// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: what there is to buy and earn. Helpers produce purrs every second,
// upgrades multiply them, achievements add a little everywhere, and Nine Lives perks carry
// over when you start over.

export interface HelperDef {
	id: string;
	name: string;
	emoji: string;
	description: string;
	baseCost: number;
	basePps: number;
}

export const HELPERS: ReadonlyArray<HelperDef> = [
	{id: 'yarn', name: 'Yarn Ball', emoji: '🧶', description: 'Something to bat around. A purr every ten seconds.', baseCost: 15, basePps: 0.1},
	{id: 'kitten', name: 'Kitten', emoji: '🐱', description: 'Small, loud, and very happy to see you.', baseCost: 100, basePps: 1},
	{id: 'post', name: 'Scratching Post', emoji: '🪵', description: 'Saves the sofa, earns purrs.', baseCost: 1_100, basePps: 8},
	{id: 'tree', name: 'Cat Tree', emoji: '🌳', description: 'Five floors of naps.', baseCost: 12_000, basePps: 47},
	{id: 'window', name: 'Sunny Window', emoji: '☀️', description: 'Warm, bright, full of birds to watch.', baseCost: 130_000, basePps: 260},
	{id: 'box', name: 'Cardboard Castle', emoji: '📦', description: 'Turrets made of delivery boxes.', baseCost: 1_400_000, basePps: 1_400},
	{id: 'cafe', name: 'Cat Café', emoji: '☕', description: 'Visitors pay in head scratches.', baseCost: 20_000_000, basePps: 7_800},
	{id: 'farm', name: 'Catnip Farm', emoji: '🌿', description: 'Acres of the good stuff.', baseCost: 330_000_000, basePps: 44_000},
	{id: 'shelter', name: 'Cat Shelter', emoji: '🏡', description: 'Every cat finds a lap here.', baseCost: 5_100_000_000, basePps: 260_000},
	{id: 'laser', name: 'Laser Lab', emoji: '🔴', description: 'The red dot, at industrial scale.', baseCost: 75_000_000_000, basePps: 1_600_000},
	{id: 'moon', name: 'Moon Colony', emoji: '🌙', description: 'Low gravity, maximum zoomies.', baseCost: 1_000_000_000_000, basePps: 10_000_000},
];

export const HELPER_COST_GROWTH = 1.15;

/** Owned counts at which a helper gets its next doubling upgrade, and their cost factors. */
export const HELPER_TIERS: ReadonlyArray<{need: number; costFactor: number; adjective: string}> = [
	{need: 1, costFactor: 10, adjective: 'Fluffier'},
	{need: 10, costFactor: 50, adjective: 'Cozier'},
	{need: 25, costFactor: 500, adjective: 'Purr-fected'},
	{need: 50, costFactor: 50_000, adjective: 'Legendary'},
	{need: 100, costFactor: 5_000_000, adjective: 'Mythic'},
	{need: 150, costFactor: 500_000_000, adjective: 'Cosmic'},
	{need: 200, costFactor: 50_000_000_000, adjective: 'Nine-Lived'},
];

export type UpgradeEffect =
	| {kind: 'helper'; helper: string; multiplier: number}
	| {kind: 'pet'; multiplier: number}
	| {kind: 'petShare'; share: number}
	| {kind: 'global'; multiplier: number}
	| {kind: 'synergy'; helper: string; per: string; bonus: number}
	| {kind: 'lucky'; frequency?: number; duration?: number};

export interface UpgradeDef {
	id: string;
	name: string;
	emoji: string;
	description: string;
	cost: number;
	effect: UpgradeEffect;
	/** Shown in the shop once this is true. */
	unlock: (state: {owned: Record<string, number>; lifetimeRun: number; pets: number; luckyCaught: number}) => boolean;
}

function helperTierUpgrades(): Array<UpgradeDef> {
	const upgrades: Array<UpgradeDef> = [];
	for (const helper of HELPERS) {
		HELPER_TIERS.forEach((tier, index) => {
			upgrades.push({
				id: `${helper.id}-t${index + 1}`,
				name: `${tier.adjective} ${helper.name}`,
				emoji: helper.emoji,
				description: `${helper.name}s purr twice as much.`,
				cost: helper.baseCost * tier.costFactor,
				effect: {kind: 'helper', helper: helper.id, multiplier: 2},
				unlock: (state) => (state.owned[helper.id] ?? 0) >= tier.need,
			});
		});
	}
	return upgrades;
}

