// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the game state and rules. The game runs while its page is open;
// time away (page closed, or another device) earns at a reduced rate when you come back,
// while the garden keeps growing and resident cats keep bonding in real time.
// Progress is saved to the server (every 30 s while playing, and when leaving the page).
// Each save names the version it builds on; if another tab or device saved since, the server
// refuses it and this café switches to that newer progress instead of overwriting it.

import {
	ACHIEVEMENT_BONUS,
	ACHIEVEMENTS,
	HELPER_COST_GROWTH,
	HELPER_TIERS,
	HELPERS,
	LIFE_BONUS,
	livesFor,
	PERKS,
	UPGRADES,
	type UpgradeDef,
} from '@app/features/catnip_cafe/CafeData';
import {formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import {cafeSound} from '@app/features/catnip_cafe/CafeSound';
import {
	ADOPTION_BASE_COST,
	ADOPTION_COST_GROWTH,
	BASE_RESIDENT_SLOTS,
	BLISS_MS,
	BLISS_PETS,
	BLISS_PPS,
	type CafeCatData,
	COAT_BY_ID,
	COLLECTION_LIMIT,
	type GoalData,
	type GoalKind,
	GOAL_CATNIP_REWARD,
	GOAL_KINDS,
	goalTarget,
	localDayKey,
	MAX_PLOTS,
	MAX_RHYTHM,
	MOOD_DECAY,
	MOOD_MAX,
	MOUSE_MAX_MS,
	MOUSE_MIN_MS,
	MOUSE_RUN_MS,
	moodTier,
	OUTFITS,
	type OutfitSlot,
	plotCost,
	previousDayKey,
	type Progress,
	RARITIES,
	RARITY_BY_ID,
	type Rarity,
	RESEARCH_BY_ID,
	rollCat,
	SEED_BY_ID,
	seededRandom,
	START_PLOTS,
	STREAK_BONUS,
	STREAK_CAP,
	TREATS,
	type TraitKind,
	type TreatDef,
	traitStrength,
} from '@app/features/catnip_cafe/CafeWorld';
import {http} from '@app/features/platform/transport/RestTransport';
import {HttpError} from '@app/features/platform/types/EndpointError';
import {makeAutoObservable, runInAction} from 'mobx';

const SAVE_VERSION = 2;
const TICK_MS = 100;
const SAVE_EVERY_MS = 30_000;
/** Gaps longer than this count as time away (reduced rate) rather than play. */
const ACTIVE_GAP_MS = 60_000;
/** Time away shorter than this gets a small note instead of the welcome-back card. */
const WELCOME_CARD_MS = 5 * 60_000;
const LUCKY_MIN_MS = 120_000;
const LUCKY_MAX_MS = 300_000;
const LUCKY_VISIBLE_MS = 13_000;

export type BuffKind = 'zoomies' | 'frenzy';

interface Buff {
	kind: BuffKind;
	until: number;
}

export interface Plot {
	seed: string | null;
	plantedAt: number;
}

export interface CafeStats {
	bestPps: number;
	biggestPet: number;
	miceCaught: number;
	treatsEaten: number;
	harvests: number;
	catsAdopted: number;
	legendaryCats: number;
	goalsDone: number;
	longestStreak: number;
	blissCount: number;
	playMs: number;
	catnipEarned: number;
	biggestLuckyGift: number;
}

interface GoalsState {
	day: string;
	list: Array<GoalData>;
	rerolled: boolean;
	chestClaimed: boolean;
}

interface SaveData {
	v: number;
	purrs: number;
	lifetimeRun: number;
	lifetimeAll: number;
	pets: number;
	luckyCaught: number;
	owned: Record<string, number>;
	upgrades: Array<string>;
	achievements: Array<string>;
	livesEarned: number;
	perks: Array<string>;
	lifeStartedAt: number;
	savedAt: number;
	buff: Buff | null;
	// --- version 2 ---
	cats: Array<CafeCatData>;
	residents: Array<number>;
	nextCatId: number;
	adoptionsBought: number;
	mood: number;
	blissUntil: number;
	treats: Record<TreatDef['id'], number>;
	catnip: number;
	plots: Array<Plot>;
	research: Array<string>;
	goals: GoalsState;
	streak: number;
	lastFullDay: string;
	outfit: {hat: string | null; collar: string | null; coat: string};
	stats: CafeStats;
}

export interface LuckyCat {
	x: number;
	y: number;
	until: number;
}

export interface Mouse {
	id: number;
	/** Height on the stage, in percent. */
	y: number;
	fromLeft: boolean;
	until: number;
}

export interface Floater {
	id: number;
	kind: 'number' | 'heart' | 'paw';
	text: string;
	x: number;
	y: number;
	dx: number;
	dy: number;
}

export interface Notice {
	id: number;
	text: string;
}

interface SaveResponse {
	save: string | null;
	updated_at: number | null;
	slot?: number;
}

export interface SlotSummary {
	slot: number;
	/** When it was last saved; null for an empty slot. */
	updated_at: number | null;
	purrs: number;
	lives: number;
}

export interface SlotsInfo {
	active: number;
	slots: Array<SlotSummary>;
}

export interface Welcome {
	awayMs: number;
	purrs: number;
}

export interface Celebration {
	id: number;
	name: string;
}

function emptyStats(): CafeStats {
	return {
		bestPps: 0,
		biggestPet: 0,
		miceCaught: 0,
		treatsEaten: 0,
		harvests: 0,
		catsAdopted: 0,
		legendaryCats: 0,
		goalsDone: 0,
		longestStreak: 0,
		blissCount: 0,
		playMs: 0,
		catnipEarned: 0,
		biggestLuckyGift: 0,
	};
}

function emptySave(): SaveData {
	return {
		v: SAVE_VERSION,
		purrs: 0,
		lifetimeRun: 0,
		lifetimeAll: 0,
		pets: 0,
		luckyCaught: 0,
		owned: {},
		upgrades: [],
		achievements: [],
		livesEarned: 0,
		perks: [],
		lifeStartedAt: Date.now(),
		savedAt: Date.now(),
		buff: null,
		cats: [],
		residents: [],
		nextCatId: 1,
		adoptionsBought: 0,
		mood: 50,
		blissUntil: 0,
		treats: {cookie: 2, tuna: 0, sardine: 0},
		catnip: 0,
		plots: Array.from({length: START_PLOTS}, () => ({seed: null, plantedAt: 0})),
		research: [],
		goals: {day: '', list: [], rerolled: false, chestClaimed: false},
		streak: 0,
		lastFullDay: '',
		outfit: {hat: null, collar: null, coat: 'ginger'},
		stats: emptyStats(),
	};
}

const num = (value: unknown, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function readCat(value: unknown): CafeCatData | null {
	if (!isObject(value) || !isObject(value.trait)) return null;
	if (typeof value.id !== 'number' || typeof value.name !== 'string' || typeof value.coat !== 'string') return null;
	if (!RARITY_BY_ID.has(value.rarity as Rarity) || typeof value.trait.kind !== 'string') return null;
	return {
		id: value.id,
		name: value.name.slice(0, 40),
		coat: COAT_BY_ID.has(value.coat) ? value.coat : 'ginger',
		rarity: value.rarity as Rarity,
		trait: {
			kind: value.trait.kind as TraitKind,
			value: num(value.trait.value, 0),
			...(typeof value.trait.helper === 'string' ? {helper: value.trait.helper} : {}),
		},
		adoptedAt: num(value.adoptedAt, Date.now()),
		residentMs: num(value.residentMs, 0),
	};
}

function readSave(raw: string | null): SaveData {
	if (!raw) return emptySave();
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const base = emptySave();
		const stats = isObject(parsed.stats) ? parsed.stats : {};
		const goals = isObject(parsed.goals) ? parsed.goals : {};
		const outfit = isObject(parsed.outfit) ? parsed.outfit : {};
		const treats = isObject(parsed.treats) ? parsed.treats : {};
		const buff = isObject(parsed.buff) && typeof parsed.buff.until === 'number' ? (parsed.buff as unknown as Buff) : null;
		const cats = Array.isArray(parsed.cats)
			? parsed.cats.map(readCat).filter((cat): cat is CafeCatData => cat !== null).slice(0, COLLECTION_LIMIT)
			: [];
		const catIds = new Set(cats.map((cat) => cat.id));
		const plots = Array.isArray(parsed.plots)
			? parsed.plots
					.filter(isObject)
					.slice(0, MAX_PLOTS)
					.map((plot) => ({
						seed: typeof plot.seed === 'string' && SEED_BY_ID.has(plot.seed) ? plot.seed : null,
						plantedAt: num(plot.plantedAt, 0),
					}))
			: base.plots;
		while (plots.length < START_PLOTS) plots.push({seed: null, plantedAt: 0});
		const goalList = Array.isArray(goals.list)
			? goals.list
					.filter(isObject)
					.filter((goal) => GOAL_KINDS.includes(goal.kind as GoalKind))
					.map(
						(goal): GoalData => ({
							kind: goal.kind as GoalKind,
							target: Math.max(1, num(goal.target, 1)),
							progress: num(goal.progress, 0),
							claimed: goal.claimed === true,
							reward: goal.reward === 'tuna' || goal.reward === 'catnip' ? goal.reward : 'cookie',
						}),
					)
			: [];
		const statNumbers = Object.fromEntries(
			Object.entries(emptyStats()).map(([key, fallback]) => [key, num(stats[key], fallback)]),
		) as unknown as CafeStats;
		return {
			...base,
			purrs: num(parsed.purrs, 0),
			lifetimeRun: num(parsed.lifetimeRun, 0),
			lifetimeAll: num(parsed.lifetimeAll, 0),
			pets: num(parsed.pets, 0),
			luckyCaught: num(parsed.luckyCaught, 0),
			owned: isObject(parsed.owned) ? (parsed.owned as Record<string, number>) : {},
			upgrades: strings(parsed.upgrades),
			achievements: strings(parsed.achievements),
			livesEarned: num(parsed.livesEarned, 0),
			perks: strings(parsed.perks),
			lifeStartedAt: num(parsed.lifeStartedAt, base.lifeStartedAt),
			savedAt: num(parsed.savedAt, base.savedAt),
			buff,
			cats,
			residents: (Array.isArray(parsed.residents) ? parsed.residents : []).filter(
				(id): id is number => typeof id === 'number' && catIds.has(id),
			),
			nextCatId: Math.max(num(parsed.nextCatId, 1), ...cats.map((cat) => cat.id + 1), 1),
			adoptionsBought: num(parsed.adoptionsBought, 0),
			mood: Math.min(MOOD_MAX, num(parsed.mood, base.mood)),
			blissUntil: num(parsed.blissUntil, 0),
			treats: {
				cookie: num(treats.cookie, base.treats.cookie),
				tuna: num(treats.tuna, 0),
				sardine: num(treats.sardine, 0),
			},
			catnip: num(parsed.catnip, 0),
			plots,
			research: strings(parsed.research).filter((id) => RESEARCH_BY_ID.has(id)),
			goals: {
				day: typeof goals.day === 'string' ? goals.day : '',
				list: goalList,
				rerolled: goals.rerolled === true,
				chestClaimed: goals.chestClaimed === true,
			},
			streak: num(parsed.streak, 0),
			lastFullDay: typeof parsed.lastFullDay === 'string' ? parsed.lastFullDay : '',
			outfit: {
				hat: typeof outfit.hat === 'string' ? outfit.hat : null,
				collar: typeof outfit.collar === 'string' ? outfit.collar : null,
				coat: typeof outfit.coat === 'string' && COAT_BY_ID.has(outfit.coat) ? outfit.coat : 'ginger',
			},
			stats: statNumbers,
		};
	} catch {
		return emptySave();
	}
}

const UPGRADE_BY_ID = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));
const PET_UPGRADES = new Set(UPGRADES.filter((u) => u.effect.kind === 'pet' || u.effect.kind === 'petShare').map((u) => u.id));
const TREAT_BY_ID = new Map(TREATS.map((treat) => [treat.id, treat]));

