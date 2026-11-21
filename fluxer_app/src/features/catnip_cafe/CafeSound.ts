// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: sound effects. The sounds are plain files dropped into
// fluxer_app/assets/assets/catnip-cafe/sounds/ (served at /assets/catnip-cafe/sounds/).
// The build writes index.json there listing the files, so only existing sounds are
// fetched; a sound with no file simply stays silent. When a name has several formats,
// .ogg wins over .mp3 over the rest. The pet sound may also come in variants (pet-1, pet-2, ...), and
// one is picked at random each time. Mute and volume are remembered on this device.

// The app removes window.localStorage at startup; this is the handle it kept.
import {cafePrefs} from '@app/features/catnip_cafe/CafePrefs';
import {getProtectedLocalStorage} from '@app/features/platform/state/ProtectedWebStorage';
import {makeAutoObservable} from 'mobx';

export type CafeSoundName =
	| 'pet'
	| 'buy'
	| 'upgrade'
	| 'lucky-appear'
	| 'lucky-catch'
	| 'achievement'
	| 'new-life'
	| 'mouse-appear'
	| 'mouse-catch'
	| 'treat'
	| 'harvest'
	| 'adopt'
	| 'goal'
	| 'bliss';

const ALL_SOUNDS: ReadonlyArray<CafeSoundName> = [
	'pet',
	'buy',
	'upgrade',
	'lucky-appear',
	'lucky-catch',
	'achievement',
	'new-life',
	'mouse-appear',
	'mouse-catch',
	'treat',
	'harvest',
	'adopt',
	'goal',
	'bliss',
];

/** Sounds that borrow another one until a file of their own is added (null: stay silent). */
const FALLBACK: Partial<Record<CafeSoundName, CafeSoundName | null>> = {
	'mouse-appear': null,
	'mouse-catch': 'buy',
	treat: 'pet',
	harvest: 'buy',
	adopt: 'achievement',
	goal: 'upgrade',
	bliss: 'lucky-appear',
};

const SOUND_BASE = '/assets/catnip-cafe/sounds/';
const EXTENSION_ORDER = ['ogg', 'mp3', 'opus', 'webm', 'm4a', 'wav', 'flac'];
const PET_VARIANTS = 4;
const STORAGE_KEY = 'sparkcord:catnip-cafe:sound';
/** Rapid petting would stack dozens of sounds; keep a short gap and a cap. */
const MIN_GAP_MS: Partial<Record<CafeSoundName, number>> = {pet: 45, buy: 40};
const MAX_PLAYING = 8;

function readPrefs(): {muted: boolean; volume: number} {
	try {
		const raw = getProtectedLocalStorage()?.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as {muted?: unknown; volume?: unknown};
			const volume = typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : 0.6;
			return {muted: parsed.muted === true, volume};
		}
	} catch {}
	return {muted: false, volume: 0.6};
}

class CafeSoundPlayer {
	muted: boolean;
	volume: number;

	private context: AudioContext | null = null;
	private gain: GainNode | null = null;
	/** File name (without folder) → decoded sound, or null when there is no such file. */
	private buffers = new Map<string, Promise<AudioBuffer | null>>();
	private lastPlayed = new Map<CafeSoundName, number>();
	private playing = 0;
	/** Sound name (file name without extension) → file name, from the build's index.json. */
	private index: Promise<Map<string, string>> | null = null;

	constructor() {
		const prefs = readPrefs();
		this.muted = prefs.muted;
		this.volume = prefs.volume;
		makeAutoObservable<CafeSoundPlayer, 'context' | 'gain' | 'buffers' | 'lastPlayed' | 'playing' | 'index'>(this, {
			context: false,
			gain: false,
			buffers: false,
			lastPlayed: false,
			playing: false,
			index: false,
		});
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		this.persist();
		if (!muted) this.play(cafePrefs.petSound ? 'pet' : 'buy');
	}

	setVolume(volume: number): void {
		this.volume = Math.min(1, Math.max(0, volume));
		if (this.gain) this.gain.gain.value = this.volume;
		if (this.volume > 0 && this.muted) this.muted = false;
		this.persist();
	}

