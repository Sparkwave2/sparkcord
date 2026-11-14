// SPDX-License-Identifier: AGPL-3.0-or-later
// Loads the peer-to-peer share card (and WebTorrent, on use) only when one is shown.

import type {P2PShareInfo} from '@app/features/p2p/P2PShare';
import {lazy, Suspense} from 'react';

const P2PShareCard = lazy(() => import('@app/features/p2p/P2PShareCard'));

export function P2PShareCardLazy({share, authorId}: {share: P2PShareInfo; authorId: string}) {
	return (
		<Suspense fallback={<div style={{minHeight: 62}} />}>
			<P2PShareCard share={share} authorId={authorId} />
		</Suspense>
	);
}
