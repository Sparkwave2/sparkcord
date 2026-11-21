// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord tuppers: Settings > Tuppers list of the channels where autoproxy has a mode of its
// own (set with tp!auto there), with a button to send each back to the default.

import {Endpoints} from '@app/features/app/constants/Endpoints';
import Channels from '@app/features/channel/state/Channels';
import * as ChannelUtils from '@app/features/channel/utils/ChannelUtils';
import Guilds from '@app/features/guild/state/Guilds';
import {http} from '@app/features/platform/transport/RestTransport';
import {refreshTupperNames} from '@app/features/tupper/TupperNames';
import type {TupperWire} from '@app/features/tupper/TupperShared';
import {Button} from '@app/features/ui/button/Button';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import styles from '@app/features/user/components/modals/tabs/TuppersTab.module.css';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useState} from 'react';

interface ChannelAutoproxyWire {
	channel_id: string;
	mode: 'off' | 'front' | 'latch' | null;
	tupper_id: string | null;
	latch_tupper_id: string | null;
}

function channelLabel(channelId: string, unknown: string): string {
	const channel = Channels.getChannel(channelId);
	if (!channel) return unknown;
	if (channel.guildId) {
		const guild = Guilds.getGuild(channel.guildId);
		return guild ? `#${channel.name ?? channelId} · ${guild.name}` : `#${channel.name ?? channelId}`;
	}
	return ChannelUtils.getDMDisplayName(channel);
}

export const TupperChannelAutoproxyList = observer(function TupperChannelAutoproxyList({
	tuppers,
}: {
	tuppers: ReadonlyArray<TupperWire>;
}) {
	const {t} = useLingui();
	const [entries, setEntries] = useState<Array<ChannelAutoproxyWire> | null>(null);
	const load = useCallback(async () => {
		try {
			const response = await http.get<Array<ChannelAutoproxyWire>>(Endpoints.USER_TUPPER_AUTOPROXY_CHANNELS);
			setEntries(response.body ?? []);
		} catch {
			setEntries([]);
			ToastCommands.error(t`Couldn't load your per-channel autoproxy.`);
		}
	}, [t]);
	useEffect(() => {
		void load();
	}, [load]);

	const reset = async (channelId: string) => {
		try {
			await http.put(Endpoints.USER_TUPPER_AUTOPROXY_CHANNEL(channelId), {body: {mode: null}});
			setEntries((current) => current?.filter((entry) => entry.channel_id !== channelId) ?? null);
			void refreshTupperNames();
		} catch {
			ToastCommands.error(t`Couldn't reset that channel. Try again in a moment.`);
		}
	};

	const describe = (entry: ChannelAutoproxyWire): string => {
		if (entry.mode === 'off') return t`Off`;
		if (entry.mode === 'latch') {
			const latched = tuppers.find((tupper) => tupper.id === entry.latch_tupper_id);
			return latched ? t`Latch (now ${latched.name})` : t`Latch`;
		}
		const tupper = tuppers.find((candidate) => candidate.id === entry.tupper_id);
		return tupper ? t`Always ${tupper.name}` : t`Always one tupper`;
	};

	return (
		<div className={styles.channelAutoproxy}>
			<h4 className={styles.channelAutoproxyTitle}>
				<Trans>Channels with their own autoproxy</Trans>
			</h4>
			<p className={styles.hint}>
				<Trans>
					Type tp!auto off, tp!auto latch or tp!auto followed by a tupper's name in a channel to give it its own
					autoproxy; tp!auto default puts it back on the default above.
				</Trans>
			</p>
			{entries === null ? null : entries.length === 0 ? (
				<p className={styles.hint}>
					<Trans>None yet: every channel follows the default.</Trans>
				</p>
			) : (
				<ul className={styles.channelAutoproxyList}>
					{entries.map((entry) => (
						<li key={entry.channel_id} className={styles.channelAutoproxyRow}>
							<span className={styles.channelAutoproxyName}>
								{channelLabel(entry.channel_id, t`Unknown channel`)}
							</span>
							<span className={styles.channelAutoproxyMode}>{describe(entry)}</span>
							<Button
								variant="secondary"
								small={true}
								onClick={() => void reset(entry.channel_id)}
								data-flx="user.tuppers-tab.channel-autoproxy.reset"
							>
								{t`Use default`}
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
});
