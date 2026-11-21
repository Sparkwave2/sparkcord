// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The current user's tuppers and tupper settings, cached on the client for slash-command
// autocomplete and for showing a sent message as the tupper straight away (before the
// server confirms). Loaded lazily, refreshed after tupper commands or settings changes.
// Keep imports minimal (see TupperShared).

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {
	matchProxyTagsLocal,
	type TupperSettingsWire,
	type TupperWire,
} from '@app/features/tupper/TupperShared';
import type {MessageProxyResponse} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {useEffect, useSyncExternalStore} from 'react';

const STALE_AFTER_MS = 60_000;
const EMPTY: ReadonlyArray<string> = Object.freeze([]);

let tuppers: ReadonlyArray<TupperWire> = [];
let settings: TupperSettingsWire | null = null;
let names: ReadonlyArray<string> = EMPTY;
let loadedAt = 0;
let pending: Promise<void> | null = null;

/** A channel's own autoproxy (set with tp!auto there); channels not listed follow the default. */
interface ChannelAutoproxyWire {
	channel_id: string;
	mode: 'off' | 'front' | 'latch' | null;
	tupper_id: string | null;
	latch_tupper_id: string | null;
}
let channelAutoproxy = new Map<string, ChannelAutoproxyWire>();
/** The tupper latch mode last used in each channel, as far as this client knows. */
const channelLatches = new Map<string, string | null>();
const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

export function setTupperNames(list: ReadonlyArray<TupperWire>): void {
	tuppers = list;
	names = Object.freeze(list.map((t) => t.name).sort((a, b) => a.localeCompare(b)));
	loadedAt = Date.now();
	emit();
}

export function setTupperSettings(value: TupperSettingsWire): void {
	settings = value;
}

export function refreshTupperNames(): Promise<void> {
	pending ??= Promise.all([
		http.get<Array<TupperWire>>(Endpoints.USER_TUPPERS),
		http.get<TupperSettingsWire>(Endpoints.USER_TUPPER_SETTINGS),
		http.get<Array<ChannelAutoproxyWire>>(Endpoints.USER_TUPPER_AUTOPROXY_CHANNELS).catch(() => null),
	])
		.then(([list, current, channels]) => {
			settings = current.body;
			if (channels?.body) {
				channelAutoproxy = new Map(channels.body.map((entry) => [entry.channel_id, entry]));
				for (const entry of channels.body) channelLatches.set(entry.channel_id, entry.latch_tupper_id);
			}
			setTupperNames(list.body);
		})
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

/** Tupper names for autocomplete; loads tuppers and settings on first use and when stale. */
export function useTupperNames(): ReadonlyArray<string> {
	useEffect(() => {
		if (Date.now() - loadedAt > STALE_AFTER_MS) void refreshTupperNames();
	}, []);
	return useSyncExternalStore(subscribe, () => names);
}

/**
 * Predicts how the server will proxy a message, mirroring TupperService.resolveProxy, so the
 * optimistic message already shows the tupper. Also mirrors the latch bookkeeping. Returns
 * null when the message would be sent as the user (or nothing is loaded yet); the server's
 * response replaces the optimistic message either way.
 */
export function predictTupperProxy(
	content: string,
	hasAttachments: boolean,
	channelId: string,
): {proxy: MessageProxyResponse; content: string} | null {
	if (tuppers.length === 0 || settings === null || !settings.proxy_enabled) return null;
	if (content.length === 0 && !hasAttachments) return null;
	// Autoproxy is per channel: the channel's own mode, else the account default.
	const own = channelAutoproxy.get(channelId);
	const mode = own?.mode ?? settings.autoproxy_mode;
	const frontId = own?.mode != null ? own.tupper_id : settings.autoproxy_tupper_id;
	if (content.startsWith('\\')) {
		if (content.startsWith('\\\\') && mode === 'latch') channelLatches.set(channelId, null);
		return null;
	}
	let tupper: TupperWire | undefined;
	let proxiedContent = content;
	const match = matchProxyTagsLocal(content, tuppers, hasAttachments);
	if (match) {
		tupper = match.tupper;
		proxiedContent = match.content;
		if (mode === 'latch') channelLatches.set(channelId, tupper.id);
	} else {
		const autoId = mode === 'front' ? frontId : mode === 'latch' ? (channelLatches.get(channelId) ?? null) : null;
		tupper = autoId === null ? undefined : tuppers.find((t) => t.id === autoId);
	}
	if (!tupper) return null;
	return {
		content: proxiedContent,
		proxy: {
			tupper_id: tupper.id,
			name: tupper.display_name ?? tupper.name,
			avatar_url: tupper.avatar_proxy_url,
			color: tupper.color,
			pronouns: tupper.pronouns,
			system_tag: tupper.tag ?? settings.system_tag,
			font: tupper.font ?? null,
		},
	};
}
