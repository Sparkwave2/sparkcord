// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: makes a frosted theme from the user's own picture. The picture is shrunk and
// kept inside the theme; dark or light, the panel tint and the accent are worked out from
// it and can be changed here before the theme is saved and turned on.

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {
	type DerivedThemeColours,
	deriveThemeColours,
	type ProcessedImage,
	processThemeImage,
} from '@app/features/theme_presets/ImagePalette';
import styles from '@app/features/theme_presets/CustomImageThemeModal.module.css';
import {applyPreset, newCustomPresetId} from '@app/features/theme_presets/ThemePresetCommands';
import type {ThemePreset} from '@app/features/theme_presets/ThemePresets';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Spinner} from '@app/features/ui/components/Spinner';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useMemo, useState} from 'react';

const TITLE = msg({message: 'Theme from your picture', comment: 'Title of the dialog that makes a theme from an image.'});
const NAME = msg({message: 'Name', comment: 'Label of the theme name field in the theme-from-picture dialog.'});
const BASE = msg({message: 'Style', comment: 'Label of the dark/light choice in the theme-from-picture dialog.'});
const DARK = msg({message: 'Dark', comment: 'Dark option in the theme-from-picture dialog.'});
const LIGHT = msg({message: 'Light', comment: 'Light option in the theme-from-picture dialog.'});
const ACCENT = msg({
	message: 'Accent colour',
	comment: 'Label of the accent colour picker in the theme-from-picture dialog.',
});
const ACCENT_RESET = msg({
	message: 'Use the picture’s colour',
	comment: 'Button that puts back the accent colour taken from the picture.',
});
const HINT = msg({
	message: 'Colours are picked from your picture. The picture is saved inside the theme on this device.',
	comment: 'Help text in the theme-from-picture dialog.',
});
const PREVIEW_TEXT = msg({
	message: 'This is how messages will look.',
	comment: 'Sample message in the preview of the theme-from-picture dialog.',
});
const PREVIEW_BUTTON = msg({message: 'Button', comment: 'Sample button in the theme preview.'});
const CREATE = msg({message: 'Create theme', comment: 'Saves and turns on the theme made from a picture.'});
const CANCEL = msg({message: 'Cancel', comment: 'Closes the theme-from-picture dialog without saving.'});
const FAILED = msg({
	message: "Couldn't use that picture. Try a PNG, JPEG, WebP or GIF.",
	comment: 'Shown when a picture for a theme could not be read.',
});
const SAVE_FAILED = msg({message: "Couldn't save the theme.", comment: 'Toast when saving a theme from a picture fails.'});

function defaultName(file: File): string {
	const base = file.name.replace(/\.[^.]+$/, '').trim();
	return (base || 'My theme').slice(0, 40);
}

const CustomImageThemeModal = observer(function CustomImageThemeModal({file}: {file: File}) {
	const {i18n} = useLingui();
	const [processed, setProcessed] = useState<ProcessedImage | null>(null);
	const [failed, setFailed] = useState(false);
	const [name, setName] = useState(() => defaultName(file));
	const [base, setBase] = useState<'dark' | 'light'>('dark');
	const [accent, setAccent] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		processThemeImage(file).then(
			(result) => {
				if (cancelled) return;
				setProcessed(result);
				setBase(result.colours.suggestedBase);
			},
			(error) => {
				console.warn('[theme] picture failed', error);
				if (!cancelled) setFailed(true);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [file]);

	const colours: DerivedThemeColours | null = useMemo(
		() => (processed ? deriveThemeColours(processed.colours, base, accent ?? undefined) : null),
		[processed, base, accent],
	);
	const pictureAccent = useMemo(
		() => (processed ? deriveThemeColours(processed.colours, base).accent : null),
		[processed, base],
	);

	const create = async () => {
		if (!processed || !colours) return;
		const preset: ThemePreset = {
			id: newCustomPresetId(),
			name: name.trim() || defaultName(file),
			description: base === 'light' ? 'Your own picture, light.' : 'Your own picture, dark.',
			base,
			...colours,
			image: processed.dataUrl,
		};
		setSaving(true);
		try {
			await applyPreset(preset);
			ModalCommands.pop();
		} catch (error) {
			console.warn('[theme] saving failed', error);
			ToastCommands.error(i18n._(SAVE_FAILED));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal.Root size="small" centered data-flx="theme-presets.custom-modal">
			<Modal.Header title={i18n._(TITLE)} />
			<Modal.Content>
				<Modal.ContentLayout>
					{failed ? (
						<p className={styles.error}>{i18n._(FAILED)}</p>
					) : !processed || !colours ? (
						<div className={styles.loading}>
							<Spinner />
						</div>
					) : (
						<>
							<div
								className={styles.preview}
								style={{backgroundImage: `url("${processed.dataUrl}"), ${colours.gradient}`}}
							>
								<div
									className={styles.previewPanel}
									style={{
										background: `rgba(${colours.panel}, 0.72)`,
										color: base === 'light' ? '#1d1d22' : '#f2f3f5',
									}}
								>
									<span className={styles.previewName} style={{color: colours.accentLight}}>
										Sparkcord
									</span>
									<span>{i18n._(PREVIEW_TEXT)}</span>
									<span
										className={styles.previewButton}
										style={{background: colours.accent, color: colours.onAccent}}
									>
										{i18n._(PREVIEW_BUTTON)}
									</span>
								</div>
							</div>
							<p className={styles.hint}>{i18n._(HINT)}</p>
							<Input
								label={i18n._(NAME)}
								value={name}
								maxLength={40}
								onChange={(event) => setName(event.target.value)}
							/>
							<div className={styles.row}>
								<span className={styles.label}>{i18n._(BASE)}</span>
								<div className={styles.segmented} role="radiogroup">
									{(['dark', 'light'] as const).map((option) => (
										<button
											key={option}
											type="button"
											role="radio"
											aria-checked={base === option}
											className={clsx(styles.segment, base === option && styles.segmentActive)}
											onClick={() => setBase(option)}
										>
											{i18n._(option === 'dark' ? DARK : LIGHT)}
										</button>
									))}
								</div>
							</div>
							<div className={styles.row}>
								<span className={styles.label}>{i18n._(ACCENT)}</span>
								<input
									type="color"
									className={styles.colour}
									value={colours.accent}
									onChange={(event) => setAccent(event.target.value)}
									aria-label={i18n._(ACCENT)}
								/>
								{accent !== null && accent !== pictureAccent && (
									<Button variant="secondary" small onClick={() => setAccent(null)}>
										{i18n._(ACCENT_RESET)}
									</Button>
								)}
							</div>
						</>
					)}
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer>
				<Button variant="secondary" onClick={() => ModalCommands.pop()}>
					{i18n._(CANCEL)}
				</Button>
				<Button onClick={() => void create()} submitting={saving} disabled={!processed || failed}>
					{i18n._(CREATE)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});

/** Opens the dialog for a picture the user picked. */
export function openCustomImageTheme(file: File): void {
	ModalCommands.push(modal(() => <CustomImageThemeModal file={file} />));
}
