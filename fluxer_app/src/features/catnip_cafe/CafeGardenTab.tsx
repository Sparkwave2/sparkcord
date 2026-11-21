// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the catnip garden (plots that grow in real time, even while you're
// away) and the research tree that catnip pays for.

import {CafeEmoji} from '@app/features/catnip_cafe/CafeEmoji';
import Cafe from '@app/features/catnip_cafe/CafeEngine';
import {formatDuration, formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import styles from '@app/features/catnip_cafe/CafePage.module.css';
import {WaitHint} from '@app/features/catnip_cafe/CafeShop';
import {RESEARCH, RESEARCH_BY_ID, SEED_BY_ID, SEEDS} from '@app/features/catnip_cafe/CafeWorld';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

const PlotCard = observer(function PlotCard({index}: {index: number}) {
	const {t} = useLingui();
	const [choosing, setChoosing] = useState(false);
	const plot = Cafe.state.plots[index];
	if (!plot) return null;
	if (!plot.seed) {
		return (
			<div className={clsx(styles.plot, styles.plotEmpty)}>
				{choosing ? (
					<div className={styles.seedList}>
						{SEEDS.map((seed) => {
							const locked = seed.research !== undefined && !Cafe.hasResearch(seed.research);
							return (
								<button
									key={seed.id}
									type="button"
									className={styles.seedButton}
									disabled={locked}
									onClick={() => {
										Cafe.plant(index, seed.id);
										setChoosing(false);
									}}
									title={locked ? t`Needs the ${RESEARCH_BY_ID.get(seed.research ?? '')?.name ?? ''} research` : undefined}
								>
									<CafeEmoji className={styles.seedEmoji} emoji={seed.emoji} />
									<span>
										{seed.name}
										<span className={styles.seedMeta}>
											{formatDuration(seed.growMs / Cafe.gardenSpeed)} · 🌿 {Math.round(seed.yield * Cafe.catnipYield)}
										</span>
									</span>
								</button>
							);
						})}
						<button type="button" className={styles.smallButton} onClick={() => setChoosing(false)}>
							{t`Cancel`}
						</button>
					</div>
				) : (
					<button type="button" className={styles.plantButton} onClick={() => setChoosing(true)}>
						{t`+ Plant`}
					</button>
				)}
			</div>
		);
	}
	const seed = SEED_BY_ID.get(plot.seed);
	const progress = Cafe.plotProgress(plot);
	const ready = progress >= 1;
	const left = Cafe.plotGrowMs(plot) * (1 - progress);
	return (
		<div className={clsx(styles.plot, ready && styles.plotReady)}>
			<CafeEmoji className={clsx(styles.plotEmoji, !ready && styles.plotGrowing)} emoji={seed?.emoji ?? '🌱'} />
			<span className={styles.plotName}>{seed?.name}</span>
			{ready ? (
				<button type="button" className={styles.primaryButton} onClick={() => Cafe.harvest(index)}>
					{t`Harvest`}
				</button>
			) : (
				<>
					<span className={styles.tierBar}>
						<span className={styles.tierFill} style={{width: `${Math.round(progress * 100)}%`}} />
					</span>
					<span className={styles.seedMeta}>{formatDuration(left)}</span>
				</>
			)}
			<button
				type="button"
				className={styles.plotClear}
				onClick={() => Cafe.clearPlot(index)}
				title={t`Dig up and plant something else`}
				aria-label={t`Dig up`}
			>
				×
			</button>
		</div>
	);
});

export const GardenTab = observer(function GardenTab() {
	const {t} = useLingui();
	const nextPlot = Cafe.nextPlotCost;
	const branches: Array<{id: 'garden' | 'cats' | 'cafe'; label: string}> = [
		{id: 'garden', label: t`Garden`},
		{id: 'cats', label: t`Cats`},
		{id: 'cafe', label: t`Café`},
	];
	return (
		<>
			<div className={styles.gardenHeader}>
				<span className={styles.catnipCount}>
					<CafeEmoji className={styles.inlineEmoji} emoji="🌿" /> {formatPurrs(Cafe.state.catnip)} {t`catnip`}
				</span>
				{Cafe.readyPlots > 1 && (
					<button type="button" className={styles.primaryButton} onClick={() => Cafe.harvestAll()}>
						{t`Harvest all (${Cafe.readyPlots})`}
					</button>
				)}
			</div>
			<p className={styles.tabIntro}>
				{t`Plants keep growing while you're away. Harvested plots are replanted with the same seed.`}
			</p>
			<div className={styles.plotGrid}>
				{Cafe.state.plots.map((_, index) => (
					<PlotCard key={index} index={index} />
				))}
				{nextPlot !== null && (
					<button
						type="button"
						className={clsx(styles.plot, styles.plotBuy, Cafe.state.purrs >= nextPlot && styles.affordable)}
						onClick={() => Cafe.buyPlot()}
						disabled={Cafe.state.purrs < nextPlot}
					>
						<span>{t`New plot`}</span>
						<span className={styles.price}>🐾 {formatPurrs(nextPlot)}</span>
						<WaitHint cost={nextPlot} />
					</button>
				)}
			</div>
			<h3 className={styles.sectionTitle}>{t`Research`}</h3>
			<p className={styles.tabIntro}>{t`Spend catnip on lasting improvements. They stay through Nine Lives.`}</p>
			<div className={styles.researchColumns}>
				{branches.map((branch) => (
					<div key={branch.id} className={styles.researchBranch}>
						<span className={styles.branchTitle}>{branch.label}</span>
						{RESEARCH.filter((research) => research.branch === branch.id).map((research) => {
							const done = Cafe.hasResearch(research.id);
							const open = !research.requires || Cafe.hasResearch(research.requires);
							const affordable = !done && open && Cafe.state.catnip >= research.cost;
							return (
								<button
									key={research.id}
									type="button"
									className={clsx(
										styles.upgrade,
										affordable && styles.affordable,
										done && styles.perkOwned,
										!open && styles.researchLocked,
									)}
									onClick={() => Cafe.research(research.id)}
									disabled={!affordable}
									title={research.description}
								>
									<CafeEmoji className={styles.upgradeEmoji} emoji={research.emoji} />
									<span className={styles.upgradeText}>
										<span className={styles.upgradeName}>{research.name}</span>
										<span className={styles.upgradeDescription}>{research.description}</span>
									</span>
									<span className={styles.price}>{done ? '✓' : `🌿 ${research.cost}`}</span>
								</button>
							);
						})}
					</div>
				))}
			</div>
		</>
	);
});
