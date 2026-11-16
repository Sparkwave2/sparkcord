// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: a small warning mark after a message that was sent on a slow connection.
// Off unless the viewer turns it on (Settings > Appearance > Messages).

import styles from '@app/features/latency/MessageLatencyMark.module.css';
import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {useLingui} from '@lingui/react/macro';
import {WarningIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

export const MessageLatencyMark = observer(function MessageLatencyMark({latencyMs}: {latencyMs: number | null}) {
	const {t} = useLingui();
	if (latencyMs === null || !SparkcordPrefs.get('showLatencyWarnings')) return null;
	const label = t`Sent on a slow connection (${latencyMs} ms). This message may have arrived late.`;
	return (
		<Tooltip text={label}>
			<span className={styles.mark} role="img" aria-label={label} data-flx="sparkcord.message-latency-mark">
				<WarningIcon weight="fill" aria-hidden="true" />
			</span>
		</Tooltip>
	);
});
