// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the voice chat radio and watch-together. One shared queue of YouTube videos
// per call. Nothing is streamed through the server: everyone's app plays the video in
// its own official YouTube player and the people in the call keep each other in step
// with small messages (SparkcordVoiceMessages, like the soundboard). Listening only is
// the radio; showing the player's picture is watch-together.
//
// The shared state has a revision number. Whoever changes something sends the whole
// state with the next revision; a higher revision wins, and for equal revisions the
// sender with the higher user id wins, so everyone ends up with the same state. Someone
// who joins asks ("hello") and one of the others answers with the current state.

import Authentication from '@app/features/auth/state/Authentication';
// The app removes window.localStorage at startup; this is the handle it kept.
import {getProtectedLocalStorage} from '@app/features/platform/state/ProtectedWebStorage';
import {http} from '@app/features/platform/transport/RestTransport';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {
	onSparkcordVoiceMessage,
	type SparkcordVoiceMessage,
	sendSparkcordVoiceMessage,
} from '@app/features/voice/engine/SparkcordVoiceMessages';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import type {Room} from 'livekit-client';
import {makeAutoObservable, runInAction} from 'mobx';

export interface RadioItem {
	/** Unique within the queue (the same video can be queued twice). */
	id: string;
	/** YouTube video id. */
	v: string;
	/** Title, when the person who added it could look it up. */
	t: string | null;
	/** User id of who added it. */
	by: string;
}

export const MAX_QUEUE = 25;
const MAX_TITLE = 100;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const VOLUME_KEY = 'sparkcord.radioVolume';
const VIDEO_KEY = 'sparkcord.radioShowVideo';
const PLAYER_ID = 'sparkcord-radio';
const TICK_MS = 1000;
/** How far a player may be from the shared position before it is moved. */
const MAX_DRIFT_SECONDS = 2.5;
const SEEK_COOLDOWN_MS = 4000;
const RECEIVE_WINDOW_MS = 10_000;
const RECEIVE_MAX_IN_WINDOW = 25;
/** YouTube player errors that mean "this video can't be played here at all". */
const UNPLAYABLE_ERRORS = new Set([100, 101, 150]);

const PLAYER_ENDED = 0;
const PLAYER_PLAYING = 1;
const PLAYER_PAUSED = 2;
const PLAYER_BUFFERING = 3;

