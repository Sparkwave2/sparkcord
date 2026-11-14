// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal types for the parts of WebTorrent's browser bundle Sparkcord uses.

declare module 'webtorrent/dist/webtorrent.min.js' {
	export interface WebTorrentFile {
		name: string;
		length: number;
		blob(): Promise<Blob>;
	}

	export interface Torrent {
		infoHash: string;
		magnetURI: string;
		name: string;
		length: number;
		progress: number;
		downloaded: number;
		uploaded: number;
		downloadSpeed: number;
		uploadSpeed: number;
		numPeers: number;
		done: boolean;
		ready: boolean;
		files: Array<WebTorrentFile>;
		on(event: 'done' | 'ready' | 'wire' | 'noPeers', listener: (...args: Array<unknown>) => void): void;
		on(event: 'error' | 'warning', listener: (error: Error | string) => void): void;
		destroy(opts?: {destroyStore?: boolean}, callback?: (error?: Error) => void): void;
	}

	export interface TorrentOptions {
		announce?: Array<string>;
		name?: string;
		private?: boolean;
	}

	export interface WebTorrentOptions {
		tracker?: {rtcConfig?: RTCConfiguration} | boolean;
		dht?: boolean;
		lsd?: boolean;
		utp?: boolean;
		natUpnp?: boolean;
		natPmp?: boolean;
		webSeeds?: boolean;
	}

	export default class WebTorrent {
		constructor(opts?: WebTorrentOptions);
		torrents: Array<Torrent>;
		seed(input: File | Blob | Array<File>, opts: TorrentOptions, onSeed?: (torrent: Torrent) => void): Torrent;
		add(magnet: string, opts: TorrentOptions, onTorrent?: (torrent: Torrent) => void): Torrent;
		get(infoHash: string): Promise<Torrent | null> | Torrent | null;
		on(event: 'error', listener: (error: Error | string) => void): void;
		destroy(callback?: (error?: Error) => void): void;
	}
}
