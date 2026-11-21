// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the trophies tab (achievements and stats), Nine Lives, and the
// per-community leaderboard.

import Authentication from '@app/features/auth/state/Authentication';
import {ACHIEVEMENTS, LIFE_BONUS, livesFor, PERKS} from '@app/features/catnip_cafe/CafeData';
import {CafeEmoji} from '@app/features/catnip_cafe/CafeEmoji';
import Cafe from '@app/features/catnip_cafe/CafeEngine';
import {formatDuration, formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import styles from '@app/features/catnip_cafe/CafePage.module.css';
import Guilds from '@app/features/guild/state/Guilds';
import {http} from '@app/features/platform/transport/RestTransport';
import Users from '@app/features/user/state/Users';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

const StatsView = observer(function StatsView() {
	const {t} = useLingui();
	const s = Cafe.state;
	const rows: Array<[string, string]> = [
		[t`Purrs this life`, formatPurrs(s.lifetimeRun)],
		[t`Purrs ever`, formatPurrs(s.lifetimeAll)],
		[t`Best purrs per second`, formatPurrs(s.stats.bestPps)],
		[t`Pets`, s.pets.toLocaleString()],
		[t`Biggest single pet`, formatPurrs(s.stats.biggestPet)],
		[t`Lucky Cats caught`, s.luckyCaught.toLocaleString()],
		[t`Biggest Lucky Cat gift`, formatPurrs(s.stats.biggestLuckyGift)],
		[t`Mice caught`, s.stats.miceCaught.toLocaleString()],
		[t`Treats fed`, s.stats.treatsEaten.toLocaleString()],
		[t`Times in Bliss`, s.stats.blissCount.toLocaleString()],
		[t`Cats adopted`, s.stats.catsAdopted.toLocaleString()],
		[t`Plants harvested`, s.stats.harvests.toLocaleString()],
		[t`Catnip grown`, formatPurrs(s.stats.catnipEarned)],
		[t`Daily goals done`, s.stats.goalsDone.toLocaleString()],
		[t`Longest streak`, t`${s.stats.longestStreak} days`],
		[t`Lives`, s.livesEarned.toLocaleString()],
		[t`Time played`, formatDuration(s.stats.playMs)],
		[t`This life started`, formatDuration(Cafe.now - s.lifeStartedAt) + ' ' + t`ago`],
	];
	return (
		<>
			<h3 className={styles.sectionTitle}>{t`Stats`}</h3>
			<dl className={styles.statList}>
				{rows.map(([label, value]) => (
					<div key={label} className={styles.statRow}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
			<h3 className={styles.sectionTitle}>{t`Bonuses on all purrs`}</h3>
			<dl className={styles.statList}>
				{Cafe.multiplierParts.map((part) => (
					<div key={part.label} className={styles.statRow}>
						<dt>{part.label}</dt>
						<dd>×{part.value.toFixed(2)}</dd>
					</div>
				))}
				<div className={clsx(styles.statRow, styles.statTotal)}>
					<dt>{t`Total`}</dt>
					<dd>×{formatPurrs(Cafe.globalMultiplier)}</dd>
				</div>
			</dl>
		</>
	);
});

export const TrophiesTab = observer(function TrophiesTab() {
	const {t} = useLingui();
	const earned = new Set(Cafe.state.achievements);
	const [view, setView] = useState<'achievements' | 'stats'>('achievements');
	return (
		<>
			<div className={styles.segmented}>
				<button
					type="button"
					className={clsx(styles.amount, view === 'achievements' && styles.amountActive)}
					onClick={() => setView('achievements')}
				>
					{t`Achievements`}
				</button>
				<button
					type="button"
					className={clsx(styles.amount, view === 'stats' && styles.amountActive)}
					onClick={() => setView('stats')}
				>
					{t`Stats`}
				</button>
			</div>
			{view === 'stats' ? (
				<StatsView />
			) : (
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
									<CafeEmoji className={styles.achievementIcon} emoji={done ? '🏆' : '🔒'} />
									<span className={styles.achievementText}>
										<span className={styles.upgradeName}>{done ? achievement.name : '???'}</span>
										<span className={styles.upgradeDescription}>{achievement.description}</span>
									</span>
								</div>
							);
						})}
					</div>
				</>
			)}
		</>
	);
});

export const LivesTab = observer(function LivesTab() {
	const {t} = useLingui();
	const gain = Cafe.livesOnRestart;
	const nextAt = (livesFor(Cafe.state.lifetimeAll) + 1) ** 3 * 1e12;
	const [confirming, setConfirming] = useState(false);
	const progress = Math.min(1, Cafe.state.lifetimeAll / nextAt);
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
						? t`Start a new life now to gain ${gain} ${gain === 1 ? 'Life' : 'Lives'}. You lose your purrs, helpers and upgrades, but keep Lives, perks, achievements, cats, the garden, research and goals.`
						: t`Earn ${formatPurrs(nextAt)} purrs in total to gain your next Life.`}
				</p>
				{gain === 0 && (
					<span className={styles.tierBar}>
						<span className={styles.tierFill} style={{width: `${progress * 100}%`}} />
					</span>
				)}
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
							<CafeEmoji className={styles.upgradeEmoji} emoji={perk.emoji} />
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

export const LeaderboardTab = observer(function LeaderboardTab() {
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
