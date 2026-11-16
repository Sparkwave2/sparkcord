// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: tells desktop app users when the download page offers a newer version
// (see fluxer_desktop SparkcordUpdateCheck.ts). A small card in the corner with a
// button that opens the download page; "Later" hides it until the next version.
// Renders nothing on the web or in a desktop build without the check.

import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import styles from '@app/features/sparkcord_update/UpdateNotice.module.css';
import {getElectronAPI, openExternalUrl} from '@app/features/ui/utils/NativeUtils';
import type {SparkcordUpdateInfo} from '@app/types/electron.d';
import {Trans} from '@lingui/react/macro';
import {ArrowCircleUpIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

const FIRST_CHECK_MS = 20_000;
const RECHECK_MS = 3 * 60 * 60 * 1000;

export const UpdateNotice = observer(function UpdateNotice() {
	const [info, setInfo] = useState<SparkcordUpdateInfo | null>(null);

	useEffect(() => {
		const check = getElectronAPI()?.sparkcordUpdateCheck;
		if (!check) return;
		let mounted = true;
		const run = () => {
			void check()
				.then((next) => {
					if (mounted) setInfo(next);
				})
				.catch(() => {});
		};
		const first = window.setTimeout(run, FIRST_CHECK_MS);
		const timer = window.setInterval(run, RECHECK_MS);
		return () => {
			mounted = false;
			window.clearTimeout(first);
			window.clearInterval(timer);
		};
	}, []);

	if (!info?.available || !info.latest) return null;
	if (SparkcordPrefs.get('dismissedUpdateVersion') === info.latest) return null;
	const {latest, current, notes, url} = info;

	return (
		<div className={styles.card} role="status">
			<ArrowCircleUpIcon className={styles.icon} size={28} weight="fill" />
			<div className={styles.text}>
				<span className={styles.title}>
					<Trans>Sparkcord {latest} is available</Trans>
				</span>
				<span className={styles.detail}>{notes || <Trans>You have version {current}.</Trans>}</span>
			</div>
			<div className={styles.buttons}>
				<button type="button" className={styles.primary} onClick={() => void openExternalUrl(url)}>
					<Trans>Download</Trans>
				</button>
				<button type="button" className={styles.later} onClick={() => SparkcordPrefs.set('dismissedUpdateVersion', latest)}>
					<Trans>Later</Trans>
				</button>
			</div>
		</div>
	);
});
