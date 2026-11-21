// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the wider world around the café. Cats you adopt (coats, rarities,
// traits), the cat's mood and treats, the catnip garden and its research tree, daily goals,
// and outfits for the cat you pet. Everything here outlasts a new life (Nine Lives).

import {HELPERS} from '@app/features/catnip_cafe/CafeData';

// ----- coats (fur colours), shared by adopted cats and the cat you pet -----

export interface CoatDef {
	id: string;
	name: string;
	fur: string;
	furDark: string;
	stroke: string;
	/** Forehead stripes, if any. */
	stripe?: string;
	/** Patches drawn over the fur (calico). */
	patches?: Array<{colour: string; d: string}>;
	/** A lighter muzzle and chin (tuxedo, siamese is darker). */
	muzzle?: string;
	/** Darker ears and face mask (siamese). */
	points?: string;
	/** Little stars over the fur (galaxy). */
	stars?: boolean;
	/** Only legendary cats come with this coat. */
	legendaryOnly?: boolean;
}

export const COATS: ReadonlyArray<CoatDef> = [
	{id: 'ginger', name: 'Ginger', fur: '#ffc983', furDark: '#ef9a4a', stroke: '#b9682a', stripe: '#c9752f'},
	{id: 'black', name: 'Midnight', fur: '#55556a', furDark: '#2a2a36', stroke: '#141419'},
	{id: 'grey', name: 'Silver', fur: '#d3d7df', furDark: '#9198a7', stroke: '#5d6270', stripe: '#7b8190'},
	{id: 'white', name: 'Snow', fur: '#ffffff', furDark: '#e6e1da', stroke: '#b2a99f'},
	{id: 'cream', name: 'Cream', fur: '#fff3dc', furDark: '#f0d19c', stroke: '#c49a5a', stripe: '#e3b97c'},
	{
		id: 'calico',
		name: 'Calico',
		fur: '#ffffff',
		furDark: '#ece6de',
		stroke: '#a89c8f',
		patches: [
			{colour: '#ef9a4a', d: 'M40 95q10-40 45-42q-8 25-22 40q-12 10-23 2Z'},
			{colour: '#3b3b46', d: 'M118 58q30 0 50 30q-20 6-36 0q-12-8-14-30Z'},
			{colour: '#ef9a4a', d: 'M130 150q22-6 34 6q-8 16-26 16q-10-8-8-22Z'},
		],
	},
	{id: 'tuxedo', name: 'Tuxedo', fur: '#45454f', furDark: '#22222a', stroke: '#111116', muzzle: '#ffffff'},
	{id: 'tabby', name: 'Tabby', fur: '#d2ab82', furDark: '#9a7450', stroke: '#5e4630', stripe: '#6e5238'},
	{id: 'siamese', name: 'Siamese', fur: '#fbf0de', furDark: '#e6d3b5', stroke: '#9c8268', points: '#6b4a3a'},
	{
		id: 'galaxy',
		name: 'Galaxy',
		fur: '#7b6cf0',
		furDark: '#2d1b69',
		stroke: '#1b1040',
		stars: true,
		legendaryOnly: true,
	},
];

export const COAT_BY_ID = new Map(COATS.map((coat) => [coat.id, coat]));

// ----- adopted cats -----

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const RARITIES: ReadonlyArray<{id: Rarity; name: string; weight: number; power: number; catnip: number}> = [
	{id: 'common', name: 'Common', weight: 60, power: 1, catnip: 5},
	{id: 'uncommon', name: 'Uncommon', weight: 27, power: 1.6, catnip: 12},
	{id: 'rare', name: 'Rare', weight: 10, power: 2.5, catnip: 30},
	{id: 'legendary', name: 'Legendary', weight: 3, power: 4, catnip: 80},
];

export const RARITY_BY_ID = new Map(RARITIES.map((rarity) => [rarity.id, rarity]));

export type TraitKind = 'helper' | 'pet' | 'global' | 'lucky' | 'garden' | 'calm' | 'treat' | 'away' | 'mouse';

export interface CatTrait {
	kind: TraitKind;
	/** For helper traits: which helper. */
	helper?: string;
	/** The bonus at level 1, as a fraction (0.1 = 10%), or percentage points for "away". */
	value: number;
}

