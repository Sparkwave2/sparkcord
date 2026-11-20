// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: game ROM attachments. The card shows the system and a Play button; playing
// downloads the ROM and opens EmulatorJS (self-hosted under /assets/emulatorjs/, run in
// a same-origin iframe so its globals and styles stay out of the app) in a fullscreen
// viewer styled like the image and PDF viewers. Saves stay in this browser.
//
// Flash files (.swf) use the same card and viewer, but are played by Ruffle
// (self-hosted under /assets/ruffle/), which runs them cut off from the network.
//
// The viewer itself is GameWindow (one game at a time, kept outside the message so a
// minimized game keeps running while you move around the app).

import {fetchAttachmentBytes} from '@app/features/channel/components/embeds/attachments/AttachmentBytes';
import styles from '@app/features/channel/components/embeds/attachments/RomAttachment.module.css';
import type {RomSystem} from '@app/features/channel/components/embeds/attachments/RomSystems';
import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import GamePlayer from '@app/features/game_player/GamePlayer';
import {downloadFile} from '@app/features/messaging/utils/FileDownloadUtils';
import {formatFileSize} from '@app/features/messaging/utils/FileUtils';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {getFormattingLocale} from '@app/features/user/utils/LocaleUtils';
import type {MessageAttachment} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {Trans, useLingui} from '@lingui/react/macro';
import {ArrowsOutSimpleIcon, DownloadSimpleIcon, GameControllerIcon, PlayIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useEffect, useRef, useState} from 'react';

export const RomAttachment = observer(function RomAttachment({
	attachment,
	system,
}: {
	attachment: MessageAttachment;
	system: RomSystem;
}) {
	const {t} = useLingui();
	const fileName = attachment.title || attachment.filename;
	const playing = GamePlayer.isPlaying(attachment.id);
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(
		() => () => {
			abortRef.current?.abort();
		},
		[],
	);

	const start = async () => {
		if (!attachment.url || loading) return;
		setLoading(true);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const bytes = await fetchAttachmentBytes(attachment.url, controller.signal);
			if (controller.signal.aborted) return;
			GamePlayer.open({
				romUrl: URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'})),
				system,
				fileName,
				attachmentId: attachment.id,
			});
		} catch (error) {
			if (!controller.signal.aborted) ToastCommands.error(t`Couldn't load the game. Try again.`);
			void error;
		} finally {
			setLoading(false);
		}
	};

	const play = () => {
		if (playing) {
			GamePlayer.maximize();
			return;
		}
		const current = GamePlayer.game;
		if (!current) {
			void start();
			return;
		}
		// One game at a time: starting this one ends the other.
		ModalCommands.push(
			modal(() => (
				<ConfirmModal
					title={<Trans>Close the other game?</Trans>}
					description={
						<Trans>
							<strong>{current.fileName}</strong> is still running. Starting this game closes it, and anything not
							saved in it is lost.
						</Trans>
					}
					primaryText={<Trans>Close it and play</Trans>}
					primaryVariant="primary"
					onPrimary={() => {
						GamePlayer.close();
						void start();
					}}
					data-flx="rom.confirm-replace"
				/>
			)),
		);
	};

	return (
		<div className={styles.card}>
			<div className={styles.icon}>
				<GameControllerIcon size={28} weight="fill" />
			</div>
			<div className={styles.info}>
				<span className={styles.name} title={fileName}>
					{fileName}
				</span>
				<span className={styles.meta}>
					{system.label} · {formatFileSize(getFormattingLocale(), attachment.size)}
				</span>
			</div>
			<button type="button" className={styles.playButton} onClick={play} disabled={loading}>
				{playing ? <ArrowsOutSimpleIcon size={16} weight="bold" /> : <PlayIcon size={16} weight="fill" />}
				{loading ? <Trans>Loading…</Trans> : playing ? <Trans>Show</Trans> : <Trans>Play</Trans>}
			</button>
			<button
				type="button"
				className={styles.iconButton}
				onClick={() => {
					const url = attachment.proxy_url ?? attachment.url;
					if (url) void downloadFile(url, 'file', fileName);
				}}
				aria-label={t`Download`}
				title={t`Download`}
			>
				<DownloadSimpleIcon size={18} />
			</button>
		</div>
	);
});
