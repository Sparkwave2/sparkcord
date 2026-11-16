// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: "Scan with VirusTotal" in an attachment's right-click menu. Shown when the
// server has a VirusTotal key and the attachment has no result yet (or VirusTotal didn't
// know the file, in which case it offers the upload).

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import VirusTotal from '@app/features/virustotal/VirusTotal';
import {confirmVirusTotalUpload, scanWithVirusTotal} from '@app/features/virustotal/VirusTotalScan';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

const SCAN = msg({message: 'Scan with VirusTotal', comment: 'Attachment right-click menu item.'});
const UPLOAD = msg({
	message: 'Upload to VirusTotal for a scan',
	comment: 'Attachment right-click menu item, shown when VirusTotal has never seen the file.',
});

interface VirusTotalMenuItemProps {
	message: Message;
	attachmentId: string;
	fileName: string;
	onClose: () => void;
}

export const VirusTotalMenuItem = observer(function VirusTotalMenuItem({
	message,
	attachmentId,
	fileName,
	onClose,
}: VirusTotalMenuItemProps) {
	const {i18n} = useLingui();
	useEffect(() => {
		void VirusTotal.ensureConfig();
		VirusTotal.request(attachmentId);
	}, [attachmentId]);
	if (!VirusTotal.canScan(attachmentId)) return null;
	const unknown = VirusTotal.scans.get(attachmentId)?.status === 'unknown';
	const target = {message, attachmentId, fileName};
	return (
		<MenuItem
			onClick={() => {
				onClose();
				if (unknown) confirmVirusTotalUpload(i18n, target);
				else void scanWithVirusTotal(i18n, target);
			}}
			data-flx="virustotal.menu-item.scan"
		>
			{i18n._(unknown ? UPLOAD : SCAN)}
		</MenuItem>
	);
});
