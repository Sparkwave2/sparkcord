// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the soundboard popout (from the voice panel or the soundboard keybind).
// Personal sounds and, in a community voice channel, that community's sounds. Click to
// play; add, rename or delete where allowed; a volume slider for everyone's sounds.

import Authentication from '@app/features/auth/state/Authentication';
import Guilds from '@app/features/guild/state/Guilds';
import Permission from '@app/features/permissions/state/Permission';
import Soundboard, {type SoundboardSound} from '@app/features/soundboard/Soundboard';
import styles from '@app/features/soundboard/SoundboardPopout.module.css';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {Trans, useLingui} from '@lingui/react/macro';
import {PencilSimpleIcon, PlusIcon, SpeakerHighIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

function errorMessage(error: unknown): string {
	const body = (error as {body?: {message?: string; errors?: Array<{message?: string}>}})?.body;
	return body?.errors?.[0]?.message ?? body?.message ?? (error instanceof Error ? error.message : String(error));
}

const SoundButton = observer(function SoundButton({
	sound,
	canEdit,
	canPlay,
}: {
	sound: SoundboardSound;
	canEdit: boolean;
	canPlay: boolean;
}) {
	const {t} = useLingui();
	const [renaming, setRenaming] = useState(false);
	const [name, setName] = useState(sound.name);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const isPlaying = [...Soundboard.playing.values()].some((playing) => playing.soundId === sound.id);

	const saveName = async () => {
		const trimmed = name.trim();
		setRenaming(false);
		if (!trimmed || trimmed === sound.name) {
			setName(sound.name);
			return;
		}
		try {
			await Soundboard.rename(sound, trimmed);
		} catch (error) {
			setName(sound.name);
			ToastCommands.error(errorMessage(error));
		}
	};

	const remove = async () => {
		if (!confirmDelete) {
			setConfirmDelete(true);
			window.setTimeout(() => setConfirmDelete(false), 3000);
			return;
		}
		try {
			await Soundboard.remove(sound);
		} catch (error) {
			ToastCommands.error(errorMessage(error));
		}
	};

	if (renaming) {
		return (
			<input
				className={styles.renameInput}
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
		);
	}

	return (
		<div className={styles.soundWrap}>
			<button
				type="button"
				className={isPlaying ? `${styles.sound} ${styles.soundPlaying}` : styles.sound}
				disabled={!canPlay}
				onClick={() => {
					if (!Soundboard.play(sound)) ToastCommands.error(t`Wait a moment before playing another sound.`);
				}}
				title={canPlay ? sound.name : t`Join a voice channel to play sounds`}
			>
				<SpeakerHighIcon size={14} weight="fill" className={styles.soundIcon} />
				<span className={styles.soundName}>{sound.name}</span>
			</button>
			{canEdit && (
				<div className={styles.soundActions}>
					<button
						type="button"
						className={styles.smallButton}
						onClick={() => setRenaming(true)}
						aria-label={t`Rename`}
						title={t`Rename`}
					>
						<PencilSimpleIcon size={12} />
					</button>
					<button
						type="button"
						className={confirmDelete ? `${styles.smallButton} ${styles.danger}` : styles.smallButton}
						onClick={() => void remove()}
						aria-label={confirmDelete ? t`Click again to delete` : t`Delete`}
						title={confirmDelete ? t`Click again to delete` : t`Delete`}
					>
						<XIcon size={12} weight="bold" />
					</button>
				</div>
			)}
		</div>
	);
});

const SoundSection = observer(function SoundSection({
	title,
	sounds,
	guildId,
	canAdd,
	canEditSound,
}: {
	title: string;
	sounds: ReadonlyArray<SoundboardSound> | null;
	guildId: string | null;
	canAdd: boolean;
	canEditSound: (sound: SoundboardSound) => boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const canPlay = Soundboard.canPlay;

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

	return (
		<section className={styles.section}>
			<div className={styles.sectionHeader}>
				<span className={styles.sectionTitle}>{title}</span>
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
						<button
							type="button"
							className={styles.addButton}
							disabled={uploading}
							onClick={() => inputRef.current?.click()}
						>
							<PlusIcon size={12} weight="bold" />
							{uploading ? <Trans>Adding…</Trans> : <Trans>Add</Trans>}
						</button>
					</>
				)}
			</div>
			{sounds === null ? (
				<p className={styles.empty}>
					<Trans>Loading…</Trans>
				</p>
			) : sounds.length === 0 ? (
				<p className={styles.empty}>
					<Trans>No sounds yet.</Trans>
				</p>
			) : (
				<div className={styles.grid}>
					{sounds.map((sound) => (
						<SoundButton key={sound.id} sound={sound} canEdit={canEditSound(sound)} canPlay={canPlay} />
					))}
				</div>
			)}
		</section>
	);
});

export const SoundboardPopout = observer(function SoundboardPopout() {
	const {t} = useLingui();
	const guildId = MediaEngine.guildId;
	const guild = guildId ? Guilds.getGuild(guildId) : null;
	const me = Authentication.currentUserId;

	useEffect(() => {
		Soundboard.loadPersonal().catch((error) => ToastCommands.error(errorMessage(error)));
	}, []);
	useEffect(() => {
		if (guildId) Soundboard.loadGuild(guildId).catch(() => {});
	}, [guildId]);

	const canCreate = guildId ? Permission.can(Permissions.CREATE_EXPRESSIONS, {guildId}) : false;
	const canManage = guildId ? Permission.can(Permissions.MANAGE_EXPRESSIONS, {guildId}) : false;

	return (
		<div className={styles.popout}>
			<div className={styles.header}>
				<span className={styles.title}>
					<Trans>Soundboard</Trans>
				</span>
				<span className={styles.hint}>
					<Trans>Up to 10 seconds, 1 MB</Trans>
				</span>
			</div>
			<div className={styles.body}>
				<SoundSection
					title={t`Personal`}
					sounds={Soundboard.personal}
					guildId={null}
					canAdd
					canEditSound={() => true}
				/>
				{guildId && guild && (
					<SoundSection
						title={guild.name}
						sounds={Soundboard.guildSounds.get(guildId) ?? null}
						guildId={guildId}
						canAdd={canCreate}
						canEditSound={(sound) => canManage || (canCreate && sound.creator_id === me)}
					/>
				)}
			</div>
			<label className={styles.volume}>
				<span>
					<Trans>Soundboard volume</Trans>
				</span>
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
		</div>
	);
});
