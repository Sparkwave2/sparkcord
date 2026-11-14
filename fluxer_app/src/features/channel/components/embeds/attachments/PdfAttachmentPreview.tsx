// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: inline, scrollable PDF viewer for PDF attachments (pdf.js, loaded only when
// a PDF scrolls into view). Pages render lazily as they come near the visible area.

import styles from '@app/features/channel/components/embeds/attachments/PdfAttachmentPreview.module.css';
import {fetchApiAttachmentBlob, fetchedApiAttachmentKey} from '@app/features/messaging/state/ApiAttachmentMedia';
import AttachmentUrlRefresher from '@app/features/messaging/state/AttachmentUrlRefresher';
import {wrapDesktopLocalResourceURL} from '@app/features/messaging/utils/DesktopResourceUrl';
import {downloadFile} from '@app/features/messaging/utils/FileDownloadUtils';
import {formatFileSize} from '@app/features/messaging/utils/FileUtils';
import {getFormattingLocale} from '@app/features/user/utils/LocaleUtils';
import type {MessageAttachment} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {
	ArrowsInSimpleIcon,
	ArrowsOutSimpleIcon,
	DownloadSimpleIcon,
	FilePdfIcon,
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
} from '@phosphor-icons/react';
import type {PDFDocumentProxy, RenderTask} from 'pdfjs-dist';
import {useCallback, useEffect, useRef, useState} from 'react';

const AUTO_LOAD_MAX_BYTES = 25 * 1024 * 1024;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const LOADING = msg({message: 'Loading PDF…', comment: 'Shown while a PDF attachment preview loads.'});
const FAILED = msg({message: "Couldn't preview this PDF.", comment: 'Shown when a PDF attachment preview fails.'});
const LOAD_PREVIEW = msg({
	message: 'Load preview ({size})',
	comment: 'Button to load the preview of a large PDF attachment. {size} is the file size.',
});
const PAGES = msg({message: '{count, plural, one {# page} other {# pages}}', comment: 'Page count of a PDF attachment.'});
const ZOOM_IN = msg({message: 'Zoom in', comment: 'PDF preview button.'});
const ZOOM_OUT = msg({message: 'Zoom out', comment: 'PDF preview button.'});
const EXPAND = msg({message: 'Expand', comment: 'PDF preview button that makes the viewer taller.'});
const COLLAPSE = msg({message: 'Collapse', comment: 'PDF preview button that makes the viewer smaller again.'});
const DOWNLOAD = msg({message: 'Download', comment: 'PDF preview button.'});

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
	if (!pdfjsPromise) {
		pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
			pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
			return pdfjs;
		});
		pdfjsPromise.catch(() => {
			pdfjsPromise = null;
		});
	}
	return pdfjsPromise;
}

async function fetchPdfBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
	const target = await AttachmentUrlRefresher.refresh(url);
	if (fetchedApiAttachmentKey(target) !== null) {
		return (await fetchApiAttachmentBlob(target, signal)).arrayBuffer();
	}
	let response = await fetch(wrapDesktopLocalResourceURL(target), {signal});
	if (!response.ok && [401, 403, 404, 410].includes(response.status)) {
		const refreshed = await AttachmentUrlRefresher.refresh(url, {force: true});
		if (refreshed !== target) response = await fetch(wrapDesktopLocalResourceURL(refreshed), {signal});
	}
	if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
	return response.arrayBuffer();
}

function PdfPage({doc, pageNumber, width}: {doc: PDFDocumentProxy; pageNumber: number; width: number}) {
	const holderRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [visible, setVisible] = useState(false);
	const [aspect, setAspect] = useState(1.414);

	useEffect(() => {
		const holder = holderRef.current;
		if (!holder) return;
		const observer = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), {
			rootMargin: '400px 0px',
		});
		observer.observe(holder);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!visible || width <= 0) return;
		let task: RenderTask | null = null;
		let cancelled = false;
		void doc.getPage(pageNumber).then((page) => {
			if (cancelled) return;
			const base = page.getViewport({scale: 1});
			setAspect(base.height / base.width);
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ratio = window.devicePixelRatio || 1;
			const viewport = page.getViewport({scale: (width / base.width) * ratio});
			canvas.width = Math.floor(viewport.width);
			canvas.height = Math.floor(viewport.height);
			const context = canvas.getContext('2d');
			if (!context) return;
			task = page.render({canvasContext: context, viewport});
			task.promise.catch(() => undefined);
		});
		return () => {
			cancelled = true;
			task?.cancel();
		};
	}, [doc, pageNumber, visible, width]);

	return (
		<div ref={holderRef} className={styles.page} style={{width, height: Math.round(width * aspect)}}>
			<canvas ref={canvasRef} className={styles.canvas} />
		</div>
	);
}

interface PdfAttachmentPreviewProps {
	attachment: MessageAttachment;
	spoilerHidden?: boolean;
}

