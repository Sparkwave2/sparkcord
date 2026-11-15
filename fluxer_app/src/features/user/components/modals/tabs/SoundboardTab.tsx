// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: Settings > Soundboard. Your personal sounds (playable in any voice channel)
// and the volume for everyone's soundboard sounds.

import Soundboard from '@app/features/soundboard/Soundboard';
import {SoundboardVolumeSlider, SoundManager} from '@app/features/soundboard/SoundManager';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import styles from '@app/features/user/components/modals/tabs/PersonalExpressionsTab.module.css';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect} from 'react';

const MAX_PERSONAL_SOUNDS = 50;

const SoundboardTab: React.FC = observer(() => {
	const {t} = useLingui();
	useEffect(() => {
		Soundboard.loadPersonal().catch(() => ToastCommands.error(t`Couldn't load your sounds.`));
	}, [t]);
	return (
		<div className={styles.container}>
			<section className={styles.section}>
				<h2 className={styles.heading}>
					<Trans>Soundboard</Trans>
				</h2>
				<p className={styles.hint}>
					<Trans>
						Play short sounds for everyone in your voice channel from the speaker button in the voice panel (or
						the "Toggle the soundboard" keybind). Your personal sounds work in any voice channel; communities can
						have their own sounds too.
					</Trans>
				</p>
			</section>
			<section className={styles.section}>
				<h3 className={styles.subheading}>
					<Trans>Soundboard volume</Trans>
				</h3>
				<p className={styles.hint}>
					<Trans>How loud other people's (and your own) soundboard sounds play for you.</Trans>
				</p>
				<SoundboardVolumeSlider />
			</section>
			<section className={styles.section}>
				<h3 className={styles.subheading}>
					<Trans>Your sounds</Trans>
				</h3>
				<SoundManager
					sounds={Soundboard.personal}
					guildId={null}
					max={MAX_PERSONAL_SOUNDS}
					canAdd
					canEditSound={() => true}
				/>
			</section>
		</div>
	);
});

export default SoundboardTab;