export function goalText(goal: GoalData): string {
	const n = goal.target.toLocaleString('en');
	switch (goal.kind) {
		case 'pet':
			return `Pet the cat ${n} times`;
		case 'buy':
			return `Buy ${n} helpers`;
		case 'lucky':
			return goal.target === 1 ? 'Catch a Lucky Cat' : `Catch ${n} Lucky Cats`;
		case 'mouse':
			return `Catch ${n} mice`;
		case 'harvest':
			return `Harvest ${n} plants`;
		case 'treat':
			return `Feed ${n} treats`;
		case 'earn':
			return `Earn ${formatPurrs(goal.target)} purrs`;
		case 'bliss':
			return 'Make the cat reach Bliss';
		case 'rhythm':
			return `Build a full petting rhythm (×${MAX_RHYTHM})`;
	}
}

class CafeEngine {
	state: SaveData = emptySave();
	loaded = false;
	loadFailed = false;
	lucky: LuckyCat | null = null;
	mouse: Mouse | null = null;
	floaters: Array<Floater> = [];
	notices: Array<Notice> = [];
	welcome: Welcome | null = null;
	celebration: Celebration | null = null;
	buyAmount: 1 | 10 | 100 | 'max' = 1;
	/** Pets in a steady rhythm (not too fast, not too slow). */
	rhythm = 0;
	lastPetAt = 0;
	/** Ticks over every second, for countdowns in the page. */
	now = Date.now();
	private nextLuckyAt = 0;
	private nextMouseAt = 0;
	private lastTick = 0;
	private lastSave = 0;
	private dirty = false;
	private timer: ReturnType<typeof setInterval> | null = null;
	private nextId = 1;
	private loadPromise: Promise<void> | null = null;
	/** The server's version (updated_at) of the save this café builds on; null when there is none. */
	private version: number | null = null;
	/** The save slot being played (1 to 3). */
	slot = 1;
	/** The save in flight, so saves never overlap (they would refuse each other). */
	private saving: Promise<void> | null = null;