/** Base trait strength (for a common cat at level 1), and how likely each kind is. */
const TRAIT_BASE: ReadonlyArray<{kind: TraitKind; value: number; weight: number}> = [
	{kind: 'helper', value: 0.12, weight: 30},
	{kind: 'pet', value: 0.1, weight: 12},
	{kind: 'global', value: 0.03, weight: 14},
	{kind: 'lucky', value: 0.05, weight: 8},
	{kind: 'garden', value: 0.06, weight: 9},
	{kind: 'calm', value: 0.08, weight: 8},
	{kind: 'treat', value: 0.1, weight: 6},
	{kind: 'away', value: 0.02, weight: 6},
	{kind: 'mouse', value: 0.12, weight: 7},
];

export interface CafeCatData {
	id: number;
	name: string;
	coat: string;
	rarity: Rarity;
	trait: CatTrait;
	adoptedAt: number;
	/** Time spent living in the café (as a resident), which raises its level. */
	residentMs: number;
}

/** Hours as a resident needed for levels 2 to 5. */
export const CAT_LEVEL_HOURS = [1, 4, 12, 36];
export const CAT_MAX_LEVEL = CAT_LEVEL_HOURS.length + 1;
export const COLLECTION_LIMIT = 60;
export const BASE_RESIDENT_SLOTS = 3;

export function catLevel(cat: CafeCatData, bondingSpeed = 1): number {
	const hours = (cat.residentMs * bondingSpeed) / 3_600_000;
	let level = 1;
	for (const need of CAT_LEVEL_HOURS) if (hours >= need) level++;
	return level;
}

/** The trait's bonus with rarity and level applied. */
export function traitStrength(cat: CafeCatData, bondingSpeed = 1): number {
	const power = RARITY_BY_ID.get(cat.rarity)?.power ?? 1;
	return cat.trait.value * power * (1 + 0.25 * (catLevel(cat, bondingSpeed) - 1));
}

export function describeTrait(trait: CatTrait, strength: number): string {
	const percent = `${Math.round(strength * 1000) / 10}%`;
	switch (trait.kind) {
		case 'helper': {
			const helper = HELPERS.find((h) => h.id === trait.helper);
			return `${helper?.name ?? 'Helper'}s +${percent}`;
		}
		case 'pet':
			return `Pets +${percent}`;
		case 'global':
			return `All purrs +${percent}`;
		case 'lucky':
			return `Lucky Cats +${percent} more often`;
		case 'garden':
			return `Garden grows ${percent} faster`;
		case 'calm':
			return `Mood falls ${percent} slower`;
		case 'treat':
			return `Treats +${percent} mood`;
		case 'away':
			return `+${Math.round(strength * 1000) / 10} points earned while away`;
		case 'mouse':
			return `Mice +${percent} more often`;
	}
}

const CAT_NAMES = [
	'Mochi', 'Biscuit', 'Pumpkin', 'Miso', 'Pepper', 'Noodle', 'Toast', 'Waffles', 'Bean', 'Pickle',
	'Luna', 'Olive', 'Nugget', 'Pudding', 'Socks', 'Tofu', 'Clementine', 'Juniper', 'Marble', 'Smudge',
	'Ziggy', 'Pip', 'Wasabi', 'Dumpling', 'Sesame', 'Taffy', 'Momo', 'Cinnamon', 'Basil', 'Hazel',
	'Pretzel', 'Kiwi', 'Mango', 'Sprout', 'Truffle', 'Bramble', 'Fig', 'Cocoa', 'Sushi', 'Button',
	'Tinsel', 'Comet', 'Muffin', 'Peanut', 'Saffron', 'Willow', 'Ember', 'Pebble', 'Nimbus', 'Oreo',
	'Rascal', 'Sir Fluff', 'Lady Whiskers', 'Professor Paws', 'Captain Mew', 'Duchess', 'Baron Von Purr',
	'Meatball', 'Gizmo', 'Scout',
];

function pick<T>(items: ReadonlyArray<T>, random: () => number): T {
	return items[Math.floor(random() * items.length) % items.length];
}

