// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The current user's tupper names, for slash-command autocomplete. Loaded lazily, refreshed
// after tupper commands or settings changes. Keep imports minimal (see TupperShared).

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import type {TupperWire} from '@app/features/tupper/TupperShared';
import {useEffect, useSyncExternalStore} from 'react';

const STALE_AFTER_MS = 60_000;
const EMPTY: ReadonlyArray<string> = Object.freeze([]);

let names: ReadonlyArray<string> = EMPTY;
let loadedAt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

export function setTupperNames(tuppers: ReadonlyArray<Pick<TupperWire, 'name'>>): void {
	names = Object.freeze(tuppers.map((t) => t.name).sort((a, b) => a.localeCompare(b)));
	loadedAt = Date.now();
	emit();
}

export function refreshTupperNames(): Promise<void> {
	pending ??= http
		.get<Array<TupperWire>>(Endpoints.USER_TUPPERS)
		.then((response) => setTupperNames(response.body))
		.catch(() => {})
		.finally(() => {
			pending = null;
		});
	return pending;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Tupper names for autocomplete; loads them on first use and when stale. */
export function useTupperNames(): ReadonlyArray<string> {
	useEffect(() => {
		if (Date.now() - loadedAt > STALE_AFTER_MS) void refreshTupperNames();
	}, []);
	return useSyncExternalStore(subscribe, () => names);
}