	constructor() {
		makeAutoObservable<this, 'timer' | 'loadPromise' | 'ownerId' | 'saving'>(
			this,
			{timer: false, loadPromise: false, ownerId: false, saving: false},
			{autoBind: true},
		);
	}

	// ----- derived numbers -----

	has(upgradeId: string): boolean {
		return this.state.upgrades.includes(upgradeId);
	}

	hasPerk(perkId: string): boolean {
		return this.state.perks.includes(perkId);
	}

	hasResearch(researchId: string): boolean {
		return this.state.research.includes(researchId);
	}

	get livesSpent(): number {
		return this.state.perks.reduce((sum, id) => sum + (PERKS.find((p) => p.id === id)?.cost ?? 0), 0);
	}

	get livesAvailable(): number {
		return this.state.livesEarned - this.livesSpent;
	}

	/** Lives a new start would add right now. */
	get livesOnRestart(): number {
		return Math.max(0, livesFor(this.state.lifetimeAll) - this.state.livesEarned);
	}

	// cats

	get residentSlots(): number {
		return BASE_RESIDENT_SLOTS + (this.hasResearch('whisperer-1') ? 3 : 0) + (this.hasResearch('whisperer-2') ? 3 : 0);
	}

	get bondingSpeed(): number {
		return this.hasResearch('bonding') ? 2 : 1;
	}

	get residentCats(): Array<CafeCatData> {
		const ids = new Set(this.state.residents);
		return this.state.cats.filter((cat) => ids.has(cat.id));
	}

	/** The summed bonus of resident cats with this kind of trait. */
	catBonus(kind: TraitKind, helperId?: string): number {
		let total = 0;
		for (const cat of this.residentCats) {
			if (cat.trait.kind !== kind) continue;
			if (kind === 'helper' && cat.trait.helper !== helperId) continue;
			total += traitStrength(cat, this.bondingSpeed);
		}
		return total;
	}

	get adoptionCost(): number {
		return Math.ceil(
			ADOPTION_BASE_COST * ADOPTION_COST_GROWTH ** this.state.adoptionsBought * (this.hasResearch('fairs') ? 0.7 : 1),
		);
	}

	get collectionFull(): boolean {
		return this.state.cats.length >= COLLECTION_LIMIT;
	}

	/** Coats the cat you pet can wear: ginger, plus any coat among your adopted cats. */
	get unlockedCoats(): Set<string> {
		return new Set(['ginger', ...this.state.cats.map((cat) => cat.coat)]);
	}

	// streak and research multipliers

	/** The streak still counts if yesterday or today was a full day. */
	get activeStreak(): number {
		const today = localDayKey(this.now);
		if (this.state.lastFullDay === today || this.state.lastFullDay === previousDayKey(today)) return this.state.streak;
		return 0;
	}

	get streakBonus(): number {
		return Math.min(this.activeStreak, STREAK_CAP) * STREAK_BONUS;
	}

	get researchAura(): number {
		let multiplier = 1;
		if (this.hasResearch('aura-1')) multiplier *= 1.1;
		if (this.hasResearch('aura-2')) multiplier *= 1.25;
		if (this.hasResearch('aura-3')) multiplier *= 1.5;
		return multiplier;
	}

	get kinshipBonus(): number {
		return this.hasResearch('kinship') ? 0.02 * this.residentCats.length : 0;
	}

	/** Every lasting multiplier on all purrs, for the stats page. */
	get multiplierParts(): Array<{label: string; value: number}> {
		let upgrades = 1;
		for (const id of this.state.upgrades) {
			const effect = UPGRADE_BY_ID.get(id)?.effect;
			if (effect?.kind === 'global') upgrades *= effect.multiplier;
		}
		return [
			{label: 'Achievements', value: 1 + this.state.achievements.length * ACHIEVEMENT_BONUS},
			{label: 'Lives', value: 1 + this.state.livesEarned * LIFE_BONUS},
			{label: 'Upgrades', value: upgrades},
			{label: 'Research', value: this.researchAura},
			{label: 'Cats', value: (1 + this.catBonus('global')) * (1 + this.kinshipBonus)},
			{label: 'Daily streak', value: 1 + this.streakBonus},
		];
	}

	get globalMultiplier(): number {
		return this.multiplierParts.reduce((product, part) => product * part.value, 1);
	}

	helperMultiplier(helperId: string): number {
		let multiplier = 1 + this.catBonus('helper', helperId);
		for (const id of this.state.upgrades) {
			const effect = UPGRADE_BY_ID.get(id)?.effect;
			if (!effect) continue;
			if (effect.kind === 'helper' && effect.helper === helperId) multiplier *= effect.multiplier;
			if (effect.kind === 'synergy' && effect.helper === helperId) {
				multiplier *= 1 + effect.bonus * (this.state.owned[effect.per] ?? 0);
			}
		}
		return multiplier;
	}

	/** Purrs per second from one of this helper (without buffs). */
	helperPps(helperId: string): number {
		const helper = HELPERS.find((h) => h.id === helperId);
		if (!helper) return 0;
		return helper.basePps * this.helperMultiplier(helperId) * this.globalMultiplier;
	}

	/** Purrs per second without temporary buffs or mood (used for time away and prices). */
	get basePps(): number {
		return HELPERS.reduce((sum, helper) => sum + (this.state.owned[helper.id] ?? 0) * this.helperPps(helper.id), 0);
	}

	get activeBuff(): Buff | null {
		const buff = this.state.buff;
		return buff && buff.until > this.now ? buff : null;
	}

	get blissActive(): boolean {
		return this.state.blissUntil > this.now;
	}

	get mood() {
		return moodTier(this.state.mood);
	}

	get luckyPower(): number {
		return this.hasPerk('golden-whiskers') ? 2 : 1;
	}

	get pps(): number {
		const buff = this.activeBuff;
		return (
			this.basePps *
			(buff?.kind === 'zoomies' ? 5 * this.luckyPower : 1) *
			this.mood.pps *
			(this.blissActive ? BLISS_PPS : 1)
		);
	}

	get rhythmMultiplier(): number {
		return 1 + this.rhythm * 0.025;
	}

	get petValue(): number {
		let value = 1 + this.catBonus('pet');
		let share = this.hasPerk('purr-echo') ? 0.05 : 0;
		for (const id of this.state.upgrades) {
			const effect = UPGRADE_BY_ID.get(id)?.effect;
			if (effect?.kind === 'pet') value *= effect.multiplier;
			if (effect?.kind === 'petShare') share += effect.share;
		}
		value = value * this.globalMultiplier + this.pps * share;
		value *= this.rhythmMultiplier * this.mood.pets * (this.blissActive ? BLISS_PETS : 1);
		if (this.activeBuff?.kind === 'frenzy') value *= 200 * this.luckyPower;
		return value;
	}

