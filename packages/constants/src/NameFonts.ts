// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: fonts people can pick for how their name is shown. All are SIL Open Font
// License fonts from Google Fonts, bundled with the web app (no requests to Google).

export interface NameFont {
	/** Stable id stored on accounts, community profiles and tuppers. */
	id: string;
	/** Font family name on Google Fonts (also used by the download script). */
	family: string;
	/** Short category, used to group the picker. */
	kind: 'display' | 'script' | 'serif' | 'retro' | 'mono' | 'rounded';
}

export const NAME_FONTS: ReadonlyArray<NameFont> = [
	{id: 'bangers', family: 'Bangers', kind: 'display'},
	{id: 'cherry-bomb', family: 'Cherry Bomb One', kind: 'rounded'},
	{id: 'chicle', family: 'Chicle', kind: 'display'},
	{id: 'creepster', family: 'Creepster', kind: 'display'},
	{id: 'lobster', family: 'Lobster', kind: 'script'},
	{id: 'monoton', family: 'Monoton', kind: 'display'},
	{id: 'ribeye', family: 'Ribeye', kind: 'display'},
	{id: 'permanent-marker', family: 'Permanent Marker', kind: 'script'},
	{id: 'caveat', family: 'Caveat', kind: 'script'},
	{id: 'pacifico', family: 'Pacifico', kind: 'script'},
	{id: 'sacramento', family: 'Sacramento', kind: 'script'},
	{id: 'biorhyme', family: 'BioRhyme', kind: 'serif'},
	{id: 'cinzel', family: 'Cinzel', kind: 'serif'},
	{id: 'zilla-slab', family: 'Zilla Slab', kind: 'serif'},
	{id: 'special-elite', family: 'Special Elite', kind: 'serif'},
	{id: 'museomoderno', family: 'MuseoModerno', kind: 'rounded'},
	{id: 'fredoka', family: 'Fredoka', kind: 'rounded'},
	{id: 'comfortaa', family: 'Comfortaa', kind: 'rounded'},
	{id: 'orbitron', family: 'Orbitron', kind: 'retro'},
	{id: 'pixelify', family: 'Pixelify Sans', kind: 'retro'},
	{id: 'press-start', family: 'Press Start 2P', kind: 'retro'},
	{id: 'space-mono', family: 'Space Mono', kind: 'mono'},
];

export const NAME_FONT_IDS: ReadonlySet<string> = new Set(NAME_FONTS.map((font) => font.id));

/**
 * Per-community value meaning "use the normal app font here", overriding the account
 * font. (No per-community value at all means "use my account font".)
 */
export const NAME_FONT_NONE = 'none';

export function isNameFontId(value: unknown): value is string {
	return typeof value === 'string' && NAME_FONT_IDS.has(value);
}
