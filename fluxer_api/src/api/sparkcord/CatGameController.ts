// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café (the idle cat game): keeps each player's saves on the server so they
// follow them between devices, plus the public numbers others may see (purrs earned in
// total, Lives), for the per-community leaderboard and the line on profiles. The game runs
// in the app; the server only stores what it is given, after basic sanity checks.
//
// Each player has 3 save slots. The slot they play is the "active" one (kept here so all
// their devices agree), and only the active slot's numbers are public.

import {LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {getGuildRepository} from '@app/api/middleware/ServiceSingletons';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import type {IKVProvider} from '@pkgs/kv_client/src/IKVProvider';
import {z} from 'zod';

// Slot 1 keeps the key the game used before it had slots.
const SAVE_KEY = (userId: string, slot: number) =>
	slot === 1 ? `sparkcord:catgame:save:${userId}` : `sparkcord:catgame:save:${userId}:${slot}`;
const ACTIVE_KEY = (userId: string) => `sparkcord:catgame:active:${userId}`;
const STATS_KEY = (userId: string) => `sparkcord:catgame:stats:${userId}`;
const SLOTS = [1, 2, 3] as const;
const MAX_SAVE_BYTES = 64 * 1024;
const MAX_QUERY_USERS = 100;
const MAX_LEADERBOARD_MEMBERS = 2000;
const LEADERBOARD_SIZE = 25;

interface PublicStats {
	purrs: number;
	lives: number;
	updated_at: number;
}

interface StoredSave {
	save: string;
	updated_at: number;
	purrs?: number;
	lives?: number;
}

const finite = z.number().finite().min(0).max(1e300);
const Slot = z.number().int().min(1).max(3);
const SlotQuery = z.object({slot: z.enum(['1', '2', '3']).optional()});

const SaveRequest = z.object({
	save: z.string().max(MAX_SAVE_BYTES),
	lifetime_purrs: finite,
	lives: finite,
	// The slot to store into; the active slot when left out (older clients).
	slot: Slot.optional(),
	// The version (updated_at) the client last loaded or stored. When the stored save has moved
	// on since (another tab or device saved), the write is refused with 409 and the newer save,
	// so one copy of the game never overwrites another's progress. Older clients leave it out.
	base_updated_at: z.number().nullable().optional(),
});
const SaveResponse = z.object({
	save: z.string().nullable(),
	updated_at: z.number().nullable(),
	slot: Slot,
});
const SlotSummary = z.object({
	slot: Slot,
	updated_at: z.number().nullable(),
	purrs: z.number(),
	lives: z.number(),
});
const SlotsResponse = z.object({active: Slot, slots: z.array(SlotSummary)});
const ActiveSlotRequest = z.object({slot: Slot});
const StatsEntry = z.object({purrs: z.number(), lives: z.number()});
const StatsQueryRequest = z.object({user_ids: z.array(z.string().regex(/^\d{1,20}$/)).max(MAX_QUERY_USERS)});
const StatsQueryResponse = z.object({stats: z.record(z.string(), StatsEntry)});
const GuildParam = z.object({guild_id: z.string().regex(/^\d{1,20}$/)});
const LeaderboardResponse = z.object({
	entries: z.array(z.object({user_id: z.string(), purrs: z.number(), lives: z.number()})),
});

const security: Array<'sessionToken'> = ['sessionToken'];
const tags = ['Sparkcord'];

function parseStored(raw: string | null): StoredSave | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<StoredSave>;
		if (typeof value.save !== 'string' || typeof value.updated_at !== 'number') return null;
		return value as StoredSave;
	} catch {
		return null;
	}
}

/** Purrs and Lives of a stored save (older records only have them inside the save itself). */
function storedTotals(stored: StoredSave): {purrs: number; lives: number} {
	if (typeof stored.purrs === 'number' && typeof stored.lives === 'number') {
		return {purrs: stored.purrs, lives: stored.lives};
	}
	try {
		const game = JSON.parse(stored.save) as {lifetimeAll?: unknown; livesEarned?: unknown};
		const purrs = typeof game.lifetimeAll === 'number' && Number.isFinite(game.lifetimeAll) ? game.lifetimeAll : 0;
		const lives = typeof game.livesEarned === 'number' && Number.isFinite(game.livesEarned) ? game.livesEarned : 0;
		return {purrs: Math.floor(purrs), lives: Math.floor(lives)};
	} catch {
		return {purrs: 0, lives: 0};
	}
}

function parseSlot(raw: string | null): number {
	const slot = Number(raw);
	return slot === 2 || slot === 3 ? slot : 1;
}

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

/** Makes the public numbers match a slot (or clears them when it is empty). */
async function publishSlot(kv: IKVProvider, userId: string, stored: StoredSave | null): Promise<void> {
	if (!stored) {
		await kv.del(STATS_KEY(userId));
		return;
	}
	const totals = storedTotals(stored);
	const stats: PublicStats = {purrs: totals.purrs, lives: totals.lives, updated_at: Date.now()};
	await kv.set(STATS_KEY(userId), JSON.stringify(stats));
}

