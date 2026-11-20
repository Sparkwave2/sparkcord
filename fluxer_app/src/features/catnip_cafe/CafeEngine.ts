// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the game state and rules. The game runs while its page is open;
// time away (page closed, or another device) earns at a reduced rate when you come back.
// Progress is saved to the server (every 30 s while playing, and when leaving the page).

import {
	ACHIEVEMENT_BONUS,
	ACHIEVEMENTS,
	HELPER_COST_GROWTH,
	HELPERS,
	LIFE_BONUS,
	livesFor,
	PERKS,
	UPGRADES,
	type UpgradeDef,
} from '@app/features/catnip_cafe/CafeData';
import {formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import {cafeSound} from '@app/features/catnip_cafe/CafeSound';
import {http} from '@app/features/platform/transport/RestTransport';
import {makeAutoObservable, runInAction} from 'mobx';

const SAVE_VERSION = 1;
const TICK_MS = 100;
const SAVE_EVERY_MS = 30_000;
/** Gaps longer than this count as time away (reduced rate) rather than play. */
const ACTIVE_GAP_MS = 60_000;
const LUCKY_MIN_MS = 120_000;
const LUCKY_MAX_MS = 300_000;
const LUCKY_VISIBLE_MS = 13_000;

export type BuffKind = 'zoomies' | 'frenzy';

interface Buff {
	kind: BuffKind;
	until: number;
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
}

export interface LuckyCat {
	x: number;
	y: number;
	until: number;
}

export interface Floater {
	id: number;
	text: string;
	x: number;
	y: number;
}

export interface Notice {
	id: number;
	text: string;
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
	};
}

function readSave(raw: string | null): SaveData {
	if (!raw) return emptySave();
	try {
		const parsed = JSON.parse(raw) as Partial<SaveData>;
		const base = emptySave();
		const num = (value: unknown, fallback: number) =>
			typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
		return {
			...base,
			purrs: num(parsed.purrs, 0),
			lifetimeRun: num(parsed.lifetimeRun, 0),
			lifetimeAll: num(parsed.lifetimeAll, 0),
			pets: num(parsed.pets, 0),
			luckyCaught: num(parsed.luckyCaught, 0),
			owned: typeof parsed.owned === 'object' && parsed.owned !== null ? parsed.owned : {},
			upgrades: Array.isArray(parsed.upgrades) ? parsed.upgrades.filter((id) => typeof id === 'string') : [],
			achievements: Array.isArray(parsed.achievements)
				? parsed.achievements.filter((id) => typeof id === 'string')
				: [],
			livesEarned: num(parsed.livesEarned, 0),
			perks: Array.isArray(parsed.perks) ? parsed.perks.filter((id) => typeof id === 'string') : [],
			lifeStartedAt: num(parsed.lifeStartedAt, base.lifeStartedAt),
			savedAt: num(parsed.savedAt, base.savedAt),
			buff: parsed.buff && typeof parsed.buff.until === 'number' ? parsed.buff : null,
		};
	} catch {
		return emptySave();
	}
}

const UPGRADE_BY_ID = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));
const PET_UPGRADES = new Set(UPGRADES.filter((u) => u.effect.kind === 'pet' || u.effect.kind === 'petShare').map((u) => u.id));

class CafeEngine {
	state: SaveData = emptySave();
	loaded = false;
	loadFailed = false;
	lucky: LuckyCat | null = null;
	floaters: Array<Floater> = [];
	notices: Array<Notice> = [];
	buyAmount: 1 | 10 | 100 | 'max' = 1;
	private nextLuckyAt = 0;
	private lastTick = 0;
	private lastSave = 0;
	private dirty = false;
	private timer: ReturnType<typeof setInterval> | null = null;
	private nextId = 1;
	private loadPromise: Promise<void> | null = null;

