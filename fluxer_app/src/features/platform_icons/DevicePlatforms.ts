// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: platform icons. Each client tells the server once a minute which kind of
// app it is (web, desktop or mobile) unless the person hid it or is invisible, and
// looks up other people's kinds in small batches when their icons are on screen.

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import LocalPresence from '@app/features/presence/state/LocalPresence';
import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import {isElectron} from '@app/features/ui/utils/ElectronRuntime';
import {StatusTypes} from '@fluxer/constants/src/StatusConstants';
import {autorun, observable, runInAction} from 'mobx';

export type DevicePlatform = 'web' | 'desktop' | 'mobile';

const REPORT_EVERY_MS = 60_000;
const REFRESH_EVERY_MS = 60_000;
const BATCH_DELAY_MS = 200;
const MAX_BATCH = 100;

export function currentDevicePlatform(): DevicePlatform {
	if (isElectron()) return 'desktop';
	if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
		return 'mobile';
	}
	return 'web';
}

// ---- Reporting this client ----

let reporting = false;
let reported = false;

function shouldReport(): boolean {
	if (SparkcordPrefs.get('hidePlatform')) return false;
	const status = LocalPresence.getStatus();
	return status !== StatusTypes.INVISIBLE && status !== StatusTypes.OFFLINE;
}

async function report(): Promise<void> {
	const platform = currentDevicePlatform();
	try {
		if (shouldReport()) {
			await http.put(Endpoints.SPARKCORD_PLATFORM(platform));
			reported = true;
		} else if (reported) {
			reported = false;
			await http.delete(Endpoints.SPARKCORD_PLATFORM(platform));
		}
	} catch {
		// Not essential; the next round tries again.
	}
}

/** Starts reporting this client's platform. Safe to call on every gateway ready. */
export function startPlatformReporting(): void {
	if (reporting) {
		void report();
		return;
	}
	reporting = true;
	// Assume a report from an earlier page load may still be live, so hiding clears it.
	reported = true;
	// Runs now, and again whenever the hide setting or the person's status changes.
	autorun(() => {
		shouldReport();
		void report();
	});
	window.setInterval(() => void report(), REPORT_EVERY_MS);
}

// ---- Reading other people ----

const known = observable.map<string, ReadonlyArray<DevicePlatform>>({}, {deep: false});
const fetchedAt = new Map<string, number>();
const watched = new Map<string, number>();
const pending = new Set<string>();
let batchTimer: number | null = null;
let refreshTimer: number | null = null;

async function flush(): Promise<void> {
	batchTimer = null;
	const ids = [...pending].slice(0, MAX_BATCH);
	for (const id of ids) pending.delete(id);
	if (pending.size > 0) batchTimer = window.setTimeout(() => void flush(), BATCH_DELAY_MS);
	if (ids.length === 0) return;
	try {
		const response = await http.post<{platforms: Record<string, Array<DevicePlatform>>}>(
			Endpoints.SPARKCORD_PLATFORMS_QUERY,
			{body: {user_ids: ids}},
		);
		const now = Date.now();
		runInAction(() => {
			for (const id of ids) {
				fetchedAt.set(id, now);
				const platforms = response.body.platforms[id];
				if (platforms && platforms.length > 0) known.set(id, platforms);
				else known.delete(id);
			}
		});
	} catch {
		// Leave what is known; the refresh round asks again.
	}
}

function request(userId: string): void {
	pending.add(userId);
	if (batchTimer === null) batchTimer = window.setTimeout(() => void flush(), BATCH_DELAY_MS);
}

function refreshWatched(): void {
	if (watched.size === 0) {
		if (refreshTimer !== null) window.clearInterval(refreshTimer);
		refreshTimer = null;
		return;
	}
	if (typeof document !== 'undefined' && document.hidden) return;
	for (const userId of watched.keys()) request(userId);
}

/** Call while an icon for this person is on screen; returns the function that ends it. */
export function watchPlatforms(userId: string): () => void {
	watched.set(userId, (watched.get(userId) ?? 0) + 1);
	if (Date.now() - (fetchedAt.get(userId) ?? 0) > REFRESH_EVERY_MS / 2) request(userId);
	if (refreshTimer === null) refreshTimer = window.setInterval(refreshWatched, REFRESH_EVERY_MS);
	return () => {
		const count = (watched.get(userId) ?? 1) - 1;
		if (count <= 0) watched.delete(userId);
		else watched.set(userId, count);
	};
}

/** The platforms last seen for this person (observable). */
export function getPlatforms(userId: string): ReadonlyArray<DevicePlatform> {
	return known.get(userId) ?? [];
}
