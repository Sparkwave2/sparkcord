// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the game page. Pet the cat in the middle, hire helpers on the
// right, and use the tabs for upgrades, achievements, Nine Lives and the leaderboard.

import Authentication from '@app/features/auth/state/Authentication';
import {ACHIEVEMENTS, HELPERS, LIFE_BONUS, livesFor, PERKS} from '@app/features/catnip_cafe/CafeData';
import Cafe, {formatPurrs} from '@app/features/catnip_cafe/CafeEngine';
import {CafeCat} from '@app/features/catnip_cafe/CafeCat';
import styles from '@app/features/catnip_cafe/CafePage.module.css';
import Guilds from '@app/features/guild/state/Guilds';
import {http} from '@app/features/platform/transport/RestTransport';
import Users from '@app/features/user/state/Users';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

type Tab = 'upgrades' | 'achievements' | 'lives' | 'leaderboard';

const UpgradesTab = observer(function UpgradesTab() {
	const {t} = useLingui();
	const upgrades = Cafe.visibleUpgrades;
	if (upgrades.length === 0) {
		return <p className={styles.empty}>{t`New upgrades appear as your café grows.`}</p>;
	}
	return (
		<div className={styles.upgradeGrid}>
			{upgrades.map((upgrade) => {
				const affordable = Cafe.state.purrs >= upgrade.cost;
				return (
					<button
						key={upgrade.id}
						type="button"
						className={clsx(styles.upgrade, affordable && styles.affordable)}
						onClick={() => Cafe.buyUpgrade(upgrade.id)}
						disabled={!affordable}
						title={`${upgrade.name}: ${upgrade.description}`}
					>
						<span className={styles.upgradeEmoji}>{upgrade.emoji}</span>
						<span className={styles.upgradeText}>
							<span className={styles.upgradeName}>{upgrade.name}</span>
							<span className={styles.upgradeDescription}>{upgrade.description}</span>
						</span>
						<span className={styles.price}>🐾 {formatPurrs(upgrade.cost)}</span>
					</button>
				);
			})}
		</div>
	);
});

const AchievementsTab = observer(function AchievementsTab() {
	const {t} = useLingui();
	const earned = new Set(Cafe.state.achievements);
	return (
		<>
			<p className={styles.tabIntro}>
				{t`${earned.size} of ${ACHIEVEMENTS.length} earned. Each one adds 1% to all purrs.`}
			</p>
			<div className={styles.achievementGrid}>
				{ACHIEVEMENTS.map((achievement) => {
					const done = earned.has(achievement.id);
					return (
						<div
							key={achievement.id}
							className={clsx(styles.achievement, done && styles.achievementDone)}
							title={achievement.description}
						>
							<span className={styles.achievementIcon}>{done ? '🏆' : '🔒'}</span>
							<span className={styles.achievementText}>
								<span className={styles.upgradeName}>{done ? achievement.name : '???'}</span>
								<span className={styles.upgradeDescription}>{achievement.description}</span>
							</span>
						</div>
					);
				})}
			</div>
		</>
	);
});

const LivesTab = observer(function LivesTab() {
	const {t} = useLingui();
	const gain = Cafe.livesOnRestart;
	const nextAt = (livesFor(Cafe.state.lifetimeAll) + 1) ** 3 * 1e12;
	const [confirming, setConfirming] = useState(false);
	return (
		<>
			<div className={styles.livesSummary}>
				<span className={styles.livesCount}>❤️ {Cafe.state.livesEarned}</span>
				<span>
					{t`Lives give +${Math.round(LIFE_BONUS * 100)}% purrs each, for good. ${Cafe.livesAvailable} left to spend on perks.`}
				</span>
			</div>
			<div className={styles.restartBox}>
				<p>
					{gain > 0
						? t`Start a new life now to gain ${gain} ${gain === 1 ? 'Life' : 'Lives'}. You lose your purrs, helpers and upgrades, but keep Lives, perks and achievements.`
						: t`Earn ${formatPurrs(nextAt)} purrs in total to gain your next Life.`}
				</p>
				{gain > 0 &&
					(confirming ? (
						<span className={styles.confirmRow}>
							<button
								type="button"
								className={styles.dangerButton}
								onClick={() => {
									setConfirming(false);
									Cafe.restart();
								}}
							>
								{t`Yes, start over`}
							</button>
							<button type="button" className={styles.plainButton} onClick={() => setConfirming(false)}>
								{t`Cancel`}
							</button>
						</span>
					) : (
						<button type="button" className={styles.primaryButton} onClick={() => setConfirming(true)}>
							{t`Start a new life`}
						</button>
					))}
			</div>
			<div className={styles.upgradeGrid}>
				{PERKS.map((perk) => {
					const owned = Cafe.hasPerk(perk.id);
					const affordable = !owned && Cafe.livesAvailable >= perk.cost;
					return (
						<button
							key={perk.id}
							type="button"
							className={clsx(styles.upgrade, affordable && styles.affordable, owned && styles.perkOwned)}
							onClick={() => Cafe.buyPerk(perk.id)}
							disabled={!affordable}
						>
							<span className={styles.upgradeEmoji}>{perk.emoji}</span>
							<span className={styles.upgradeText}>
								<span className={styles.upgradeName}>{perk.name}</span>
								<span className={styles.upgradeDescription}>{perk.description}</span>
							</span>
							<span className={styles.price}>{owned ? '✓' : `❤️ ${perk.cost}`}</span>
						</button>
					);
				})}
			</div>
		</>
	);
});

