// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: short number format (1.23M, 4.5B...).

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid'];

export function formatPurrs(value: number): string {
	if (!Number.isFinite(value)) return '∞';
	if (value < 1000) return value < 10 && value % 1 !== 0 ? value.toFixed(1) : Math.floor(value).toLocaleString('en');
	const tier = Math.floor(Math.log10(value) / 3);
	if (tier >= SUFFIXES.length) return value.toExponential(2);
	const scaled = value / 10 ** (tier * 3);
	return `${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)}${SUFFIXES[tier]}`;
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
