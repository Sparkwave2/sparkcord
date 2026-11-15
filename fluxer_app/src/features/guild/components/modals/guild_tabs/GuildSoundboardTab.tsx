// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: Community settings > Soundboard. The community's sounds, which its members
// can play in its voice channels. Adding needs Create Expressions; removing others'
// sounds needs Manage Expressions.

import Authentication from '@app/features/auth/state/Authentication';
import Permission from '@app/features/permissions/state/Permission';
import Soundboard from '@app/features/soundboard/Soundboard';
import {SoundManager} from '@app/features/soundboard/SoundManager';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import styles from '@app/features/user/components/modals/tabs/PersonalExpressionsTab.module.css';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

const MAX_COMMUNITY_SOUNDS = 50;

const GuildSoundboardTab = observer(function GuildSoundboardTab({guildId}: {guildId: string}) {
	const {t} = useLingui();
	useEffect(() => {
		Soundboard.loadGuild(guildId).catch(() => ToastCommands.error(t`Couldn't load the community's sounds.`));
	}, [guildId, t]);
	const canCreate = Permission.can(Permissions.CREATE_EXPRESSIONS, {guildId});
	const canManage = Permission.can(Permissions.MANAGE_EXPRESSIONS, {guildId});
	const me = Authentication.currentUserId;
	return (
		<div className={styles.container}>
			<section className={styles.section}>
				<h2 className={styles.heading}>
					<Trans>Soundboard</Trans>
				</h2>
				<p className={styles.hint}>
					<Trans>
						Sounds every member can play in this community's voice channels, from the speaker button in the voice
						panel.
					</Trans>
				</p>
			</section>
			<SoundManager
				sounds={Soundboard.guildSounds.get(guildId) ?? null}
				guildId={guildId}
				max={MAX_COMMUNITY_SOUNDS}
				canAdd={canCreate}
				canEditSound={(sound) => canManage || (canCreate && sound.creator_id === me)}
			/>
		</div>
	);
});

export default GuildSoundboardTab;