	constructor() {
		makeAutoObservable<this, 'timer' | 'loadPromise' | 'ownerId'>(
			this,
			{timer: false, loadPromise: false, ownerId: false},
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

	get globalMultiplier(): number {
		let multiplier = 1 + this.state.achievements.length * ACHIEVEMENT_BONUS;
		multiplier *= 1 + this.state.livesEarned * LIFE_BONUS;
		for (const id of this.state.upgrades) {
			const effect = UPGRADE_BY_ID.get(id)?.effect;
			if (effect?.kind === 'global') multiplier *= effect.multiplier;
		}
		return multiplier;
	}

	helperMultiplier(helperId: string): number {
		let multiplier = 1;
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

	/** Purrs per second without temporary buffs (used for time away). */
	get basePps(): number {
		return HELPERS.reduce((sum, helper) => sum + (this.state.owned[helper.id] ?? 0) * this.helperPps(helper.id), 0);
	}

	get activeBuff(): Buff | null {
		const buff = this.state.buff;
		return buff && buff.until > Date.now() ? buff : null;
	}

	get luckyPower(): number {
		return this.hasPerk('golden-whiskers') ? 2 : 1;
	}

	get pps(): number {
		const buff = this.activeBuff;
		return this.basePps * (buff?.kind === 'zoomies' ? 5 * this.luckyPower : 1);
	}

	get petValue(): number {
		let value = 1;
		let share = this.hasPerk('purr-echo') ? 0.05 : 0;
		for (const id of this.state.upgrades) {
			const effect = UPGRADE_BY_ID.get(id)?.effect;
			if (effect?.kind === 'pet') value *= effect.multiplier;
			if (effect?.kind === 'petShare') share += effect.share;
		}
		value = value * this.globalMultiplier + this.pps * share;
		const buff = this.activeBuff;
		if (buff?.kind === 'frenzy') value *= 200 * this.luckyPower;
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
		let frequency = 1;
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

	// ----- actions -----

	private earn(amount: number): void {
		if (!(amount > 0) || !Number.isFinite(amount)) return;
		this.state.purrs += amount;
		this.state.lifetimeRun += amount;
		this.state.lifetimeAll += amount;
		this.dirty = true;
	}

	pet(x: number, y: number): void {
		const value = this.petValue;
		this.earn(value);
		this.state.pets += 1;
		cafeSound.play('pet');
		const id = this.nextId++;
		this.floaters.push({id, text: `+${formatPurrs(value)}`, x, y});
		if (this.floaters.length > 30) this.floaters.shift();
		setTimeout(
			() =>
				runInAction(() => {
					this.floaters = this.floaters.filter((floater) => floater.id !== id);
				}),
			1000,
		);
	}

	buyHelper(helperId: string): void {
		const amount = this.purchaseCount(helperId);
		const cost = this.helperCost(helperId, amount);
		if (this.state.purrs < cost) return;
		this.state.purrs -= cost;
		this.state.owned[helperId] = (this.state.owned[helperId] ?? 0) + amount;
		this.dirty = true;
		cafeSound.play('buy');
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
		cafeSound.play('lucky-catch');
		const roll = Math.random();
		const duration = this.luckyDuration;
		if (roll < 0.45) {
			const gift = Math.max(13, Math.min(this.state.purrs * 0.1, this.basePps * 600) * this.luckyPower);
			this.earn(gift);
			this.notify(`Lucky Cat! It left you ${formatPurrs(gift)} purrs.`);
		} else if (roll < 0.85) {
			this.state.buff = {kind: 'zoomies', until: Date.now() + 60_000 * duration};
			this.notify(`Zoomies! Purrs per second ×${5 * this.luckyPower} for ${60 * duration} seconds.`);
		} else {
			this.state.buff = {kind: 'frenzy', until: Date.now() + 15_000 * duration};
			this.notify(`Petting frenzy! Pets ×${200 * this.luckyPower} for ${15 * duration} seconds.`);
		}
		this.dirty = true;
		this.checkAchievements();
	}

	dismissNotice(id: number): void {
		this.notices = this.notices.filter((notice) => notice.id !== id);
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

	private checkAchievements(): void {
		let unlocked = false;
		const progress = {
			lifetimeAll: this.state.lifetimeAll,
			owned: this.state.owned,
			pets: this.state.pets,
			luckyCaught: this.state.luckyCaught,
			lives: this.state.livesEarned,
			pps: this.basePps,
		};
		for (const achievement of ACHIEVEMENTS) {
			if (this.state.achievements.includes(achievement.id)) continue;
			if (achievement.check(progress)) {
				this.state.achievements.push(achievement.id);
				this.notify(`Achievement: ${achievement.name}`);
				this.dirty = true;
				unlocked = true;
			}
		}
		if (unlocked) cafeSound.play('achievement');
	}

	private tick(): void {
		const now = Date.now();
		const elapsed = now - this.lastTick;
		this.lastTick = now;
		if (elapsed <= 0) return;
		if (elapsed > ACTIVE_GAP_MS) {
			this.applyAway(elapsed);
		} else {
			this.earn((this.pps * elapsed) / 1000);
		}
		if (this.lucky && this.lucky.until < now) this.lucky = null;
		if (!this.lucky && now >= this.nextLuckyAt) {
			this.lucky = {x: 10 + Math.random() * 75, y: 15 + Math.random() * 65, until: now + LUCKY_VISIBLE_MS * this.luckyDuration};
			cafeSound.play('lucky-appear');
			this.scheduleLucky(now);
		}
		if (this.state.buff && this.state.buff.until < now) this.state.buff = null;
		if (Math.floor(now / 1000) !== Math.floor((now - elapsed) / 1000)) this.checkAchievements();
		if (this.dirty && now - this.lastSave > SAVE_EVERY_MS) void this.save();
	}

	/** Earnings for time away: a share of the base rate, capped. */
	private applyAway(elapsedMs: number): void {
		const longNaps = this.hasPerk('long-naps');
		const capMs = (longNaps ? 24 : 8) * 3_600_000;
		const rate = longNaps ? 0.5 : 0.25;
		const gained = ((this.basePps * Math.min(elapsedMs, capMs)) / 1000) * rate;
		if (gained >= 1) {
			this.earn(gained);
			const hours = Math.min(elapsedMs, capMs) / 3_600_000;
			const away = hours >= 1 ? `${hours.toFixed(1)} hours` : `${Math.round(hours * 60)} minutes`;
			this.notify(`Welcome back! Your café earned ${formatPurrs(gained)} purrs in ${away}.`);
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
			// Time since the last save (or since leaving the page) counts as time away.
			this.scheduleLucky(now);
			this.lastTick = Math.min(now, this.state.savedAt);
			this.tick();
			this.lastTick = now;
			this.timer = setInterval(() => this.tick(), TICK_MS);
		});
		const onHide = () => {
			if (document.visibilityState === 'hidden') void this.save();
		};
		document.addEventListener('visibilitychange', onHide);
		return () => {
			document.removeEventListener('visibilitychange', onHide);
			if (this.timer !== null) clearInterval(this.timer);
			this.timer = null;
			this.lucky = null;
			void this.save();
		};
	}

	load(): Promise<void> {
		this.loadPromise ??= (async () => {
			try {
				const response = await http.get<{save: string | null}>('/sparkcord/catgame/save');
				runInAction(() => {
					this.state = readSave(response.body?.save ?? null);
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

	async save(): Promise<void> {
		if (!this.loaded) return;
		this.lastSave = Date.now();
		this.dirty = false;
		this.state.savedAt = Date.now();
		try {
			await http.put('/sparkcord/catgame/save', {
				body: {
					save: JSON.stringify(this.state),
					lifetime_purrs: this.state.lifetimeAll,
					lives: this.state.livesEarned,
				},
			});
		} catch (error) {
			console.warn('[cafe] saving failed', error);
			this.dirty = true;
		}
	}

	/** Forgets the loaded save (on account switch). */
	reset(): void {
		if (this.timer !== null) clearInterval(this.timer);
		this.timer = null;
		this.state = emptySave();
		this.loaded = false;
		this.loadFailed = false;
		this.loadPromise = null;
	}
}

export {formatPurrs};

export default new CafeEngine();
