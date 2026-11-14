// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord soundboard on the client. Sounds are personal (playable in any voice channel)
// or belong to a community (playable in its voice channels). Playing a sound sends a
// small message to the others in the call (SparkcordVoiceMessages); every listener
// fetches the audio and plays it locally at their own soundboard volume, and the
// player's tile shows what's playing.

import Authentication from '@app/features/auth/state/Authentication';
import {http} from '@app/features/platform/transport/RestTransport';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {
	bindSparkcordVoiceMessages,
	onSparkcordVoiceMessage,
	type SparkcordVoiceMessage,
	sendSparkcordVoiceMessage,
} from '@app/features/voice/engine/SparkcordVoiceMessages';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import {parseVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import {makeAutoObservable, runInAction} from 'mobx';
import type {Room} from 'livekit-client';

export interface SoundboardSound {
	id: string;
	name: string;
	emoji: string | null;
	duration_ms: number;
	owner_kind: 'user' | 'guild';
	owner_id: string;
	creator_id: string;
}

export interface PlayingSound {
	soundId: string;
	name: string;
	emoji: string | null;
	until: number;
}

export const MAX_SOUND_SECONDS = 10;
export const MAX_SOUND_BYTES = 1024 * 1024;

const VOLUME_KEY = 'sparkcord.soundboardVolume';
const PLAY_COOLDOWN_MS = 1500;
const RECEIVE_WINDOW_MS = 5000;
const RECEIVE_MAX_IN_WINDOW = 4;
const BUFFER_CACHE_SIZE = 40;

function readVolume(): number {
	try {
		const raw = window.localStorage.getItem(VOLUME_KEY);
		const value = raw === null ? Number.NaN : Number(raw);
		return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.6;
	} catch {
		return 0.6;
	}
}

class Soundboard {
	personal: Array<SoundboardSound> | null = null;
	guildSounds = new Map<string, Array<SoundboardSound>>();
	/** What each user in the call is playing right now, for the indicator on their tile. */
	playing = new Map<string, PlayingSound>();
	volume = readVolume();

	private started = false;
	private context: AudioContext | null = null;
	private buffers = new Map<string, Promise<AudioBuffer>>();
	private lastPlayAt = 0;
	private received = new Map<string, Array<number>>();
	private boundRoom: Room | null = null;
	private unbindRoom: (() => void) | null = null;

	constructor() {
		makeAutoObservable<
			this,
			'started' | 'context' | 'buffers' | 'lastPlayAt' | 'received' | 'boundRoom' | 'unbindRoom'
		>(
			this,
			{started: false, context: false, buffers: false, lastPlayAt: false, received: false, boundRoom: false, unbindRoom: false},
			{autoBind: true},
		);
	}

	/** Starts listening for sounds played by others (called after gateway READY). */
	start(): void {
		if (this.started) return;
		this.started = true;
		onSparkcordVoiceMessage((fromUserId, message) => this.handleMessage(fromUserId, message));
		// LiveKit rooms need a data listener; rebind whenever the room changes.
		window.setInterval(() => this.syncRoomBinding(), 2000);
	}

	private syncRoomBinding(): void {
		const room = MediaEngine.room;
		if (room === this.boundRoom) return;
		this.unbindRoom?.();
		this.unbindRoom = null;
		this.boundRoom = room;
		if (room) {
			this.unbindRoom = bindSparkcordVoiceMessages(room, (identity) => parseVoiceParticipantIdentity(identity).userId);
		}
	}

	setVolume(volume: number): void {
		this.volume = Math.min(1, Math.max(0, volume));
		try {
			window.localStorage.setItem(VOLUME_KEY, String(this.volume));
		} catch {
			// Not persisted; fine.
		}
	}

	async loadPersonal(): Promise<void> {
		const res = await http.get<{sounds: Array<SoundboardSound>}>('/users/@me/soundboard');
		runInAction(() => {
			this.personal = res.body.sounds;
		});
	}

	async loadGuild(guildId: string): Promise<void> {
		const res = await http.get<{sounds: Array<SoundboardSound>}>(`/guilds/${guildId}/soundboard`);
		runInAction(() => {
			this.guildSounds.set(guildId, res.body.sounds);
		});
	}

	/** Checks the file and uploads it as a personal sound, or a community sound when guildId is given. */
	async upload(file: File, guildId: string | null): Promise<void> {
		if (file.size > MAX_SOUND_BYTES) throw new Error('Sounds can be at most 1 MB.');
		const bytes = await file.arrayBuffer();
		const decoded = await this.getContext().decodeAudioData(bytes.slice(0));
		const durationMs = Math.round(decoded.duration * 1000);
		if (durationMs > MAX_SOUND_SECONDS * 1000 + 250) throw new Error('Sounds can be at most 10 seconds long.');
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
		const name = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 32) || 'sound';
		const path = guildId ? `/guilds/${guildId}/soundboard` : '/users/@me/soundboard';
		const res = await http.post<SoundboardSound>(path, {
			body: {name, duration_ms: Math.max(1, durationMs), sound: dataUrl},
		});
		runInAction(() => {
			if (guildId) this.guildSounds.set(guildId, [...(this.guildSounds.get(guildId) ?? []), res.body]);
			else this.personal = [...(this.personal ?? []), res.body];
		});
	}

	async rename(sound: SoundboardSound, name: string): Promise<void> {
		const path =
			sound.owner_kind === 'guild'
				? `/guilds/${sound.owner_id}/soundboard/${sound.id}`
				: `/users/@me/soundboard/${sound.id}`;
		const res = await http.patch<SoundboardSound>(path, {body: {name}});
		this.replace(res.body);
	}

	async remove(sound: SoundboardSound): Promise<void> {
		const path =
			sound.owner_kind === 'guild'
				? `/guilds/${sound.owner_id}/soundboard/${sound.id}`
				: `/users/@me/soundboard/${sound.id}`;
		await http.delete(path);
		runInAction(() => {
			if (sound.owner_kind === 'guild') {
				const list = this.guildSounds.get(sound.owner_id) ?? [];
				this.guildSounds.set(
					sound.owner_id,
					list.filter((item) => item.id !== sound.id),
				);
			} else {
				this.personal = (this.personal ?? []).filter((item) => item.id !== sound.id);
			}
		});
	}

	private replace(sound: SoundboardSound): void {
		if (sound.owner_kind === 'guild') {
			const list = this.guildSounds.get(sound.owner_id) ?? [];
			this.guildSounds.set(
				sound.owner_id,
				list.map((item) => (item.id === sound.id ? sound : item)),
			);
		} else {
			this.personal = (this.personal ?? []).map((item) => (item.id === sound.id ? sound : item));
		}
	}

	get canPlay(): boolean {
		return MediaEngine.room !== null && MediaEngine.channelId !== null;
	}

	/** Plays a sound for everyone in the current call. Returns false while on cooldown. */
	play(sound: SoundboardSound): boolean {
		const room = MediaEngine.room;
		const channelId = MediaEngine.channelId;
		if (!room || !channelId) return false;
		const now = Date.now();
		if (now - this.lastPlayAt < PLAY_COOLDOWN_MS) return false;
		this.lastPlayAt = now;
		const message: SparkcordVoiceMessage = {
			k: 'sb',
			id: sound.id,
			name: sound.name,
			emoji: sound.emoji,
			ms: sound.duration_ms,
			ch: channelId,
		};
		void sendSparkcordVoiceMessage(room, message).catch(() => {});
		const me = Authentication.currentUserId;
		if (me) this.markPlaying(me, sound.id, sound.name, sound.emoji, sound.duration_ms);
		void this.playLocally(sound.id);
		return true;
	}

	private handleMessage(fromUserId: string, message: SparkcordVoiceMessage): void {
		if (message.k !== 'sb') return;
		const {id, name, emoji, ms, ch} = message as {id?: unknown; name?: unknown; emoji?: unknown; ms?: unknown; ch?: unknown};
		if (typeof id !== 'string' || !/^\d{1,20}$/.test(id) || typeof name !== 'string') return;
		if (ch !== MediaEngine.channelId) return;
		// Ignore spam: a few sounds per sender per few seconds.
		const now = Date.now();
		const recent = (this.received.get(fromUserId) ?? []).filter((at) => now - at < RECEIVE_WINDOW_MS);
		if (recent.length >= RECEIVE_MAX_IN_WINDOW) return;
		recent.push(now);
		this.received.set(fromUserId, recent);
		const durationMs = typeof ms === 'number' && ms > 0 ? Math.min(ms, MAX_SOUND_SECONDS * 1000) : 3000;
		this.markPlaying(fromUserId, id, name.slice(0, 32), typeof emoji === 'string' ? emoji : null, durationMs);
		if (LocalVoiceState.getSelfDeaf()) return;
		void this.playLocally(id);
	}

	private markPlaying(userId: string, soundId: string, name: string, emoji: string | null, durationMs: number): void {
		const until = Date.now() + durationMs;
		this.playing.set(userId, {soundId, name, emoji, until});
		window.setTimeout(() => {
			runInAction(() => {
				const current = this.playing.get(userId);
				if (current && current.until <= Date.now()) this.playing.delete(userId);
			});
		}, durationMs + 50);
	}

	private getContext(): AudioContext {
		this.context ??= new AudioContext();
		return this.context;
	}

	private loadBuffer(soundId: string): Promise<AudioBuffer> {
		let pending = this.buffers.get(soundId);
		if (!pending) {
			pending = http
				.get<Blob>(`/soundboard-sounds/${soundId}/audio`, {parse: 'binary'})
				.then(async (res) => {
					const blob = res.body as unknown as Blob;
					return this.getContext().decodeAudioData(await blob.arrayBuffer());
				});
			pending.catch(() => this.buffers.delete(soundId));
			this.buffers.set(soundId, pending);
			if (this.buffers.size > BUFFER_CACHE_SIZE) {
				const oldest = this.buffers.keys().next().value;
				if (oldest !== undefined) this.buffers.delete(oldest);
			}
		}
		return pending;
	}

	private async playLocally(soundId: string): Promise<void> {
		try {
			const context = this.getContext();
			if (context.state === 'suspended') await context.resume();
			const buffer = await this.loadBuffer(soundId);
			const source = context.createBufferSource();
			source.buffer = buffer;
			const gain = context.createGain();
			gain.gain.value = this.volume;
			source.connect(gain).connect(context.destination);
			source.start();
			source.stop(context.currentTime + Math.min(buffer.duration, MAX_SOUND_SECONDS));
		} catch {
			// Couldn't fetch or decode the sound; skip it.
		}
	}
}

export default new Soundboard();