	/** Start fetching the sounds so the first pet isn't late. */
	preload(): void {
		for (const name of ALL_SOUNDS) void this.load(name);
		for (let i = 1; i <= PET_VARIANTS; i++) void this.load(`pet-${i}`);
	}

	play(name: CafeSoundName): void {
		if (this.muted || this.volume <= 0) return;
		if (name === 'pet' && !cafePrefs.petSound) return;
		const now = performance.now();
		const gap = MIN_GAP_MS[name];
		if (gap && now - (this.lastPlayed.get(name) ?? 0) < gap) return;
		if (this.playing >= MAX_PLAYING) return;
		this.lastPlayed.set(name, now);
		void this.playFile(name);
	}

	private async playFile(name: CafeSoundName): Promise<void> {
		const context = this.ensureContext();
		if (!context || !this.gain) return;
		const buffer = await this.bufferFor(name);
		if (!buffer || this.muted) return;
		if (context.state === 'suspended') {
			try {
				await context.resume();
			} catch {
				return;
			}
		}
		const source = context.createBufferSource();
		source.buffer = buffer;
		// A little pitch wobble keeps repeated pets and purchases from sounding robotic.
		if (name === 'pet' || name === 'buy' || name === 'treat') source.playbackRate.value = 0.93 + Math.random() * 0.14;
		source.connect(this.gain);
		this.playing++;
		source.onended = () => {
			this.playing = Math.max(0, this.playing - 1);
			source.disconnect();
		};
		source.start();
	}

	/** The sound to play for a name: a random pet variant, the file itself, or its fallback. */
	private async bufferFor(name: CafeSoundName): Promise<AudioBuffer | null> {
		if (name === 'pet') {
			const variants = (
				await Promise.all(Array.from({length: PET_VARIANTS}, (_, i) => this.load(`pet-${i + 1}`)))
			).filter((b): b is AudioBuffer => b !== null);
			if (variants.length > 0) return variants[Math.floor(Math.random() * variants.length)];
			return this.load('pet');
		}
		const own = await this.load(name);
		if (own) return own;
		const fallback = FALLBACK[name];
		return fallback ? this.bufferFor(fallback) : null;
	}

	private ensureContext(): AudioContext | null {
		if (this.context) return this.context;
		try {
			this.context = new AudioContext();
			this.gain = this.context.createGain();
			this.gain.gain.value = this.volume;
			this.gain.connect(this.context.destination);
		} catch {
			this.context = null;
		}
		return this.context;
	}

	private load(file: string): Promise<AudioBuffer | null> {
		const cached = this.buffers.get(file);
		if (cached) return cached;
		const promise = (async () => {
			const fileName = (await this.loadIndex()).get(file);
			const context = this.ensureContext();
			if (!fileName || !context) return null;
			try {
				const response = await fetch(`${SOUND_BASE}${encodeURIComponent(fileName)}`);
				if (!response.ok) return null;
				return await context.decodeAudioData(await response.arrayBuffer());
			} catch {
				return null;
			}
		})();
		this.buffers.set(file, promise);
		return promise;
	}

	private loadIndex(): Promise<Map<string, string>> {
		if (!this.index) {
			this.index = (async () => {
				const names = new Map<string, string>();
				try {
					const response = await fetch(`${SOUND_BASE}index.json`, {cache: 'no-cache'});
					if (!response.ok) return names;
					const body = (await response.json()) as {files?: Array<unknown>};
					const rank = (fileName: string) => {
						const position = EXTENSION_ORDER.indexOf(fileName.split('.').pop()?.toLowerCase() ?? '');
						return position < 0 ? EXTENSION_ORDER.length : position;
					};
					for (const entry of body.files ?? []) {
						if (typeof entry !== 'string') continue;
						const name = entry.replace(/\.[^.]+$/, '').toLowerCase();
						const current = names.get(name);
						if (!current || rank(entry) < rank(current)) names.set(name, entry);
					}
				} catch {}
				return names;
			})();
		}
		return this.index;
	}

	private persist(): void {
		try {
			getProtectedLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify({muted: this.muted, volume: this.volume}));
		} catch {}
	}
}

export const cafeSound = new CafeSoundPlayer();
