// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: Settings > VirusTotal, shown only to instance admins. Saves the VirusTotal
// API key the server uses to scan attachments. The key is checked with VirusTotal before
// it is saved and is never sent back to the app.

import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Button} from '@app/features/ui/button/Button';
import {Input} from '@app/features/ui/components/form/FormInput';
import styles from '@app/features/user/components/modals/tabs/PersonalExpressionsTab.module.css';
import VirusTotal from '@app/features/virustotal/VirusTotal';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useState} from 'react';

const VirusTotalTab: React.FC = observer(() => {
	const {t} = useLingui();
	const [key, setKey] = useState('');
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		void VirusTotal.ensureConfig(true);
	}, []);

	const save = async (apiKey: string | null) => {
		setSaving(true);
		try {
			const result = await VirusTotal.saveApiKey(apiKey);
			if (result.error === 'invalid_key') {
				ToastCommands.error(t`VirusTotal didn't accept that key. Check it and try again.`);
			} else if (apiKey === null) {
				ToastCommands.success(t`VirusTotal key removed. Scanning is off.`);
			} else {
				setKey('');
				ToastCommands.success(t`VirusTotal key saved. Members can now scan attachments.`);
			}
		} catch {
			ToastCommands.error(t`Couldn't save the VirusTotal key.`);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className={styles.container}>
			<section className={styles.section}>
				<h2 className={styles.heading}>
					<Trans>VirusTotal</Trans>
				</h2>
				<p className={styles.hint}>
					<Trans>
						Lets members check attachments with VirusTotal using a "Scan with VirusTotal" button under files.
						Files are looked up by their fingerprint first; a file VirusTotal has never seen is only uploaded
						after the member confirms. Results are shown to everyone who can see the message.
					</Trans>
				</p>
				<p className={styles.hint}>
					<Trans>
						Only instance admins see this page. Get a key from your VirusTotal account (API key, under your
						profile). Free keys allow 4 lookups a minute and 500 a day.
					</Trans>
				</p>
			</section>
			<section className={styles.section}>
				<h3 className={styles.subheading}>
					{VirusTotal.configured ? <Trans>Scanning is on</Trans> : <Trans>Scanning is off</Trans>}
				</h3>
				<form
					className={styles.section}
					onSubmit={(event) => {
						event.preventDefault();
						if (key.trim()) void save(key.trim());
					}}
				>
					<Input
						type="password"
						autoComplete="off"
						label={VirusTotal.configured ? t`Replace the API key` : t`API key`}
						placeholder={VirusTotal.configured ? t`A key is saved` : t`Paste your VirusTotal API key`}
						value={key}
						onChange={(event) => setKey(event.target.value)}
						disabled={saving}
					/>
					<div className={styles.row}>
						<Button type="submit" disabled={!key.trim()} submitting={saving}>
							<Trans>Save key</Trans>
						</Button>
						{VirusTotal.configured && (
							<Button variant="danger" onClick={() => void save(null)} disabled={saving}>
								<Trans>Remove key</Trans>
							</Button>
						)}
					</div>
				</form>
			</section>
		</div>
	);
});

export default VirusTotalTab;
