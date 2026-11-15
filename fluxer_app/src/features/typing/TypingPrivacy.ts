// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: per-device typing indicator preferences.
// - sendTypingIndicators: when off, nobody sees that you are typing (no typing requests).
// - showTypingIndicators: when off, you don't see when others are typing, anywhere.

// The app removes window.localStorage at startup; this is the handle it kept.
import {getProtectedLocalStorage} from '@app/features/platform/state/ProtectedWebStorage';
import {makeAutoObservable} from 'mobx';

const STORAGE_KEY = 'sparkcord.typingPrivacy';

interface StoredTypingPrivacy {
	sendTypingIndicators?: boolean;
	showTypingIndicators?: boolean;
}

function readStored(): StoredTypingPrivacy {
	try {
		const raw = getProtectedLocalStorage()?.getItem(STORAGE_KEY) ?? null;
		return raw ? (JSON.parse(raw) as StoredTypingPrivacy) : {};
	} catch {
		return {};
	}
}

class TypingPrivacy {
	sendTypingIndicators: boolean;
	showTypingIndicators: boolean;

	constructor() {
		const stored = readStored();
		this.sendTypingIndicators = stored.sendTypingIndicators !== false;
		this.showTypingIndicators = stored.showTypingIndicators !== false;
		makeAutoObservable(this, {}, {autoBind: true});
		try {
			window.addEventListener('storage', (event) => {
				if (event.key !== STORAGE_KEY) return;
				const next = readStored();
				this.sendTypingIndicators = next.sendTypingIndicators !== false;
				this.showTypingIndicators = next.showTypingIndicators !== false;
			});
		} catch {}
	}

	setSendTypingIndicators(value: boolean): void {
		this.sendTypingIndicators = value;
		this.save();
	}

	setShowTypingIndicators(value: boolean): void {
		this.showTypingIndicators = value;
		this.save();
	}

	private save(): void {
		try {
			getProtectedLocalStorage()?.setItem(
				STORAGE_KEY,
				JSON.stringify({
					sendTypingIndicators: this.sendTypingIndicators,
					showTypingIndicators: this.showTypingIndicators,
				}),
			);
		} catch {}
	}
}

export default new TypingPrivacy();
