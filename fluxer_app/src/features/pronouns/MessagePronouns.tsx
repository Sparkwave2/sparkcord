// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: pronouns next to names in messages (optional, Settings > Appearance >
// Messages). Tuppers carry their pronouns on the message. For accounts the pronouns are
// part of the profile, so they are read through the normal profile request (which
// applies the person's profile privacy), a few at a time, and remembered for a while.

import styles from '@app/features/pronouns/MessagePronouns.module.css';
import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import {observer} from 'mobx-react-lite';
import {useEffect, useSyncExternalStore} from 'react';

const STALE_AFTER_MS = 10 * 60_000;
const RETRY_AFTER_MS = 60_000;
const REQUEST_SPACING_MS = 350;

interface Entry {
	pronouns: string | null;
	at: number;
}

const cache = new Map<string, Entry>();
const queue: Array<{userId: string; guildId: string | null}> = [];
const queuedKeys = new Set<string>();
const listeners = new Set<() => void>();
let running = false;

const keyFor = (userId: string, guildId: string | null) => `${guildId ?? ''}:${userId}`;

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

async function run(): Promise<void> {
	if (running) return;
	running = true;
	// Loaded on demand: the profile commands pull in a large part of the app.
	const commands = await import('@app/features/user/commands/UserProfileCommands');
	while (queue.length > 0) {
		const next = queue.shift()!;
		const key = keyFor(next.userId, next.guildId);
		try {
			const profile = await commands.fetch(next.userId, next.guildId ?? undefined);
			const pronouns = profile.getEffectiveProfile().pronouns?.trim() || null;
			cache.set(key, {pronouns, at: Date.now()});
		} catch {
			// Blocked, deleted or rate limited: try again later rather than at once.
			cache.set(key, {pronouns: null, at: Date.now() - STALE_AFTER_MS + RETRY_AFTER_MS});
		}
		queuedKeys.delete(key);
		for (const listener of listeners) listener();
		await new Promise((resolve) => setTimeout(resolve, REQUEST_SPACING_MS));
	}
	running = false;
}

function request(userId: string, guildId: string | null): void {
	const key = keyFor(userId, guildId);
	const entry = cache.get(key);
	if ((entry && Date.now() - entry.at < STALE_AFTER_MS) || queuedKeys.has(key)) return;
	queuedKeys.add(key);
	queue.push({userId, guildId});
	void run();
}

function useUserPronouns(userId: string | null, guildId: string | null): string | null {
	const key = userId ? keyFor(userId, guildId) : null;
	const pronouns = useSyncExternalStore(subscribe, () => (key ? (cache.get(key)?.pronouns ?? null) : null));
	useEffect(() => {
		if (userId) request(userId, guildId);
	}, [userId, guildId]);
	return pronouns;
}

/**
 * The pronouns of a message's author, shown after their name when the viewer turned
 * the option on. Pass `proxyPronouns` for tupper messages (then no account is looked up).
 */
export const MessagePronouns = observer(function MessagePronouns({
	userId,
	guildId,
	isProxy,
	proxyPronouns,
}: {
	userId: string;
	guildId: string | null;
	isProxy: boolean;
	proxyPronouns?: string | null;
}) {
	const enabled = SparkcordPrefs.get('showPronouns');
	const userPronouns = useUserPronouns(enabled && !isProxy ? userId : null, guildId);
	if (!enabled) return null;
	const pronouns = isProxy ? proxyPronouns?.trim() : userPronouns;
	if (!pronouns) return null;
	return <span className={styles.pronouns}>{pronouns}</span>;
});
