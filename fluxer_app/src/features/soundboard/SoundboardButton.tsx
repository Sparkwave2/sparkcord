// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: soundboard button in the voice connection panel, plus the "now playing"
// badge shown next to a participant's name while their sound plays.

import {ComponentBus} from '@app/features/platform/utils/ComponentBus';
import Soundboard from '@app/features/soundboard/Soundboard';
import styles from '@app/features/soundboard/SoundboardButton.module.css';
import {SoundboardPopout} from '@app/features/soundboard/SoundboardPopout';
import {Popout} from '@app/features/ui/popover/PopoverPopout';
import panelStyles from '@app/features/voice/components/VoiceConnectionStatus.module.css';
import {useLingui} from '@lingui/react/macro';
import {SpeakerHighIcon, SpeakerSimpleHighIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useEffect, useRef} from 'react';

export function SoundboardButton() {
	const {t} = useLingui();
	const buttonRef = useRef<HTMLButtonElement>(null);
	// The "Toggle the soundboard" keybind opens/closes this popout.
	useEffect(() => ComponentBus.subscribe('SOUNDBOARD_TOGGLE', () => buttonRef.current?.click()), []);
	return (
		<Popout
			uniqueId="sparkcord-soundboard"
			position="top"
			offsetMainAxis={16}
			tooltip={t`Soundboard`}
			render={() => <SoundboardPopout />}
		>
			{/* The button must be the popout's direct child: the popout attaches its click handler to it. */}
			<button ref={buttonRef} type="button" className={panelStyles.controlButton} aria-label={t`Soundboard`}>
				<SpeakerHighIcon weight="fill" className={panelStyles.icon} />
			</button>
		</Popout>
	);
}

/** Shows which sound a user is playing right now (next to their name in calls). */
export const SoundboardPlayingBadge = observer(function SoundboardPlayingBadge({userId}: {userId: string}) {
	const playing = Soundboard.playing.get(userId);
	if (!playing) return null;
	return (
		<span className={styles.badge} title={playing.name}>
			<SpeakerSimpleHighIcon size={12} weight="fill" className={styles.badgeIcon} />
			<span className={styles.badgeName}>{playing.name}</span>
		</span>
	);
});
