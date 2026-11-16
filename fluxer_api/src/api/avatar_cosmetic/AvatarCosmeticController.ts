// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord avatar cosmetics: the cosmetic (an image drawn over the avatar) a user wears.
// One per account, picked from the catalogue in @fluxer/constants AvatarCosmetics.
// Clients look cosmetics up in batches for the avatars they show, since user objects
// reach clients through services that only pass a fixed set of fields.

import {createUserID, type UserID} from '@app/api/BrandedTypes';
import {deleteOneOrMany, fetchMany, upsertOne} from '@app/api/database/CassandraQueryExecution';
import {defineTable} from '@app/api/database/CassandraTableDsl';
import {DefaultUserOnly, LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {isAvatarCosmeticId} from '@fluxer/constants/src/AvatarCosmetics';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import {SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

interface AvatarCosmeticRow {
	user_id: UserID;
	cosmetic: string;
	updated_at: Date;
}

const COLUMNS = ['user_id', 'cosmetic', 'updated_at'] as const satisfies ReadonlyArray<keyof AvatarCosmeticRow>;

const AvatarCosmetics = defineTable<AvatarCosmeticRow, 'user_id', 'user_id'>({
	name: 'avatar_cosmetics',
	columns: COLUMNS,
	primaryKey: ['user_id'],
	partitionKey: ['user_id'],
});

const FETCH_BY_USER = AvatarCosmetics.selectCql({where: AvatarCosmetics.where.eq('user_id')});
const MAX_LOOKUP = 100;

async function cosmeticFor(userId: UserID): Promise<string | null> {
	const rows = await fetchMany<AvatarCosmeticRow>(FETCH_BY_USER, {user_id: userId});
	const cosmetic = rows[0]?.cosmetic;
	// A cosmetic that was removed from the catalogue counts as none.
	return cosmetic && isAvatarCosmeticId(cosmetic) ? cosmetic : null;
}

const LookupRequest = z.object({
	user_ids: z.array(SnowflakeType).min(1).max(MAX_LOOKUP),
});
const LookupResponse = z.object({
	cosmetics: z.record(z.string(), z.string().nullable()).describe('Cosmetic id per user id; null = none'),
});
const MyCosmeticResponse = z.object({
	cosmetic: z.string().nullable().describe('The avatar cosmetic worn, or null for none'),
});
const SetRequest = z.object({
	cosmetic: z.string().max(60).nullable().describe('Cosmetic id, or null to take it off'),
});

const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];
const tags = ['Avatar cosmetics'];

export function AvatarCosmeticController(app: HonoApp) {
	app.post(
		'/avatar-cosmetics/lookup',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		Validator('json', LookupRequest),
		OpenAPI({
			operationId: 'lookup_avatar_cosmetics',
			summary: 'Look up avatar cosmetics',
			responseSchema: LookupResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Returns the avatar cosmetic each user wears (null = none).',
		}),
		async (ctx) => {
			const {user_ids} = ctx.req.valid('json');
			const unique = [...new Set(user_ids.map(String))];
			const entries = await Promise.all(
				unique.map(async (id) => [id, await cosmeticFor(createUserID(BigInt(id)))] as const),
			);
			return ctx.json({cosmetics: Object.fromEntries(entries)});
		},
	);

	app.get(
		'/users/@me/avatar-cosmetic',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'get_my_avatar_cosmetic',
			summary: 'Get my avatar cosmetic',
			responseSchema: MyCosmeticResponse,
			statusCode: 200,
			security,
			tags,
			description: 'The avatar cosmetic the current user wears.',
		}),
		async (ctx) => ctx.json({cosmetic: await cosmeticFor(ctx.get('user').id)}),
	);

	app.put(
		'/users/@me/avatar-cosmetic',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', SetRequest),
		OpenAPI({
			operationId: 'set_my_avatar_cosmetic',
			summary: 'Set my avatar cosmetic',
			responseSchema: MyCosmeticResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Wears an avatar cosmetic from the catalogue, or takes the current one off.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {cosmetic} = ctx.req.valid('json');
			if (cosmetic !== null && !isAvatarCosmeticId(cosmetic)) {
				throw InputValidationError.create('cosmetic', 'Unknown cosmetic.');
			}
			if (cosmetic === null) {
				await deleteOneOrMany(AvatarCosmetics.deleteByPk({user_id: userId}));
			} else {
				await upsertOne(AvatarCosmetics.upsertAll({user_id: userId, cosmetic, updated_at: new Date()}));
			}
			return ctx.json({cosmetic});
		},
	);
}
