// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/app/components/dialogs/shared/SettingsSection';
import ThemeLibrary from '@app/features/theme/state/ThemeLibrary';
import styles from '@app/features/theme_presets/PresetThemesSection.module.css';
import {activePresetId, applyPreset, turnOffPresets} from '@app/features/theme_presets/ThemePresetCommands';
import {presetImageUrl, THEME_PRESETS, type ThemePreset} from '@app/features/theme_presets/ThemePresets';
import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import {THEME_BLUR_DEFAULT_PX, THEME_BLUR_MAX_PX} from '@app/features/theme_presets/ThemeTweaks';
import {Button} from '@app/features/ui/button/Button';
import {Slider} from '@app/features/ui/components/Slider';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useState} from 'react';

const SECTION_TITLE_DESCRIPTOR = msg({
	message: 'Preset themes',
	comment: 'Title of the Sparkcord section in Settings > Themes listing ready-made themes with background images.',
});
const SECTION_DESCRIPTION_DESCRIPTOR = msg({
	message: 'Ready-made themes with a background image behind the app. Picking one adds it to Your themes.',
	comment: 'Description of the preset themes section in Settings > Themes.',
});
const IN_USE_DESCRIPTOR = msg({
	message: 'In use',
	comment: 'Badge on the preset theme card that is currently applied.',
});
const DARK_DESCRIPTOR = msg({message: 'Dark', comment: 'Tells that a preset theme is based on the dark theme.'});
const LIGHT_DESCRIPTOR = msg({message: 'Light', comment: 'Tells that a preset theme is based on the light theme.'});
const TURN_OFF_DESCRIPTOR = msg({
	message: 'Turn off preset theme',
	comment: 'Button in Settings > Themes that stops using the current preset theme.',
});
const BLUR_TITLE_DESCRIPTOR = msg({
	message: 'Background blur',
	comment: 'Label of the slider in Settings > Themes that sets how blurry the preset theme background looks.',
});
const BLUR_HELP_DESCRIPTOR = msg({
	message: 'How blurry the background image looks behind the app. 0 shows it sharp. Only changes this device.',
	comment: 'Help text of the background blur slider in Settings > Themes.',
});
const APPLY_FAILED_DESCRIPTOR = msg({
	message: "Couldn't apply that theme.",
	comment: 'Toast when applying a preset theme fails.',
});

const PresetCard: React.FC<{preset: ThemePreset; active: boolean; busy: boolean; onPick: () => void}> = observer(
	({preset, active, busy, onPick}) => {
		const {i18n} = useLingui();
		const [imageFailed, setImageFailed] = useState(false);
		return (
			<button
				type="button"
				className={clsx(styles.card, active && styles.cardActive)}
				onClick={onPick}
				disabled={busy}
				aria-pressed={active}
				data-flx={`theme-presets.card.${preset.id}`}
			>
				<span className={styles.preview} style={{backgroundImage: preset.gradient}}>
					{!imageFailed && (
						<img
							className={styles.previewImage}
							src={presetImageUrl(preset, true)}
							alt=""
							loading="lazy"
							onError={() => setImageFailed(true)}
						/>
					)}
					{active && <span className={styles.badge}>{i18n._(IN_USE_DESCRIPTOR)}</span>}
					<span className={styles.swatch} style={{background: preset.accent}} />
				</span>
				<span className={styles.body}>
					<span className={styles.name}>{preset.name}</span>
					<span className={styles.description}>{preset.description}</span>
					<span className={styles.meta}>{i18n._(preset.base === 'light' ? LIGHT_DESCRIPTOR : DARK_DESCRIPTOR)}</span>
				</span>
			</button>
		);
	},
);

export const PresetThemesSection: React.FC = observer(() => {
	const {i18n} = useLingui();
	const [busy, setBusy] = useState(false);
	// Read so the section re-renders when the library loads or changes.
	void ThemeLibrary.themes.length;
	const activeId = activePresetId();

	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} catch {
			ToastCommands.error(i18n._(APPLY_FAILED_DESCRIPTOR));
		} finally {
			setBusy(false);
		}
	};

	return (
		<SettingsSection
			id="preset-themes"
			title={i18n._(SECTION_TITLE_DESCRIPTOR)}
			description={i18n._(SECTION_DESCRIPTION_DESCRIPTOR)}
			data-flx="theme-presets.section"
		>
			<div className={styles.grid}>
				{THEME_PRESETS.map((preset) => (
					<PresetCard
						key={preset.id}
						preset={preset}
						active={activeId === preset.id}
						busy={busy}
						onPick={() => void run(() => applyPreset(preset))}
					/>
				))}
			</div>
			{activeId !== null && (
				<div className={styles.tweak}>
					<span className={styles.tweakTitle}>{i18n._(BLUR_TITLE_DESCRIPTOR)}</span>
					<span className={styles.tweakHelp}>{i18n._(BLUR_HELP_DESCRIPTOR)}</span>
					<Slider
						defaultValue={SparkcordPrefs.get('themeBlurPx')}
						factoryDefaultValue={THEME_BLUR_DEFAULT_PX}
						minValue={0}
						maxValue={THEME_BLUR_MAX_PX}
						step={1}
						markers={[0, 5, 10, 15, 20, 25, 30]}
						stickToMarkers={false}
						onMarkerRender={(value) => `${value}`}
						onValueRender={(value) => `${Math.round(value)} px`}
						onValueChange={(value) => SparkcordPrefs.set('themeBlurPx', Math.round(value))}
					/>
				</div>
			)}
			{activeId !== null && (
				<div className={styles.actions}>
					<Button variant="secondary" small onClick={() => void run(turnOffPresets)} disabled={busy}>
						{i18n._(TURN_OFF_DESCRIPTOR)}
					</Button>
				</div>
			)}
		</SettingsSection>
	);
});
