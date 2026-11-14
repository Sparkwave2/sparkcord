// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: fullscreen PDF viewer, styled like the image viewer (dimmed, blurred backdrop;
// action buttons bottom-left; file info bottom-right). Esc or clicking the backdrop closes it.

import pdfStyles from '@app/features/channel/components/embeds/attachments/PdfAttachmentPreview.module.css';
import mediaStyles from '@app/features/messaging/components/modals/MediaModal.module.css';
import {ControlButton} from '@app/features/messaging/components/modals/media_modal/MediaControls';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {
	DownloadSimpleIcon,
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
	XIcon,
} from '@phosphor-icons/react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import type React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

interface PdfFullscreenViewerProps {
	doc: PDFDocumentProxy;
	fileName: string;
	fileSize: string;
	pagesLabel: string;
	zoom: number;
	canZoomIn: boolean;
	canZoomOut: boolean;
	labels: {zoomIn: string; zoomOut: string; download: string; close: string};
	onZoom: (direction: 1 | -1) => void;
	onDownload: () => void;
	onClose: () => void;
	renderPage: (pageNumber: number, width: number) => React.ReactNode;
}

export function PdfFullscreenViewer({
	doc,
	fileName,
	fileSize,
	pagesLabel,
	zoom,
	canZoomIn,
	canZoomOut,
	labels,
	onZoom,
	onDownload,
	onClose,
	renderPage,
}: PdfFullscreenViewerProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [viewport, setViewport] = useState({width: window.innerWidth, height: window.innerHeight});
	const [closing, setClosing] = useState(false);
	// Play the fade-out before unmounting.
	const requestClose = useCallback(() => {
		setClosing(true);
		window.setTimeout(onClose, 200);
	}, [onClose]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				requestClose();
			} else if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
				event.preventDefault();
				onZoom(1);
			} else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
				event.preventDefault();
				onZoom(-1);
			}
		};
		const onResize = () => setViewport({width: window.innerWidth, height: window.innerHeight});
		window.addEventListener('keydown', onKey, true);
		window.addEventListener('resize', onResize);
		scrollRef.current?.focus();
		return () => {
			window.removeEventListener('keydown', onKey, true);
			window.removeEventListener('resize', onResize);
		};
	}, [requestClose, onZoom]);

	// Fit a page to the screen height (A4-ish), never wider than the screen.
	const baseWidth = Math.min(viewport.width - 64, Math.round((viewport.height - 120) / 1.414), 1000);
	const pageWidth = Math.max(200, Math.round(baseWidth * zoom));

	return createPortal(
		<div
			className={closing ? `${pdfStyles.fullscreenRoot} ${pdfStyles.fullscreenClosing}` : pdfStyles.fullscreenRoot}
			role="dialog" aria-modal="true" aria-label={fileName}>
			<div className={mediaStyles.modalBackdrop} aria-hidden="true" />
			<div
				ref={scrollRef}
				tabIndex={-1}
				className={`${pdfStyles.fullscreenScroller} ${pdfStyles.fullscreenFade}`}
				onClick={(event) => {
					if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.pdfGap === 'true')
						requestClose();
				}}
			>
				<div className={pdfStyles.fullscreenPages} data-pdf-gap="true">
					{Array.from({length: doc.numPages}, (_, i) => (
						<div key={i + 1}>{renderPage(i + 1, pageWidth)}</div>
					))}
				</div>
			</div>
			<div className={`${mediaStyles.modalContentInner} ${pdfStyles.fullscreenFade}`} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
				<div className={mediaStyles.overlayActionBar}>
					{[
						{label: labels.zoomOut, icon: <MagnifyingGlassMinusIcon size={20} weight="bold" />, onClick: () => onZoom(-1), disabled: !canZoomOut},
						{label: labels.zoomIn, icon: <MagnifyingGlassPlusIcon size={20} weight="bold" />, onClick: () => onZoom(1), disabled: !canZoomIn},
						{label: labels.download, icon: <DownloadSimpleIcon size={20} weight="bold" />, onClick: onDownload, disabled: false},
						{label: labels.close, icon: <XIcon size={20} weight="bold" />, onClick: requestClose, disabled: false},
					].map((button) => (
						<Tooltip key={button.label} text={button.label} position="top">
							<span className={mediaStyles.overlayActionButtonWrap}>
								<ControlButton
									label={button.label}
									icon={button.icon}
									onClick={button.onClick}
									disabled={button.disabled}
								/>
							</span>
						</Tooltip>
					))}
				</div>
				<div className={mediaStyles.bottomInfoBar}>
					{[fileName, fileSize, pagesLabel, `${Math.round(zoom * 100)}%`].map((part, index) => (
						<span key={`${part}-${index}`} className={mediaStyles.bottomInfoItem}>
							{part}
						</span>
					))}
				</div>
			</div>
		</div>,
		document.body,
	);
}
