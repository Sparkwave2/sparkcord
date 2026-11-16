// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: avatar cosmetics people can wear. A cosmetic is an image drawn on top of
// the avatar, wherever the avatar appears. The image files are bundled with the web app
// under /assets/cosmetics/. To add one: put its file there and add an entry here.

export interface AvatarCosmetic {
	/** Stable id stored on accounts. */
	id: string;
	name: string;
	/** File name under /assets/cosmetics/. */
	file: string;
	/**
	 * Size relative to the avatar: 1 covers it exactly; larger values let a frame reach
	 * outside the avatar's edge.
	 */
	scale: number;
}

export const AVATAR_COSMETICS: ReadonlyArray<AvatarCosmetic> = [
	{id: 'placeholder-circle', name: 'Placeholder circle', file: 'placeholder-circle.svg', scale: 1},
];

const BY_ID = new Map(AVATAR_COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]));

export function getAvatarCosmetic(id: string | null | undefined): AvatarCosmetic | null {
	return id ? (BY_ID.get(id) ?? null) : null;
}

export function isAvatarCosmeticId(id: string): boolean {
	return BY_ID.has(id);
}
