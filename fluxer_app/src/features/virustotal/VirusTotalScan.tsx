// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: starting a VirusTotal scan of an attachment, shared by the attachment
// right-click menu and the badge. Looks the file up by hash first; when VirusTotal has
// never seen it, asks (with a warning) before uploading the file.

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import VirusTotal, {type VirusTotalError} from '@app/features/virustotal/VirusTotal';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {Trans} from '@lingui/react/macro';

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

export interface ScanTarget {
	message: Message;
	attachmentId: string;
	fileName: string;
}

/** Checks an attachment with VirusTotal; upload sends the file itself (after the user agreed). */
export async function scanWithVirusTotal(i18n: I18n, target: ScanTarget, upload = false): Promise<void> {
	try {
		const result = await VirusTotal.scan(target.message.channelId, target.message.id, target.attachmentId, upload);
		if (result.error) ToastCommands.error(i18n._(ERRORS[result.error] ?? ERRORS.failed));
		else if (!upload && result.scan?.status === 'unknown') confirmVirusTotalUpload(i18n, target);
	} catch {
		ToastCommands.error(i18n._(ERRORS.failed));
	}
}

/** Warns that the file will be shared with VirusTotal, and uploads it if the user agrees. */
export function confirmVirusTotalUpload(i18n: I18n, target: ScanTarget): void {
	const {fileName} = target;
	ModalCommands.push(
		modal(() => (
			<ConfirmModal
				title={<Trans>Upload to VirusTotal?</Trans>}
				description={
					<Trans>
						VirusTotal has never seen <strong>{fileName}</strong>. To scan it, the file will be uploaded to
						VirusTotal, which shares uploaded files with security companies and keeps them. Don't upload anything
						private.
					</Trans>
				}
				primaryText={<Trans>Upload and scan</Trans>}
				primaryVariant="primary"
				onPrimary={() => scanWithVirusTotal(i18n, target, true)}
				data-flx="virustotal.confirm-upload"
			/>
		)),
	);
}
