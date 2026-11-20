// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the one game (ROM or Flash) being played. It lives here rather than in the
// chat message it came from, so a minimized game keeps running while you change channels
// or scroll. GameWindow shows it fullscreen or as a small floating window.

import type {RomSystem} from '@app/features/channel/components/embeds/attachments/RomSystems';
import {makeAutoObservable} from 'mobx';

export interface PlayingGame {
	/** blob: URL of the downloaded game file (revoked when the game closes). */
	romUrl: string;
	system: RomSystem;
	fileName: string;
	/** The attachment it was started from, to tell the card it is playing. */
	attachmentId: string;
}

class GamePlayer {
	game: PlayingGame | null = null;
	minimized = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	open(game: PlayingGame): void {
		if (this.game) URL.revokeObjectURL(this.game.romUrl);
		this.game = game;
		this.minimized = false;
	}

	close(): void {
		if (this.game) URL.revokeObjectURL(this.game.romUrl);
		this.game = null;
		this.minimized = false;
	}

	minimize(): void {
		if (this.game) this.minimized = true;
	}

	maximize(): void {
		this.minimized = false;
	}

	isPlaying(attachmentId: string): boolean {
		return this.game?.attachmentId === attachmentId;
	}
}

export default new GamePlayer();
