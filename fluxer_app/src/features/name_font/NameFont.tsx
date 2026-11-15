// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord name fonts on the client: a small cache of which font each user's name is
// shown in (account-wide, or per community), filled by batched lookups for the names
// on screen, and <NameFont>, which draws a name in it. A leaf module (React plus a
// dynamically imported HTTP client) so message and member list components can use it
// without adding import cycles.

import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import {NAME_FONTS} from '@fluxer/constants/src/NameFonts';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useSyncExternalStore} from 'react';

const STALE_AFTER_MS = 120_000;
const BATCH_DELAY_MS = 40;
const MAX_BATCH = 100;

interface Entry {
	font: string | null;
	at: number;
}

const cache = new Map<string, Entry>();
const queued = new Map<string, Set<string>>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const keyFor = (userId: string, guildId: string | null | undefined) => `${guildId ?? ''}:${userId}`;

function emit(): void {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

async function flush(): Promise<void> {
	flushTimer = null;
	const groups = [...queued.entries()];
	queued.clear();
	const {http} = await import('@app/features/platform/transport/RestTransport');
	await Promise.all(
		groups.flatMap(([guildId, ids]) => {
			const list = [...ids];
			const chunks: Array<Array<string>> = [];
			for (let i = 0; i < list.length; i += MAX_BATCH) chunks.push(list.slice(i, i + MAX_BATCH));
			return chunks.map(async (chunk) => {
				try {
					const res = await http.post<{fonts: Record<string, string | null>}>('/name-fonts/lookup', {
						body: {user_ids: chunk, guild_id: guildId || null},
					});
					const now = Date.now();
					for (const id of chunk) cache.set(keyFor(id, guildId || null), {font: res.body.fonts[id] ?? null, at: now});
				} catch {
					// Leave them uncached for a while rather than retrying in a tight loop.
					const now = Date.now() - STALE_AFTER_MS / 2;
					for (const id of chunk) {
						const key = keyFor(id, guildId || null);
						if (!cache.has(key)) cache.set(key, {font: null, at: now});
					}
				} finally {
					for (const id of chunk) inflight.delete(keyFor(id, guildId || null));
				}
			});
		}),
	);
	emit();
}

function request(userId: string, guildId: string | null | undefined): void {
	const key = keyFor(userId, guildId);
	const entry = cache.get(key);
	if ((entry && Date.now() - entry.at < STALE_AFTER_MS) || inflight.has(key)) return;
	inflight.add(key);
	const group = guildId ?? '';
	let ids = queued.get(group);
	if (!ids) {
		ids = new Set();
		queued.set(group, ids);
	}
	ids.add(userId);
	flushTimer ??= setTimeout(() => void flush(), BATCH_DELAY_MS);
}

/** Drops cached fonts for a user (e.g. after they change theirs) and looks them up again. */
export function invalidateNameFont(userId: string): void {
	const keys = [...cache.keys()].filter((key) => key.endsWith(`:${userId}`));
	for (const key of keys) cache.delete(key);
	for (const key of keys) request(userId, key.slice(0, key.indexOf(':')) || null);
	emit();
}

/** The font id a user's name is shown in (in the given community, if any), or null. */
export function useNameFont(userId: string | null | undefined, guildId: string | null | undefined): string | null {
	const key = userId ? keyFor(userId, guildId) : null;
	const font = useSyncExternalStore(subscribe, () => (key ? (cache.get(key)?.font ?? null) : null));
	useEffect(() => {
		if (userId) request(userId, guildId);
	}, [userId, guildId]);
	return font;
}

const KNOWN = new Map(NAME_FONTS.map((font) => [font.id, font]));
let facesInstalled = false;

/** Adds @font-face rules once; each file only downloads when a name uses it. */
function installFaces(): void {
	if (facesInstalled || typeof document === 'undefined') return;
	facesInstalled = true;
	const style = document.createElement('style');
	style.id = 'sparkcord-name-fonts';
	style.textContent = NAME_FONTS.map(
		(font) =>
			`@font-face{font-family:"Sparkcord ${font.id}";src:url("/assets/name-fonts/${font.id}.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:swap;}`,
	).join('\n');
	document.head.appendChild(style);
}

export function nameFontFamily(fontId: string | null | undefined): string | undefined {
	if (!fontId || !KNOWN.has(fontId)) return undefined;
	installFaces();
	return `"Sparkcord ${fontId}", var(--font-sans, sans-serif)`;
}

/**
 * Draws children in a font id directly (tuppers). Does nothing when the viewer turned
 * name fonts off (Settings > Accessibility); the font pickers use nameFontFamily and
 * keep showing their samples.
 */
export const FontSpan = observer(function FontSpan({
	font,
	children,
}: {
	font: string | null | undefined;
	children: React.ReactNode;
}) {
	const family = SparkcordPrefs.get('plainNameFonts') ? undefined : nameFontFamily(font);
	if (!family) return <>{children}</>;
	return <span style={{fontFamily: family}}>{children}</span>;
});

/** Draws a user's name in their chosen font (as shown in the given community). */
export function NameFont({
	userId,
	guildId,
	children,
}: {
	userId: string | null | undefined;
	guildId?: string | null;
	children: React.ReactNode;
}) {
	const font = useNameFont(userId, guildId);
	return <FontSpan font={font}>{children}</FontSpan>;
}