export function PdfAttachmentPreview({attachment, spoilerHidden}: PdfAttachmentPreviewProps) {
	const {i18n} = useLingui();
	const rootRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [near, setNear] = useState(false);
	const [requested, setRequested] = useState(attachment.size <= AUTO_LOAD_MAX_BYTES);
	const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
	const [error, setError] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [expanded, setExpanded] = useState(false);
	const [containerWidth, setContainerWidth] = useState(0);
	const fileName = attachment.title || attachment.filename;

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) setNear(true);
		}, {rootMargin: '600px 0px'});
		observer.observe(root);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const observer = new ResizeObserver(() => setContainerWidth(scroller.clientWidth));
		observer.observe(scroller);
		setContainerWidth(scroller.clientWidth);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!near || !requested || spoilerHidden || !attachment.url) return;
		const controller = new AbortController();
		let loaded: PDFDocumentProxy | null = null;
		setError(false);
		void (async () => {
			try {
				const [pdfjs, bytes] = await Promise.all([loadPdfjs(), fetchPdfBytes(attachment.url!, controller.signal)]);
				if (controller.signal.aborted) return;
				loaded = await pdfjs.getDocument({data: new Uint8Array(bytes), isEvalSupported: false}).promise;
				if (controller.signal.aborted) {
					void loaded.destroy();
					return;
				}
				setDoc(loaded);
			} catch (err) {
				if (!controller.signal.aborted) {
					console.error('[pdf] preview failed', err);
					setError(true);
				}
			}
		})();
		return () => {
			controller.abort();
			void loaded?.destroy();
			setDoc(null);
		};
	}, [near, requested, spoilerHidden, attachment.url]);

	const zoomBy = useCallback((direction: 1 | -1) => {
		setZoom((current) => {
			const index = ZOOM_STEPS.indexOf(current);
			const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))];
			return next ?? current;
		});
	}, []);

	const handleDownload = useCallback(() => {
		const url = attachment.proxy_url ?? attachment.url;
		if (url) void downloadFile(url, 'file', fileName);
	}, [attachment.proxy_url, attachment.url, fileName]);

	const pageWidth = Math.max(0, Math.floor((containerWidth - 24) * zoom));

	let body: React.ReactNode;
	if (error) body = <div className={styles.status}>{i18n._(FAILED)}</div>;
	else if (!requested)
		body = (
			<div className={styles.status}>
				<button type="button" className={styles.loadButton} onClick={() => setRequested(true)}>
					{i18n._(LOAD_PREVIEW, {size: formatFileSize(getFormattingLocale(), attachment.size)})}
				</button>
			</div>
		);
	else if (!doc) body = <div className={styles.status}>{i18n._(LOADING)}</div>;
	else
		body = Array.from({length: doc.numPages}, (_, i) => (
			<PdfPage key={i + 1} doc={doc} pageNumber={i + 1} width={pageWidth} />
		));

	return (
		<div ref={rootRef} className={styles.root}>
			<div className={styles.header}>
				<FilePdfIcon size={20} weight="fill" className={styles.fileIcon} />
				<div className={styles.title}>
					<span className={styles.name}>{fileName}</span>
					<span className={styles.meta}>
						{formatFileSize(getFormattingLocale(), attachment.size)}
						{doc ? ` · ${i18n._(PAGES, {count: doc.numPages})}` : ''}
					</span>
				</div>
				<div className={styles.tools}>
					<button
						type="button"
						className={styles.tool}
						onClick={() => zoomBy(-1)}
						disabled={!doc || zoom === ZOOM_STEPS[0]}
						aria-label={i18n._(ZOOM_OUT)}
						title={i18n._(ZOOM_OUT)}
					>
						<MagnifyingGlassMinusIcon size={18} weight="bold" />
					</button>
					<span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
					<button
						type="button"
						className={styles.tool}
						onClick={() => zoomBy(1)}
						disabled={!doc || zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
						aria-label={i18n._(ZOOM_IN)}
						title={i18n._(ZOOM_IN)}
					>
						<MagnifyingGlassPlusIcon size={18} weight="bold" />
					</button>
					<button
						type="button"
						className={styles.tool}
						onClick={() => setExpanded((v) => !v)}
						aria-label={i18n._(expanded ? COLLAPSE : EXPAND)}
						title={i18n._(expanded ? COLLAPSE : EXPAND)}
					>
						{expanded ? <ArrowsInSimpleIcon size={18} weight="bold" /> : <ArrowsOutSimpleIcon size={18} weight="bold" />}
					</button>
					<button
						type="button"
						className={styles.tool}
						onClick={handleDownload}
						disabled={!attachment.url}
						aria-label={i18n._(DOWNLOAD)}
						title={i18n._(DOWNLOAD)}
					>
						<DownloadSimpleIcon size={18} weight="bold" />
					</button>
				</div>
			</div>
			<div ref={scrollRef} className={expanded ? `${styles.scroller} ${styles.expanded}` : styles.scroller}>
				<div className={styles.pages}>{body}</div>
			</div>
		</div>
	);
}
