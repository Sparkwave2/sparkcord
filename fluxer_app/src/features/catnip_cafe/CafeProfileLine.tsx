// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: a "Catnip Café" row on profile cards with the person's total purrs (and
// Lives), shown once they have played. Clicking it opens the café.

import {Routes} from '@app/app/Routes';
import {formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import styles from '@app/features/tupper/TupperSystemLink.module.css';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {http} from '@app/features/platform/transport/RestTransport';
import {Trans} from '@lingui/react/macro';
import {useEffect, useState} from 'react';

interface CafeStats {
	purrs: number;
	lives: number;
}

const CACHE_MS = 60_000;
const cache = new Map<string, {at: number; value: Promise<CafeStats | null>}>();

function loadStats(userId: string): Promise<CafeStats | null> {
	const cached = cache.get(userId);
	if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
	const value = http
		.post<{stats: Record<string, CafeStats>}>('/sparkcord/catgame/stats/query', {body: {user_ids: [userId]}})
		.then((response) => response.body?.stats?.[userId] ?? null)
		.catch(() => null);
	cache.set(userId, {at: Date.now(), value});
	return value;
}

export function CafeProfileLine({userId}: {userId: string}) {
	const [stats, setStats] = useState<CafeStats | null>(null);
	useEffect(() => {
		let cancelled = false;
		setStats(null);
		void loadStats(userId).then((result) => {
			if (!cancelled) setStats(result);
		});
		return () => {
			cancelled = true;
		};
	}, [userId]);
	if (!stats || stats.purrs <= 0) return null;
	return (
		<div className={styles.container} data-flx="catnip-cafe.profile-line">
			<span className={styles.title}>
				<Trans comment="Heading on a profile card for the person's Catnip Café game score">Catnip Café</Trans>
			</span>
			<button
				type="button"
				className={styles.button}
				onClick={() => RouterUtils.transitionTo(Routes.CATNIP_CAFE)}
				data-flx="catnip-cafe.profile-line.button"
			>
				<span className={styles.name}>🐾 {formatPurrs(stats.purrs)}</span>
				{stats.lives > 0 && <span className={styles.count}>❤️ {stats.lives}</span>}
			</button>
		</div>
	);
}