interface LeaderboardEntry {
	user_id: string;
	purrs: number;
	lives: number;
}

const LeaderboardTab = observer(function LeaderboardTab() {
	const {t} = useLingui();
	const guilds = Guilds.getGuilds();
	const [guildId, setGuildId] = useState<string | null>(guilds[0]?.id ?? null);
	const [entries, setEntries] = useState<Array<LeaderboardEntry> | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		if (!guildId) return;
		let cancelled = false;
		setEntries(null);
		setFailed(false);
		void Cafe.save().then(() =>
			http
				.get<{entries: Array<LeaderboardEntry>}>(`/sparkcord/catgame/leaderboard/${guildId}`)
				.then((response) => {
					if (!cancelled) setEntries(response.body?.entries ?? []);
				})
				.catch(() => {
					if (!cancelled) setFailed(true);
				}),
		);
		return () => {
			cancelled = true;
		};
	}, [guildId]);
	if (guilds.length === 0) return <p className={styles.empty}>{t`Join a community to compare cafés.`}</p>;
	const me = Authentication.currentUserId;
	return (
		<>
			<select
				className={styles.select}
				value={guildId ?? ''}
				onChange={(event) => setGuildId(event.target.value)}
				aria-label={t`Community`}
			>
				{guilds.map((guild) => (
					<option key={guild.id} value={guild.id}>
						{guild.name}
					</option>
				))}
			</select>
			{failed && <p className={styles.empty}>{t`Couldn't load the leaderboard.`}</p>}
			{!failed && entries === null && <p className={styles.empty}>{t`Loading…`}</p>}
			{entries !== null && entries.length === 0 && (
				<p className={styles.empty}>{t`Nobody here has a café yet. Be the first!`}</p>
			)}
			{entries !== null && entries.length > 0 && (
				<ol className={styles.leaderboard}>
					{entries.map((entry, index) => (
						<li key={entry.user_id} className={clsx(styles.leaderRow, entry.user_id === me && styles.leaderMe)}>
							<span className={styles.rank}>{['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`}</span>
							<span className={styles.leaderName}>{Users.getUser(entry.user_id)?.displayName ?? t`Someone`}</span>
							<span className={styles.leaderPurrs}>
								🐾 {formatPurrs(entry.purrs)}
								{entry.lives > 0 && <span className={styles.leaderLives}> ❤️ {entry.lives}</span>}
							</span>
						</li>
					))}
				</ol>
			)}
		</>
	);
});

const HelperShop = observer(function HelperShop() {
	const {t} = useLingui();
	const amounts: Array<1 | 10 | 100 | 'max'> = [1, 10, 100, 'max'];
	// Show helpers up to two beyond the best one owned, so there is always something to aim for.
	let lastOwned = -1;
	HELPERS.forEach((helper, index) => {
		if ((Cafe.state.owned[helper.id] ?? 0) > 0) lastOwned = index;
	});
	const visible = HELPERS.slice(0, Math.max(2, lastOwned + 3));
	return (
		<div className={styles.shop}>
			<div className={styles.shopHeader}>
				<span className={styles.columnTitle}>{t`Helpers`}</span>
				<span className={styles.amounts}>
					{amounts.map((amount) => (
						<button
							key={amount}
							type="button"
							className={clsx(styles.amount, Cafe.buyAmount === amount && styles.amountActive)}
							onClick={() => Cafe.setBuyAmount(amount)}
						>
							{amount === 'max' ? t`Max` : `×${amount}`}
						</button>
					))}
				</span>
			</div>
			{visible.map((helper) => {
				const owned = Cafe.state.owned[helper.id] ?? 0;
				const count = Cafe.purchaseCount(helper.id);
				const cost = Cafe.helperCost(helper.id, count);
				const affordable = Cafe.state.purrs >= cost;
				return (
					<button
						key={helper.id}
						type="button"
						className={clsx(styles.helper, affordable && styles.affordable)}
						onClick={() => Cafe.buyHelper(helper.id)}
						disabled={!affordable}
						title={`${helper.description} Each makes ${formatPurrs(Cafe.helperPps(helper.id))} purrs per second.`}
					>
						<span className={styles.helperEmoji}>{helper.emoji}</span>
						<span className={styles.helperText}>
							<span className={styles.upgradeName}>{helper.name}</span>
							<span className={styles.price}>
								🐾 {formatPurrs(cost)}
								{count > 1 && <span className={styles.helperCount}> (×{count})</span>}
							</span>
						</span>
						<span className={styles.owned}>{owned}</span>
					</button>
				);
			})}
		</div>
	);
});

