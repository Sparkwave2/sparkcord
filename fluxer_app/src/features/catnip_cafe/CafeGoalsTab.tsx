// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: three daily goals, their rewards, the daily chest and the streak.

import {CafeEmoji} from '@app/features/catnip_cafe/CafeEmoji';
import Cafe, {goalText} from '@app/features/catnip_cafe/CafeEngine';
import {formatDuration, formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import styles from '@app/features/catnip_cafe/CafePage.module.css';
import {GOAL_CATNIP_REWARD, STREAK_BONUS, STREAK_CAP} from '@app/features/catnip_cafe/CafeWorld';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

const REWARD_EMOJI = {cookie: '🍪', tuna: '🐟', catnip: '🌿'} as const;

function msUntilMidnight(now: number): number {
	const midnight = new Date(now);
	midnight.setHours(24, 0, 0, 0);
	return midnight.getTime() - now;
}

export const GoalsTab = observer(function GoalsTab() {
	const {t} = useLingui();
	const goals = Cafe.state.goals;
	const streak = Cafe.activeStreak;
	const rewardText = (reward: 'cookie' | 'tuna' | 'catnip') =>
		reward === 'cookie' ? t`3 Cookie Treats` : reward === 'tuna' ? t`Tuna Flakes` : t`${GOAL_CATNIP_REWARD} catnip`;
	return (
		<>
			<div className={styles.goalsHeader}>
				<span>
					{t`New goals in ${formatDuration(msUntilMidnight(Cafe.now))}`}
				</span>
				<span className={styles.streak} title={t`Each day in a row with every goal done adds ${Math.round(STREAK_BONUS * 100)}% to all purrs (up to ${STREAK_CAP} days).`}>
					🔥 {t`${streak}-day streak · +${Math.round(Cafe.streakBonus * 100)}%`}
				</span>
			</div>
			<div className={styles.goalList}>
				{goals.list.map((goal, index) => {
					const done = goal.progress >= goal.target;
					const shown = goal.kind === 'earn' ? formatPurrs(goal.progress) : Math.floor(goal.progress).toLocaleString();
					const target = goal.kind === 'earn' ? formatPurrs(goal.target) : goal.target.toLocaleString();
					return (
						<div key={`${goal.kind}-${index}`} className={clsx(styles.goal, goal.claimed && styles.goalClaimed)}>
							<div className={styles.goalText}>
								<span className={styles.upgradeName}>{goalText(goal)}</span>
								<span className={styles.tierBar}>
									<span className={styles.tierFill} style={{width: `${Math.min(100, (goal.progress / goal.target) * 100)}%`}} />
								</span>
								<span className={styles.upgradeDescription}>
									{shown} / {target} · {t`Reward:`} <CafeEmoji className={styles.inlineEmoji} emoji={REWARD_EMOJI[goal.reward]} />{' '}
									{rewardText(goal.reward)}
								</span>
							</div>
							{goal.claimed ? (
								<span className={styles.goalCheck}>✓</span>
							) : done ? (
								<button type="button" className={clsx(styles.primaryButton, styles.glow)} onClick={() => Cafe.claimGoal(index)}>
									{t`Claim`}
								</button>
							) : (
								!goals.rerolled && (
									<button
										type="button"
										className={styles.smallButton}
										onClick={() => Cafe.rerollGoal(index)}
										title={t`Swap this goal for another one (once a day)`}
									>
										{t`Swap`}
									</button>
								)
							)}
						</div>
					);
				})}
			</div>
			<div className={clsx(styles.chest, Cafe.chestReady && styles.chestReady)}>
				<CafeEmoji className={styles.chestEmoji} emoji={goals.chestClaimed ? '📭' : '🎁'} />
				<div className={styles.goalText}>
					<span className={styles.upgradeName}>{t`Daily chest`}</span>
					<span className={styles.upgradeDescription}>
						{goals.chestClaimed
							? t`Opened. Come back tomorrow!`
							: t`Claim all three goals to open it: a Golden Sardine, a new cat, and +1 day on your streak.`}
					</span>
				</div>
				{Cafe.chestReady && (
					<button type="button" className={clsx(styles.primaryButton, styles.glow)} onClick={() => Cafe.claimChest()}>
						{t`Open`}
					</button>
				)}
			</div>
		</>
	);
});
