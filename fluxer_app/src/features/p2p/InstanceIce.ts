// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: this instance's STUN/TURN servers (served by the tracker at /tracker-ice,
// with short-lived TURN credentials). Used by peer-to-peer voice calls, which otherwise
// only get the STUN URLs the API hands out and can't connect across NATs.

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';

const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

let cached: Array<RTCIceServer> = [];
let fetchedAt = 0;
let pending: Promise<void> | null = null;

function iceUrl(): string {
	// In the desktop app the page isn't served by the instance, so use its web address.
	try {
		const base = RuntimeConfig.webAppEndpoint;
		if (base) return new URL('/tracker-ice', base).toString();
	} catch {
		// Fall through to the page's own origin.
	}
	return '/tracker-ice';
}

/** Fetches the list (again once it's a few hours old; the TURN credentials last a day). */
export function refreshInstanceIce(): Promise<void> {
	if (pending) return pending;
	if (fetchedAt && Date.now() - fetchedAt < REFRESH_AFTER_MS) return Promise.resolve();
	pending = fetch(iceUrl())
		.then((res) => (res.ok ? (res.json() as Promise<{iceServers?: Array<RTCIceServer>}>) : {}))
		.then((body) => {
			if (Array.isArray(body.iceServers)) {
				cached = body.iceServers;
				fetchedAt = Date.now();
			}
		})
		.catch(() => {})
		.finally(() => {
			pending = null;
		});
	return pending;
}

/** The last fetched list (empty until the first fetch finishes). Also starts a refresh when it's stale. */
export function instanceIceServers(): Array<RTCIceServer> {
	void refreshInstanceIce();
	return cached;
}
