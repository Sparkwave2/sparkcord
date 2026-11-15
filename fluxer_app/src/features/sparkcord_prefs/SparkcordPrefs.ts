// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: small per-device preferences (kept in this browser or desktop app, not
// synced to the account). A leaf module, so any component can read it.

import {makeAutoObservable} from 'mobx';

const STORAGE_KEY = 'sparkcord.prefs';

interface Prefs {
	/** Show everyone's names in the default font, ignoring name fonts (accessibility). */
	plainNameFonts: boolean;
}

const DEFAULTS: Prefs = {
	plainNameFonts: false,
};

function readStored(): Prefs {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
		const prefs = {...DEFAULTS};
		for (const key of Object.keys(DEFAULTS) as Array<keyof Prefs>) {
			if (typeof parsed[key] === typeof DEFAULTS[key]) prefs[key] = parsed[key] as never;
		}
		return prefs;
	} catch {
		return {...DEFAULTS};
	}
}

class SparkcordPrefs {
	values: Prefs = readStored();

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		try {
			// Keep other windows of the app in step.
			window.addEventListener('storage', (event) => {
				if (event.key === STORAGE_KEY) this.reload();
			});
		} catch {}
	}

	private reload(): void {
		this.values = readStored();
	}

	get<K extends keyof Prefs>(key: K): Prefs[K] {
		return this.values[key];
	}

	set<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
		this.values = {...this.values, [key]: value};
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
		} catch {}
	}
}

export default new SparkcordPrefs();
