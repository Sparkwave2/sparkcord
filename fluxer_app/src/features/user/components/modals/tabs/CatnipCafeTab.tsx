// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: Settings > Catnip Café. Sound and display choices for the idle cat game (kept on
// this device), and the 3 save slots (kept on the server) to switch between or delete.

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {SettingsSection} from '@app/features/app/components/dialogs/shared/SettingsSection';
import {SettingsTabContainer} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import Cafe, {type SlotSummary, type SlotsInfo} from '@app/features/catnip_cafe/CafeEngine';
import {formatDuration, formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import {type CafePrefsData, cafePrefs, type NumberFormat} from '@app/features/catnip_cafe/CafePrefs';
import {cafeSound} from '@app/features/catnip_cafe/CafeSound';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Button} from '@app/features/ui/button/Button';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {Slider} from '@app/features/ui/components/Slider';
import {RadioGroup, type RadioOption} from '@app/features/ui/radio_group/RadioGroup';
import styles from '@app/features/user/components/modals/tabs/CatnipCafeTab.module.css';
import {Trans, useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

const PrefSwitch = observer(function PrefSwitch({
	pref,
	label,
	description,
}: {
	pref: Exclude<keyof CafePrefsData, 'numberFormat'>;
	label: React.ReactNode;
	description: React.ReactNode;
}) {
	return (
		<Switch
			label={label}
			description={description}
			value={cafePrefs[pref]}
			onChange={(value) => cafePrefs.set(pref, value)}
			data-flx={`user.catnip-cafe-tab.switch.${pref}`}
		/>
	);
});

const SlotCard = observer(function SlotCard({
	summary,
	active,
	busy,
	onSwitch,
	onDelete,
}: {
	summary: SlotSummary;
	active: boolean;
	busy: boolean;
	onSwitch: () => void;
	onDelete: () => void;
}) {
	const {t} = useLingui();
	const empty = summary.updated_at === null;
	// The slot being played shows its live numbers rather than the last saved ones.
	const purrs = active && Cafe.loaded ? Cafe.state.lifetimeAll : summary.purrs;
	const lives = active && Cafe.loaded ? Cafe.state.livesEarned : summary.lives;
	return (
		<div className={clsx(styles.slot, active && styles.slotActive)} data-flx="user.catnip-cafe-tab.slot">
			<div className={styles.slotHeader}>
				<span className={styles.slotName}>{t`Slot ${summary.slot}`}</span>
				{active && <span className={styles.badge}>{t`Playing`}</span>}
			</div>
			{empty && !(active && Cafe.loaded) ? (
				<p className={styles.slotEmpty}>{t`Empty. Playing it starts a brand new café.`}</p>
			) : (
				<div className={styles.slotStats}>
					<span>{t`🐾 ${formatPurrs(purrs)} purrs in total`}</span>
					<span>{t`🐈 ${lives} Lives`}</span>
					{summary.updated_at !== null && (
						<span className={styles.slotWhen}>
							{t`Last saved ${formatDuration(Math.max(0, Date.now() - summary.updated_at))} ago`}
						</span>
					)}
				</div>
			)}
			<div className={styles.slotActions}>
				<Button
					variant="primary"
					small={true}
					disabled={active || busy}
					onClick={onSwitch}
					data-flx="user.catnip-cafe-tab.button.switch-slot"
				>
					{active ? t`Playing` : t`Play this slot`}
				</Button>
				<Button
					variant="danger"
					small={true}
					disabled={busy || (empty && !active)}
					onClick={onDelete}
					data-flx="user.catnip-cafe-tab.button.delete-slot"
				>
					{t`Delete`}
				</Button>
			</div>
		</div>
	);
});

const CatnipCafeTab: React.FC = observer(() => {
	const {t} = useLingui();
	const [slots, setSlots] = useState<SlotsInfo | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		try {
			setSlots(await Cafe.listSlots());
		} catch {
			ToastCommands.error(t`Couldn't load your café saves.`);
		}
	}, [t]);
	useEffect(() => {
		void refresh();
	}, [refresh]);

	const run = async (action: () => Promise<SlotsInfo>, done: string) => {
		setBusy(true);
		try {
			setSlots(await action());
			ToastCommands.success(done);
		} catch {
			ToastCommands.error(t`That didn't work. Try again in a moment.`);
			void refresh();
		} finally {
			setBusy(false);
		}
	};

	const switchTo = (slot: number) => void run(() => Cafe.switchSlot(slot), t`Now playing slot ${slot}.`);

	const confirmDelete = (slot: number, active: boolean) => {
		ModalCommands.push(
			modal(() => (
				<ConfirmModal
					title={t`Delete slot ${slot}?`}
					description={
						active
							? t`This erases everything in slot ${slot}, the one you're playing, and starts it over as a new café. It can't be undone.`
							: t`This erases everything in slot ${slot}. It can't be undone.`
					}
					primaryText={t`Delete`}
					primaryVariant="danger"
					onPrimary={() => run(() => Cafe.deleteSlot(slot), t`Slot ${slot} deleted.`)}
					data-flx="user.catnip-cafe-tab.confirm-modal.delete-slot"
				/>
			)),
		);
	};

	// Each style shows how it writes the same two numbers.
	const example = (format: NumberFormat) =>
		`${formatPurrs(1_234_567, format)} · ${formatPurrs(45_600_000_000_000, format)}`;
	const numberOptions: ReadonlyArray<RadioOption<NumberFormat>> = [
		{value: 'short', name: t`Short`, desc: example('short')},
		{value: 'long', name: t`Long words`, desc: example('long')},
		{value: 'full', name: t`Full numbers`, desc: example('full')},
		{value: 'scientific', name: t`Scientific`, desc: example('scientific')},
		{value: 'engineering', name: t`Engineering`, desc: example('engineering')},
	];

	const volume = Math.round(cafeSound.volume * 100);
	return (
		<SettingsTabContainer data-flx="user.catnip-cafe-tab.settings-tab-container">
			<SettingsSection
				id="catnip-cafe-sound"
				title={<Trans>Sound</Trans>}
				data-flx="user.catnip-cafe-tab.section.sound"
			>
				<Switch
					label={<Trans>Café sounds</Trans>}
					description={<Trans>Play the café's sound effects.</Trans>}
					value={!cafeSound.muted}
					onChange={(value) => cafeSound.setMuted(!value)}
					data-flx="user.catnip-cafe-tab.switch.sounds"
				/>
				<div className={styles.volume}>
					<span className={styles.volumeLabel}>
						<Trans>Volume</Trans>
					</span>
					<Slider
						defaultValue={volume}
						factoryDefaultValue={60}
						minValue={0}
						maxValue={100}
						step={1}
						markers={[0, 25, 50, 75, 100]}
						stickToMarkers={false}
						onMarkerRender={(value) => `${value}%`}
						onValueRender={(value) => `${value}%`}
						onValueChange={(value) => cafeSound.setVolume(value / 100)}
						ariaLabel={t`Café volume`}
					/>
				</div>
				<PrefSwitch
					pref="petSound"
					label={<Trans>Petting sound</Trans>}
					description={<Trans>Play a sound each time you pet the cat.</Trans>}
				/>
			</SettingsSection>
			<SettingsSection
				id="catnip-cafe-visuals"
				title={<Trans>Visuals</Trans>}
				data-flx="user.catnip-cafe-tab.section.visuals"
			>
				<PrefSwitch
					pref="catAnimations"
					label={<Trans>Cat animations</Trans>}
					description={<Trans>Blinking, ear twitches, the swishing tail and eyes that follow your pointer.</Trans>}
				/>
				<PrefSwitch
					pref="particles"
					label={<Trans>Petting effects</Trans>}
					description={<Trans>Hearts, paw prints and floating numbers when you pet the cat.</Trans>}
				/>
				<PrefSwitch
					pref="confetti"
					label={<Trans>Confetti</Trans>}
					description={<Trans>Confetti when you unlock an achievement (the banner still shows).</Trans>}
				/>
				<PrefSwitch
					pref="rollingNumbers"
					label={<Trans>Rolling numbers</Trans>}
					description={<Trans>Big changes to your purrs count up instead of jumping straight to the new number.</Trans>}
				/>
			</SettingsSection>
			<SettingsSection
				id="catnip-cafe-numbers"
				title={<Trans>Numbers</Trans>}
				description={<Trans>How big numbers are written in the café and on shared café cards.</Trans>}
				data-flx="user.catnip-cafe-tab.section.numbers"
			>
				<RadioGroup
					aria-label={t`Number style`}
					options={numberOptions}
					value={cafePrefs.numberFormat}
					onChange={(value) => cafePrefs.set('numberFormat', value)}
				/>
			</SettingsSection>
			<SettingsSection
				id="catnip-cafe-saves"
				title={<Trans>Save slots</Trans>}
				description={
					<Trans>
						You have 3 separate cafés. The one you play is saved automatically, and only it counts on leaderboards
						and your profile.
					</Trans>
				}
				data-flx="user.catnip-cafe-tab.section.saves"
			>
				{slots === null ? (
					<p className={styles.loading}>
						<Trans>Loading your saves…</Trans>
					</p>
				) : (
					<div className={styles.slots}>
						{slots.slots.map((summary) => {
							const active = summary.slot === slots.active;
							return (
								<SlotCard
									key={summary.slot}
									summary={summary}
									active={active}
									busy={busy}
									onSwitch={() => switchTo(summary.slot)}
									onDelete={() => confirmDelete(summary.slot, active)}
								/>
							);
						})}
					</div>
				)}
			</SettingsSection>
		</SettingsTabContainer>
	);
});

export default CatnipCafeTab;
