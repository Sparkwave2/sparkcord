// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: this client's connection latency, measured from gateway heartbeats (time
// from sending one to its acknowledgement). A leaf module: the gateway writes to it and
// the message queue reads it when sending.

import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';

/** Latency from this many milliseconds up is reported with sent messages. */
export const HIGH_LATENCY_MS = 400;
/** A measurement older than this says nothing about the connection now. */
const FRESH_FOR_MS = 120_000;

let lastLatencyMs: number | null = null;
let measuredAt = 0;

/** Called by the gateway each time a heartbeat is acknowledged. */
export function recordGatewayLatency(latencyMs: number): void {
	if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
	lastLatencyMs = Math.round(latencyMs);
	measuredAt = Date.now();
}

/** The most recent latency, or null when there is no recent measurement. */
export function currentLatencyMs(): number | null {
	if (lastLatencyMs === null || Date.now() - measuredAt > FRESH_FOR_MS) return null;
	return lastLatencyMs;
}

/** The latency to send along with a message: only when high, and not when the person hides it. */
export function latencyToReport(): number | null {
	if (SparkcordPrefs.get('hideMyLatency')) return null;
	const latency = currentLatencyMs();
	return latency !== null && latency >= HIGH_LATENCY_MS ? latency : null;
}
