// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord group-chat name colours on the client. In group DMs (no roles) every member's
// name gets a colour: the one they picked in Settings > Profile, or otherwise a stable
// "random" one derived from their user id, so everyone sees the same colour. Chosen
// colours come from a small cache filled by batched lookups. A leaf module (React plus a
// dynamically imported HTTP client) so message and member list components can use it
// without adding import cycles.

import {useEffect, useSyncExternalStore} from 'react';

/** Default colours, readable on both dark and light themes. */
export const GROUP_NAME_COLORS = [
	'#e5484d',
	'#f76b15',
	'#d29e00',
	'#30a46c',
	'#12a594',
	'#0090ff',
	'#6e56cf',
	'#d6409f',
] as const;

const STALE_AFTER_MS = 120_000;
const BATCH_DELAY_MS = 40;
const MAX_BATCH = 100;

interface Entry {
	color: string | null;
	at: number;
}

const cache = new Map<string, Entry>();
const queued = new Set<string>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emit(): void {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

async function getHttp() {
	return (await import('@app/features/platform/transport/RestTransport')).http;
}

async function flush(): Promise<void> {
	flushTimer = null;
	const ids = [...queued];
	queued.clear();
	const http = await getHttp();
	const chunks: Array<Array<string>> = [];
	for (let i = 0; i < ids.length; i += MAX_BATCH) chunks.push(ids.slice(i, i + MAX_BATCH));
	await Promise.all(
		chunks.map(async (chunk) => {
			try {
				const res = await http.post<{colors: Record<string, string | null>}>('/group-name-colors/lookup', {
					body: {user_ids: chunk},
				});
				const now = Date.now();
				for (const id of chunk) cache.set(id, {color: res.body.colors[id] ?? null, at: now});
			} catch {
				// Leave them on the default for a while rather than retrying in a tight loop.
				const now = Date.now() - STALE_AFTER_MS / 2;
				for (const id of chunk) if (!cache.has(id)) cache.set(id, {color: null, at: now});
			} finally {
				for (const id of chunk) inflight.delete(id);
			}
		}),
	);
	emit();
}

function request(userId: string): void {
	const entry = cache.get(userId);
	if ((entry && Date.now() - entry.at < STALE_AFTER_MS) || inflight.has(userId)) return;
	inflight.add(userId);
	queued.add(userId);
	flushTimer ??= setTimeout(() => void flush(), BATCH_DELAY_MS);
}

function hashString(value: string): number {
	let hash = 0;
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

/** The colour a user gets when they haven't picked one. */
export function defaultGroupNameColor(userId: string): string {
	return GROUP_NAME_COLORS[hashString(userId) % GROUP_NAME_COLORS.length]!;
}

/**
 * The colour of a user's name in group chats (their pick, or their default colour).
 * Pass null to opt out (e.g. outside group DMs); the hook then returns undefined.
 */
export function useGroupNameColor(userId: string | null | undefined): string | undefined {
	const chosen = useSyncExternalStore(subscribe, () => (userId ? (cache.get(userId)?.color ?? null) : null));
	useEffect(() => {
		if (userId) request(userId);
	}, [userId]);
	if (!userId) return undefined;
	return chosen ?? defaultGroupNameColor(userId);
}

export async function fetchMyGroupNameColor(): Promise<string | null> {
	const http = await getHttp();
	const res = await http.get<{color: string | null}>('/users/@me/group-name-color');
	return res.body.color;
}

/** Saves the current user's colour (null = back to the default) and refreshes the cache. */
export async function saveMyGroupNameColor(userId: string, color: string | null): Promise<string | null> {
	const http = await getHttp();
	const res = await http.put<{color: string | null}>('/users/@me/group-name-color', {body: {color}});
	cache.set(userId, {color: res.body.color, at: Date.now()});
	emit();
	return res.body.color;
}
