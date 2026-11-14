// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord group-chat name colours: the colour a user's name is shown in inside group
// DMs (which have no roles). Users who haven't picked one get a stable "random" colour
// computed on the client from their user id. Clients look colours up in batches, since
// user objects reach clients through services that only pass a fixed set of fields.

import {createUserID, type UserID} from '@app/api/BrandedTypes';
import {deleteOneOrMany, fetchMany, upsertOne} from '@app/api/database/CassandraQueryExecution';
import {defineTable} from '@app/api/database/CassandraTableDsl';
import {DefaultUserOnly, LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

interface GroupNameColorRow {
	user_id: UserID;
	color: string;
	updated_at: Date;
}

const COLUMNS = ['user_id', 'color', 'updated_at'] as const satisfies ReadonlyArray<keyof GroupNameColorRow>;

const GroupNameColors = defineTable<GroupNameColorRow, 'user_id', 'user_id'>({
	name: 'group_name_colors',
	columns: COLUMNS,
	primaryKey: ['user_id'],
	partitionKey: ['user_id'],
});

const FETCH_BY_USER = GroupNameColors.selectCql({where: GroupNameColors.where.eq('user_id')});
const MAX_LOOKUP = 100;
const HEX_COLOR = /^#[0-9a-f]{6}$/;

async function colorFor(userId: UserID): Promise<string | null> {
	const rows = await fetchMany<GroupNameColorRow>(FETCH_BY_USER, {user_id: userId});
	const color = rows[0]?.color;
	return color && HEX_COLOR.test(color) ? color : null;
}

const LookupRequest = z.object({
	user_ids: z.array(SnowflakeType).min(1).max(MAX_LOOKUP),
});
const LookupResponse = z.object({
	colors: z.record(z.string(), z.string().nullable()).describe('Chosen colour per user id; null = default'),
});
const MyColorResponse = z.object({
	color: z.string().nullable().describe('Chosen group-chat name colour (#rrggbb), or null for the default'),
});
const SetRequest = z.object({
	color: z
		.string()
		.toLowerCase()
		.regex(HEX_COLOR, 'Expected a #rrggbb colour')
		.nullable()
		.describe('#rrggbb, or null to go back to the default colour'),
});

const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];
const tags = ['Group name colours'];

export function GroupNameColorController(app: HonoApp) {
	app.post(
		'/group-name-colors/lookup',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		Validator('json', LookupRequest),
		OpenAPI({
			operationId: 'lookup_group_name_colors',
			summary: 'Look up group-chat name colours',
			responseSchema: LookupResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Returns the chosen group-chat name colour for each user (null = default colour).',
		}),
		async (ctx) => {
			const {user_ids} = ctx.req.valid('json');
			const unique = [...new Set(user_ids.map(String))];
			const entries = await Promise.all(
				unique.map(async (id) => [id, await colorFor(createUserID(BigInt(id)))] as const),
			);
			return ctx.json({colors: Object.fromEntries(entries)});
		},
	);

	app.get(
		'/users/@me/group-name-color',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'get_my_group_name_color',
			summary: 'Get my group-chat name colour',
			responseSchema: MyColorResponse,
			statusCode: 200,
			security,
			tags,
			description: "The current user's chosen group-chat name colour.",
		}),
		async (ctx) => ctx.json({color: await colorFor(ctx.get('user').id)}),
	);

	app.put(
		'/users/@me/group-name-color',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', SetRequest),
		OpenAPI({
			operationId: 'set_my_group_name_color',
			summary: 'Set my group-chat name colour',
			responseSchema: MyColorResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Sets the colour your name is shown in inside group chats, or resets it to the default.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {color} = ctx.req.valid('json');
			if (color === null) {
				await deleteOneOrMany(GroupNameColors.deleteByPk({user_id: userId}));
			} else {
				await upsertOne(GroupNameColors.upsertAll({user_id: userId, color, updated_at: new Date()}));
			}
			return ctx.json({color});
		},
	);
}
