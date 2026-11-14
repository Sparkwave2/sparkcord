// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The card shown for a peer-to-peer file share message: file name and size, and
// Download / progress / Save for receivers, or sharing status for the sender.

import Authentication from '@app/features/auth/state/Authentication';
import {saveDownload, startDownload, stopTransfer, useTransfer} from '@app/features/p2p/P2PClient';
import styles from '@app/features/p2p/P2PShareCard.module.css';
import {formatBytes, type P2PShareInfo} from '@app/features/p2p/P2PShare';
import {Button} from '@app/features/ui/button/Button';
import {Trans} from '@lingui/react/macro';
import {ShareNetworkIcon} from '@phosphor-icons/react';
import type React from 'react';
import {useEffect, useState} from 'react';

const NO_PEER_HINT_AFTER_MS = 15_000;

export default function P2PShareCard({share, authorId}: {share: P2PShareInfo; authorId: string}) {
	const transfer = useTransfer(share.infoHash);
	const isMine = authorId === Authentication.currentUserId;
	const [waitingLong, setWaitingLong] = useState(false);

	useEffect(() => {
		if (transfer?.status !== 'connecting') {
			setWaitingLong(false);
			return;
		}
		const timer = setTimeout(() => setWaitingLong(true), NO_PEER_HINT_AFTER_MS);
		return () => clearTimeout(timer);
	}, [transfer?.status]);

	const size = share.size != null ? formatBytes(share.size) : null;
	const percent = Math.floor((transfer?.progress ?? 0) * 100);

	let status: React.ReactNode;
	let actions: React.ReactNode = null;
	if (!transfer) {
		status = isMine ? (
			<Trans>You shared this peer-to-peer. It's available while the tab you shared it from stays open.</Trans>
		) : (
			<Trans>Shared peer-to-peer. The sender needs to have Sparkcord open.</Trans>
		);
		actions = (
			<Button small onClick={() => void startDownload(share.magnet, share.infoHash)}>
				<Trans>Download</Trans>
			</Button>
		);
	} else if (transfer.status === 'seeding') {
		status =
			transfer.peers > 0 ? (
				<Trans>
					Sharing · {transfer.peers} connected · {formatBytes(transfer.uploadSpeed)}/s
				</Trans>
			) : (
				<Trans>Sharing. Keep Sparkcord open until people have downloaded it.</Trans>
			);
		actions = (
			<Button small variant="secondary" onClick={() => stopTransfer(share.infoHash)}>
				<Trans>Stop sharing</Trans>
			</Button>
		);
	} else if (transfer.status === 'connecting') {
		status = waitingLong ? (
			<Trans>Can't reach the sender. They may have closed Sparkcord; this keeps trying.</Trans>
		) : (
			<Trans>Connecting to the sender…</Trans>
		);
		actions = (
			<Button small variant="secondary" onClick={() => stopTransfer(share.infoHash)}>
				<Trans>Cancel</Trans>
			</Button>
		);
	} else if (transfer.status === 'downloading') {
		status = (
			<Trans>
				Downloading {percent}% · {formatBytes(transfer.downloadSpeed)}/s
			</Trans>
		);
		actions = (
			<Button small variant="secondary" onClick={() => stopTransfer(share.infoHash)}>
				<Trans>Cancel</Trans>
			</Button>
		);
	} else if (transfer.status === 'done') {
		status = <Trans>Downloaded. Also sharing it on while this tab is open.</Trans>;
		actions = (
			<>
				<Button small onClick={() => void saveDownload(share.infoHash)}>
					<Trans>Save</Trans>
				</Button>
				<Button small variant="secondary" onClick={() => stopTransfer(share.infoHash)}>
					<Trans>Remove</Trans>
				</Button>
			</>
		);
	} else {
		status = <Trans>The transfer failed: {transfer.error ?? 'unknown error'}</Trans>;
		actions = (
			<Button small variant="secondary" onClick={() => stopTransfer(share.infoHash)}>
				<Trans>Dismiss</Trans>
			</Button>
		);
	}

	const showBar = transfer && (transfer.status === 'downloading' || transfer.status === 'connecting');

	return (
		<div className={styles.card}>
			<div className={styles.icon} aria-hidden="true">
				<ShareNetworkIcon size={24} weight="duotone" />
			</div>
			<div className={styles.body}>
				<div className={styles.name} title={share.name}>
					{share.name}
				</div>
				<div className={styles.meta}>
					{size && <span>{size} · </span>}
					<span>{status}</span>
				</div>
				{showBar && (
					<div className={styles.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
						<div className={styles.barFill} style={{width: `${percent}%`}} />
					</div>
				)}
			</div>
			{actions && <div className={styles.actions}>{actions}</div>}
		</div>
	);
}
