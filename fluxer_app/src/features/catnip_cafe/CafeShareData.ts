// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the data behind a shared café card (/cafe). The card is sent as an
// ordinary rich embed, so any app shows its title and stat fields; its link points at the
// café and carries the numbers and the cat's look, which Sparkcord reads back to draw the card.
// Kept free of heavy imports: the embed renderer checks every embed with parseCafeCard.

/** Query parameter marking a café card link. */
const CARD_PARAM = 'cafe_card';
const CAFE_PATH = '/channels/@cafe';

export interface CafeCardData {
	coat: string;
	hat: string | null;
	collar: string | null;
	/** Purrs earned in total (all lives). */
	purrs: number;
	/** Purrs per second. */
	pps: number;
	lives: number;
	pets: number;
	cats: number;
	achievements: number;
	achievementsTotal: number;
	streak: number;
}

const NUMBER_KEYS = ['purrs', 'pps', 'lives', 'pets', 'cats', 'achievements', 'achievementsTotal', 'streak'] as const;

export function buildCafeCardUrl(origin: string, data: CafeCardData): string {
	const url = new URL(CAFE_PATH, origin);
	url.searchParams.set(CARD_PARAM, '1');
	url.searchParams.set('coat', data.coat);
	if (data.hat) url.searchParams.set('hat', data.hat);
	if (data.collar) url.searchParams.set('collar', data.collar);
	for (const key of NUMBER_KEYS) {
		const value = data[key];
		url.searchParams.set(key, Number.isInteger(value) ? String(value) : value.toPrecision(6));
	}
	return url.toString();
}

const ID = /^[a-z0-9-]{1,32}$/;

/** The card behind an embed's link, or null when the embed isn't a café card. */
export function parseCafeCard(embed: {url?: string | null}): CafeCardData | null {
	if (!embed.url || !embed.url.includes(CARD_PARAM)) return null;
	let url: URL;
	try {
		url = new URL(embed.url);
	} catch {
		return null;
	}
	if (url.pathname !== CAFE_PATH || url.searchParams.get(CARD_PARAM) !== '1') return null;
	const id = (name: string) => {
		const value = url.searchParams.get(name);
		return value && ID.test(value) ? value : null;
	};
	const numbers = {} as Record<(typeof NUMBER_KEYS)[number], number>;
	for (const key of NUMBER_KEYS) {
		const value = Number(url.searchParams.get(key));
		numbers[key] = Number.isFinite(value) && value >= 0 ? value : 0;
	}
	return {coat: id('coat') ?? 'ginger', hat: id('hat'), collar: id('collar'), ...numbers};
}
