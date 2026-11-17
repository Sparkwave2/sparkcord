// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: this instance's STUN/TURN servers (served by the tracker at /tracker-ice,
// with short-lived TURN credentials) and its peer-to-peer tracker. Used by peer-to-peer
// voice calls (which otherwise only get the STUN URLs the API hands out and can't connect
// across NATs) and by peer-to-peer file sharing.

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';

const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

let cached: Array<RTCIceServer> = [];
let fetchedAt = 0;
let pending: Promise<void> | null = null;

/**
 * The instance's web address. In the desktop app the page isn't served by the instance
 * (it has its own local origin), so the page's own address can't be used there.
 */
function instanceBase(): URL {
	try {
		const base = RuntimeConfig.webAppEndpoint;
		if (base) return new URL(base);
	} catch {
		// Fall through to the page's own origin.
	}
	return new URL(location.origin);
}

function iceUrl(): string {
	return new URL('/tracker-ice', instanceBase()).toString();
}

/** The instance's WebSocket tracker for peer-to-peer file sharing. */
export function instanceTrackerUrl(): string {
	const base = instanceBase();
	const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${scheme}//${base.host}/tracker`;
}

/** Fetches the list if needed and returns it (empty when the instance has none). */
export async function loadInstanceIce(): Promise<Array<RTCIceServer>> {
	await refreshInstanceIce();
	return cached;
}

/** Fetches the list (again once it's a few hours old; the TURN credentials last a day). */
export function refreshInstanceIce(): Promise<void> {
	if (pending) return pending;
	if (fetchedAt && Date.now() - fetchedAt < REFRESH_AFTER_MS) return Promise.resolve();
	pending = fetch(iceUrl())
		.then((res): Promise<{iceServers?: Array<RTCIceServer>}> => (res.ok ? res.json() : Promise.resolve({})))
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