export const UPGRADES: ReadonlyArray<UpgradeDef> = [
	{
		id: 'pet-1',
		name: 'Gentle Hands',
		emoji: '🖐️',
		description: 'Pets are worth twice as much.',
		cost: 100,
		effect: {kind: 'pet', multiplier: 2},
		unlock: (s) => s.pets >= 10,
	},
	{
		id: 'pet-2',
		name: 'Chin Scratches',
		emoji: '😽',
		description: 'Pets are worth twice as much.',
		cost: 500,
		effect: {kind: 'pet', multiplier: 2},
		unlock: (s) => s.pets >= 100,
	},
	{
		id: 'pet-3',
		name: 'The Spot Behind the Ears',
		emoji: '👂',
		description: 'Pets are worth twice as much.',
		cost: 10_000,
		effect: {kind: 'pet', multiplier: 2},
		unlock: (s) => s.pets >= 500,
	},
	...[1, 2, 3, 4, 5, 6].map(
		(n): UpgradeDef => ({
			id: `pet-share-${n}`,
			name: ['Belly Rub (Risky)', 'Slow Blink', 'Head Bonk', 'Biscuit Kneading', 'Loaf Mode', 'Ancient Purr'][n - 1],
			emoji: ['🫃', '😌', '🤕', '🍞', '🍞', '🔮'][n - 1],
			description: 'Each pet also earns 1% of your purrs per second.',
			cost: 10 ** (4 + n * 2),
			effect: {kind: 'petShare', share: 0.01},
			unlock: (s) => s.pets >= 200 * n && s.lifetimeRun >= 10 ** (3 + n * 2),
		}),
	),
	...[1, 2, 3, 4, 5, 6, 7, 8].map(
		(n): UpgradeDef => ({
			id: `global-${n}`,
			name: [
				'Warm Milk',
				'Fresh Water Fountain',
				'Heated Blankets',
				'Fancy Food Bowls',
				'Catnip Infusion',
				'Window Bird Feeder',
				'Infinite Cardboard',
				'The Big Sunbeam',
			][n - 1],
			emoji: ['🥛', '⛲', '🛏️', '🥣', '🌱', '🐦', '📦', '🌞'][n - 1],
			description: `All purrs per second +${n <= 4 ? 10 : 25}%.`,
			cost: 10 ** (3 + n * 1.6),
			effect: {kind: 'global', multiplier: n <= 4 ? 1.1 : 1.25},
			unlock: (s) => s.lifetimeRun >= 10 ** (2 + n * 1.6),
		}),
	),
	{
		id: 'syn-playdates',
		name: 'Kitten Playdates',
		emoji: '🧸',
		description: 'Kittens +2% for every Cat Café you own.',
		cost: 50_000_000,
		effect: {kind: 'synergy', helper: 'kitten', per: 'cafe', bonus: 0.02},
		unlock: (s) => (s.owned.kitten ?? 0) >= 25 && (s.owned.cafe ?? 0) >= 1,
	},
	{
		id: 'syn-tree-window',
		name: 'Treetop Sunbathing',
		emoji: '🌤️',
		description: 'Cat Trees +1% for every Sunny Window you own.',
		cost: 2_000_000,
		effect: {kind: 'synergy', helper: 'tree', per: 'window', bonus: 0.01},
		unlock: (s) => (s.owned.tree ?? 0) >= 15 && (s.owned.window ?? 0) >= 15,
	},
	{
		id: 'syn-shelter',
		name: 'Shelter Network',
		emoji: '🤝',
		description: 'Cat Shelters +1% for every Kitten you own.',
		cost: 50_000_000_000,
		effect: {kind: 'synergy', helper: 'shelter', per: 'kitten', bonus: 0.01},
		unlock: (s) => (s.owned.shelter ?? 0) >= 10 && (s.owned.kitten ?? 0) >= 100,
	},
	{
		id: 'syn-farm-laser',
		name: 'Grow Lights',
		emoji: '💡',
		description: 'Catnip Farms +1% for every Laser Lab you own.',
		cost: 2_000_000_000_000,
		effect: {kind: 'synergy', helper: 'farm', per: 'laser', bonus: 0.01},
		unlock: (s) => (s.owned.farm ?? 0) >= 25 && (s.owned.laser ?? 0) >= 10,
	},
	{
		id: 'lucky-1',
		name: 'Shiny Bell',
		emoji: '🔔',
		description: 'Lucky Cats show up twice as often.',
		cost: 77_777,
		effect: {kind: 'lucky', frequency: 2},
		unlock: (s) => s.luckyCaught >= 3,
	},
	{
		id: 'lucky-2',
		name: 'Patient Paws',
		emoji: '🐾',
		description: 'Lucky Cats and their effects last twice as long.',
		cost: 7_777_777,
		effect: {kind: 'lucky', duration: 2},
		unlock: (s) => s.luckyCaught >= 10,
	},
	...helperTierUpgrades(),
];

