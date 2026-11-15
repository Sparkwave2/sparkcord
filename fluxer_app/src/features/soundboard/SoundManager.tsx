// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: manage a list of soundboard sounds in settings (your personal sounds, or a
// community's). Upload, preview (only you hear it), rename and delete.

import Soundboard, {type SoundboardSound} from '@app/features/soundboard/Soundboard';
import styles from '@app/features/soundboard/SoundManager.module.css';
import {Button} from '@app/features/ui/button/Button';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Spinner} from '@app/features/ui/components/Spinner';
import {Trans, useLingui} from '@lingui/react/macro';
import {PencilSimpleIcon, PlayIcon, TrashIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useRef, useState} from 'react';

function errorMessage(error: unknown): string {
	const body = (error as {body?: {message?: string; errors?: Array<{message?: string}>}})?.body;
	return body?.errors?.[0]?.message ?? body?.message ?? (error instanceof Error ? error.message : String(error));
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)} s`;
}

const SoundRow = observer(function SoundRow({sound, canEdit}: {sound: SoundboardSound; canEdit: boolean}) {
	const {t} = useLingui();
	const [renaming, setRenaming] = useState(false);
	const [name, setName] = useState(sound.name);
	const [busy, setBusy] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const saveName = async () => {
		const trimmed = name.trim();
		setRenaming(false);
		if (!trimmed || trimmed === sound.name) {
			setName(sound.name);
			return;
		}
		setBusy(true);
		try {
			await Soundboard.rename(sound, trimmed);
		} catch (error) {
			setName(sound.name);
			ToastCommands.error(errorMessage(error));
		} finally {
			setBusy(false);
		}
	};

	const remove = async () => {
		if (!confirmDelete) {
			setConfirmDelete(true);
			window.setTimeout(() => setConfirmDelete(false), 3000);
			return;
		}
		setBusy(true);
		try {
			await Soundboard.remove(sound);
		} catch (error) {
			ToastCommands.error(errorMessage(error));
			setBusy(false);
		}
	};

	return (
		<div className={styles.row}>
			<button
				type="button"
				className={styles.iconButton}
				onClick={() => Soundboard.preview(sound)}
				aria-label={t`Preview`}
				title={t`Preview (only you hear it)`}
			>
				<PlayIcon size={16} weight="fill" />
			</button>
			{renaming ? (
				<input
					className={styles.nameInput}
					value={name}
					maxLength={32}
					// biome-ignore lint/a11y/noAutofocus: opened by the user's click on rename.
					autoFocus
					onChange={(event) => setName(event.target.value)}
					onBlur={() => void saveName()}
					onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
						if (event.key === 'Enter') void saveName();
						if (event.key === 'Escape') {
							event.stopPropagation();
							setName(sound.name);
							setRenaming(false);
						}
					}}
				/>
			) : (
				<span className={styles.name} title={sound.name}>
					{sound.name}
				</span>
			)}
			<span className={styles.duration}>{formatDuration(sound.duration_ms)}</span>
			{canEdit && (
				<>
					<button
						type="button"
						className={styles.iconButton}
						onClick={() => setRenaming(true)}
						disabled={busy}
						aria-label={t`Rename`}
						title={t`Rename`}
					>
						<PencilSimpleIcon size={16} />
					</button>
					<button
						type="button"
						className={confirmDelete ? `${styles.iconButton} ${styles.danger}` : styles.iconButton}
						onClick={() => void remove()}
						disabled={busy}
						aria-label={confirmDelete ? t`Click again to delete` : t`Delete`}
						title={confirmDelete ? t`Click again to delete` : t`Delete`}
					>
						<TrashIcon size={16} />
					</button>
				</>
			)}
		</div>
	);
});

export const SoundManager = observer(function SoundManager({
	sounds,
	guildId,
	max,
	canAdd,
	canEditSound,
}: {
	sounds: ReadonlyArray<SoundboardSound> | null;
	guildId: string | null;
	max: number;
	canAdd: boolean;
	canEditSound: (sound: SoundboardSound) => boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);

	const upload = async (files: FileList | null) => {
		if (!files) return;
		setUploading(true);
		for (const file of Array.from(files)) {
			try {
				await Soundboard.upload(file, guildId);
			} catch (error) {
				ToastCommands.error(`${file.name}: ${errorMessage(error)}`);
			}
		}
		setUploading(false);
		if (inputRef.current) inputRef.current.value = '';
	};

	if (sounds === null) return <Spinner />;

	return (
		<div className={styles.manager}>
			<div className={styles.header}>
				<span className={styles.count}>
					<Trans>
						{sounds.length} of {max} sounds
					</Trans>
				</span>
				{canAdd && (
					<>
						<input
							ref={inputRef}
							type="file"
							accept="audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/webm,.mp3,.ogg,.wav,.webm"
							multiple
							hidden
							onChange={(event) => void upload(event.target.files)}
						/>
						<Button
							small
							submitting={uploading}
							disabled={sounds.length >= max}
							onClick={() => inputRef.current?.click()}
						>
							<Trans>Upload sounds</Trans>
						</Button>
					</>
				)}
			</div>
			<p className={styles.hint}>
				<Trans>MP3, OGG, WAV or WebM, up to 10 seconds and 1 MB. The file name becomes the sound's name.</Trans>
			</p>
			{sounds.length === 0 ? (
				<p className={styles.hint}>
					<Trans>No sounds yet.</Trans>
				</p>
			) : (
				<div className={styles.list}>
					{sounds.map((sound) => (
						<SoundRow key={sound.id} sound={sound} canEdit={canEditSound(sound)} />
					))}
				</div>
			)}
		</div>
	);
});

/** The soundboard volume slider (also in the soundboard popout). */
export const SoundboardVolumeSlider = observer(function SoundboardVolumeSlider() {
	const {t} = useLingui();
	return (
		<label className={styles.volume}>
			<input
				type="range"
				min={0}
				max={100}
				value={Math.round(Soundboard.volume * 100)}
				onChange={(event) => Soundboard.setVolume(Number(event.target.value) / 100)}
				aria-label={t`Soundboard volume`}
			/>
			<span className={styles.volumeValue}>{Math.round(Soundboard.volume * 100)}%</span>
		</label>
	);
});
