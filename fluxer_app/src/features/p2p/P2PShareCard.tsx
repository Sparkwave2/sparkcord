// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The card shown for a peer-to-peer file share message: file name and size, and
// Download / progress / Save for receivers, or sharing status for the sender.

import Authentication from '@app/features/auth/state/Authentication';
import {
	cancelPreparing,
	saveDownload,
	startDownload,
	stopTransfer,
	usePreparing,
	useTransfer,
} from '@app/features/p2p/P2PClient';
import styles from '@app/features/p2p/P2PShareCard.module.css';
import {formatBytes, type P2PShareInfo} from '@app/features/p2p/P2PShare';
import {Button} from '@app/features/ui/button/Button';
import {Trans} from '@lingui/react/macro';
import {ShareNetworkIcon} from '@phosphor-icons/react';
import type React from 'react';
import {useEffect, useState} from 'react';

const NO_PEER_HINT_AFTER_MS = 15_000;

export default function P2PShareCard({share, authorId}: {share: P2PShareInfo; authorId: string}) {
	if (share.pendingId) return <PreparingCard share={share} pendingId={share.pendingId} />;
	return <ShareCard share={share} authorId={authorId} />;
}

function formatElapsed(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** The sender's placeholder while WebTorrent reads, hashes and stores the file. */
function PreparingCard({share, pendingId}: {share: P2PShareInfo; pendingId: string}) {
	const prep = usePreparing(pendingId);
	const [, setTick] = useState(0);
	useEffect(() => {
		if (!prep) return;
		const timer = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(timer);
	}, [prep]);
	const size = share.size != null ? formatBytes(share.size) : null;
	const elapsed = prep ? formatElapsed(Date.now() - prep.since) : null;
	// WebTorrent reads the whole file twice: quickly to hash it, then more slowly to
	// store the copy it shares from. Progress is bytes read out of both passes; before
	// the first bytes the bar is indeterminate.
	const readPercent =
		prep && prep.phase !== 'queued' && prep.size > 0 && prep.bytesRead > 0
			? Math.min(99, Math.floor((prep.bytesRead / (2 * prep.size)) * 100))
			: null;

	let status: React.ReactNode;
	if (!prep) status = <Trans>Preparing to share…</Trans>;
	else if (prep.phase === 'queued') status = <Trans>Waiting for the files before it…</Trans>;
	else if (readPercent !== null) status = <Trans>Getting it ready to share: {readPercent}% ({elapsed})</Trans>;
	else status = <Trans>Getting it ready to share ({elapsed})…</Trans>;

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
				{readPercent !== null ? (
					<div className={styles.bar} role="progressbar" aria-valuenow={readPercent} aria-valuemin={0} aria-valuemax={100}>
						<div className={styles.barFill} style={{width: `${readPercent}%`}} />
					</div>
				) : (
					<div className={styles.bar} role="progressbar" aria-busy="true">
						<div className={styles.barIndeterminate} />
					</div>
				)}
			</div>
			{prep && (
				<div className={styles.actions}>
					<Button small variant="secondary" onClick={() => cancelPreparing(pendingId)}>
						<Trans>Cancel</Trans>
					</Button>
				</div>
			)}
		</div>
	);
}

function ShareCard({share, authorId}: {share: P2PShareInfo; authorId: string}) {
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
