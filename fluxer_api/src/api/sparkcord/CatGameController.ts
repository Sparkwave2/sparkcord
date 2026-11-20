// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café (the idle cat game): keeps each player's save on the server so it
// follows them between devices, plus the public numbers others may see (purrs earned in
// total, Lives), for the per-community leaderboard and the line on profiles. The game runs
// in the app; the server only stores what it is given, after basic sanity checks.

import {LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {getGuildRepository} from '@app/api/middleware/ServiceSingletons';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {z} from 'zod';

const SAVE_KEY = (userId: string) => `sparkcord:catgame:save:${userId}`;
const STATS_KEY = (userId: string) => `sparkcord:catgame:stats:${userId}`;
const MAX_SAVE_BYTES = 64 * 1024;
const MAX_QUERY_USERS = 100;
const MAX_LEADERBOARD_MEMBERS = 2000;
const LEADERBOARD_SIZE = 25;

interface PublicStats {
	purrs: number;
	lives: number;
	updated_at: number;
}

const finite = z.number().finite().min(0).max(1e300);

const SaveRequest = z.object({
	save: z.string().max(MAX_SAVE_BYTES),
	lifetime_purrs: finite,
	lives: finite,
});
const SaveResponse = z.object({save: z.string().nullable(), updated_at: z.number().nullable()});
const StatsEntry = z.object({purrs: z.number(), lives: z.number()});
const StatsQueryRequest = z.object({user_ids: z.array(z.string().regex(/^\d{1,20}$/)).max(MAX_QUERY_USERS)});
const StatsQueryResponse = z.object({stats: z.record(z.string(), StatsEntry)});
const GuildParam = z.object({guild_id: z.string().regex(/^\d{1,20}$/)});
const LeaderboardResponse = z.object({
	entries: z.array(z.object({user_id: z.string(), purrs: z.number(), lives: z.number()})),
});

const security: Array<'sessionToken'> = ['sessionToken'];
const tags = ['Sparkcord'];

function parseStats(raw: string | null): PublicStats | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<PublicStats>;
		if (typeof value.purrs !== 'number' || typeof value.lives !== 'number') return null;
		return {purrs: value.purrs, lives: value.lives, updated_at: value.updated_at ?? 0};
	} catch {
		return null;
	}
}

export function CatGameController(app: HonoApp) {
	app.get(
		'/sparkcord/catgame/save',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_READ),
		LoginRequired,
		OpenAPI({
			operationId: 'get_catgame_save',
			summary: 'Get Catnip Café save',
			responseSchema: SaveResponse,
			statusCode: 200,
			security,
			tags,
			description: "The current user's Catnip Café save, or null when they haven't played.",
		}),
		async (ctx) => {
			const kv = ctx.get('apiContext').services.kv;
			const raw = await kv.get(SAVE_KEY(ctx.get('user').id.toString()));
			if (!raw) return ctx.json({save: null, updated_at: null});
			try {
				const stored = JSON.parse(raw) as {save: string; updated_at: number};
				return ctx.json({save: stored.save, updated_at: stored.updated_at});
			} catch {
				return ctx.json({save: null, updated_at: null});
			}
		},
	);

	app.put(
		'/sparkcord/catgame/save',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_WRITE),
		LoginRequired,
		Validator('json', SaveRequest),
		OpenAPI({
			operationId: 'put_catgame_save',
			summary: 'Store Catnip Café save',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description: "Stores the current user's Catnip Café save and their public totals.",
		}),
		async (ctx) => {
			const {save, lifetime_purrs, lives} = ctx.req.valid('json');
			const userId = ctx.get('user').id.toString();
			const kv = ctx.get('apiContext').services.kv;
			const now = Date.now();
			await kv.set(SAVE_KEY(userId), JSON.stringify({save, updated_at: now}));
			const stats: PublicStats = {purrs: Math.floor(lifetime_purrs), lives: Math.floor(lives), updated_at: now};
			await kv.set(STATS_KEY(userId), JSON.stringify(stats));
			return ctx.body(null, 204);
		},
	);

	app.delete(
		'/sparkcord/catgame/save',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_WRITE),
		LoginRequired,
		OpenAPI({
			operationId: 'delete_catgame_save',
			summary: 'Delete Catnip Café save',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description: "Wipes the current user's Catnip Café progress and public totals.",
		}),
		async (ctx) => {
			const userId = ctx.get('user').id.toString();
			await ctx.get('apiContext').services.kv.del(SAVE_KEY(userId), STATS_KEY(userId));
			return ctx.body(null, 204);
		},
	);

	app.post(
		'/sparkcord/catgame/stats/query',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_READ),
		LoginRequired,
		Validator('json', StatsQueryRequest),
		OpenAPI({
			operationId: 'query_catgame_stats',
			summary: 'Query Catnip Café totals',
			responseSchema: StatsQueryResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Total purrs and Lives of the given users (only users who have played are listed).',
		}),
		async (ctx) => {
			const {user_ids} = ctx.req.valid('json');
			const ids = [...new Set(user_ids)];
			const stats: Record<string, {purrs: number; lives: number}> = {};
			if (ids.length > 0) {
				const values = await ctx.get('apiContext').services.kv.mget(...ids.map(STATS_KEY));
				ids.forEach((id, index) => {
					const parsed = parseStats(values[index] ?? null);
					if (parsed) stats[id] = {purrs: parsed.purrs, lives: parsed.lives};
				});
			}
			return ctx.json({stats});
		},
	);

	app.get(
		'/sparkcord/catgame/leaderboard/:guild_id',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_READ),
		LoginRequired,
		Validator('param', GuildParam),
		OpenAPI({
			operationId: 'get_catgame_leaderboard',
			summary: 'Catnip Café leaderboard',
			responseSchema: LeaderboardResponse,
			statusCode: 200,
			security,
			tags,
			description: "The best Catnip Café players among a community's members (the caller must be a member).",
		}),
		async (ctx) => {
			const {guild_id} = ctx.req.valid('param');
			const guilds = getGuildRepository();
			const guildId = BigInt(guild_id) as never;
			const member = await guilds.getMember(guildId, ctx.get('user').id);
			if (!member) return ctx.json({message: 'Not a member of that community.', code: 'UNKNOWN_GUILD'}, 404);
			const members = (await guilds.listMembers(guildId)).slice(0, MAX_LEADERBOARD_MEMBERS);
			const ids = members.map((entry) => entry.userId.toString());
			const kv = ctx.get('apiContext').services.kv;
			const entries: Array<{user_id: string; purrs: number; lives: number}> = [];
			for (let i = 0; i < ids.length; i += 200) {
				const chunk = ids.slice(i, i + 200);
				const values = await kv.mget(...chunk.map(STATS_KEY));
				chunk.forEach((id, index) => {
					const parsed = parseStats(values[index] ?? null);
					if (parsed && parsed.purrs > 0) entries.push({user_id: id, purrs: parsed.purrs, lives: parsed.lives});
				});
			}
			entries.sort((a, b) => b.purrs - a.purrs);
			return ctx.json({entries: entries.slice(0, LEADERBOARD_SIZE)});
		},
	);
}
