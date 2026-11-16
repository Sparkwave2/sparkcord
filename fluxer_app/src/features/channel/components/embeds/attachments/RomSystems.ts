// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: which game files can be played in the in-app emulator (EmulatorJS), by
// file extension. Ambiguous extensions (.bin, .iso, .zip) are left out on purpose.

export interface RomSystem {
	/** EmulatorJS system name (EJS_core). */
	core: string;
	label: string;
}

/** Marks a file as a Flash movie, which Ruffle plays rather than EmulatorJS. */
export const FLASH_CORE = 'flash';

const SYSTEMS: Record<string, RomSystem> = {
	nes: {core: 'nes', label: 'NES'},
	fds: {core: 'nes', label: 'Famicom Disk System'},
	unf: {core: 'nes', label: 'NES'},
	unif: {core: 'nes', label: 'NES'},
	sfc: {core: 'snes', label: 'SNES'},
	smc: {core: 'snes', label: 'SNES'},
	gb: {core: 'gb', label: 'Game Boy'},
	gbc: {core: 'gb', label: 'Game Boy Color'},
	gba: {core: 'gba', label: 'Game Boy Advance'},
	n64: {core: 'n64', label: 'Nintendo 64'},
	z64: {core: 'n64', label: 'Nintendo 64'},
	v64: {core: 'n64', label: 'Nintendo 64'},
	nds: {core: 'nds', label: 'Nintendo DS'},
	sms: {core: 'segaMS', label: 'Master System'},
	gg: {core: 'segaGG', label: 'Game Gear'},
	md: {core: 'segaMD', label: 'Mega Drive'},
	gen: {core: 'segaMD', label: 'Mega Drive'},
	smd: {core: 'segaMD', label: 'Mega Drive'},
	pce: {core: 'pce', label: 'PC Engine'},
	chd: {core: 'psx', label: 'PlayStation'},
	pbp: {core: 'psx', label: 'PlayStation'},
	a26: {core: 'atari2600', label: 'Atari 2600'},
	a78: {core: 'atari7800', label: 'Atari 7800'},
	lnx: {core: 'lynx', label: 'Atari Lynx'},
	ngp: {core: 'ngp', label: 'Neo Geo Pocket'},
	ngc: {core: 'ngp', label: 'Neo Geo Pocket Color'},
	ws: {core: 'ws', label: 'WonderSwan'},
	wsc: {core: 'ws', label: 'WonderSwan Color'},
	vb: {core: 'vb', label: 'Virtual Boy'},
	// Flash movies and games: played by Ruffle instead of EmulatorJS (see RomAttachment).
	swf: {core: FLASH_CORE, label: 'Flash'},
};

export function getRomSystem(fileName: string): RomSystem | null {
	const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
	return SYSTEMS[extension] ?? null;
}
