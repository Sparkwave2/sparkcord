// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord peer-to-peer transfers: one WebTorrent client per tab (loaded on first use),
// using this instance's tracker and the voice server's STUN/TURN servers. Files are
// shared only while the tab stays open. Downloaded files are shared on to others too
// while the tab is open, like any torrent.

import {instanceTrackerUrl, loadInstanceIce} from '@app/features/p2p/InstanceIce';
import {markMagnet} from '@app/features/p2p/P2PShare';
import type WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import type {Torrent} from 'webtorrent/dist/webtorrent.min.js';
import {useSyncExternalStore} from 'react';

export type TransferStatus = 'seeding' | 'connecting' | 'downloading' | 'done' | 'error';

export interface TransferState {
	infoHash: string;
	status: TransferStatus;
	/** 0..1 */
	progress: number;
	peers: number;
	downloadSpeed: number;
	uploadSpeed: number;
	uploaded: number;
	/** True when this tab created the share (it's the original sender). */
	ownShare: boolean;
	error: string | null;
}

const transfers = new Map<string, TransferState>();
const torrents = new Map<string, Torrent>();
const listeners = new Set<() => void>();
let version = 0;
let clientPromise: Promise<WebTorrent> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

function emit(): void {
	version++;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * WebTorrent keeps each torrent's data in the site's private file storage (OPFS), in a
 * folder named "<file name> - <first 8 of info hash>". That storage is shared by every
 * tab of the site and outlives the tab, so each tab holds a Web Lock on the folders it
 * uses, and folders nobody holds (left by closed tabs) are deleted when sharing starts.
 */
const LOCK_PREFIX = 'sparkcord-p2p:';
const STORE_DIR_PATTERN = / - [0-9a-f]{8}$/;
const lockReleases = new Map<string, () => void>();

function storeDirName(name: string, infoHash: string): string {
	return `${name} - ${infoHash.slice(0, 8)}`;
}

function holdStoreLock(dirName: string): void {
	if (!navigator.locks || lockReleases.has(dirName)) return;
	void navigator.locks.request(
		LOCK_PREFIX + dirName,
		() =>
			new Promise<void>((release) => {
				lockReleases.set(dirName, release);
			}),
	);
}

function releaseStoreLock(dirName: string): void {
	lockReleases.get(dirName)?.();
	lockReleases.delete(dirName);
}

async function removeStaleStores(): Promise<void> {
	if (!navigator.locks || !navigator.storage?.getDirectory) return;
	const root = await navigator.storage.getDirectory();
	const names: Array<string> = [];
	for await (const name of (root as unknown as {keys(): AsyncIterable<string>}).keys()) {
		if (STORE_DIR_PATTERN.test(name)) names.push(name);
	}
	for (const name of names) {
		await navigator.locks.request(LOCK_PREFIX + name, {ifAvailable: true}, async (lock) => {
			if (lock) await root.removeEntry(name, {recursive: true}).catch(() => {});
		});
	}
}

/** True when another tab of this browser is already sharing or downloading the file. */
async function heldByAnotherTab(infoHash: string): Promise<boolean> {
	if (!navigator.locks) return false;
	const suffix = ` - ${infoHash.slice(0, 8)}`;
	const {held = []} = await navigator.locks.query();
	return held.some((lock) => lock.name?.startsWith(LOCK_PREFIX) && lock.name.endsWith(suffix));
}

function getClient(): Promise<WebTorrent> {
	clientPromise ??= (async () => {
		const [{default: WebTorrentClass}, iceServers] = await Promise.all([
			import('webtorrent/dist/webtorrent.min.js'),
			loadInstanceIce(),
		]);
		const client = new WebTorrentClass({
			tracker: {rtcConfig: {iceServers}},
			dht: false,
			lsd: false,
			utp: false,
			natUpnp: false,
			natPmp: false,
		});
		client.on('error', (error) => console.warn('[p2p]', error));
		window.addEventListener('beforeunload', warnIfSharing);
		await removeStaleStores().catch(() => {});
		return client;
	})();
	return clientPromise;
}

function warnIfSharing(event: BeforeUnloadEvent): void {
	const sharing = [...transfers.values()].some((t) => t.ownShare && t.status === 'seeding');
	if (sharing) event.preventDefault();
}

function refresh(): void {
	let changed = false;
	for (const [hash, torrent] of torrents) {
		const state = transfers.get(hash);
		if (!state || state.status === 'error') continue;
		const next: TransferState = {
			...state,
			progress: torrent.progress,
			peers: torrent.numPeers,
			downloadSpeed: torrent.downloadSpeed,
			uploadSpeed: torrent.uploadSpeed,
			uploaded: torrent.uploaded,
			status: state.ownShare
				? 'seeding'
				: torrent.done
					? 'done'
					: torrent.numPeers > 0 || torrent.downloaded > 0
						? 'downloading'
						: 'connecting',
		};
		if (JSON.stringify(next) !== JSON.stringify(state)) {
			transfers.set(hash, next);
			changed = true;
		}
	}
	if (changed) emit();
	if (torrents.size === 0 && ticker) {
		clearInterval(ticker);
		ticker = null;
	}
}

/** `infoHash` is passed in: a torrent added from a magnet link only learns it later. */
function track(torrent: Torrent, ownShare: boolean, infoHash: string): void {
	const hash = infoHash;
	torrents.set(hash, torrent);
	transfers.set(hash, {
		infoHash: hash,
		status: ownShare ? 'seeding' : 'connecting',
		progress: ownShare ? 1 : 0,
		peers: 0,
		downloadSpeed: 0,
		uploadSpeed: 0,
		uploaded: 0,
		ownShare,
		error: null,
	});
	torrent.on('error', (error) => {
		const state = transfers.get(hash);
		if (state) transfers.set(hash, {...state, status: 'error', error: String(error)});
		emit();
	});
	torrent.on('done', () => refresh());
	ticker ??= setInterval(refresh, 500);
	emit();
}

export type PreparePhase = 'queued' | 'reading' | 'saving';

export interface PrepareState {
	phase: PreparePhase;
	/** When the current phase started (for elapsed time). */
	since: number;
	size: number;
	/** Bytes WebTorrent has read from the file so far (it reads it once to hash it). */
	bytesRead: number;
}

export class ShareCancelledError extends Error {
	constructor() {
		super('Sharing was cancelled');
	}
}

const preparing = new Map<string, PrepareState & {cancel: () => void}>();

function setPreparing(id: string, phase: PreparePhase, size: number, cancel: () => void): void {
	preparing.set(id, {phase, since: Date.now(), size, bytesRead: preparing.get(id)?.bytesRead ?? 0, cancel});
	emit();
}

let emitTimer: ReturnType<typeof setTimeout> | null = null;
function emitSoon(): void {
	emitTimer ??= setTimeout(() => {
		emitTimer = null;
		emit();
	}, 250);
}

/**
 * The same file, but counting the bytes WebTorrent reads from it (it reads files with
 * stream()), which is how the "Preparing" card shows real progress. No data is copied.
 */
class CountingFile extends File {
	constructor(
		source: File,
		private readonly onRead: (bytes: number) => void,
	) {
		super([source], source.name, {type: source.type, lastModified: source.lastModified});
	}

	override stream(): ReturnType<File['stream']> {
		const counter = new TransformStream<Uint8Array, Uint8Array>({
			transform: (chunk, controller) => {
				this.onRead(chunk.byteLength);
				controller.enqueue(chunk);
			},
		});
		return super.stream().pipeThrough(counter) as ReturnType<File['stream']>;
	}
}

/** Marks a share as waiting its turn (files are prepared one at a time). */
export function queuePreparing(id: string, size: number): void {
	setPreparing(id, 'queued', size, () => {
		preparing.delete(id);
		cancelledQueued.add(id);
		emit();
	});
}

const cancelledQueued = new Set<string>();

export function cancelPreparing(id: string): void {
	preparing.get(id)?.cancel();
}

export function usePreparing(id: string | null): PrepareState | null {
	useSyncExternalStore(subscribe, () => version);
	return id ? (preparing.get(id) ?? null) : null;
}

/**
 * Starts sharing a file from this tab; resolves to the magnet link to post. WebTorrent
 * first reads and hashes the whole file, then stores a copy to share from; `id` tracks
 * that for the "Preparing" card. Rejects with ShareCancelledError if cancelled.
 */
export async function shareFile(file: File, id: string): Promise<string> {
	if (cancelledQueued.delete(id)) throw new ShareCancelledError();
	// Show it as started right away (loading WebTorrent can take a moment).
	let cancelledEarly = false;
	setPreparing(id, 'reading', file.size, () => {
		cancelledEarly = true;
		preparing.delete(id);
		emit();
	});
	const client = await getClient();
	if (cancelledEarly) throw new ShareCancelledError();
	return new Promise((resolve, reject) => {
		let torrent: Torrent | null = null;
		const cancel = () => {
			preparing.delete(id);
			emit();
			torrent?.destroy({destroyStore: true});
			reject(new ShareCancelledError());
		};
		setPreparing(id, 'reading', file.size, cancel);
		const counted = new CountingFile(file, (bytes) => {
			const state = preparing.get(id);
			if (!state) return;
			state.bytesRead += bytes;
			emitSoon();
		});
		try {
			torrent = client.seed(counted, {announce: [instanceTrackerUrl()], name: file.name}, (ready) => {
				if (!preparing.has(id)) return;
				preparing.delete(id);
				holdStoreLock(storeDirName(ready.name, ready.infoHash));
				track(ready, true, ready.infoHash);
				resolve(markMagnet(ready.magnetURI, file.size));
			});
			torrent.on('infoHash', () => {
				if (preparing.has(id)) setPreparing(id, 'saving', file.size, cancel);
			});
			torrent.on('error', (error) => {
				if (!preparing.has(id)) return;
				preparing.delete(id);
				emit();
				reject(error instanceof Error ? error : new Error(String(error)));
			});
		} catch (error) {
			preparing.delete(id);
			emit();
			reject(error);
		}
	});
}

/** Starts downloading a shared file into this tab. */
export async function startDownload(magnet: string, infoHash: string): Promise<void> {
	if (torrents.has(infoHash)) return;
	transfers.set(infoHash, {
		infoHash,
		status: 'connecting',
		progress: 0,
		peers: 0,
		downloadSpeed: 0,
		uploadSpeed: 0,
		uploaded: 0,
		ownShare: false,
		error: null,
	});
	emit();
	const client = await getClient();
	if (await heldByAnotherTab(infoHash)) {
		transfers.set(infoHash, {
			...(transfers.get(infoHash) as TransferState),
			status: 'error',
			error: 'this file is already open in another Sparkcord tab of this browser',
		});
		emit();
		return;
	}
	const torrent = client.add(magnet, {announce: [instanceTrackerUrl()]});
	torrent.on('ready', () => holdStoreLock(storeDirName(torrent.name, infoHash)));
	track(torrent, false, infoHash);
}

/** Saves a finished download to the user's device. */
export async function saveDownload(infoHash: string): Promise<void> {
	const torrent = torrents.get(infoHash);
	const file = torrent?.files[0];
	if (!file) return;
	const blob = await file.blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = file.name;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Stops sharing (and forgets) a transfer in this tab. */
export function stopTransfer(infoHash: string): void {
	const torrent = torrents.get(infoHash);
	torrents.delete(infoHash);
	transfers.delete(infoHash);
	if (torrent) {
		const dirName = storeDirName(torrent.name, infoHash);
		// Its callback isn't always called, so don't wait for it to release the lock.
		torrent.destroy({destroyStore: true});
		releaseStoreLock(dirName);
	}
	emit();
}

export function useTransfer(infoHash: string): TransferState | null {
	useSyncExternalStore(subscribe, () => version);
	return transfers.get(infoHash) ?? null;
}