function pickWeighted<T extends {weight: number}>(items: ReadonlyArray<T>, random: () => number): T {
	const total = items.reduce((sum, item) => sum + item.weight, 0);
	let roll = random() * total;
	for (const item of items) {
		roll -= item.weight;
		if (roll < 0) return item;
	}
	return items[items.length - 1];
}

export function rollCat(id: number, random: () => number = Math.random, minRarity?: Rarity): CafeCatData {
	let rarity = pickWeighted(RARITIES, random).id;
	if (minRarity) {
		const order = RARITIES.map((r) => r.id);
		if (order.indexOf(rarity) < order.indexOf(minRarity)) rarity = minRarity;
	}
	const coats = COATS.filter((coat) => !coat.legendaryOnly || rarity === 'legendary');
	// Legendary cats are often galaxy cats.
	const coat = rarity === 'legendary' && random() < 0.5 ? 'galaxy' : pick(coats, random).id;
	const base = pickWeighted(TRAIT_BASE, random);
	const trait: CatTrait = {kind: base.kind, value: base.value};
	if (base.kind === 'helper') trait.helper = pick(HELPERS, random).id;
	return {id, name: pick(CAT_NAMES, random), coat, rarity, trait, adoptedAt: Date.now(), residentMs: 0};
}

export const ADOPTION_BASE_COST = 5_000;
export const ADOPTION_COST_GROWTH = 6;

// ----- mood and treats -----

export const MOOD_MAX = 100;
/** Mood lost per second. */
export const MOOD_DECAY = 0.2;
export const BLISS_MS = 30_000;
export const BLISS_PPS = 2;
export const BLISS_PETS = 3;
export const MAX_RHYTHM = 20;

export interface MoodTier {
	id: 'grumpy' | 'calm' | 'happy' | 'delighted';
	name: string;
	emoji: string;
	min: number;
	pps: number;
	pets: number;
}

export const MOOD_TIERS: ReadonlyArray<MoodTier> = [
	{id: 'grumpy', name: 'Grumpy', emoji: '😾', min: 0, pps: 0.9, pets: 1},
	{id: 'calm', name: 'Calm', emoji: '🐱', min: 20, pps: 1, pets: 1},
	{id: 'happy', name: 'Happy', emoji: '😺', min: 60, pps: 1.1, pets: 1.25},
	{id: 'delighted', name: 'Delighted', emoji: '😻', min: 90, pps: 1.2, pets: 1.5},
];

export function moodTier(mood: number): MoodTier {
	let tier = MOOD_TIERS[0];
	for (const candidate of MOOD_TIERS) if (mood >= candidate.min) tier = candidate;
	return tier;
}

export interface TreatDef {
	id: 'cookie' | 'tuna' | 'sardine';
	name: string;
	emoji: string;
	description: string;
	/** Mood it gives; the sardine sets off Bliss instead. */
	mood: number;
	/** Seconds of base purrs per second it costs (0 = can't be bought). */
	costSeconds: number;
	minCost: number;
}

export const TREATS: ReadonlyArray<TreatDef> = [
	{id: 'cookie', name: 'Cookie Treat', emoji: '🍪', description: 'A crunchy little treat. +25 mood.', mood: 25, costSeconds: 45, minCost: 100},
	{id: 'tuna', name: 'Tuna Flakes', emoji: '🐟', description: 'The good stuff. +60 mood.', mood: 60, costSeconds: 150, minCost: 500},
	{
		id: 'sardine',
		name: 'Golden Sardine',
		emoji: '🐠',
		description: 'Instant Bliss. Found in goal chests and lucky harvests.',
		mood: 0,
		costSeconds: 0,
		minCost: 0,
	},
];

// ----- mice -----

export const MOUSE_MIN_MS = 75_000;
export const MOUSE_MAX_MS = 200_000;
export const MOUSE_RUN_MS = 4_200;

// ----- garden -----

export interface SeedDef {
	id: string;
	name: string;
	emoji: string;
	growMs: number;
	yield: number;
	/** Research needed to plant it. */
	research?: string;
}

