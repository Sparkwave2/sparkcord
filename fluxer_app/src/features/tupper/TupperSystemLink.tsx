// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: a "System" row on profile cards. Shown only when the person has tuppers
// and lets you see them (or it is your own profile). Clicking it opens the system window.

import Authentication from '@app/features/auth/state/Authentication';
import {loadTupperSystem, openTupperSystem, type TupperSystemWire} from '@app/features/tupper/TupperSystem';
import styles from '@app/features/tupper/TupperSystemLink.module.css';
import {Plural, Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

export const TupperSystemLink = observer(function TupperSystemLink({userId}: {userId: string}) {
	const [system, setSystem] = useState<TupperSystemWire | null>(null);
	const isOwn = Authentication.currentUserId === userId;

	useEffect(() => {
		let cancelled = false;
		setSystem(null);
		void loadTupperSystem(userId).then((result) => {
			if (!cancelled) setSystem(result);
		});
		return () => {
			cancelled = true;
		};
	}, [userId]);

	if (!system || system.tuppers.length === 0) return null;
	if (system.private && !isOwn) return null;
	const count = system.tuppers.length;
	return (
		<div className={styles.container} data-flx="tupper.system-link.container">
			<span className={styles.title}>
				<Trans comment="Heading on a profile card for the person's tupper system (their proxy members)">System</Trans>
			</span>
			<button
				type="button"
				className={styles.button}
				onClick={() => openTupperSystem(userId)}
				data-flx="tupper.system-link.button"
			>
				<span className={styles.name}>
					{system.system_name || (
						<Trans comment="Button on a profile card that opens the list of the person's tuppers">View system</Trans>
					)}
				</span>
				<span className={styles.count}>
					<Plural value={count} one="# tupper" other="# tuppers" />
				</span>
			</button>
		</div>
	);
});
