// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: inline 3D viewer for model attachments (GLB/glTF, OBJ, STL, PLY, FBX). Drag
// to rotate, scroll to zoom, right-drag to pan. The 3D engine loads only when a model is
// near the visible area, and its graphics context is released again when it scrolls away
// (browsers allow only a handful at once).

import {fetchAttachmentBytes} from '@app/features/channel/components/embeds/attachments/AttachmentBytes';
import styles from '@app/features/channel/components/embeds/attachments/ModelAttachmentPreview.module.css';
import type {ModelFormat, ModelView} from '@app/features/channel/components/embeds/attachments/ModelScene';
import pdfStyles from '@app/features/channel/components/embeds/attachments/PdfAttachmentPreview.module.css';
import {downloadFile} from '@app/features/messaging/utils/FileDownloadUtils';
import {formatFileSize} from '@app/features/messaging/utils/FileUtils';
import {getFormattingLocale} from '@app/features/user/utils/LocaleUtils';
import type {MessageAttachment} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ArrowsInSimpleIcon, ArrowsOutSimpleIcon, CubeIcon, DownloadSimpleIcon, GpsFixIcon} from '@phosphor-icons/react';
import {useCallback, useEffect, useRef, useState} from 'react';

const AUTO_LOAD_MAX_BYTES = 15 * 1024 * 1024;
const MODEL_FORMATS: ReadonlySet<string> = new Set(['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx']);

const LOADING = msg({message: 'Loading model…', comment: 'Shown while a 3D model attachment preview loads.'});
const FAILED = msg({message: "Couldn't preview this model.", comment: 'Shown when a 3D model preview fails.'});
const FAILED_GLTF = msg({
	message: "Couldn't preview this model. A .gltf file that keeps its data in separate files can't be shown; use .glb instead.",
	comment: 'Shown when a .gltf 3D model preview fails.',
});
const LOAD_PREVIEW = msg({
	message: 'Load preview ({size})',
	comment: 'Button to load the preview of a large PDF attachment. {size} is the file size.',
});
const TRIANGLES = msg({
	message: '{count, plural, one {# triangle} other {# triangles}}',
	comment: 'Triangle count of a 3D model attachment.',
});
const RESET_VIEW = msg({message: 'Reset view', comment: '3D model preview button.'});
const FULLSCREEN = msg({message: 'Open fullscreen', comment: 'PDF preview button that opens the fullscreen viewer.'});
const EXIT_FULLSCREEN = msg({message: 'Exit fullscreen', comment: '3D model preview button.'});
const DOWNLOAD = msg({message: 'Download', comment: 'PDF preview button.'});
const HINT = msg({
	message: 'Drag to rotate · click, then scroll to zoom · right-drag to move',
	comment: 'Hint under a 3D model preview.',
});

/** The model format of a file name, or null when it isn't a 3D model the viewer can show. */
export function getModelFormat(fileName: string): ModelFormat | null {
	const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
	return MODEL_FORMATS.has(extension) ? (extension as ModelFormat) : null;
}

interface ModelAttachmentPreviewProps {
	attachment: MessageAttachment;
	format: ModelFormat;
	spoilerHidden?: boolean;
}

