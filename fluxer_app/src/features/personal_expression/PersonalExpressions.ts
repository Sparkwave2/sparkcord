// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord personal emojis and stickers on the client: loads the current user's
// collection, keeps it in the emoji and sticker stores (under a pseudo community id, see
// PersonalExpressionConstants) and wraps the API calls for managing it. Loaded after
// every gateway READY, because the stores rebuild themselves from READY.

import Emoji from '@app/features/emoji/state/Emoji';
import Sticker from '@app/features/emoji/state/EmojiSticker';
import {http} from '@app/features/platform/transport/RestTransport';
import {makeAutoObservable, runInAction} from 'mobx';

export interface PersonalEmojiWire {
	id: string;
	name: string;
	animated: boolean;
}

export interface PersonalStickerWire extends PersonalEmojiWire {
	description: string;
	tags: Array<string>;
}

export interface PersonalExpressionInfo {
	id: string;
	kind: 'emoji' | 'sticker';
	name: string;
	animated: boolean;
	owner: {id: string; username: string | null; global_name: string | null};
}

export const MAX_PERSONAL_EMOJIS = 100;
export const MAX_PERSONAL_STICKERS = 50;

class PersonalExpressions {
	emojis: Array<PersonalEmojiWire> = [];
	stickers: Array<PersonalStickerWire> = [];
	loaded = false;
	private loading: Promise<void> | null = null;
	private infoCache = new Map<string, Promise<PersonalExpressionInfo | null>>();

	constructor() {
		makeAutoObservable<this, 'loading' | 'infoCache'>(this, {loading: false, infoCache: false}, {autoBind: true});
	}

	private apply(): void {
		Emoji.setPersonalEmojis(this.emojis);
		Sticker.setPersonalStickers(this.stickers);
	}

	/** Called after every gateway READY: (re)load and put the collection back into the stores. */
	handleGatewayReady(): void {
		if (this.loaded) this.apply();
		void this.reload();
	}

	reload(): Promise<void> {
		this.loading ??= http
			.get<{emojis: Array<PersonalEmojiWire>; stickers: Array<PersonalStickerWire>}>(
				'/users/@me/personal-expressions',
			)
			.then((res) => {
				runInAction(() => {
					this.emojis = res.body.emojis;
					this.stickers = res.body.stickers;
					this.loaded = true;
				});
				this.apply();
			})
			.catch(() => {})
			.finally(() => {
				this.loading = null;
			});
		return this.loading;
	}

	async create(kind: 'emoji' | 'sticker', name: string, image: string): Promise<void> {
		const res = await http.post<PersonalStickerWire | PersonalEmojiWire>('/users/@me/personal-expressions', {
			body: {kind, name, image},
		});
		runInAction(() => {
			if (kind === 'emoji') this.emojis = [res.body, ...this.emojis];
			else this.stickers = [res.body as PersonalStickerWire, ...this.stickers];
		});
		this.apply();
	}

	async rename(id: string, name: string): Promise<void> {
		const res = await http.patch<PersonalEmojiWire>(`/users/@me/personal-expressions/${id}`, {body: {name}});
		runInAction(() => {
			this.emojis = this.emojis.map((item) => (item.id === id ? {...item, name: res.body.name} : item));
			this.stickers = this.stickers.map((item) => (item.id === id ? {...item, name: res.body.name} : item));
		});
		this.apply();
	}

	async remove(id: string): Promise<void> {
		await http.delete(`/users/@me/personal-expressions/${id}`);
		runInAction(() => {
			this.emojis = this.emojis.filter((item) => item.id !== id);
			this.stickers = this.stickers.filter((item) => item.id !== id);
		});
		this.apply();
	}

	/** Saves a copy of someone's personal emoji/sticker into the current user's collection. */
	async copy(id: string): Promise<void> {
		await http.post(`/users/@me/personal-expressions/${id}/copy`, {body: {}});
		await this.reload();
	}

	isMine(id: string): boolean {
		return this.emojis.some((item) => item.id === id) || this.stickers.some((item) => item.id === id);
	}

	/** Owner info for a personal emoji/sticker id, or null when the id isn't a personal one. */
	getInfo(id: string): Promise<PersonalExpressionInfo | null> {
		let cached = this.infoCache.get(id);
		if (!cached) {
			cached = http
				.get<PersonalExpressionInfo>(`/personal-expressions/${id}`)
				.then((res) => res.body)
				.catch(() => null);
			this.infoCache.set(id, cached);
		}
		return cached;
	}
}

export default new PersonalExpressions();
