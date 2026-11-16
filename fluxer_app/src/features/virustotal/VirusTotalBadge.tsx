// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the VirusTotal line under an attachment. Shown only once the file was
// scanned (or while a scan runs): the result for everyone, with a link to the full
// report. Scans start from the attachment's right-click menu (VirusTotalMenuItem).

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import VirusTotal, {virusTotalReportUrl} from '@app/features/virustotal/VirusTotal';
import styles from '@app/features/virustotal/VirusTotalBadge.module.css';
import {confirmVirusTotalUpload} from '@app/features/virustotal/VirusTotalScan';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {ShieldCheckIcon, ShieldIcon, ShieldWarningIcon, SpinnerGapIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

const PENDING_POLL_MS = 20_000;
const REPORT_TOOLTIP = msg({message: 'Open the full VirusTotal report', comment: 'Tooltip of a VirusTotal result badge.'});

interface VirusTotalBadgeProps {
	attachmentId: string;
	fileName: string;
	message: Message | undefined;
	/** Name the file in the badge, for attachments shown in a grid where it isn't next to its file. */
	showFileName?: boolean;
}

export const VirusTotalBadge = observer(function VirusTotalBadge({
	attachmentId,
	fileName,
	message,
	showFileName = false,
}: VirusTotalBadgeProps) {
	const {i18n} = useLingui();
	const configured = VirusTotal.configured;
	const scan = VirusTotal.scans.get(attachmentId);
	const checking = VirusTotal.checking.has(attachmentId);

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

	if (!message || !configured) return null;
	const name = showFileName ? <span className={styles.fileName}>{fileName}</span> : null;

	if (checking || scan?.status === 'pending') {
		return (
			<div className={styles.row}>
				<span className={styles.badge}>
					<SpinnerGapIcon size={14} className={styles.spin} />
					{name}
					{checking ? <Trans>Checking with VirusTotal…</Trans> : <Trans>VirusTotal is scanning this file…</Trans>}
				</span>
			</div>
		);
	}

	if (!scan) return null;

	if (scan.status === 'unknown') {
		return (
			<div className={styles.row}>
				<span className={styles.badge}>
					<ShieldIcon size={14} weight="bold" />
					{name}
					<Trans>Not known to VirusTotal</Trans>
				</span>
				<button
					type="button"
					className={styles.action}
					onClick={() => confirmVirusTotalUpload(i18n, {message, attachmentId, fileName})}
				>
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
				title={i18n._(REPORT_TOOLTIP)}
			>
				{flagged ? <ShieldWarningIcon size={14} weight="fill" /> : <ShieldCheckIcon size={14} weight="fill" />}
				{name}
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
