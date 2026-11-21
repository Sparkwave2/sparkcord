// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: number formats (chosen in Settings > Catnip Café) and durations.

import {cafePrefs, type NumberFormat} from '@app/features/catnip_cafe/CafePrefs';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid'];
// Index = powers of a thousand; the first two stay as plain numbers in the long format.
const LONG_NAMES = [
	'',
	'thousand',
	'million',
	'billion',
	'trillion',
	'quadrillion',
	'quintillion',
	'sextillion',
	'septillion',
	'octillion',
	'nonillion',
	'decillion',
	'undecillion',
	'duodecillion',
	'tredecillion',
	'quattuordecillion',
	'quindecillion',
	'sexdecillion',
	'septendecillion',
	'octodecillion',
	'novemdecillion',
	'vigintillion',
];

/** 3 significant digits: 1.23, 12.3, 123. */
function threeDigits(scaled: number): string {
	return scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
}

function scientific(value: number): string {
	const exponent = Math.floor(Math.log10(value));
	let mantissa = value / 10 ** exponent;
	// Rounding can carry over (9.996 -> 10.00).
	if (Number(mantissa.toFixed(2)) >= 10) return `${(mantissa / 10).toFixed(2)}e${exponent + 1}`;
	mantissa = Number(mantissa.toFixed(2));
	return `${mantissa.toFixed(2)}e${exponent}`;
}

function engineering(value: number): string {
	const exponent = Math.floor(Math.log10(value) / 3) * 3;
	const scaled = value / 10 ** exponent;
	if (Number(threeDigits(scaled)) >= 1000) return `${threeDigits(scaled / 1000)}e${exponent + 3}`;
	return `${threeDigits(scaled)}e${exponent}`;
}

/** A number of purrs (or anything big) in the chosen format; small numbers look the same in all. */
export function formatPurrs(value: number, format: NumberFormat = cafePrefs.numberFormat): string {
	if (!Number.isFinite(value)) return '∞';
	if (value < 0) return `-${formatPurrs(-value, format)}`;
	if (value < 1000) return value < 10 && value % 1 !== 0 ? value.toFixed(1) : Math.floor(value).toLocaleString('en');
	switch (format) {
		case 'full':
			return value < 1e21 ? Math.floor(value).toLocaleString('en') : scientific(value);
		case 'scientific':
			return scientific(value);
		case 'engineering':
			return engineering(value);
		case 'long': {
			if (value < 1e6) return Math.floor(value).toLocaleString('en');
			const tier = Math.floor(Math.log10(value) / 3);
			if (tier >= LONG_NAMES.length) return scientific(value);
			const scaled = Math.floor((value / 10 ** (tier * 3)) * 1000) / 1000;
			return `${scaled.toLocaleString('en', {maximumFractionDigits: 3})} ${LONG_NAMES[tier]}`;
		}
		default: {
			let tier = Math.floor(Math.log10(value) / 3);
			let scaled = value / 10 ** (tier * 3);
			// Rounding can carry over (999.6M -> 1.00B, not 1000M).
			if (Number(threeDigits(scaled)) >= 1000) {
				tier += 1;
				scaled /= 1000;
			}
			if (tier >= SUFFIXES.length) return scientific(value);
			return `${threeDigits(scaled)}${SUFFIXES[tier]}`;
		}
	}
}

/** A short duration: "45s", "3m 20s", "2h 5m", "3d 4h". */
export function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.ceil(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