	helperCost(helperId: string, amount: number): number {
		const helper = HELPERS.find((h) => h.id === helperId);
		if (!helper || amount <= 0) return 0;
		const owned = this.state.owned[helperId] ?? 0;
		const g = HELPER_COST_GROWTH;
		const discount = this.hasPerk('bargain') ? 0.9 : 1;
		return Math.ceil(helper.baseCost * g ** owned * ((g ** amount - 1) / (g - 1)) * discount);
	}

	/** How many of a helper the current buy amount means (for "max": as many as affordable). */
	purchaseCount(helperId: string): number {
		if (this.buyAmount !== 'max') return this.buyAmount;
		const helper = HELPERS.find((h) => h.id === helperId);
		if (!helper) return 0;
		const owned = this.state.owned[helperId] ?? 0;
		const g = HELPER_COST_GROWTH;
		const discount = this.hasPerk('bargain') ? 0.9 : 1;
		const first = helper.baseCost * g ** owned * discount;
		if (this.state.purrs < first) return 1;
		return Math.max(1, Math.floor(Math.log((this.state.purrs * (g - 1)) / first + 1) / Math.log(g)));
	}

	/** The next doubling tier for a helper: how many are needed, and how many the last one needed. */
	nextTier(helperId: string): {need: number; from: number} | null {
		const owned = this.state.owned[helperId] ?? 0;
		let from = 0;
		for (const tier of HELPER_TIERS) {
			if (owned < tier.need) return {need: tier.need, from};
			from = tier.need;
		}
		return null;
	}

	/** Seconds until this many purrs are affordable at the current rate (null: never, 0: now). */
	secondsUntil(cost: number): number | null {
		const missing = cost - this.state.purrs;
		if (missing <= 0) return 0;
		const pps = this.pps;
		return pps > 0 ? missing / pps : null;
	}

	get visibleUpgrades(): Array<UpgradeDef> {
		const progress = {
			owned: this.state.owned,
			lifetimeRun: this.state.lifetimeRun,
			pets: this.state.pets,
			luckyCaught: this.state.luckyCaught,
		};
		return UPGRADES.filter((upgrade) => !this.has(upgrade.id) && upgrade.unlock(progress)).sort(
			(a, b) => a.cost - b.cost,
		);
	}

	get luckyFrequency(): number {
		let frequency = 1 + this.catBonus('lucky');
		if (this.hasPerk('lucky-paws')) frequency *= 1.5;
		for (const id of this.state.upgrades) {
			const effect = UPGRADE_BY_ID.get(id)?.effect;
			if (effect?.kind === 'lucky' && effect.frequency) frequency *= effect.frequency;
		}
		return frequency;
	}

	get luckyDuration(): number {
		let duration = 1;
		for (const id of this.state.upgrades) {
			const effect = UPGRADE_BY_ID.get(id)?.effect;
			if (effect?.kind === 'lucky' && effect.duration) duration *= effect.duration;
		}
		return duration;
	}

	// mood, treats, mice, garden

	get moodDecay(): number {
		return (MOOD_DECAY * (this.hasResearch('calm') ? 0.5 : 1)) / (1 + this.catBonus('calm'));
	}

	treatMood(treat: TreatDef): number {
		return treat.mood * (this.hasResearch('recipes') ? 1.25 : 1) * (1 + this.catBonus('treat'));
	}

	treatCost(treat: TreatDef): number {
		if (treat.costSeconds <= 0) return 0;
		return Math.ceil(
			Math.max(treat.minCost, this.basePps * treat.costSeconds) * (this.hasResearch('recipes') ? 0.5 : 1),
		);
	}

	get awayRate(): number {
		return (
			(this.hasPerk('long-naps') ? 0.5 : 0.25) + (this.hasResearch('night-shift') ? 0.15 : 0) + this.catBonus('away')
		);
	}

	get awayCapMs(): number {
		return (this.hasPerk('long-naps') ? 24 : 8) * 3_600_000;
	}

	get mouseFrequency(): number {
		return (this.hasResearch('squeaky') ? 2 : 1) * (1 + this.catBonus('mouse'));
	}

	get mouseReward(): number {
		return Math.max(25, this.basePps * 20) * (this.hasResearch('squeaky') ? 2 : 1);
	}

	get gardenSpeed(): number {
		return (
			(1 + (this.hasResearch('green-1') ? 0.25 : 0) + (this.hasResearch('green-2') ? 0.5 : 0)) *
			(1 + this.catBonus('garden'))
		);
	}

	get catnipYield(): number {
		return this.hasResearch('bounty') ? 1.5 : 1;
	}

	plotGrowMs(plot: Plot): number {
		const seed = plot.seed ? SEED_BY_ID.get(plot.seed) : null;
		return seed ? seed.growMs / this.gardenSpeed : 0;
	}

	/** 0 to 1, how far a plot has grown. */
	plotProgress(plot: Plot): number {
		if (!plot.seed) return 0;
		return Math.min(1, (this.now - plot.plantedAt) / this.plotGrowMs(plot));
	}

	get readyPlots(): number {
		return this.state.plots.filter((plot) => plot.seed && this.plotProgress(plot) >= 1).length;
	}

	get nextPlotCost(): number | null {
		return this.state.plots.length >= MAX_PLOTS ? null : plotCost(this.state.plots.length);
	}

	// goals

	get goalsDoneToday(): number {
		return this.state.goals.list.filter((goal) => goal.progress >= goal.target).length;
	}

	get chestReady(): boolean {
		const goals = this.state.goals;
		return goals.list.length > 0 && !goals.chestClaimed && goals.list.every((goal) => goal.claimed);
	}

	get unclaimedGoals(): number {
		return (
			this.state.goals.list.filter((goal) => !goal.claimed && goal.progress >= goal.target).length +
			(this.chestReady ? 1 : 0)
		);
	}

	// outfits and progress

	get progress(): Progress {
		return {
			lifetimeAll: this.state.lifetimeAll,
			owned: this.state.owned,
			pets: this.state.pets,
			luckyCaught: this.state.luckyCaught,
			lives: this.state.livesEarned,
			pps: this.basePps,
			achievements: this.state.achievements.length,
			miceCaught: this.state.stats.miceCaught,
			harvests: this.state.stats.harvests,
			treatsEaten: this.state.stats.treatsEaten,
			catsAdopted: this.state.stats.catsAdopted,
			legendaryCats: this.state.stats.legendaryCats,
			blissCount: this.state.stats.blissCount,
			goalsDone: this.state.stats.goalsDone,
			longestStreak: this.state.stats.longestStreak,
			research: this.state.research.length,
		};
	}

	outfitUnlocked(outfitId: string): boolean {
		const outfit = OUTFITS.find((o) => o.id === outfitId);
		return outfit ? outfit.unlocked(this.progress) : false;
	}

	// ----- actions -----