export const SEEDS: ReadonlyArray<SeedDef> = [
	{id: 'catnip', name: 'Catnip', emoji: '🌿', growMs: 5 * 60_000, yield: 4},
	{id: 'silvervine', name: 'Silvervine', emoji: '🍃', growMs: 30 * 60_000, yield: 20},
	{id: 'valerian', name: 'Valerian', emoji: '🌸', growMs: 2 * 3_600_000, yield: 70},
	{id: 'moonmint', name: 'Moonmint', emoji: '🌙', growMs: 8 * 3_600_000, yield: 260, research: 'moonmint'},
];

export const SEED_BY_ID = new Map(SEEDS.map((seed) => [seed.id, seed]));
export const START_PLOTS = 2;
export const MAX_PLOTS = 8;

export function plotCost(plots: number): number {
	return 25_000 * 40 ** (plots - START_PLOTS);
}

export interface ResearchDef {
	id: string;
	branch: 'garden' | 'cats' | 'cafe';
	name: string;
	emoji: string;
	description: string;
	cost: number;
	requires?: string;
}

export const RESEARCH: ReadonlyArray<ResearchDef> = [
	// Garden
	{id: 'green-1', branch: 'garden', name: 'Green Thumb', emoji: '👍', description: 'Plants grow 25% faster.', cost: 15},
	{id: 'bounty', branch: 'garden', name: 'Bountiful Beds', emoji: '🧺', description: '+50% catnip from each harvest.', cost: 40, requires: 'green-1'},
	{id: 'green-2', branch: 'garden', name: 'Greenhouse', emoji: '🏠', description: 'Plants grow 50% faster.', cost: 120, requires: 'bounty'},
	{id: 'moonmint', branch: 'garden', name: 'Moonmint Seeds', emoji: '🌙', description: 'Unlocks Moonmint, a slow but rich plant.', cost: 250, requires: 'green-2'},
	{id: 'golden-harvest', branch: 'garden', name: 'Golden Harvest', emoji: '🐠', description: 'Each harvest has a 5% chance to find a Golden Sardine.', cost: 400, requires: 'moonmint'},
	// Cats
	{id: 'whisperer-1', branch: 'cats', name: 'Cat Whisperer', emoji: '🗣️', description: '+3 cats can live in your café.', cost: 25},
	{id: 'fairs', branch: 'cats', name: 'Adoption Fairs', emoji: '🎪', description: 'Adopting costs 30% less.', cost: 60, requires: 'whisperer-1'},
	{id: 'bonding', branch: 'cats', name: 'Bonding Time', emoji: '💞', description: 'Cats grow closer (level up) twice as fast.', cost: 150, requires: 'fairs'},
	{id: 'whisperer-2', branch: 'cats', name: 'Cat Sanctuary', emoji: '🏰', description: '+3 more cats can live in your café.', cost: 300, requires: 'bonding'},
	{id: 'kinship', branch: 'cats', name: 'Kinship', emoji: '🫂', description: 'Each cat living in your café adds 2% to all purrs.', cost: 600, requires: 'whisperer-2'},
	// Café
	{id: 'aura-1', branch: 'cafe', name: 'Catnip Aura', emoji: '🌱', description: 'All purrs +10%.', cost: 20},
	{id: 'recipes', branch: 'cafe', name: 'Treat Recipes', emoji: '📖', description: 'Treats cost half and give 25% more mood.', cost: 50, requires: 'aura-1'},
	{id: 'calm', branch: 'cafe', name: 'Calm Corners', emoji: '🛋️', description: 'Mood falls half as fast.', cost: 100, requires: 'recipes'},
	{id: 'aura-2', branch: 'cafe', name: 'Strong Aura', emoji: '🌳', description: 'All purrs +25%.', cost: 250, requires: 'calm'},
	{id: 'night-shift', branch: 'cafe', name: 'Night Shift', emoji: '🌃', description: 'Earn 15 points more while away.', cost: 350, requires: 'aura-2'},
	{id: 'squeaky', branch: 'cafe', name: 'Squeaky Toys', emoji: '🐭', description: 'Mice show up twice as often and are worth twice as much.', cost: 500, requires: 'night-shift'},
	{id: 'aura-3', branch: 'cafe', name: 'Overwhelming Aura', emoji: '🌌', description: 'All purrs +50%.', cost: 1_000, requires: 'squeaky'},
];

export const RESEARCH_BY_ID = new Map(RESEARCH.map((research) => [research.id, research]));

// ----- daily goals -----

