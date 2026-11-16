// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: a plain "is there a newer desktop app?" check. Fluxer's own updater needs
// its signed update servers, which Sparkcord doesn't have, so it stays off; instead the
// app reads one small file from the Sparkcord download page and, when that names a newer
// version, the app shows a notice that links to the page.
//
//   <download page>/latest.json   {"version": "1.2.0", "notes": "optional short text"}
//
// The download page address is baked in at build time (SPARKCORD_DOWNLOAD_URL).

import {SPARKCORD_DOWNLOAD_URL} from '@electron/common/Constants';
import {app, ipcMain, net} from 'electron';
import log from 'electron-log';

export interface SparkcordUpdateInfo {
	/** The version of the app that is running. */
	current: string;
	/** The newest version the download page offers, or null when it could not be read. */
	latest: string | null;
	/** True when `latest` is newer than `current`. */
	available: boolean;
	notes: string | null;
	/** The download page. */
	url: string;
}

const CACHE_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

let cached: {info: SparkcordUpdateInfo; at: number} | null = null;

function parts(version: string): Array<number> | null {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** True when version `a` is newer than `b`. Unreadable versions are never "newer". */
export function isNewerVersion(a: string, b: string): boolean {
	const left = parts(a);
	const right = parts(b);
	if (!left || !right) return false;
	for (let i = 0; i < 3; i++) {
		if (left[i] !== right[i]) return left[i] > right[i];
	}
	return false;
}

async function check(): Promise<SparkcordUpdateInfo> {
	const current = app.getVersion();
	const base = SPARKCORD_DOWNLOAD_URL.replace(/\/+$/, '');
	const info: SparkcordUpdateInfo = {current, latest: null, available: false, notes: null, url: SPARKCORD_DOWNLOAD_URL};
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await net.fetch(`${base}/latest.json`, {signal: controller.signal, cache: 'no-store'});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const body = (await response.json()) as {version?: unknown; notes?: unknown};
		if (typeof body.version === 'string' && parts(body.version)) {
			info.latest = body.version.trim().replace(/^v/, '');
			info.available = isNewerVersion(info.latest, current);
			info.notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;
		}
	} catch (error) {
		log.info('[SparkcordUpdate] Could not read the latest version:', error);
	} finally {
		clearTimeout(timer);
	}
	return info;
}

/** Call once, after the app is ready. */
export function installSparkcordUpdateCheck(): void {
	ipcMain.handle('sparkcord-update-check', async (): Promise<SparkcordUpdateInfo> => {
		if (cached && Date.now() - cached.at < CACHE_MS) return cached.info;
		const info = await check();
		// A failed read is retried on the next ask instead of being remembered.
		if (info.latest !== null) cached = {info, at: Date.now()};
		return info;
	});
}
