// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: which kind of app someone is on (web, desktop, mobile), for the platform
// icons. Each client reports its own kind once a minute while it is connected and the
// report runs out by itself shortly after the client stops. A client that hides its
// platform simply doesn't report. Nothing is stored permanently.

import {LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {getCacheService} from '@app/api/middleware/ServiceSingletons';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {z} from 'zod';

const PLATFORMS = ['web', 'desktop', 'mobile'] as const;
type Platform = (typeof PLATFORMS)[number];

/** Clients report every 60 seconds; allow for one missed report. */
const REPORT_TTL_SECONDS = 150;
const MAX_QUERY_USERS = 100;

const PlatformParam = z.object({platform: z.enum(PLATFORMS)});
const PlatformQueryRequest = z.object({
	user_ids: z.array(z.string().regex(/^\d{1,20}$/)).max(MAX_QUERY_USERS),
});
const PlatformQueryResponse = z.object({
	platforms: z.record(z.string(), z.array(z.enum(PLATFORMS))),
});

const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];
const tags = ['Sparkcord'];

const keyFor = (userId: string, platform: Platform) => `sparkcord:platform:${userId}:${platform}`;

export function PlatformController(app: HonoApp) {
	app.put(
		'/sparkcord/platform/:platform',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_WRITE),
		LoginRequired,
		Validator('param', PlatformParam),
		OpenAPI({
			operationId: 'report_platform',
			summary: 'Report platform',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description: 'Reports that the current user is connected from this kind of app. Expires by itself.',
		}),
		async (ctx) => {
			const {platform} = ctx.req.valid('param');
			await getCacheService().set(keyFor(ctx.get('user').id.toString(), platform), 1, REPORT_TTL_SECONDS);
			return ctx.body(null, 204);
		},
	);

	app.delete(
		'/sparkcord/platform/:platform',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_WRITE),
		LoginRequired,
		Validator('param', PlatformParam),
		OpenAPI({
			operationId: 'clear_platform',
			summary: 'Clear platform',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description: "Removes the current user's report for this kind of app right away.",
		}),
		async (ctx) => {
			const {platform} = ctx.req.valid('param');
			await getCacheService().delete(keyFor(ctx.get('user').id.toString(), platform));
			return ctx.body(null, 204);
		},
	);

	app.post(
		'/sparkcord/platforms/query',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_READ),
		LoginRequired,
		Validator('json', PlatformQueryRequest),
		OpenAPI({
			operationId: 'query_platforms',
			summary: 'Query platforms',
			responseSchema: PlatformQueryResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Gets the kinds of app the given users are connected from. Users with none are left out.',
		}),
		async (ctx) => {
			const userIds = [...new Set(ctx.req.valid('json').user_ids)];
			const platforms: Record<string, Array<Platform>> = {};
			if (userIds.length === 0) return ctx.json({platforms});
			const keys = userIds.flatMap((userId) => PLATFORMS.map((platform) => keyFor(userId, platform)));
			const values = await getCacheService().mget<number>(keys);
			userIds.forEach((userId, userIndex) => {
				const found = PLATFORMS.filter((_, index) => values[userIndex * PLATFORMS.length + index] != null);
				if (found.length > 0) platforms[userId] = found;
			});
			return ctx.json({platforms});
		},
	);
}
