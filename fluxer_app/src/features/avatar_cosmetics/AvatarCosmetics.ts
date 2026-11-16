// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord avatar cosmetics on the client: which cosmetic (an image drawn over the
// avatar) each user wears. A small cache filled by batched lookups for the avatars on
// screen. A leaf module (React plus a dynamically imported HTTP client) so the avatar
// component can use it without adding import cycles.

import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import {type AvatarCosmetic, getAvatarCosmetic} from '@fluxer/constants/src/AvatarCosmetics';
import {useEffect, useSyncExternalStore} from 'react';

const STALE_AFTER_MS = 120_000;
const BATCH_DELAY_MS = 40;
const MAX_BATCH = 100;

interface Entry {
	cosmetic: string | null;
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
				const res = await http.post<{cosmetics: Record<string, string | null>}>('/avatar-cosmetics/lookup', {
					body: {user_ids: chunk},
				});
				const now = Date.now();
				for (const id of chunk) cache.set(id, {cosmetic: res.body.cosmetics[id] ?? null, at: now});
			} catch {
				// Leave them without a cosmetic for a while rather than retrying in a tight loop.
				const now = Date.now() - STALE_AFTER_MS / 2;
				for (const id of chunk) if (!cache.has(id)) cache.set(id, {cosmetic: null, at: now});
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

/** Only real accounts have cosmetics; webhook and tupper avatars use other ids. */
function isUserId(userId: string | null | undefined): userId is string {
	return typeof userId === 'string' && /^\d{5,}$/.test(userId);
}

export function avatarCosmeticUrl(cosmetic: AvatarCosmetic): string {
	return `/assets/cosmetics/${cosmetic.file}`;
}

/**
 * The cosmetic a user wears, or null: when they wear none, or when the viewer turned
 * cosmetics off (Settings > Accessibility). Must be called from an observer component
 * for that switch to apply right away.
 */
export function useAvatarCosmetic(userId: string | null | undefined): AvatarCosmetic | null {
	const hidden = SparkcordPrefs.get('hideAvatarCosmetics');
	const wanted = !hidden && isUserId(userId) ? userId : null;
	const id = useSyncExternalStore(subscribe, () => (wanted ? (cache.get(wanted)?.cosmetic ?? null) : null));
	useEffect(() => {
		if (wanted) request(wanted);
	}, [wanted]);
	return getAvatarCosmetic(id);
}

export async function fetchMyAvatarCosmetic(): Promise<string | null> {
	const http = await getHttp();
	const res = await http.get<{cosmetic: string | null}>('/users/@me/avatar-cosmetic');
	return res.body.cosmetic;
}

/** Saves the current user's cosmetic (null = none) and refreshes the cache. */
export async function saveMyAvatarCosmetic(userId: string, cosmetic: string | null): Promise<string | null> {
	const http = await getHttp();
	const res = await http.put<{cosmetic: string | null}>('/users/@me/avatar-cosmetic', {body: {cosmetic}});
	cache.set(userId, {cosmetic: res.body.cosmetic, at: Date.now()});
	emit();
	return res.body.cosmetic;
}
