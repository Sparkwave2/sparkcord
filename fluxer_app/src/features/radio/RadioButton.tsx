// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: radio button in the voice connection panel. Lit while something is queued.

import Radio from '@app/features/radio/Radio';
import {RadioPopout} from '@app/features/radio/RadioPopout';
import {Popout} from '@app/features/ui/popover/PopoverPopout';
import panelStyles from '@app/features/voice/components/VoiceConnectionStatus.module.css';
import {useLingui} from '@lingui/react/macro';
import {RadioIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

export const RadioButton = observer(function RadioButton() {
	const {t} = useLingui();
	return (
		<Popout
			uniqueId="sparkcord-radio"
			position="top"
			offsetMainAxis={16}
			tooltip={t`Radio and watch together`}
			render={() => <RadioPopout />}
		>
			{/* The button must be the popout's direct child: the popout attaches its click handler to it. */}
			<button
				type="button"
				className={Radio.active ? `${panelStyles.controlButton} ${panelStyles.selected}` : panelStyles.controlButton}
				aria-label={t`Radio and watch together`}
			>
				<RadioIcon weight="fill" className={panelStyles.icon} />
			</button>
		</Popout>
	);
});
