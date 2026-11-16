// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the desktop app's "block ads and trackers" switch (Settings > Desktop).
// The blocking itself lives in the desktop shell (fluxer_desktop SparkcordAdBlock.ts);
// this only shows and changes its state. Renders nothing on the web or in a desktop
// build that has no ad blocking.

import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import type {SparkcordAdBlockStatus} from '@app/types/electron.d';
import {Trans} from '@lingui/react/macro';
import {useEffect, useState} from 'react';

export function AdBlockSwitch() {
	const [status, setStatus] = useState<SparkcordAdBlockStatus | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let mounted = true;
		const load = () => {
			void getElectronAPI()
				?.sparkcordAdBlockStatus?.()
				.then((next) => {
					if (mounted) setStatus(next);
				})
				.catch(() => {});
		};
		load();
		// Keeps the "blocked" count and the "downloading" note current while the tab is open.
		const timer = window.setInterval(load, 5000);
		return () => {
			mounted = false;
			window.clearInterval(timer);
		};
	}, []);

	if (status === null) return null;
	const blocked = status.blocked;

	const change = async (value: boolean) => {
		setBusy(true);
		try {
			const next = await getElectronAPI()?.sparkcordAdBlockSetEnabled?.(value);
			if (next) setStatus(next);
		} catch {
			// The switch keeps showing the old state.
		}
		setBusy(false);
	};

	return (
		<Switch
			label={<Trans>Block ads and trackers</Trans>}
			description={
				!status.enabled ? (
					<Trans>
						Blocks ads and trackers in embedded content such as YouTube players, using uBlock Origin's filter lists.
					</Trans>
				) : !status.ready ? (
					<Trans>
						Blocks ads and trackers in embedded content such as YouTube players, using uBlock Origin's filter lists.
						Downloading the filter lists…
					</Trans>
				) : (
					<Trans>
						Blocks ads and trackers in embedded content such as YouTube players, using uBlock Origin's filter lists.
						Blocked since the app started: {blocked}
					</Trans>
				)
			}
			value={status.enabled}
			disabled={busy}
			onChange={(value) => void change(value)}
		/>
	);
}
