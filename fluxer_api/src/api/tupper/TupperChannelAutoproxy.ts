// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord tuppers: autoproxy per channel. The account's tupper settings hold the default
// autoproxy; a channel can override it (tp!auto in that channel), and in latch mode each
// channel remembers its own last-used tupper. Kept in the KV store, one record per user and
// channel, plus a set of the channels a user has overridden (for Settings > Tuppers).

import type {ChannelID, UserID} from '@app/api/BrandedTypes';
import {getKVClient} from '@app/api/middleware/ServiceRegistry';
import type {AutoproxyMode, TupperID} from '@app/api/tupper/TupperTables';

const RECORD_KEY = (userId: UserID, channelId: ChannelID | string) =>
	`sparkcord:tupper:autoproxy:${userId}:${channelId}`;
const OVERRIDES_KEY = (userId: UserID) => `sparkcord:tupper:autoproxy-channels:${userId}`;
const MODES: ReadonlySet<string> = new Set(['off', 'front', 'latch']);

export interface ChannelAutoproxy {
	/** The channel's own mode; null follows the account default. */
	mode: AutoproxyMode | null;
	/** The tupper for front mode (only with a mode of its own). */
	tupperId: TupperID | null;
	/** The tupper latch mode last used in this channel. */
	latchTupperId: TupperID | null;
}

const EMPTY: ChannelAutoproxy = {mode: null, tupperId: null, latchTupperId: null};

function parseId(value: unknown): TupperID | null {
	return typeof value === 'string' && /^\d{1,20}$/.test(value) ? BigInt(value) : null;
}

function parse(raw: string | null): ChannelAutoproxy {
	if (!raw) return {...EMPTY};
	try {
		const value = JSON.parse(raw) as {mode?: unknown; tupper_id?: unknown; latch_tupper_id?: unknown};
		const mode = typeof value.mode === 'string' && MODES.has(value.mode) ? (value.mode as AutoproxyMode) : null;
		return {mode, tupperId: mode ? parseId(value.tupper_id) : null, latchTupperId: parseId(value.latch_tupper_id)};
	} catch {
		return {...EMPTY};
	}
}

async function write(userId: UserID, channelId: ChannelID | string, record: ChannelAutoproxy): Promise<void> {
	const kv = getKVClient();
	if (record.mode === null && record.latchTupperId === null) {
		await kv.del(RECORD_KEY(userId, channelId));
	} else {
		await kv.set(
			RECORD_KEY(userId, channelId),
			JSON.stringify({
				mode: record.mode,
				tupper_id: record.tupperId?.toString() ?? null,
				latch_tupper_id: record.latchTupperId?.toString() ?? null,
			}),
		);
	}
	if (record.mode === null) await kv.srem(OVERRIDES_KEY(userId), String(channelId));
	else await kv.sadd(OVERRIDES_KEY(userId), String(channelId));
}

export async function getChannelAutoproxy(userId: UserID, channelId: ChannelID | string): Promise<ChannelAutoproxy> {
	return parse(await getKVClient().get(RECORD_KEY(userId, channelId)));
}

/** Sets a channel's own autoproxy mode (null goes back to the default). */
export async function setChannelAutoproxy(
	userId: UserID,
	channelId: ChannelID | string,
	mode: AutoproxyMode | null,
	tupperId: TupperID | null,
): Promise<ChannelAutoproxy> {
	const current = await getChannelAutoproxy(userId, channelId);
	const next: ChannelAutoproxy = {
		mode,
		tupperId: mode === 'front' ? tupperId : null,
		// Leaving latch mode forgets what was latched.
		latchTupperId: mode === 'latch' || (mode === null && current.mode === null) ? current.latchTupperId : null,
	};
	await write(userId, channelId, next);
	return next;
}

export async function setChannelLatch(
	userId: UserID,
	channelId: ChannelID | string,
	latchTupperId: TupperID | null,
): Promise<void> {
	const current = await getChannelAutoproxy(userId, channelId);
	if (current.latchTupperId === latchTupperId) return;
	await write(userId, channelId, {...current, latchTupperId});
}

/** The channels with an autoproxy mode of their own. */
export async function listChannelAutoproxy(
	userId: UserID,
): Promise<Array<{channelId: string} & ChannelAutoproxy>> {
	const kv = getKVClient();
	const channelIds = (await kv.smembers(OVERRIDES_KEY(userId))).filter((id) => /^\d{1,20}$/.test(id)).sort();
	if (channelIds.length === 0) return [];
	const raws = await kv.mget(...channelIds.map((id) => RECORD_KEY(userId, id)));
	const list: Array<{channelId: string} & ChannelAutoproxy> = [];
	channelIds.forEach((channelId, index) => {
		const record = parse(raws[index] ?? null);
		if (record.mode !== null) list.push({channelId, ...record});
	});
	return list;
}

/** Drops a deleted tupper from every channel override that names it. */
export async function forgetTupperInChannels(userId: UserID, tupperId: TupperID): Promise<void> {
	for (const entry of await listChannelAutoproxy(userId)) {
		if (entry.tupperId === tupperId || entry.latchTupperId === tupperId) {
			await write(userId, entry.channelId, {
				mode: entry.tupperId === tupperId ? 'off' : entry.mode,
				tupperId: entry.tupperId === tupperId ? null : entry.tupperId,
				latchTupperId: entry.latchTupperId === tupperId ? null : entry.latchTupperId,
			});
		}
	}
}
