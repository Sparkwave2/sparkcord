// SPDX-License-Identifier: AGPL-3.0-or-later

import {DefaultUserOnly, LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import {createUserID} from '@app/api/BrandedTypes';
import {getTupperService, toSettingsResponse, toTupperResponse} from '@app/api/tupper/TupperService';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {
	TupperCardResponse,
	TupperCreateRequest,
	TupperImportRequest,
	TupperImportResponse,
	TupperListResponse,
	TupperResponse,
	TupperSettingsResponse,
	TupperSettingsUpdateRequest,
	TupperSystemResponse,
	TupperUpdateRequest,
} from '@fluxer/schema/src/domains/tupper/TupperSchemas';
import {z} from 'zod';

const TupperIdParam = z.object({tupper_id: z.string().regex(/^\d{1,20}$/)});
const TupperCardParam = z.object({user_id: SnowflakeType, tupper_id: z.string().regex(/^\d{1,20}$/)});
const TupperSystemParam = z.object({user_id: SnowflakeType});
const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];
const tags = ['Tuppers'];

export function TupperController(app: HonoApp) {
	app.get(
		'/users/:user_id/tuppers/:tupper_id/card',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_READ),
		LoginRequired,
		Validator('param', TupperCardParam),
		OpenAPI({
			operationId: 'get_tupper_card',
			summary: 'Get tupper card',
			responseSchema: TupperCardResponse,
			statusCode: 200,
			security,
			tags,
			description: "Gets a tupper's public card (name, avatar, pronouns, description, system) for profile popouts.",
		}),
		async (ctx) => {
			const {user_id, tupper_id} = ctx.req.valid('param');
			return ctx.json(await getTupperService().getCard(createUserID(user_id), tupper_id, ctx.get('user').id));
		},
	);

	app.get(
		'/users/:user_id/tuppers/system',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_READ),
		LoginRequired,
		Validator('param', TupperSystemParam),
		OpenAPI({
			operationId: 'get_tupper_system',
			summary: 'Get tupper system',
			responseSchema: TupperSystemResponse,
			statusCode: 200,
			security,
			tags,
			description:
				"Gets someone's system: its name, tag and tuppers. For a private system, other people get `private: true` and nothing else.",
		}),
		async (ctx) => {
			const {user_id} = ctx.req.valid('param');
			return ctx.json(await getTupperService().getSystem(createUserID(user_id), ctx.get('user').id));
		},
	);

	app.get(
		'/users/@me/tuppers',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_READ),
		LoginRequired,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'list_tuppers',
			summary: 'List tuppers',
			responseSchema: TupperListResponse,
			statusCode: 200,
			security,
			tags,
			description: "Lists the current user's tuppers (proxy members).",
		}),
		async (ctx) => ctx.json((await getTupperService().list(ctx.get('user').id)).map(toTupperResponse)),
	);

	app.post(
		'/users/@me/tuppers',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TupperCreateRequest),
		OpenAPI({
			operationId: 'create_tupper',
			summary: 'Create tupper',
			responseSchema: TupperResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Creates a tupper.',
		}),
		async (ctx) =>
			ctx.json(toTupperResponse(await getTupperService().create(ctx.get('user').id, ctx.req.valid('json')))),
	);

	app.get(
		'/users/@me/tuppers/settings',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_READ),
		LoginRequired,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'get_tupper_settings',
			summary: 'Get tupper settings',
			responseSchema: TupperSettingsResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Gets system name/tag and autoproxy settings.',
		}),
		async (ctx) => ctx.json(toSettingsResponse(await getTupperService().getSettings(ctx.get('user').id))),
	);

	app.patch(
		'/users/@me/tuppers/settings',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TupperSettingsUpdateRequest),
		OpenAPI({
			operationId: 'update_tupper_settings',
			summary: 'Update tupper settings',
			responseSchema: TupperSettingsResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Updates system name/tag and autoproxy settings.',
		}),
		async (ctx) =>
			ctx.json(
				toSettingsResponse(await getTupperService().updateSettings(ctx.get('user').id, ctx.req.valid('json'))),
			),
	);

	app.post(
		'/users/@me/tuppers/import',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_IMPORT),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TupperImportRequest),
		OpenAPI({
			operationId: 'import_tuppers',
			summary: 'Import tuppers',
			responseSchema: TupperImportResponse,
			statusCode: 200,
			security,
			tags,
			description:
				'Imports tuppers from a Tupperbox (`tul!export`) or PluralKit (`pk;export`) JSON file. Tuppers with the same name are updated.',
		}),
		async (ctx) => {
			const {data, replace} = ctx.req.valid('json');
			return ctx.json(await getTupperService().importData(ctx.get('user').id, data, {replace}));
		},
	);

	app.get(
		'/users/@me/tuppers/export',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_IMPORT),
		LoginRequired,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'export_tuppers',
			summary: 'Export tuppers',
			responseSchema: null,
			statusCode: 200,
			security,
			tags,
			description: 'Exports tuppers as a PluralKit-compatible JSON file.',
		}),
		async (ctx) => ctx.json(await getTupperService().exportData(ctx.get('user').id)),
	);

	app.patch(
		'/users/@me/tuppers/:tupper_id',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', TupperIdParam),
		Validator('json', TupperUpdateRequest),
		OpenAPI({
			operationId: 'update_tupper',
			summary: 'Update tupper',
			responseSchema: TupperResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Updates a tupper.',
		}),
		async (ctx) =>
			ctx.json(
				toTupperResponse(
					await getTupperService().update(
						ctx.get('user').id,
						ctx.req.valid('param').tupper_id,
						ctx.req.valid('json'),
					),
				),
			),
	);

	app.delete(
		'/users/@me/tuppers/:tupper_id',
		RateLimitMiddleware(RateLimitConfigs.TUPPER_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', TupperIdParam),
		OpenAPI({
			operationId: 'delete_tupper',
			summary: 'Delete tupper',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description: 'Deletes a tupper. Messages already sent keep their name and avatar.',
		}),
		async (ctx) => {
			await getTupperService().delete(ctx.get('user').id, ctx.req.valid('param').tupper_id);
			return ctx.body(null, 204);
		},
	);
}
