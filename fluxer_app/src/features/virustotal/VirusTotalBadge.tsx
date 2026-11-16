// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the VirusTotal line under an attachment. Shows the stored result for
// everyone (with a link to the full report), or a "Scan with VirusTotal" button. A scan
// looks the file up by hash first; only when VirusTotal has never seen it does it offer,
// after a warning, to upload the file for a full scan.

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import VirusTotal, {type VirusTotalError, virusTotalReportUrl} from '@app/features/virustotal/VirusTotal';
import styles from '@app/features/virustotal/VirusTotalBadge.module.css';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {ShieldCheckIcon, ShieldIcon, ShieldWarningIcon, SpinnerGapIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useRef, useState} from 'react';

const PENDING_POLL_MS = 20_000;

const ERRORS: Record<VirusTotalError, ReturnType<typeof msg>> = {
	not_configured: msg({
		message: 'VirusTotal scanning is not set up on this server.',
		comment: 'Error toast after trying to scan a file with VirusTotal.',
	}),
	not_found: msg({message: "Couldn't find this file to scan it.", comment: 'Error toast after a VirusTotal scan.'}),
	too_large: msg({
		message: 'This file is too large to upload to VirusTotal (32 MB at most).',
		comment: 'Error toast after a VirusTotal scan.',
	}),
	rate_limited: msg({
		message: 'VirusTotal is busy right now. Try again in a minute.',
		comment: 'Error toast after a VirusTotal scan: the instance used up its VirusTotal quota for now.',
	}),
	invalid_key: msg({
		message: "This server's VirusTotal key no longer works. Ask an admin to check it.",
		comment: 'Error toast after a VirusTotal scan.',
	}),
	failed: msg({message: "Couldn't scan this file. Try again later.", comment: 'Error toast after a VirusTotal scan.'}),
};

function showError(i18n: I18n, error: unknown): void {
	const code = typeof error === 'string' && error in ERRORS ? (error as VirusTotalError) : 'failed';
	ToastCommands.error(i18n._(ERRORS[code]));
}

interface VirusTotalBadgeProps {
	attachmentId: string;
	fileName: string;
	message: Message | undefined;
	/** Offer a scan for files that weren't scanned yet. */
	showScanButton: boolean;
}

export const VirusTotalBadge = observer(function VirusTotalBadge({
	attachmentId,
	fileName,
	message,
	showScanButton,
}: VirusTotalBadgeProps) {
	const {i18n} = useLingui();
	const [busy, setBusy] = useState(false);
	const configured = VirusTotal.configured;
	const scan = VirusTotal.scans.get(attachmentId);

	useEffect(() => {
		void VirusTotal.ensureConfig();
	}, []);
	useEffect(() => {
		if (configured && message) VirusTotal.request(attachmentId);
	}, [configured, message, attachmentId]);
	useEffect(() => {
		if (scan?.status !== 'pending') return;
		const timer = setInterval(() => VirusTotal.request(attachmentId), PENDING_POLL_MS);
		return () => clearInterval(timer);
	}, [scan?.status, attachmentId]);

	const runRef = useRef<(upload: boolean) => Promise<void>>(async () => {});

	const confirmUpload = () => {
		ModalCommands.push(
			modal(() => (
				<ConfirmModal
					title={<Trans>Upload to VirusTotal?</Trans>}
					description={
						<Trans>
							VirusTotal has never seen <strong>{fileName}</strong>. To scan it, the file will be uploaded to
							VirusTotal, which shares uploaded files with security companies and keeps them. Don't upload
							anything private.
						</Trans>
					}
					primaryText={<Trans>Upload and scan</Trans>}
					primaryVariant="primary"
					onPrimary={() => runRef.current(true)}
					data-flx="virustotal.confirm-upload"
				/>
			)),
		);
	};

	const run = async (upload: boolean) => {
		if (!message) return;
		setBusy(true);
		try {
			const result = await VirusTotal.scan(message.channelId, message.id, attachmentId, upload);
			if (result.error) showError(i18n, result.error);
			else if (!upload && result.scan?.status === 'unknown') confirmUpload();
		} catch {
			showError(i18n, 'failed');
		} finally {
			setBusy(false);
		}
	};
	runRef.current = run;

	if (!message || !configured) return null;

	if (!scan) {
		if (!showScanButton) return null;
		return (
			<div className={styles.row}>
				<button type="button" className={styles.action} onClick={() => run(false)} disabled={busy}>
					{busy ? <SpinnerGapIcon size={14} className={styles.spin} /> : <ShieldIcon size={14} weight="bold" />}
					{busy ? <Trans>Checking with VirusTotal…</Trans> : <Trans>Scan with VirusTotal</Trans>}
				</button>
			</div>
		);
	}

	if (scan.status === 'pending') {
		return (
			<div className={styles.row}>
				<span className={styles.badge}>
					<SpinnerGapIcon size={14} className={styles.spin} />
					<Trans>VirusTotal is scanning this file…</Trans>
				</span>
			</div>
		);
	}

	if (scan.status === 'unknown') {
		return (
			<div className={styles.row}>
				<span className={styles.badge}>
					<ShieldIcon size={14} weight="bold" />
					<Trans>Not known to VirusTotal</Trans>
				</span>
				<button type="button" className={styles.action} onClick={confirmUpload} disabled={busy}>
					{busy ? <SpinnerGapIcon size={14} className={styles.spin} /> : null}
					<Trans>Upload for a scan</Trans>
				</button>
			</div>
		);
	}

	const flagged = scan.status === 'flagged';
	const detections = scan.malicious + scan.suspicious;
	return (
		<div className={styles.row}>
			<a
				className={clsx(styles.badge, styles.link, flagged ? styles.flagged : styles.clean)}
				href={virusTotalReportUrl(scan.sha256)}
				target="_blank"
				rel="noopener noreferrer"
				title={i18n._(msg({message: 'Open the full VirusTotal report', comment: 'Tooltip of a VirusTotal result badge.'}))}
			>
				{flagged ? <ShieldWarningIcon size={14} weight="fill" /> : <ShieldCheckIcon size={14} weight="fill" />}
				{flagged ? (
					<Trans>
						VirusTotal: flagged by {detections} of {scan.total}
					</Trans>
				) : (
					<Trans>VirusTotal: clean · 0/{scan.total}</Trans>
				)}
			</a>
		</div>
	);
});
