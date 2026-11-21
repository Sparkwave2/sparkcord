// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: how a shared café card (/cafe) looks in chat, drawn from the card's
// link (CafeShareData) with the sharer's cat in its outfit and numbers in the viewer's style.

import {Routes} from '@app/app/Routes';
import {CafeCat} from '@app/features/catnip_cafe/CafeCat';
import {formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import styles from '@app/features/catnip_cafe/CafeShareCard.module.css';
import type {CafeCardData} from '@app/features/catnip_cafe/CafeShareData';
import {COAT_BY_ID} from '@app/features/catnip_cafe/CafeWorld';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

export const CafeShareCard = observer(function CafeShareCard({card, title}: {card: CafeCardData; title: string}) {
	const {t} = useLingui();
	const coat = COAT_BY_ID.has(card.coat) ? card.coat : 'ginger';
	const stats: Array<{emoji: string; label: string; value: string}> = [
		{emoji: '🐾', label: t`Purrs earned`, value: formatPurrs(card.purrs)},
		{emoji: '⏱️', label: t`Per second`, value: formatPurrs(card.pps)},
		{emoji: '✨', label: t`Lives`, value: formatPurrs(card.lives)},
		{emoji: '🐈', label: t`Cats`, value: formatPurrs(card.cats)},
		{emoji: '🏆', label: t`Achievements`, value: `${card.achievements}/${card.achievementsTotal}`},
		{emoji: '🔥', label: t`Daily streak`, value: t`${card.streak} days`},
	];
	return (
		<div className={styles.card} data-flx="catnip-cafe.share-card">
			<div className={styles.catBox}>
				<CafeCat className={styles.cat} coat={coat} hat={card.hat} collar={card.collar} expression="happy" />
			</div>
			<div className={styles.body}>
				<div className={styles.title}>{title}</div>
				<div className={styles.subtitle}>{t`${formatPurrs(card.pets)} pets and counting`}</div>
				<div className={styles.stats}>
					{stats.map((stat) => (
						<div key={stat.label} className={styles.stat}>
							<span className={styles.statLabel}>
								{stat.emoji} {stat.label}
							</span>
							<span className={styles.statValue}>{stat.value}</span>
						</div>
					))}
				</div>
				<button
					type="button"
					className={styles.open}
					onClick={() => RouterUtils.transitionTo(Routes.CATNIP_CAFE)}
				>
					{t`Open your café`}
				</button>
			</div>
		</div>
	);
});

export default CafeShareCard;