export const CafePage = observer(function CafePage() {
	const {t} = useLingui();
	const [tab, setTab] = useState<Tab>('upgrades');
	const [squish, setSquish] = useState(0);
	const stageRef = useRef<HTMLDivElement>(null);
	const userId = Authentication.currentUserId;

	useEffect(() => {
		if (!userId) return;
		return Cafe.start(userId);
	}, [userId]);

	if (Cafe.loadFailed) {
		return (
			<div className={styles.page}>
				<p className={styles.empty}>{t`Couldn't open your café. Try again in a moment.`}</p>
			</div>
		);
	}
	if (!Cafe.loaded) {
		return (
			<div className={styles.page}>
				<p className={styles.empty}>{t`Opening the café…`}</p>
			</div>
		);
	}

	const onPet = (event: React.MouseEvent<HTMLButtonElement>) => {
		const stage = stageRef.current?.getBoundingClientRect();
		const x = stage ? event.clientX - stage.left : 0;
		const y = stage ? event.clientY - stage.top : 0;
		Cafe.pet(x, y);
		setSquish((value) => value + 1);
	};
	const buff = Cafe.activeBuff;
	const tabs: Array<{id: Tab; label: string}> = [
		{id: 'upgrades', label: t`Upgrades`},
		{id: 'achievements', label: t`Achievements`},
		{id: 'lives', label: t`Nine Lives`},
		{id: 'leaderboard', label: t`Leaderboard`},
	];

	return (
		<div className={styles.page}>
			<div className={styles.stage} ref={stageRef}>
				<h1 className={styles.title}>{t`Catnip Café`}</h1>
				<div className={styles.purrs}>🐾 {formatPurrs(Cafe.state.purrs)}</div>
				<div className={styles.rate}>
					{t`${formatPurrs(Cafe.pps)} purrs per second`}
					{buff && (
						<span className={styles.buff}>
							{buff.kind === 'zoomies' ? t`Zoomies!` : t`Petting frenzy!`}{' '}
							{Math.ceil((buff.until - Date.now()) / 1000)}s
						</span>
					)}
				</div>
				<button
					type="button"
					key={squish}
					className={styles.catButton}
					onClick={onPet}
					aria-label={t`Pet the cat`}
				>
					<CafeCat className={styles.cat} />
				</button>
				<div className={styles.petHint}>{t`Pet the cat! Each pet: ${formatPurrs(Cafe.petValue)}`}</div>
				{Cafe.floaters.map((floater) => (
					<span key={floater.id} className={styles.floater} style={{left: floater.x, top: floater.y}}>
						{floater.text}
					</span>
				))}
				<div className={styles.notices}>
					{Cafe.notices.map((notice) => (
						<button
							key={notice.id}
							type="button"
							className={styles.notice}
							onClick={() => Cafe.dismissNotice(notice.id)}
						>
							{notice.text}
						</button>
					))}
				</div>
			</div>
			<div className={styles.middle}>
				<div className={styles.tabs} role="tablist">
					{tabs.map((entry) => (
						<button
							key={entry.id}
							type="button"
							role="tab"
							aria-selected={tab === entry.id}
							className={clsx(styles.tab, tab === entry.id && styles.tabActive)}
							onClick={() => setTab(entry.id)}
						>
							{entry.label}
						</button>
					))}
				</div>
				<div className={styles.tabBody}>
					{tab === 'upgrades' && <UpgradesTab />}
					{tab === 'achievements' && <AchievementsTab />}
					{tab === 'lives' && <LivesTab />}
					{tab === 'leaderboard' && <LeaderboardTab />}
				</div>
			</div>
			<HelperShop />
			{Cafe.lucky && (
				<button
					type="button"
					className={styles.lucky}
					style={{left: `${Cafe.lucky.x}%`, top: `${Cafe.lucky.y}%`}}
					onClick={() => Cafe.catchLucky()}
					aria-label={t`Catch the Lucky Cat`}
					title={t`Lucky Cat! Click it.`}
				>
					🐈
				</button>
			)}
		</div>
	);
});

export default CafePage;