	private earn(amount: number): void {
		if (!(amount > 0) || !Number.isFinite(amount)) return;
		this.state.purrs += amount;
		this.state.lifetimeRun += amount;
		this.state.lifetimeAll += amount;
		this.progressGoal('earn', amount);
		this.dirty = true;
	}

	private changeMood(amount: number): void {
		const before = this.state.mood;
		this.state.mood = Math.max(0, Math.min(MOOD_MAX, before + amount));
		if (this.state.mood >= MOOD_MAX && before < MOOD_MAX && !this.blissActive) this.startBliss();
	}

	private startBliss(): void {
		this.state.blissUntil = Date.now() + BLISS_MS;
		this.state.mood = 70;
		this.state.stats.blissCount += 1;
		this.progressGoal('bliss', 1);
		cafeSound.play('bliss');
		this.notify(`Bliss! Purrs ×${BLISS_PPS} and pets ×${BLISS_PETS} for ${BLISS_MS / 1000} seconds.`);
	}

	private spawn(kind: Floater['kind'], text: string, x: number, y: number, dx: number, dy: number, life: number): void {
		const id = this.nextId++;
		this.floaters.push({id, kind, text, x, y, dx, dy});
		if (this.floaters.length > 60) this.floaters.shift();
		setTimeout(
			() =>
				runInAction(() => {
					this.floaters = this.floaters.filter((floater) => floater.id !== id);
				}),
			life,
		);
	}