export function ModelAttachmentPreview({attachment, format, spoilerHidden}: ModelAttachmentPreviewProps) {
	const {i18n} = useLingui();
	const rootRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const viewRef = useRef<ModelView | null>(null);
	const bytesRef = useRef<ArrayBuffer | null>(null);
	const [near, setNear] = useState(false);
	const [requested, setRequested] = useState(attachment.size <= AUTO_LOAD_MAX_BYTES);
	const [ready, setReady] = useState(false);
	const [triangles, setTriangles] = useState<number | null>(null);
	const [error, setError] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const fileName = attachment.title || attachment.filename;

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), {
			rootMargin: '300px 0px',
		});
		observer.observe(root);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!near || !requested || spoilerHidden || !attachment.url) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const controller = new AbortController();
		let view: ModelView | null = null;
		setError(false);
		void (async () => {
			try {
				const [scene, bytes] = await Promise.all([
					import('@app/features/channel/components/embeds/attachments/ModelScene'),
					bytesRef.current ?? fetchAttachmentBytes(attachment.url!, controller.signal),
				]);
				bytesRef.current = bytes;
				if (controller.signal.aborted) return;
				// Parsers may keep or detach the buffer; give each view its own copy.
				view = await scene.createModelView(canvas, bytes.slice(0), format);
				if (controller.signal.aborted) {
					view.dispose();
					return;
				}
				viewRef.current = view;
				setTriangles(view.triangles);
				setReady(true);
			} catch (err) {
				if (!controller.signal.aborted) {
					console.error('[model] preview failed', err);
					setError(true);
				}
			}
		})();
		return () => {
			controller.abort();
			view?.dispose();
			viewRef.current = null;
			setReady(false);
		};
	}, [near, requested, spoilerHidden, attachment.url, format]);

	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const observer = new ResizeObserver(() => viewRef.current?.resize());
		observer.observe(stage);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	}, []);

	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void stageRef.current?.requestFullscreen().catch(() => {});
	}, []);

	const handleDownload = useCallback(() => {
		const url = attachment.proxy_url ?? attachment.url;
		if (url) void downloadFile(url, 'file', fileName);
	}, [attachment.proxy_url, attachment.url, fileName]);

	let overlay: React.ReactNode = null;
	if (error) overlay = <div className={styles.overlay}>{i18n._(format === 'gltf' ? FAILED_GLTF : FAILED)}</div>;
	else if (!requested)
		overlay = (
			<div className={styles.overlay}>
				<button type="button" className={pdfStyles.loadButton} onClick={() => setRequested(true)}>
					{i18n._(LOAD_PREVIEW, {size: formatFileSize(getFormattingLocale(), attachment.size)})}
				</button>
			</div>
		);
	else if (!ready) overlay = <div className={styles.overlay}>{i18n._(LOADING)}</div>;

	return (
		<div ref={rootRef} className={pdfStyles.root}>
			<div className={pdfStyles.header}>
				<CubeIcon size={20} weight="fill" className={styles.fileIcon} />
				<div className={pdfStyles.title}>
					<span className={pdfStyles.name}>{fileName}</span>
					<span className={pdfStyles.meta}>
						{format.toUpperCase()} · {formatFileSize(getFormattingLocale(), attachment.size)}
						{triangles ? ` · ${i18n._(TRIANGLES, {count: triangles})}` : ''}
					</span>
				</div>
				<div className={pdfStyles.tools}>
					<button
						type="button"
						className={pdfStyles.tool}
						onClick={() => viewRef.current?.resetView()}
						disabled={!ready}
						aria-label={i18n._(RESET_VIEW)}
						title={i18n._(RESET_VIEW)}
					>
						<GpsFixIcon size={18} weight="bold" />
					</button>
					<button
						type="button"
						className={pdfStyles.tool}
						onClick={toggleFullscreen}
						disabled={!ready}
						aria-label={i18n._(FULLSCREEN)}
						title={i18n._(FULLSCREEN)}
					>
						<ArrowsOutSimpleIcon size={18} weight="bold" />
					</button>
					<button
						type="button"
						className={pdfStyles.tool}
						onClick={handleDownload}
						disabled={!attachment.url}
						aria-label={i18n._(DOWNLOAD)}
						title={i18n._(DOWNLOAD)}
					>
						<DownloadSimpleIcon size={18} weight="bold" />
					</button>
				</div>
			</div>
			<div ref={stageRef} className={styles.stage}>
				<canvas ref={canvasRef} className={ready ? styles.canvas : `${styles.canvas} ${styles.canvasHidden}`} />
				{overlay}
				{ready && <span className={styles.hint}>{i18n._(HINT)}</span>}
				{fullscreen && (
					<button
						type="button"
						className={styles.exitFullscreen}
						onClick={toggleFullscreen}
						aria-label={i18n._(EXIT_FULLSCREEN)}
						title={i18n._(EXIT_FULLSCREEN)}
					>
						<ArrowsInSimpleIcon size={20} weight="bold" />
					</button>
				)}
			</div>
		</div>
	);
}
