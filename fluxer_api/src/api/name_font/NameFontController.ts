// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord name fonts: the font a user's name is shown in. One account-wide value
// (scope 0) plus optional per-community overrides (scope = community id; the value
// "none" means "normal font in this community"). Clients look fonts up in batches for
// the names they show, since user objects reach clients through services that only
// pass a fixed set of fields.

import {createGuildID, createUserID, type GuildID, type UserID} from '@app/api/BrandedTypes';
import {deleteOneOrMany, fetchMany, upsertOne} from '@app/api/database/CassandraQueryExecution';
import {defineTable} from '@app/api/database/CassandraTableDsl';
import {DefaultUserOnly, LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {getGuildRepository} from '@app/api/middleware/ServiceSingletons';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {isNameFontId, NAME_FONT_NONE} from '@fluxer/constants/src/NameFonts';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import {SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

interface NameFontRow {
	user_id: UserID;
	/** 0 for the account-wide font, otherwise a community id. */
	scope_id: bigint;
	font: string;
	updated_at: Date;
}

const NAME_FONT_COLUMNS = ['user_id', 'scope_id', 'font', 'updated_at'] as const satisfies ReadonlyArray<
	keyof NameFontRow
>;

const NameFonts = defineTable<NameFontRow, 'user_id' | 'scope_id', 'user_id'>({
	name: 'name_fonts',
	columns: NAME_FONT_COLUMNS,
	primaryKey: ['user_id', 'scope_id'],
	partitionKey: ['user_id'],
});

const FETCH_BY_USER = NameFonts.selectCql({where: NameFonts.where.eq('user_id')});
const ACCOUNT_SCOPE = 0n;
const MAX_LOOKUP = 100;

async function rowsFor(userId: UserID): Promise<Array<NameFontRow>> {
	return fetchMany<NameFontRow>(FETCH_BY_USER, {user_id: userId});
}

/** The font to show for a user, optionally inside a community. null = normal font. */
function effectiveFont(rows: ReadonlyArray<NameFontRow>, guildId: GuildID | null): string | null {
	if (guildId !== null) {
		const scoped = rows.find((row) => row.scope_id === BigInt(guildId));
		if (scoped) return isNameFontId(scoped.font) ? scoped.font : null;
	}
	const account = rows.find((row) => row.scope_id === ACCOUNT_SCOPE);
	return account && isNameFontId(account.font) ? account.font : null;
}

const LookupRequest = z.object({
	user_ids: z.array(SnowflakeType).min(1).max(MAX_LOOKUP),
	guild_id: SnowflakeType.nullish(),
});
const LookupResponse = z.object({
	fonts: z.record(z.string(), z.string().nullable()).describe('Font id per user id; null = normal font'),
});
const MyFontsResponse = z.object({
	font: z.string().nullable().describe('Account-wide name font, or null'),
	guilds: z
		.record(z.string(), z.string())
		.describe('Per-community overrides by community id; "none" = normal font there'),
});
const SetRequest = z.object({
	font: z.string().max(40).nullable().describe('Font id; null clears (per community: back to the account font)'),
	guild_id: SnowflakeType.nullish().describe('Set the font for this community only'),
});

const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];
const tags = ['Name fonts'];

export function NameFontController(app: HonoApp) {
	app.post(
		'/name-fonts/lookup',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		Validator('json', LookupRequest),
		OpenAPI({
			operationId: 'lookup_name_fonts',
			summary: 'Look up name fonts',
			responseSchema: LookupResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Returns the name font for each user, as shown in the given community (if any).',
		}),
		async (ctx) => {
			const {user_ids, guild_id} = ctx.req.valid('json');
			const guildId = guild_id ? createGuildID(guild_id) : null;
			const unique = [...new Set(user_ids.map(String))];
			const entries = await Promise.all(
				unique.map(async (id) => [id, effectiveFont(await rowsFor(createUserID(BigInt(id))), guildId)] as const),
			);
			return ctx.json({fonts: Object.fromEntries(entries)});
		},
	);

	app.get(
		'/users/@me/name-font',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'get_my_name_fonts',
			summary: 'Get my name fonts',
			responseSchema: MyFontsResponse,
			statusCode: 200,
			security,
			tags,
			description: "The current user's account-wide name font and per-community overrides.",
		}),
		async (ctx) => {
			const rows = await rowsFor(ctx.get('user').id);
			const account = rows.find((row) => row.scope_id === ACCOUNT_SCOPE);
			const guilds: Record<string, string> = {};
			for (const row of rows) if (row.scope_id !== ACCOUNT_SCOPE) guilds[row.scope_id.toString()] = row.font;
			return ctx.json({font: account?.font ?? null, guilds});
		},
	);

	app.put(
		'/users/@me/name-font',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', SetRequest),
		OpenAPI({
			operationId: 'set_my_name_font',
			summary: 'Set my name font',
			responseSchema: MyFontsResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Sets the account-wide name font, or the font for one community.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {font, guild_id} = ctx.req.valid('json');
			let scope = ACCOUNT_SCOPE;
			if (guild_id) {
				const member = await getGuildRepository().getMember(createGuildID(guild_id), userId);
				if (!member) throw InputValidationError.create('guild_id', 'You are not in this community.');
				scope = BigInt(guild_id);
			}
			const allowed = font === null || isNameFontId(font) || (scope !== ACCOUNT_SCOPE && font === NAME_FONT_NONE);
			if (!allowed) throw InputValidationError.create('font', 'Unknown font.');
			if (font === null) {
				await deleteOneOrMany(NameFonts.deleteByPk({user_id: userId, scope_id: scope}));
			} else {
				await upsertOne(NameFonts.upsertAll({user_id: userId, scope_id: scope, font, updated_at: new Date()}));
			}
			const rows = await rowsFor(userId);
			const account = rows.find((row) => row.scope_id === ACCOUNT_SCOPE);
			const guilds: Record<string, string> = {};
			for (const row of rows) if (row.scope_id !== ACCOUNT_SCOPE) guilds[row.scope_id.toString()] = row.font;
			return ctx.json({font: account?.font ?? null, guilds});
		},
	);
}
