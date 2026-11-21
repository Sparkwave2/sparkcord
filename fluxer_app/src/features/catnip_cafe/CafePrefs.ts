// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: display and sound choices from Settings > Catnip Café, remembered
// on this device. (Volume and mute live with the sounds, in CafeSound.)

import {getProtectedLocalStorage} from '@app/features/platform/state/ProtectedWebStorage';
import {makeAutoObservable} from 'mobx';

const STORAGE_KEY = 'sparkcord:catnip-cafe:prefs';

/** How big numbers are written: 1.23M, 1.234 million, 1,234,567, 1.23e6 or 45.6e9. */
export type NumberFormat = 'short' | 'long' | 'full' | 'scientific' | 'engineering';
export const NUMBER_FORMATS: ReadonlyArray<NumberFormat> = ['short', 'long', 'full', 'scientific', 'engineering'];

export interface CafePrefsData {
	/** Blinking, ear twitches, the swishing tail and eyes that follow the pointer. */
	catAnimations: boolean;
	/** Hearts, paw prints and floating numbers when you pet. */
	particles: boolean;
	/** Confetti on achievement and celebration banners. */
	confetti: boolean;
	/** The purr counter counts up instead of jumping to the new value. */
	rollingNumbers: boolean;
	/** The sound when you pet the cat. */
	petSound: boolean;
	numberFormat: NumberFormat;
}

const DEFAULTS: CafePrefsData = {
	catAnimations: true,
	particles: true,
	confetti: true,
	rollingNumbers: true,
	petSound: true,
	numberFormat: 'short',
};

function readPrefs(): CafePrefsData {
	try {
		const raw = getProtectedLocalStorage()?.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<Record<keyof CafePrefsData, unknown>>;
			const prefs = {...DEFAULTS};
			for (const key of Object.keys(DEFAULTS) as Array<keyof CafePrefsData>) {
				const value = parsed[key];
				if (key === 'numberFormat') {
					if (NUMBER_FORMATS.includes(value as NumberFormat)) prefs.numberFormat = value as NumberFormat;
				} else if (typeof value === 'boolean') {
					prefs[key] = value;
				}
			}
			return prefs;
		}
	} catch {}
	return {...DEFAULTS};
}

class CafePrefs implements CafePrefsData {
	catAnimations = DEFAULTS.catAnimations;
	particles = DEFAULTS.particles;
	confetti = DEFAULTS.confetti;
	rollingNumbers = DEFAULTS.rollingNumbers;
	petSound = DEFAULTS.petSound;
	numberFormat = DEFAULTS.numberFormat;

	constructor() {
		Object.assign(this, readPrefs());
		makeAutoObservable(this, {}, {autoBind: true});
	}

	set<K extends keyof CafePrefsData>(key: K, value: CafePrefsData[K]): void {
		(this as CafePrefsData)[key] = value;
		try {
			const data: CafePrefsData = {
				catAnimations: this.catAnimations,
				particles: this.particles,
				confetti: this.confetti,
				rollingNumbers: this.rollingNumbers,
				petSound: this.petSound,
				numberFormat: this.numberFormat,
			};
			getProtectedLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch {}
	}
}

export const cafePrefs = new CafePrefs();