function readStored(key: string): string | null {
	try {
		return getProtectedLocalStorage()?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function writeStored(key: string, value: string): void {
	try {
		getProtectedLocalStorage()?.setItem(key, value);
	} catch {
		// Not persisted; fine.
	}
}

function readVolume(): number {
	const raw = readStored(VOLUME_KEY);
	const value = raw === null ? Number.NaN : Number(raw);
	return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

/** The video id in a YouTube link (watch, youtu.be, shorts, live, embed, music), or null. */
export function parseYouTubeVideoId(input: string): string | null {
	const text = input.trim();
	if (VIDEO_ID.test(text)) return text;
	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
	let id: string | null = null;
	if (host === 'youtu.be') {
		id = url.pathname.split('/')[1] ?? null;
	} else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
		const parts = url.pathname.split('/').filter(Boolean);
		if (parts[0] === 'watch') id = url.searchParams.get('v');
		else if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed' || parts[0] === 'v') id = parts[1] ?? null;
	}
	return id && VIDEO_ID.test(id) ? id : null;
}

function parseItems(raw: unknown): Array<RadioItem> | null {
	if (!Array.isArray(raw) || raw.length > MAX_QUEUE) return null;
	const items: Array<RadioItem> = [];
	const seen = new Set<string>();
	for (const entry of raw) {
		if (typeof entry !== 'object' || entry === null) return null;
		const {id, v, t, by} = entry as {id?: unknown; v?: unknown; t?: unknown; by?: unknown};
		if (typeof id !== 'string' || !/^[\w-]{1,40}$/.test(id) || seen.has(id)) return null;
		if (typeof v !== 'string' || !VIDEO_ID.test(v)) return null;
		if (typeof by !== 'string' || !/^\d{1,20}$/.test(by)) return null;
		seen.add(id);
		items.push({id, v, t: typeof t === 'string' ? t.slice(0, MAX_TITLE) : null, by});
	}
	return items;
}

class Radio {
	/** The shared queue; the first item is the one playing. */
	items: Array<RadioItem> = [];
	playing = false;
	/** Shared position in seconds, as it was at `anchor`. */
	pos = 0;
	/** Length of the current video in seconds, once this device's player knows it. */
	duration = 0;
	/** Title of the current video as this device's player reports it. */
	playerTitle: string | null = null;
	/** The browser refused to start playback until the user clicks somewhere. */
	blocked = false;
	volume = readVolume();
	showVideo = readStored(VIDEO_KEY) === '1';
	/** Changes once a second while the radio is on, so the position display moves. */
	clock = 0;

	private rev = 0;
	private writer = '';
	private anchor = performance.now();
	private started = false;
	private room: Room | null = null;
	private channelId: string | null = null;
	private container: HTMLElement | null = null;
	private iframe: HTMLIFrameElement | null = null;
	private loadedItemId: string | null = null;
	private loadedAt = 0;
	private playerReady = false;
	private playerState = -1;
	private playerTime = 0;
	private playerTimeAt = 0;
	private listeningTimer: number | null = null;
	private lastSeekAt = 0;
	private appliedVolume = -1;
	private helloTimers: Array<number> = [];
	private answerTimer: number | null = null;
	private received = new Map<string, Array<number>>();

	constructor() {
		makeAutoObservable<
			this,
			| 'rev'
			| 'writer'
			| 'anchor'
			| 'started'
			| 'room'
			| 'channelId'
			| 'container'
			| 'iframe'
			| 'loadedItemId'
			| 'loadedAt'
			| 'playerReady'
			| 'playerState'
			| 'playerTime'
			| 'playerTimeAt'
			| 'listeningTimer'
			| 'lastSeekAt'
			| 'appliedVolume'
			| 'helloTimers'
			| 'answerTimer'
			| 'received'
		>(
			this,
			{
				rev: false,
				writer: false,
				anchor: false,
				started: false,
				room: false,
				channelId: false,
				container: false,
				iframe: false,
				loadedItemId: false,
				loadedAt: false,
				playerReady: false,
				playerState: false,
				playerTime: false,
				playerTimeAt: false,
				listeningTimer: false,
				lastSeekAt: false,
				appliedVolume: false,
				helloTimers: false,
				answerTimer: false,
				received: false,
			},
			{autoBind: true},
		);
	}

	/** Starts following the call (called after gateway READY). */
	start(): void {
		if (this.started) return;
		this.started = true;
		onSparkcordVoiceMessage((fromUserId, message) => this.handleMessage(fromUserId, message));
		window.addEventListener('message', (event) => this.handlePlayerMessage(event));
		window.setInterval(() => this.tick(), TICK_MS);
	}

	get current(): RadioItem | null {
		return this.items[0] ?? null;
	}

	get active(): boolean {
		return this.items.length > 0;
	}

	get canUse(): boolean {
		return MediaEngine.room !== null && MediaEngine.channelId !== null;
	}

	/** Where playback should be right now, in seconds. */
	get position(): number {
		// Reading the clock makes observers update once a second.
		void this.clock;
		return this.expected();
	}

	private expected(): number {
		return this.playing ? this.pos + (performance.now() - this.anchor) / 1000 : this.pos;
	}

	// ----- changes made on this device -----

	/** Adds a video to the end of the queue. Returns an error message key, or null. */
	async add(link: string): Promise<'invalid' | 'full' | 'no-call' | null> {
		const videoId = parseYouTubeVideoId(link);
		if (!videoId) return 'invalid';
		if (!this.canUse) return 'no-call';
		if (this.items.length >= MAX_QUEUE) return 'full';
		let title: string | null = null;
		try {
			const res = await http.get<{title: string | null}>(`/sparkcord/youtube/${videoId}`);
			title = typeof res.body.title === 'string' ? res.body.title.slice(0, MAX_TITLE) : null;
		} catch {
			// No title; the queue shows the link instead.
		}
		const me = Authentication.currentUserId;
		if (!me || !this.canUse) return 'no-call';
		if (this.items.length >= MAX_QUEUE) return 'full';
		const item: RadioItem = {id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, v: videoId, t: title, by: me};
		if (this.items.length === 0) this.commit([item], true, 0);
		else this.commit([...this.items, item], this.playing, this.expected());
		return null;
	}

	togglePlaying(): void {
		if (!this.active) return;
		this.commit(this.items, !this.playing, this.expected());
	}

	seek(seconds: number): void {
		if (!this.active) return;
		this.commit(this.items, this.playing, Math.max(0, seconds));
	}

	skip(): void {
		if (!this.active) return;
		this.commit(this.items.slice(1), true, 0);
	}

	remove(itemId: string): void {
		const index = this.items.findIndex((item) => item.id === itemId);
		if (index < 0) return;
		if (index === 0) this.skip();
		else this.commit(this.items.filter((item) => item.id !== itemId), this.playing, this.expected());
	}

	stop(): void {
		if (!this.active) return;
		this.commit([], false, 0);
	}

	setVolume(volume: number): void {
		this.volume = Math.min(1, Math.max(0, volume));
		writeStored(VOLUME_KEY, String(this.volume));
		this.applyVolume();
	}

	setShowVideo(show: boolean): void {
		this.showVideo = show;
		writeStored(VIDEO_KEY, show ? '1' : '0');
	}

	/** Called from a click, to start playback the browser held back. */
	unblock(): void {
		this.command('playVideo');
	}

	private commit(items: Array<RadioItem>, playing: boolean, pos: number): void {
		const me = Authentication.currentUserId;
		if (!me) return;
		this.rev += 1;
		this.writer = me;
		this.setState(items, items.length > 0 && playing, items.length > 0 ? pos : 0);
		this.broadcast();
	}

	private setState(items: Array<RadioItem>, playing: boolean, pos: number): void {
		const previous = this.current?.id ?? null;
		this.items = items;
		this.playing = playing;
		this.pos = pos;
		this.anchor = performance.now();
		this.lastSeekAt = 0;
		if ((this.current?.id ?? null) !== previous) {
			this.duration = 0;
			this.playerTitle = null;
		}
		this.reconcile();
	}

	// ----- messages between the people in the call -----

	private broadcast(): void {
		const room = this.room;
		if (!room || !this.channelId) return;
		const message: SparkcordVoiceMessage = {
			k: 'radio',
			op: 'state',
			ch: this.channelId,
			rev: this.rev,
			items: this.items,
			playing: this.playing,
			pos: Math.round(this.expected() * 100) / 100,
		};
		void sendSparkcordVoiceMessage(room, message).catch(() => {});
	}

	private sayHello(): void {
		const room = this.room;
		if (!room || !this.channelId || this.rev > 0) return;
		void sendSparkcordVoiceMessage(room, {k: 'radio', op: 'hello', ch: this.channelId}).catch(() => {});
	}

	/** Sends the current state after a short random wait, unless someone else does first. */
	private answerSoon(): void {
		if (this.rev === 0 || this.answerTimer !== null) return;
		this.answerTimer = window.setTimeout(
			() => {
				this.answerTimer = null;
				this.broadcast();
			},
			150 + Math.random() * 500,
		);
	}

	private handleMessage(fromUserId: string, message: SparkcordVoiceMessage): void {
		if (message.k !== 'radio' || message.ch !== this.channelId || this.channelId === null) return;
		const now = Date.now();
		const recent = (this.received.get(fromUserId) ?? []).filter((at) => now - at < RECEIVE_WINDOW_MS);
		if (recent.length >= RECEIVE_MAX_IN_WINDOW) return;
		recent.push(now);
		this.received.set(fromUserId, recent);

		if (message.op === 'hello') {
			this.answerSoon();
			return;
		}
		if (message.op !== 'state') return;
		const {rev, playing, pos} = message as {rev?: unknown; playing?: unknown; pos?: unknown};
		if (typeof rev !== 'number' || !Number.isSafeInteger(rev) || rev < 1) return;
		if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0) return;
		const items = parseItems(message.items);
		if (!items) return;
		if (rev >= this.rev && this.answerTimer !== null) {
			// Someone already told the newcomer.
			window.clearTimeout(this.answerTimer);
			this.answerTimer = null;
		}
		if (rev < this.rev) {
			// They missed newer changes (for example they just joined): tell them.
			this.answerSoon();
			return;
		}
		if (rev === this.rev && fromUserId <= this.writer) return;
		this.rev = rev;
		this.writer = fromUserId;
		this.setState(items, items.length > 0 && playing === true, items.length > 0 ? pos : 0);
	}

	// ----- following the call -----

	private tick(): void {
		const room = MediaEngine.room;
		const channelId = MediaEngine.channelId;
		if (room !== this.room || channelId !== this.channelId) {
			this.room = room;
			this.channelId = room ? channelId : null;
			for (const timer of this.helloTimers) window.clearTimeout(timer);
			this.helloTimers = [];
			if (this.answerTimer !== null) window.clearTimeout(this.answerTimer);
			this.answerTimer = null;
			this.rev = 0;
			this.writer = '';
			this.received.clear();
			this.setState([], false, 0);
			if (this.room && this.channelId) {
				// The connection may still be coming up, so ask a few times.
				this.helloTimers = [1500, 4000, 9000].map((delay) => window.setTimeout(() => this.sayHello(), delay));
			}
		}
		if (this.active) {
			this.clock += 1;
			this.reconcile();
		}
	}

	// ----- the YouTube player on this device -----

	/** The element the player lives in (RadioWindow gives it, and takes it away with null). */
	setContainer(container: HTMLElement | null): void {
		if (container === this.container) return;
		this.destroyPlayer();
		this.container = container;
		this.reconcile();
	}

	private destroyPlayer(): void {
		if (this.listeningTimer !== null) window.clearInterval(this.listeningTimer);
		this.listeningTimer = null;
		this.iframe?.remove();
		this.iframe = null;
		this.loadedItemId = null;
		this.playerReady = false;
		this.playerState = -1;
		this.playerTime = 0;
		this.appliedVolume = -1;
		this.blocked = false;
	}

	private loadPlayer(item: RadioItem): void {
		this.destroyPlayer();
		if (!this.container) return;
		const url = new URL(`https://www.youtube.com/embed/${item.v}`);
		url.searchParams.set('enablejsapi', '1');
		url.searchParams.set('autoplay', this.playing ? '1' : '0');
		url.searchParams.set('controls', '0');
		url.searchParams.set('disablekb', '1');
		url.searchParams.set('playsinline', '1');
		url.searchParams.set('rel', '0');
		url.searchParams.set('start', String(Math.max(0, Math.floor(this.expected()))));
		if (/^https?:$/.test(window.location.protocol)) url.searchParams.set('origin', window.location.origin);
		const iframe = document.createElement('iframe');
		iframe.allow = 'autoplay; fullscreen; encrypted-media';
		iframe.setAttribute(
			'sandbox',
			'allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-presentation',
		);
		iframe.setAttribute('aria-label', item.t ?? 'YouTube');
		iframe.dataset.embedMedia = 'true';
		iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
		iframe.src = url.toString();
		this.container.appendChild(iframe);
		this.iframe = iframe;
		this.loadedItemId = item.id;
		this.loadedAt = performance.now();
		// The player only talks to us after we say we're listening; it may not be up yet.
		this.listeningTimer = window.setInterval(() => {
			if (this.playerReady || !this.iframe) {
				if (this.listeningTimer !== null) window.clearInterval(this.listeningTimer);
				this.listeningTimer = null;
				return;
			}
			this.post({event: 'listening', id: PLAYER_ID, channel: 'widget'});
		}, 300);
	}

	private post(message: Record<string, unknown>): void {
		try {
			this.iframe?.contentWindow?.postMessage(JSON.stringify(message), 'https://www.youtube.com');
		} catch {
			// The frame went away.
		}
	}

	private command(func: string, ...args: Array<unknown>): void {
		this.post({event: 'command', func, args, id: PLAYER_ID, channel: 'widget'});
	}

	private handlePlayerMessage(event: MessageEvent): void {
		if (!this.iframe || event.source !== this.iframe.contentWindow) return;
		if (event.origin !== 'https://www.youtube.com' || typeof event.data !== 'string') return;
		let data: {event?: unknown; info?: unknown};
		try {
			data = JSON.parse(event.data);
		} catch {
			return;
		}
		if (!this.playerReady) {
			this.playerReady = true;
			this.command('addEventListener', 'onStateChange');
			this.command('addEventListener', 'onError');
			this.applyVolume();
		}
		if (data.event === 'onError') {
			this.handlePlayerError(Number(data.info));
			return;
		}
		if (data.event === 'onStateChange' && typeof data.info === 'number') {
			this.playerState = data.info;
			this.reconcile();
			return;
		}
		if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && typeof data.info === 'object' && data.info) {
			const info = data.info as {
				currentTime?: unknown;
				playerState?: unknown;
				duration?: unknown;
				videoData?: {title?: unknown};
			};
			if (typeof info.currentTime === 'number') {
				this.playerTime = info.currentTime;
				this.playerTimeAt = performance.now();
			}
			const title = info.videoData?.title;
			const duration = info.duration;
			if ((typeof duration === 'number' && duration > 0 && duration !== this.duration) || (typeof title === 'string' && title && title !== this.playerTitle)) {
				runInAction(() => {
					if (typeof duration === 'number' && duration > 0) this.duration = duration;
					if (typeof title === 'string' && title) this.playerTitle = title.slice(0, MAX_TITLE);
				});
			}
			if (typeof info.playerState === 'number' && info.playerState !== this.playerState) {
				this.playerState = info.playerState;
				this.reconcile();
			}
		}
	}

	private handlePlayerError(code: number): void {
		const failed = this.loadedItemId;
		if (!failed || !UNPLAYABLE_ERRORS.has(code)) return;
		// The video can't be embedded (or is gone): move on for everyone.
		window.setTimeout(() => {
			if (this.current?.id === failed) this.skip();
		}, 1500);
	}

	private applyVolume(): void {
		if (!this.playerReady) return;
		const volume = LocalVoiceState.getSelfDeaf() ? 0 : Math.round(this.volume * 100);
		if (volume === this.appliedVolume) return;
		this.appliedVolume = volume;
		if (volume === 0) {
			this.command('mute');
		} else {
			this.command('unMute');
			this.command('setVolume', volume);
		}
	}

	/** Brings this device's player in line with the shared state. */
	private reconcile(): void {
		const current = this.current;
		if (!current || !this.container) {
			if (this.iframe) this.destroyPlayer();
			return;
		}
		if (this.loadedItemId !== current.id) {
			this.loadPlayer(current);
			return;
		}
		if (!this.playerReady) return;
		this.applyVolume();
		const now = performance.now();
		const expected = this.expected();

		if (this.playerState === PLAYER_ENDED || (this.duration > 0 && expected > this.duration + 3)) {
			// Finished. Everyone notices at about the same time and sends the same next state.
			if (this.playing) this.skip();
			return;
		}
		if (this.playing) {
			const waiting = this.playerState !== PLAYER_PLAYING && this.playerState !== PLAYER_BUFFERING;
			if (waiting) this.command('playVideo');
			const blocked = waiting && now - this.loadedAt > 5000 && this.playerState !== PLAYER_PAUSED;
			if (blocked !== this.blocked) this.blocked = blocked;
		} else {
			if (this.playerState === PLAYER_PLAYING || this.playerState === PLAYER_BUFFERING) this.command('pauseVideo');
			if (this.blocked) this.blocked = false;
		}
		if (this.playerState !== PLAYER_PLAYING && this.playerState !== PLAYER_PAUSED) return;
		const playerNow =
			this.playerState === PLAYER_PLAYING ? this.playerTime + (now - this.playerTimeAt) / 1000 : this.playerTime;
		if (Math.abs(playerNow - expected) > MAX_DRIFT_SECONDS && now - this.lastSeekAt > SEEK_COOLDOWN_MS) {
			this.lastSeekAt = now;
			this.command('seekTo', Math.max(0, expected), true);
		}
	}
}

export default new Radio();
