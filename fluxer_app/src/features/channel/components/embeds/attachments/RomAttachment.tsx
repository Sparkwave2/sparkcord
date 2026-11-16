// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: game ROM attachments. The card shows the system and a Play button; playing
// downloads the ROM and opens EmulatorJS (self-hosted under /assets/emulatorjs/, run in
// a same-origin iframe so its globals and styles stay out of the app) in a fullscreen
// viewer styled like the image and PDF viewers. Saves stay in this browser.
//
// Flash files (.swf) use the same card and viewer, but are played by Ruffle
// (self-hosted under /assets/ruffle/), which runs them cut off from the network.

import {fetchAttachmentBytes} from '@app/features/channel/components/embeds/attachments/AttachmentBytes';
import pdfStyles from '@app/features/channel/components/embeds/attachments/PdfAttachmentPreview.module.css';
import styles from '@app/features/channel/components/embeds/attachments/RomAttachment.module.css';
import {FLASH_CORE, type RomSystem} from '@app/features/channel/components/embeds/attachments/RomSystems';
import mediaStyles from '@app/features/messaging/components/modals/MediaModal.module.css';
import {downloadFile} from '@app/features/messaging/utils/FileDownloadUtils';
import {formatFileSize} from '@app/features/messaging/utils/FileUtils';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {getFormattingLocale} from '@app/features/user/utils/LocaleUtils';
import type {MessageAttachment} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {Trans, useLingui} from '@lingui/react/macro';
import {DownloadSimpleIcon, GameControllerIcon, PlayIcon, XIcon} from '@phosphor-icons/react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

function RomPlayer({romUrl, system, fileName, onClose}: {romUrl: string; system: RomSystem; fileName: string; onClose: () => void}) {
	const {t} = useLingui();
	const [closing, setClosing] = useState(false);
	const frameRef = useRef<HTMLIFrameElement>(null);
	const requestClose = useCallback(() => {
		setClosing(true);
		window.setTimeout(onClose, 200);
	}, [onClose]);

	useEffect(() => {
		// Esc only reaches this window when the game doesn't have focus.
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				requestClose();
			}
		};
		window.addEventListener('keydown', onKey, true);
		frameRef.current?.focus();
		return () => window.removeEventListener('keydown', onKey, true);
	}, [requestClose]);

	const accent = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#a855f7';
	const src =
		system.core === FLASH_CORE
			? `/assets/ruffle/player.html?${new URLSearchParams({swf: romUrl}).toString()}`
			: `/assets/emulatorjs/player.html?${new URLSearchParams({
					core: system.core,
					name: fileName,
					rom: romUrl,
					color: accent,
				}).toString()}`;

	return createPortal(
		<div
			className={closing ? `${pdfStyles.fullscreenRoot} ${pdfStyles.fullscreenClosing}` : pdfStyles.fullscreenRoot}
			role="dialog"
			aria-modal="true"
			aria-label={fileName}
		>
			<div className={pdfStyles.fullscreenBlur} aria-hidden="true" />
			<div className={`${mediaStyles.modalBackdrop} ${pdfStyles.fullscreenTint}`} aria-hidden="true" onClick={requestClose} />
			<div className={`${styles.playerFrameWrap} ${pdfStyles.fullscreenFade}`}>
				<div className={styles.playerHeader}>
					<GameControllerIcon size={18} weight="fill" />
					<span className={styles.playerTitle}>{fileName}</span>
					<span className={styles.playerSystem}>{system.label}</span>
					<button type="button" className={styles.closeButton} onClick={requestClose} aria-label={t`Close`} title={t`Close`}>
						<XIcon size={18} weight="bold" />
					</button>
				</div>
				<iframe
					ref={frameRef}
					className={styles.playerFrame}
					src={src}
					title={fileName}
					allow="gamepad; fullscreen; autoplay"
					allowFullScreen
				/>
			</div>
		</div>,
		document.body,
	);
}

export function RomAttachment({attachment, system}: {attachment: MessageAttachment; system: RomSystem}) {
	const {t} = useLingui();
	const fileName = attachment.title || attachment.filename;
	const [romUrl, setRomUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(
		() => () => {
			abortRef.current?.abort();
		},
		[],
	);

	const play = async () => {
		if (!attachment.url || loading) return;
		setLoading(true);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const bytes = await fetchAttachmentBytes(attachment.url, controller.signal);
			if (controller.signal.aborted) return;
			setRomUrl(URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'})));
		} catch (error) {
			if (!controller.signal.aborted) ToastCommands.error(t`Couldn't load the game. Try again.`);
			void error;
		} finally {
			setLoading(false);
		}
	};

	const close = useCallback(() => {
		setRomUrl((url) => {
			if (url) URL.revokeObjectURL(url);
			return null;
		});
	}, []);

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
			<button type="button" className={styles.playButton} onClick={() => void play()} disabled={loading}>
				<PlayIcon size={16} weight="fill" />
				{loading ? <Trans>Loading…</Trans> : <Trans>Play</Trans>}
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
			{romUrl && <RomPlayer romUrl={romUrl} system={system} fileName={fileName} onClose={close} />}
		</div>
	);
}