	pet(x: number, y: number): void {
		const now = Date.now();
		const gap = now - this.lastPetAt;
		// A steady beat (about two to five pets a second) builds the rhythm; mashing or pausing breaks it.
		if (gap >= 180 && gap <= 900) this.rhythm = Math.min(MAX_RHYTHM, this.rhythm + 1);
		else if (gap < 180) this.rhythm = Math.max(0, this.rhythm - 2);
		else this.rhythm = 0;
		if (this.rhythm === MAX_RHYTHM && gap >= 180 && gap <= 900) this.progressGoal('rhythm', 1);
		this.lastPetAt = now;

		const value = this.petValue;
		this.earn(value);
		this.state.pets += 1;
		this.state.stats.biggestPet = Math.max(this.state.stats.biggestPet, value);
		this.changeMood(0.35 + this.rhythm * 0.04);
		this.progressGoal('pet', 1);
		cafeSound.play('pet');
		this.spawn('number', `+${formatPurrs(value)}`, x, y, 0, -60, 1000);
		const count = this.rhythm >= 10 ? 3 : 2;
		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const distance = 30 + Math.random() * 30;
			this.spawn(
				Math.random() < 0.5 ? 'heart' : 'paw',
				Math.random() < 0.5 ? '♥' : '🐾',
				x,
				y,
				Math.cos(angle) * distance,
				Math.sin(angle) * distance - 20,
				800,
			);
		}
	}

	buyHelper(helperId: string): void {
		const amount = this.purchaseCount(helperId);
		const cost = this.helperCost(helperId, amount);
		if (this.state.purrs < cost) return;
		this.state.purrs -= cost;
		this.state.owned[helperId] = (this.state.owned[helperId] ?? 0) + amount;
		this.dirty = true;
		cafeSound.play('buy');
		this.progressGoal('buy', amount);
		this.checkAchievements();
	}

	buyUpgrade(upgradeId: string): void {
		const upgrade = UPGRADE_BY_ID.get(upgradeId);
		if (!upgrade || this.has(upgradeId) || this.state.purrs < upgrade.cost) return;
		this.state.purrs -= upgrade.cost;
		this.state.upgrades.push(upgradeId);
		this.dirty = true;
		cafeSound.play('upgrade');
	}

	buyPerk(perkId: string): void {
		const perk = PERKS.find((p) => p.id === perkId);
		if (!perk || this.hasPerk(perkId) || this.livesAvailable < perk.cost) return;
		this.state.perks.push(perkId);
		this.dirty = true;
		cafeSound.play('upgrade');
		void this.save();
	}

	setBuyAmount(amount: 1 | 10 | 100 | 'max'): void {
		this.buyAmount = amount;
	}

	/** Feeds a treat from the pantry, buying one first if there is none and it can be bought. */
	feed(treatId: TreatDef['id']): void {
		const treat = TREAT_BY_ID.get(treatId);
		if (!treat) return;
		if ((this.state.treats[treatId] ?? 0) <= 0) {
			const cost = this.treatCost(treat);
			if (cost <= 0 || this.state.purrs < cost) return;
			this.state.purrs -= cost;
		} else {
			this.state.treats[treatId] -= 1;
		}
		this.state.stats.treatsEaten += 1;
		this.progressGoal('treat', 1);
		cafeSound.play('treat');
		if (treatId === 'sardine') {
			if (this.blissActive) this.state.blissUntil += BLISS_MS;
			else this.startBliss();
		} else {
			this.changeMood(this.treatMood(treat));
		}
		this.dirty = true;
		this.checkAchievements();
	}

	private addCat(source: 'adopted' | 'stray' | 'chest'): CafeCatData | null {
		if (this.collectionFull) return null;
		const cat = rollCat(this.state.nextCatId++, Math.random, source === 'chest' ? 'uncommon' : undefined);
		this.state.cats.push(cat);
		if (this.state.residents.length < this.residentSlots) this.state.residents.push(cat.id);
		this.state.stats.catsAdopted += 1;
		if (cat.rarity === 'legendary') this.state.stats.legendaryCats += 1;
		this.dirty = true;
		cafeSound.play('adopt');
		const rarity = RARITY_BY_ID.get(cat.rarity)?.name ?? '';
		const intro =
			source === 'stray'
				? `A stray wandered in: ${cat.name}, a ${rarity.toLowerCase()} cat!`
				: `${cat.name} joined your café (${rarity.toLowerCase()})!`;
		this.notify(intro);
		this.checkAchievements();
		return cat;
	}

	adopt(): void {
		const cost = this.adoptionCost;
		if (this.collectionFull || this.state.purrs < cost) return;
		this.state.purrs -= cost;
		this.state.adoptionsBought += 1;
		this.addCat('adopted');
	}

	toggleResident(catId: number): void {
		const index = this.state.residents.indexOf(catId);
		if (index >= 0) this.state.residents.splice(index, 1);
		else if (this.state.residents.length < this.residentSlots) this.state.residents.push(catId);
		this.dirty = true;
	}

	/** Lets a cat go to a loving home elsewhere, for some catnip. */
	rehome(catId: number): void {
		const cat = this.state.cats.find((c) => c.id === catId);
		if (!cat) return;
		const catnip = RARITY_BY_ID.get(cat.rarity)?.catnip ?? 5;
		this.state.cats = this.state.cats.filter((c) => c.id !== catId);
		this.state.residents = this.state.residents.filter((id) => id !== catId);
		this.gainCatnip(catnip);
		if (this.state.outfit.coat !== 'ginger' && !this.unlockedCoats.has(this.state.outfit.coat)) {
			this.state.outfit.coat = 'ginger';
		}
		this.notify(`${cat.name} went to a loving new home. You got ${catnip} catnip.`);
		this.dirty = true;
	}

	renameCat(catId: number, name: string): void {
		const cat = this.state.cats.find((c) => c.id === catId);
		const trimmed = name.trim().slice(0, 40);
		if (!cat || !trimmed) return;
		cat.name = trimmed;
		this.dirty = true;
	}

	private gainCatnip(amount: number): void {
		this.state.catnip += amount;
		this.state.stats.catnipEarned += amount;
	}

	plant(plotIndex: number, seedId: string): void {
		const plot = this.state.plots[plotIndex];
		const seed = SEED_BY_ID.get(seedId);
		if (!plot || plot.seed || !seed) return;
		if (seed.research && !this.hasResearch(seed.research)) return;
		plot.seed = seedId;
		plot.plantedAt = Date.now();
		this.dirty = true;
	}

	harvest(plotIndex: number, quiet = false): number {
		const plot = this.state.plots[plotIndex];
		if (!plot?.seed || this.plotProgress(plot) < 1) return 0;
		const seed = SEED_BY_ID.get(plot.seed);
		const amount = Math.round((seed?.yield ?? 0) * this.catnipYield);
		this.gainCatnip(amount);
		this.state.stats.harvests += 1;
		this.progressGoal('harvest', 1);
		if (this.hasResearch('golden-harvest') && Math.random() < 0.05) {
			this.state.treats.sardine += 1;
			this.notify('Something glitters in the soil: a Golden Sardine!');
		}
		// Replant the same seed straight away.
		plot.plantedAt = Date.now();
		this.dirty = true;
		if (!quiet) cafeSound.play('harvest');
		this.checkAchievements();
		return amount;
	}

	harvestAll(): void {
		let total = 0;
		this.state.plots.forEach((_, index) => {
			total += this.harvest(index, true);
		});
		if (total > 0) cafeSound.play('harvest');
	}

	clearPlot(plotIndex: number): void {
		const plot = this.state.plots[plotIndex];
		if (!plot) return;
		plot.seed = null;
		plot.plantedAt = 0;
		this.dirty = true;
	}

	buyPlot(): void {
		const cost = this.nextPlotCost;
		if (cost === null || this.state.purrs < cost) return;
		this.state.purrs -= cost;
		this.state.plots.push({seed: null, plantedAt: 0});
		this.dirty = true;
		cafeSound.play('buy');
	}

	research(researchId: string): void {
		const research = RESEARCH_BY_ID.get(researchId);
		if (!research || this.hasResearch(researchId)) return;
		if (research.requires && !this.hasResearch(research.requires)) return;
		if (this.state.catnip < research.cost) return;
		this.state.catnip -= research.cost;
		this.state.research.push(researchId);
		this.dirty = true;
		cafeSound.play('upgrade');
		this.checkAchievements();
	}

	setOutfit(slot: OutfitSlot, outfitId: string | null): void {
		if (outfitId !== null && !this.outfitUnlocked(outfitId)) return;
		this.state.outfit[slot] = outfitId;
		this.dirty = true;
	}

	setCoat(coatId: string): void {
		if (!this.unlockedCoats.has(coatId)) return;
		this.state.outfit.coat = coatId;
		this.dirty = true;
	}

	// goals

	private ensureGoals(): void {
		const day = localDayKey();
		if (this.state.goals.day === day || !this.ownerId) return;
		const random = seededRandom(`${this.ownerId}:${day}`);
		const kinds = [...GOAL_KINDS].sort(() => random() - 0.5).slice(0, 3);
		const rewards: Array<GoalData['reward']> = ['cookie', 'catnip', 'tuna'].sort(() => random() - 0.5) as Array<
			GoalData['reward']
		>;
		this.state.goals = {
			day,
			list: kinds.map((kind, index) => ({
				kind,
				target: goalTarget(kind, this.basePps),
				progress: 0,
				claimed: false,
				reward: rewards[index],
			})),
			rerolled: false,
			chestClaimed: false,
		};
		this.dirty = true;
	}

	private progressGoal(kind: GoalKind, amount: number): void {
		for (const goal of this.state.goals.list) {
			if (goal.kind !== kind || goal.claimed || goal.progress >= goal.target) continue;
			goal.progress = Math.min(goal.target, goal.progress + amount);
			if (goal.progress >= goal.target) {
				cafeSound.play('goal');
				this.notify(`Daily goal done: ${goalText(goal)}. Claim it in Goals.`);
			}
		}
	}

	claimGoal(index: number): void {
		const goal = this.state.goals.list[index];
		if (!goal || goal.claimed || goal.progress < goal.target) return;
		goal.claimed = true;
		this.state.stats.goalsDone += 1;
		if (goal.reward === 'catnip') this.gainCatnip(GOAL_CATNIP_REWARD);
		else this.state.treats[goal.reward] += goal.reward === 'cookie' ? 3 : 1;
		cafeSound.play('upgrade');
		this.dirty = true;
		this.checkAchievements();
	}

	claimChest(): void {
		if (!this.chestReady) return;
		const today = this.state.goals.day;
		this.state.goals.chestClaimed = true;
		this.state.streak = this.state.lastFullDay === previousDayKey(today) ? this.state.streak + 1 : 1;
		this.state.lastFullDay = today;
		this.state.stats.longestStreak = Math.max(this.state.stats.longestStreak, this.state.streak);
		this.state.treats.sardine += 1;
		if (!this.addCat('chest')) this.gainCatnip(30);
		this.notify(`Daily chest: a Golden Sardine and a new friend! Streak: ${this.state.streak} days.`);
		this.dirty = true;
		this.checkAchievements();
	}

	rerollGoal(index: number): void {
		const goals = this.state.goals;
		const goal = goals.list[index];
		if (!goal || goals.rerolled || goal.claimed || goal.progress >= goal.target) return;
		const taken = new Set(goals.list.map((g) => g.kind));
		const options = GOAL_KINDS.filter((kind) => !taken.has(kind));
		const kind = options[Math.floor(Math.random() * options.length)];
		goals.list[index] = {...goal, kind, target: goalTarget(kind, this.basePps), progress: 0};
		goals.rerolled = true;
		this.dirty = true;
	}

	/** Nine Lives: start over for Lives (a permanent bonus). */
	restart(): void {
		const gained = this.livesOnRestart;
		if (gained <= 0) return;
		const keep = this.state;
		const fresh = emptySave();
		fresh.lifetimeAll = keep.lifetimeAll;
		fresh.pets = keep.pets;
		fresh.luckyCaught = keep.luckyCaught;
		fresh.achievements = keep.achievements;
		fresh.perks = keep.perks;
		fresh.livesEarned = keep.livesEarned + gained;
		if (keep.perks.includes('feline-memory')) fresh.upgrades = keep.upgrades.filter((id) => PET_UPGRADES.has(id));
		if (keep.perks.includes('head-start')) fresh.owned = {yarn: 10, kitten: 5};
		// The world outside the café carries over.
		fresh.cats = keep.cats;
		fresh.residents = keep.residents;
		fresh.nextCatId = keep.nextCatId;
		fresh.adoptionsBought = keep.adoptionsBought;
		fresh.mood = keep.mood;
		fresh.treats = keep.treats;
		fresh.catnip = keep.catnip;
		fresh.plots = keep.plots;
		fresh.research = keep.research;
		fresh.goals = keep.goals;
		fresh.streak = keep.streak;
		fresh.lastFullDay = keep.lastFullDay;
		fresh.outfit = keep.outfit;
		fresh.stats = keep.stats;
		this.state = fresh;
		this.dirty = true;
		cafeSound.play('new-life');
		this.notify(`You started a new life and gained ${gained} ${gained === 1 ? 'Life' : 'Lives'}.`);
		this.checkAchievements();
		void this.save();
	}

	catchLucky(): void {
		if (!this.lucky) return;
		this.lucky = null;
		this.state.luckyCaught += 1;
		this.progressGoal('lucky', 1);
		cafeSound.play('lucky-catch');
		const roll = Math.random();
		const duration = this.luckyDuration;
		if (roll < 0.1 && !this.collectionFull) {
			this.addCat('stray');
		} else if (roll < 0.5) {
			const gift = Math.max(13, Math.min(this.state.purrs * 0.1, this.basePps * 600) * this.luckyPower);
			this.earn(gift);
			this.state.stats.biggestLuckyGift = Math.max(this.state.stats.biggestLuckyGift, gift);
			this.notify(`Lucky Cat! It left you ${formatPurrs(gift)} purrs.`);
		} else if (roll < 0.86) {
			this.state.buff = {kind: 'zoomies', until: Date.now() + 60_000 * duration};
			this.notify(`Zoomies! Purrs per second ×${5 * this.luckyPower} for ${60 * duration} seconds.`);
		} else {
			this.state.buff = {kind: 'frenzy', until: Date.now() + 15_000 * duration};
			this.notify(`Petting frenzy! Pets ×${200 * this.luckyPower} for ${15 * duration} seconds.`);
		}
		this.dirty = true;
		this.checkAchievements();
	}

	catchMouse(): void {
		if (!this.mouse) return;
		this.mouse = null;
		const reward = this.mouseReward;
		this.earn(reward);
		this.changeMood(10);
		this.state.stats.miceCaught += 1;
		this.progressGoal('mouse', 1);
		cafeSound.play('mouse-catch');
		this.notify(`Caught the mouse! +${formatPurrs(reward)} purrs, and the cat is pleased.`);
		this.dirty = true;
		this.checkAchievements();
	}

	dismissNotice(id: number): void {
		this.notices = this.notices.filter((notice) => notice.id !== id);
	}

	dismissWelcome(): void {
		this.welcome = null;
	}

	private notify(text: string): void {
		const id = this.nextId++;
		this.notices.push({id, text});
		if (this.notices.length > 4) this.notices.shift();
		setTimeout(() => runInAction(() => this.dismissNotice(id)), 6000);
	}

	private scheduleLucky(now: number): void {
		const span = LUCKY_MIN_MS + Math.random() * (LUCKY_MAX_MS - LUCKY_MIN_MS);
		this.nextLuckyAt = now + span / this.luckyFrequency;
	}

	private scheduleMouse(now: number): void {
		const span = MOUSE_MIN_MS + Math.random() * (MOUSE_MAX_MS - MOUSE_MIN_MS);
		this.nextMouseAt = now + span / this.mouseFrequency;
	}

	private checkAchievements(): void {
		let unlocked: string | null = null;
		const progress = this.progress;
		for (const achievement of ACHIEVEMENTS) {
			if (this.state.achievements.includes(achievement.id)) continue;
			if (achievement.check(progress)) {
				this.state.achievements.push(achievement.id);
				this.notify(`Achievement: ${achievement.name}`);
				this.dirty = true;
				unlocked = achievement.name;
			}
		}
		if (unlocked) {
			cafeSound.play('achievement');
			const id = this.nextId++;
			this.celebration = {id, name: unlocked};
			setTimeout(
				() =>
					runInAction(() => {
						if (this.celebration?.id === id) this.celebration = null;
					}),
				3500,
			);
		}
	}

	/** Bonding for resident cats over real time. */
	private bond(elapsedMs: number): void {
		for (const cat of this.residentCats) cat.residentMs += elapsedMs;
	}

	private tick(): void {
		const now = Date.now();
		const elapsed = now - this.lastTick;
		this.lastTick = now;
		if (elapsed <= 0) return;
		if (Math.floor(now / 1000) !== Math.floor(this.now / 1000)) this.now = now;
		if (elapsed > ACTIVE_GAP_MS) {
			this.applyAway(elapsed);
		} else {
			this.earn((this.pps * elapsed) / 1000);
			this.state.stats.playMs += elapsed;
			this.bond(elapsed);
			if (!this.blissActive) this.changeMood((-this.moodDecay * elapsed) / 1000);
			// The rhythm fades if you stop petting.
			if (this.rhythm > 0 && now - this.lastPetAt > 900) this.rhythm = 0;
		}
		if (this.lucky && this.lucky.until < now) this.lucky = null;
		if (!this.lucky && now >= this.nextLuckyAt) {
			this.lucky = {x: 10 + Math.random() * 75, y: 15 + Math.random() * 65, until: now + LUCKY_VISIBLE_MS * this.luckyDuration};
			cafeSound.play('lucky-appear');
			this.scheduleLucky(now);
		}
		if (this.mouse && this.mouse.until < now) this.mouse = null;
		if (!this.mouse && now >= this.nextMouseAt) {
			this.mouse = {id: this.nextId++, y: 35 + Math.random() * 45, fromLeft: Math.random() < 0.5, until: now + MOUSE_RUN_MS};
			cafeSound.play('mouse-appear');
			this.scheduleMouse(now);
		}
		if (this.state.buff && this.state.buff.until < now) this.state.buff = null;
		if (Math.floor(now / 1000) !== Math.floor((now - elapsed) / 1000)) {
			this.ensureGoals();
			const pps = this.basePps;
			if (pps > this.state.stats.bestPps) this.state.stats.bestPps = pps;
			this.checkAchievements();
		}
		// A hidden café doesn't autosave: it saved when it was hidden, and another tab or device
		// may be playing meanwhile.
		if (this.dirty && now - this.lastSave > SAVE_EVERY_MS && document.visibilityState !== 'hidden') {
			void this.save();
		}
	}

	/** Earnings for time away: a share of the base rate, capped. */
	private applyAway(elapsedMs: number): void {
		const counted = Math.min(elapsedMs, this.awayCapMs);
		const gained = ((this.basePps * counted) / 1000) * this.awayRate;
		this.bond(elapsedMs);
		this.state.mood = Math.max(0, this.state.mood - (this.moodDecay * elapsedMs) / 1000);
		this.rhythm = 0;
		if (gained >= 1) this.earn(gained);
		if (elapsedMs >= WELCOME_CARD_MS) {
			this.welcome = {awayMs: elapsedMs, purrs: gained};
		} else if (gained >= 1) {
			this.notify(`Welcome back! Your café earned ${formatPurrs(gained)} purrs.`);
		}
	}

	// ----- lifecycle -----

	/** The account whose save is loaded. */
	private ownerId: string | null = null;

	/** Loads the save (once per account) and starts the game loop; returns a stop function. */
	start(userId: string): () => void {
		if (this.ownerId !== userId) {
			this.reset();
			this.ownerId = userId;
		}
		void this.load().then(() => {
			if (this.ownerId !== userId) return;
			if (this.timer !== null) return;
			const now = Date.now();
			this.now = now;
			this.ensureGoals();
			this.scheduleLucky(now);
			this.scheduleMouse(now);
			// Time since the last save (or since leaving the page) counts as time away.
			this.lastTick = Math.min(now, this.state.savedAt);
			this.tick();
			this.lastTick = now;
			this.timer = setInterval(() => this.tick(), TICK_MS);
		});
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') void this.save();
			else void this.refresh();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			if (this.timer !== null) clearInterval(this.timer);
			this.timer = null;
			this.lucky = null;
			this.mouse = null;
			void this.save();
		};
	}

	load(): Promise<void> {
		this.loadPromise ??= (async () => {
			try {
				const response = await http.get<SaveResponse>('/sparkcord/catgame/save');
				runInAction(() => {
					this.state = readSave(response.body?.save ?? null);
					this.version = response.body?.updated_at ?? null;
					this.slot = response.body?.slot ?? 1;
					this.loaded = true;
				});
			} catch (error) {
				console.warn('[cafe] loading the save failed', error);
				runInAction(() => {
					this.loadFailed = true;
				});
				this.loadPromise = null;
				throw error;
			}
		})();
		return this.loadPromise;
	}

	save(): Promise<void> {
		// One save at a time; a save asked for meanwhile runs right after, with the new version.
		const run = async () => {
			if (this.saving) await this.saving.catch(() => undefined);
			await this.saveNow();
		};
		const next = run().finally(() => {
			if (this.saving === next) this.saving = null;
		});
		this.saving = next;
		return next;
	}

	private async saveNow(): Promise<void> {
		if (!this.loaded) return;
		const owner = this.ownerId;
		const slot = this.slot;
		this.lastSave = Date.now();
		this.dirty = false;
		this.state.savedAt = Date.now();
		this.state.v = SAVE_VERSION;
		try {
			const response = await http.put<{updated_at: number | null}>('/sparkcord/catgame/save', {
				body: {
					save: JSON.stringify(this.state),
					lifetime_purrs: this.state.lifetimeAll,
					lives: this.state.livesEarned,
					slot,
					base_updated_at: this.version,
				},
			});
			if (this.ownerId !== owner || this.slot !== slot) return;
			const updatedAt = response.body?.updated_at;
			if (typeof updatedAt === 'number') this.version = updatedAt;
		} catch (error) {
			if (this.ownerId !== owner || this.slot !== slot) return;
			if (error instanceof HttpError && error.status === 409) {
				const body = error.body as {save?: string | null; updated_at?: number | null} | undefined;
				this.adoptSave(body?.save ?? null, body?.updated_at ?? null, slot);
				return;
			}
			console.warn('[cafe] saving failed', error);
			this.dirty = true;
		}
	}

	/**
	 * When the café is shown again, picks up progress another tab or device saved meanwhile
	 * (or the slot it switched to).
	 */
	async refresh(): Promise<void> {
		if (!this.loaded) return;
		const owner = this.ownerId;
		try {
			const response = await http.get<SaveResponse>('/sparkcord/catgame/save');
			const updatedAt = response.body?.updated_at ?? null;
			const slot = response.body?.slot ?? 1;
			if (this.ownerId !== owner || !this.loaded) return;
			// A save of our own may have landed while this was asked.
			if (this.saving) await this.saving.catch(() => undefined);
			if (this.ownerId !== owner || (slot === this.slot && updatedAt === this.version)) return;
			const switched = slot !== this.slot;
			this.adoptSave(response.body?.save ?? null, updatedAt, slot);
			if (switched) this.notify(`Switched to save slot ${slot}, as chosen on another device.`);
		} catch (error) {
			console.warn('[cafe] checking for newer progress failed', error);
		}
	}

	/** Switches to the newer save another tab or device stored; time since counts as away. */
	private adoptSave(save: string | null, updatedAt: number | null, slot: number, quiet = false): void {
		const sameSlot = slot === this.slot;
		this.state = readSave(save);
		this.version = updatedAt;
		this.slot = slot;
		this.dirty = false;
		this.rhythm = 0;
		this.lucky = null;
		this.mouse = null;
		this.welcome = null;
		this.celebration = null;
		this.floaters = [];
		this.ensureGoals();
		if (this.timer !== null) {
			const now = Date.now();
			this.lastTick = Math.min(now, this.state.savedAt);
			this.tick();
			this.lastTick = now;
		}
		if (!quiet && sameSlot) this.notify('Picked up the progress you made in another tab or on another device.');
	}

	// ----- save slots -----

	/** The 3 save slots, with their totals, and which one is active. */
	async listSlots(): Promise<SlotsInfo> {
		const response = await http.get<SlotsInfo>('/sparkcord/catgame/slots');
		return response.body;
	}

	/** Saves the slot being played, then plays another one (an empty slot starts a new café). */
	async switchSlot(slot: number): Promise<SlotsInfo> {
		if (this.loaded) await this.save();
		const response = await http.put<SlotsInfo>('/sparkcord/catgame/slots/active', {body: {slot}});
		if (this.loaded) {
			const save = await http.get<SaveResponse>('/sparkcord/catgame/save', {query: {slot: String(slot)}});
			runInAction(() => this.adoptSave(save.body?.save ?? null, save.body?.updated_at ?? null, slot, true));
		}
		return response.body;
	}

	/** Empties a save slot; when it's the one being played, the café starts over in it. */
	async deleteSlot(slot: number): Promise<SlotsInfo> {
		if (this.saving) await this.saving.catch(() => undefined);
		await http.delete('/sparkcord/catgame/save', {query: {slot: String(slot)}});
		if (this.loaded && slot === this.slot) {
			runInAction(() => this.adoptSave(null, null, slot, true));
		}
		return this.listSlots();
	}

	/** Forgets the loaded save (on account switch). */
	reset(): void {
		if (this.timer !== null) clearInterval(this.timer);
		this.timer = null;
		this.state = emptySave();
		this.loaded = false;
		this.loadFailed = false;
		this.loadPromise = null;
		this.version = null;
		this.slot = 1;
		this.welcome = null;
		this.rhythm = 0;
	}
}

export {formatPurrs, RARITIES};

export default new CafeEngine();