export type GoalKind = 'pet' | 'buy' | 'lucky' | 'mouse' | 'harvest' | 'treat' | 'earn' | 'bliss' | 'rhythm';

export interface GoalData {
	kind: GoalKind;
	target: number;
	progress: number;
	claimed: boolean;
	reward: 'cookie' | 'tuna' | 'catnip';
}

export const GOAL_KINDS: ReadonlyArray<GoalKind> = ['pet', 'buy', 'lucky', 'mouse', 'harvest', 'treat', 'earn', 'bliss', 'rhythm'];
export const GOAL_CATNIP_REWARD = 15;
/** Each day in a row with every goal done adds this to all purrs, up to the cap. */
export const STREAK_BONUS = 0.02;
export const STREAK_CAP = 10;

export function goalTarget(kind: GoalKind, basePps: number): number {
	switch (kind) {
		case 'pet':
			return 400;
		case 'buy':
			return 15;
		case 'lucky':
			return 1;
		case 'mouse':
			return 3;
		case 'harvest':
			return 3;
		case 'treat':
			return 2;
		case 'earn':
			return Math.max(1_000, Math.round(basePps * 900));
		case 'bliss':
			return 1;
		case 'rhythm':
			return 1;
	}
}

/** A small seeded random generator (the same goals for the same person on the same day). */
export function seededRandom(seed: string): () => number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = h >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function localDayKey(time = Date.now()): string {
	const date = new Date(time);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function previousDayKey(day: string): string {
	const [year, month, date] = day.split('-').map(Number);
	return localDayKey(new Date(year, month - 1, date - 1, 12).getTime());
}

// ----- outfits for the cat you pet -----

export interface Progress {
	lifetimeAll: number;
	owned: Record<string, number>;
	pets: number;
	luckyCaught: number;
	lives: number;
	pps: number;
	achievements: number;
	miceCaught: number;
	harvests: number;
	treatsEaten: number;
	catsAdopted: number;
	legendaryCats: number;
	blissCount: number;
	goalsDone: number;
	longestStreak: number;
	research: number;
}

export type OutfitSlot = 'hat' | 'collar';

export interface OutfitDef {
	id: string;
	slot: OutfitSlot;
	name: string;
	unlockText: string;
	unlocked: (p: Progress) => boolean;
}

export const OUTFITS: ReadonlyArray<OutfitDef> = [
	{id: 'party', slot: 'hat', name: 'Party Hat', unlockText: 'Earn 10 achievements.', unlocked: (p) => p.achievements >= 10},
	{id: 'beanie', slot: 'hat', name: 'Cosy Beanie', unlockText: 'Catch 10 mice.', unlocked: (p) => p.miceCaught >= 10},
	{id: 'flowers', slot: 'hat', name: 'Flower Crown', unlockText: 'Harvest 20 plants.', unlocked: (p) => p.harvests >= 20},
	{id: 'tophat', slot: 'hat', name: 'Top Hat', unlockText: 'Reach 1M purrs per second.', unlocked: (p) => p.pps >= 1e6},
	{id: 'wizard', slot: 'hat', name: 'Wizard Hat', unlockText: 'Finish 10 research projects.', unlocked: (p) => p.research >= 10},
	{id: 'crown', slot: 'hat', name: 'Crown', unlockText: 'Start a new life.', unlocked: (p) => p.lives >= 1},
	{id: 'halo', slot: 'hat', name: 'Halo', unlockText: 'Earn 50 achievements.', unlocked: (p) => p.achievements >= 50},
	{id: 'bell', slot: 'collar', name: 'Bell Collar', unlockText: 'Pet the cat 1,000 times.', unlocked: (p) => p.pets >= 1_000},
	{id: 'bowtie', slot: 'collar', name: 'Bow Tie', unlockText: 'Adopt 3 cats.', unlocked: (p) => p.catsAdopted >= 3},
	{id: 'scarf', slot: 'collar', name: 'Striped Scarf', unlockText: 'Finish your daily goals 3 days in a row.', unlocked: (p) => p.longestStreak >= 3},
	{id: 'gold', slot: 'collar', name: 'Gold Chain', unlockText: 'Catch 50 Lucky Cats.', unlocked: (p) => p.luckyCaught >= 50},
];