async function listSlots(kv: IKVProvider, userId: string) {
	const [activeRaw, ...raws] = await kv.mget(ACTIVE_KEY(userId), ...SLOTS.map((slot) => SAVE_KEY(userId, slot)));
	return {
		active: parseSlot(activeRaw ?? null),
		slots: SLOTS.map((slot, index) => {
			const stored = parseStored(raws[index] ?? null);
			const totals = stored ? storedTotals(stored) : {purrs: 0, lives: 0};
			return {slot, updated_at: stored?.updated_at ?? null, ...totals};
		}),
	};
}

export function CatGameController(app: HonoApp) {
	app.get(
		'/sparkcord/catgame/save',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_READ),
		LoginRequired,
		Validator('query', SlotQuery),
		OpenAPI({
			operationId: 'get_catgame_save',
			summary: 'Get Catnip Café save',
			responseSchema: SaveResponse,
			statusCode: 200,
			security,
			tags,
			description:
				"One of the current user's Catnip Café save slots (the active one unless `slot` is given); save is null for an empty slot.",
		}),
		async (ctx) => {
			const kv = ctx.get('apiContext').services.kv;
			const userId = ctx.get('user').id.toString();
			const query = ctx.req.valid('query');
			const slot = query.slot ? Number(query.slot) : parseSlot(await kv.get(ACTIVE_KEY(userId)));
			const stored = parseStored(await kv.get(SAVE_KEY(userId, slot)));
			return ctx.json({save: stored?.save ?? null, updated_at: stored?.updated_at ?? null, slot});
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
			responseSchema: SaveResponse,
			statusCode: 200,
			security,
			tags,
			description:
				"Stores one of the current user's Catnip Café save slots (and, for the active slot, their public totals). With base_updated_at, refuses (409, with the stored save) when the stored save is newer than that.",
		}),
		async (ctx) => {
			const {save, lifetime_purrs, lives, slot: askedSlot, base_updated_at} = ctx.req.valid('json');
			const userId = ctx.get('user').id.toString();
			const kv = ctx.get('apiContext').services.kv;
			const active = parseSlot(await kv.get(ACTIVE_KEY(userId)));
			const slot = askedSlot ?? active;
			if (base_updated_at !== undefined) {
				const stored = parseStored(await kv.get(SAVE_KEY(userId, slot)));
				const storedAt = stored?.updated_at ?? null;
				if (storedAt !== base_updated_at) {
					return ctx.json(
						{code: 'CATGAME_SAVE_CONFLICT', save: stored?.save ?? null, updated_at: storedAt, slot},
						409,
					);
				}
			}
			// Strictly increasing, so two saves in the same millisecond still differ.
			const now = Math.max(Date.now(), (base_updated_at ?? 0) + 1);
			const record: StoredSave = {save, updated_at: now, purrs: Math.floor(lifetime_purrs), lives: Math.floor(lives)};
			await kv.set(SAVE_KEY(userId, slot), JSON.stringify(record));
			if (slot === active) await publishSlot(kv, userId, record);
			return ctx.json({save: null, updated_at: now, slot});
		},
	);

	app.delete(
		'/sparkcord/catgame/save',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_WRITE),
		LoginRequired,
		Validator('query', SlotQuery),
		OpenAPI({
			operationId: 'delete_catgame_save',
			summary: 'Delete Catnip Café save',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description:
				"Empties one of the current user's Catnip Café save slots (the active one unless `slot` is given). Emptying the active slot also clears their public totals.",
		}),
		async (ctx) => {
			const userId = ctx.get('user').id.toString();
			const kv = ctx.get('apiContext').services.kv;
			const query = ctx.req.valid('query');
			const active = parseSlot(await kv.get(ACTIVE_KEY(userId)));
			const slot = query.slot ? Number(query.slot) : active;
			await kv.del(SAVE_KEY(userId, slot));
			if (slot === active) await kv.del(STATS_KEY(userId));
			return ctx.body(null, 204);
		},
	);

	app.get(
		'/sparkcord/catgame/slots',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_READ),
		LoginRequired,
		OpenAPI({
			operationId: 'list_catgame_slots',
			summary: 'List Catnip Café save slots',
			responseSchema: SlotsResponse,
			statusCode: 200,
			security,
			tags,
			description: "The current user's 3 Catnip Café save slots, with their totals, and which one is active.",
		}),
		async (ctx) => {
			return ctx.json(await listSlots(ctx.get('apiContext').services.kv, ctx.get('user').id.toString()));
		},
	);

	app.put(
		'/sparkcord/catgame/slots/active',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_WRITE),
		LoginRequired,
		Validator('json', ActiveSlotRequest),
		OpenAPI({
			operationId: 'set_catgame_active_slot',
			summary: 'Switch Catnip Café save slot',
			responseSchema: SlotsResponse,
			statusCode: 200,
			security,
			tags,
			description: "Makes a save slot the active one; the user's public totals follow it.",
		}),
		async (ctx) => {
			const {slot} = ctx.req.valid('json');
			const userId = ctx.get('user').id.toString();
			const kv = ctx.get('apiContext').services.kv;
			await kv.set(ACTIVE_KEY(userId), String(slot));
			await publishSlot(kv, userId, parseStored(await kv.get(SAVE_KEY(userId, slot))));
			return ctx.json(await listSlots(kv, userId));
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