export interface AchievementDef {
	id: string;
	name: string;
	description: string;
	check: (s: {
		lifetimeAll: number;
		owned: Record<string, number>;
		pets: number;
		luckyCaught: number;
		lives: number;
		pps: number;
	}) => boolean;
}

function achievements(): Array<AchievementDef> {
	const list: Array<AchievementDef> = [];
	const purrNames = [
		'First Purr',
		'Lap Warmer',
		'Purr Machine',
		'Rumble Strip',
		'Purrthquake',
		'Seismic Cat',
		'Planetary Purr',
		'Galactic Rumble',
		'Purr of the Void',
		'The Last Purr',
	];
	purrNames.forEach((name, index) => {
		const need = 10 ** (index * 3 + 1);
		list.push({
			id: `purrs-${index}`,
			name,
			description: `Earn ${need.toLocaleString('en')} purrs in total.`,
			check: (s) => s.lifetimeAll >= need,
		});
	});
	[1, 10, 100, 1_000, 100_000, 10_000_000, 1_000_000_000].forEach((need, index) => {
		list.push({
			id: `pps-${index}`,
			name: ['Humming', 'Rumbling', 'Thrumming', 'Roaring', 'Thundering', 'Resonating', 'Cosmic Hum'][index],
			description: `Reach ${need.toLocaleString('en')} purrs per second.`,
			check: (s) => s.pps >= need,
		});
	});
	[100, 1_000, 10_000, 100_000].forEach((need, index) => {
		list.push({
			id: `pets-${index}`,
			name: ['Good Kitty', 'Friendly Hand', 'Professional Petter', 'Hand of Legend'][index],
			description: `Pet the cat ${need.toLocaleString('en')} times.`,
			check: (s) => s.pets >= need,
		});
	});
	for (const helper of HELPERS) {
		[1, 50, 100, 200].forEach((need) => {
			list.push({
				id: `${helper.id}-${need}`,
				name: need === 1 ? `New ${helper.name}` : `${need} ${helper.name}s`,
				description: `Own ${need} ${helper.name}${need === 1 ? '' : 's'}.`,
				check: (s) => (s.owned[helper.id] ?? 0) >= need,
			});
		});
	}
	[1, 10, 77].forEach((need, index) => {
		list.push({
			id: `lucky-${index}`,
			name: ['Lucky Break', 'Fortune Finder', 'Charmed Life'][index],
			description: `Catch ${need} Lucky Cat${need === 1 ? '' : 's'}.`,
			check: (s) => s.luckyCaught >= need,
		});
	});
	[1, 9, 99].forEach((need, index) => {
		list.push({
			id: `lives-${index}`,
			name: ['Second Life', 'All Nine Lives', 'Beyond Nine'][index],
			description: `Have ${need} Li${need === 1 ? 'fe' : 'ves'}.`,
			check: (s) => s.lives >= need,
		});
	});
	return list;
}

export const ACHIEVEMENTS: ReadonlyArray<AchievementDef> = achievements();
/** Each achievement adds this much to all production. */
export const ACHIEVEMENT_BONUS = 0.01;

export interface PerkDef {
	id: string;
	name: string;
	emoji: string;
	description: string;
	cost: number;
}

export const PERKS: ReadonlyArray<PerkDef> = [
	{id: 'head-start', name: 'Head Start', emoji: '🚀', description: 'Start every life with 10 Yarn Balls and 5 Kittens.', cost: 1},
	{id: 'lucky-paws', name: 'Lucky Paws', emoji: '🍀', description: 'Lucky Cats show up 50% more often.', cost: 2},
	{id: 'purr-echo', name: 'Purr Echo', emoji: '📣', description: 'Each pet also earns 5% of your purrs per second.', cost: 3},
	{id: 'bargain', name: 'Bargain Hunter', emoji: '🏷️', description: 'Helpers cost 10% less.', cost: 5},
	{id: 'long-naps', name: 'Long Naps', emoji: '😴', description: 'Earn 50% (not 25%) while away, for up to 24 hours (not 8).', cost: 8},
	{id: 'golden-whiskers', name: 'Golden Whiskers', emoji: '✨', description: 'Lucky Cat effects are twice as strong.', cost: 13},
	{id: 'feline-memory', name: 'Feline Memory', emoji: '🧠', description: 'Keep your petting upgrades when you start over.', cost: 21},
];

/** Lives earned in total for this many purrs earned over all lives. */
export function livesFor(lifetimeAll: number): number {
	return Math.floor(Math.cbrt(lifetimeAll / 1e12));
}
/** Each Life adds this much to all production. */
export const LIFE_BONUS = 0.02;
