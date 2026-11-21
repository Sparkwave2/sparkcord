// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the upgrades tab and the helper shop, with what each helper adds,
// progress to its next doubling, and how long until you can afford things.

import {HELPERS} from '@app/features/catnip_cafe/CafeData';
import {CafeEmoji} from '@app/features/catnip_cafe/CafeEmoji';
import Cafe from '@app/features/catnip_cafe/CafeEngine';
import {formatDuration, formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import styles from '@app/features/catnip_cafe/CafePage.module.css';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

/** "in 2m 10s" until a cost is affordable, or nothing when it already is. */
export const WaitHint = observer(function WaitHint({cost}: {cost: number}) {
	const {t} = useLingui();
	const seconds = Cafe.secondsUntil(cost);
	if (seconds === 0) return null;
	return (
		<span className={styles.waitHint}>
			{seconds === null ? t`keep petting` : t`in ${formatDuration(seconds * 1000)}`}
		</span>
	);
});

export const UpgradesTab = observer(function UpgradesTab() {
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
						<CafeEmoji className={styles.upgradeEmoji} emoji={upgrade.emoji} />
						<span className={styles.upgradeText}>
							<span className={styles.upgradeName}>{upgrade.name}</span>
							<span className={styles.upgradeDescription}>{upgrade.description}</span>
						</span>
						<span className={styles.priceColumn}>
							<span className={styles.price}>🐾 {formatPurrs(upgrade.cost)}</span>
							<WaitHint cost={upgrade.cost} />
						</span>
					</button>
				);
			})}
		</div>
	);
});

export const HelperShop = observer(function HelperShop() {
	const {t} = useLingui();
	const amounts: Array<1 | 10 | 100 | 'max'> = [1, 10, 100, 'max'];
	// Show helpers up to two beyond the best one owned, so there is always something to aim for.
	let lastOwned = -1;
	HELPERS.forEach((helper, index) => {
		if ((Cafe.state.owned[helper.id] ?? 0) > 0) lastOwned = index;
	});
	const visible = HELPERS.slice(0, Math.max(2, lastOwned + 3));
	const total = Cafe.basePps;
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
				const each = Cafe.helperPps(helper.id);
				const share = total > 0 ? (owned * each) / total : 0;
				const tier = Cafe.nextTier(helper.id);
				const tierProgress = tier ? (owned - tier.from) / (tier.need - tier.from) : 1;
				return (
					<button
						key={helper.id}
						type="button"
						className={clsx(styles.helper, affordable && styles.affordable)}
						onClick={() => Cafe.buyHelper(helper.id)}
						disabled={!affordable}
						title={helper.description}
					>
						<CafeEmoji className={styles.helperEmoji} emoji={helper.emoji} />
						<span className={styles.helperText}>
							<span className={styles.upgradeName}>{helper.name}</span>
							<span className={styles.price}>
								🐾 {formatPurrs(cost)}
								{count > 1 && <span className={styles.helperCount}> (×{count})</span>} <WaitHint cost={cost} />
							</span>
							<span className={styles.helperInfo}>
								{owned > 0
									? t`+${formatPurrs(each)}/s each · ${Math.round(share * 100)}% of total`
									: t`+${formatPurrs(each)}/s each`}
							</span>
							{tier && owned > 0 && (
								<span
									className={styles.tierBar}
									title={t`${tier.need - owned} more until ${helper.name}s get their next upgrade`}
								>
									<span className={styles.tierFill} style={{width: `${Math.round(tierProgress * 100)}%`}} />
								</span>
							)}
						</span>
						<span className={styles.owned}>{owned}</span>
					</button>
				);
			})}
		</div>
	);
});
