// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: a small image editor, opened from the image viewer. Crop, rotate, flip,
// draw and erase; the result is sent as a new attachment in the channel or saved to the
// device. The message the image came from is never changed.
//
// The picture and the drawing are kept on two canvases of the image's own size, so the
// eraser only removes pen strokes and never the picture underneath.

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {fetchAttachmentBytes} from '@app/features/channel/components/embeds/attachments/AttachmentBytes';
import styles from '@app/features/image_editor/ImageEditor.module.css';
import {http} from '@app/features/platform/transport/RestTransport';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {
	ArrowClockwiseIcon,
	ArrowCounterClockwiseIcon,
	ArrowsHorizontalIcon,
	ArrowsVerticalIcon,
	ArrowUUpLeftIcon,
	CheckIcon,
	CropIcon,
	DownloadSimpleIcon,
	EraserIcon,
	PaperPlaneRightIcon,
	PencilSimpleIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

type Tool = 'draw' | 'erase' | 'crop';

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Snapshot {
	base: HTMLCanvasElement;
	ink: HTMLCanvasElement;
}

/** Larger images are scaled down on load so editing and undo stay light. */
const MAX_SIDE = 4096;
const MAX_UNDO = 12;
const PEN_COLORS = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ffffff', '#000000'];

function makeCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(width));
	canvas.height = Math.max(1, Math.round(height));
	return canvas;
}

function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
	const copy = makeCanvas(source.width, source.height);
	copy.getContext('2d')?.drawImage(source, 0, 0);
	return copy;
}

/** Redraws a canvas through a transform into a new canvas of the given size. */
function transformed(
	source: HTMLCanvasElement,
	width: number,
	height: number,
	apply: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
	const out = makeCanvas(width, height);
	const ctx = out.getContext('2d');
	if (ctx) {
		apply(ctx);
		ctx.drawImage(source, 0, 0);
	}
	return out;
}

function editedFileName(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
	return `${stem || 'image'}-edited.png`;
}

export function ImageEditor({
	src,
	fileName,
	channelId,
	onClose,
}: {
	/** Where the image is fetched from. */
	src: string;
	fileName: string;
	/** The channel the result can be sent to; null hides Send. */
	channelId: string | null;
	onClose: () => void;
}) {
	const {t} = useLingui();
	const viewRef = useRef<HTMLCanvasElement>(null);
	const baseRef = useRef<HTMLCanvasElement | null>(null);
	const inkRef = useRef<HTMLCanvasElement | null>(null);
	const undoRef = useRef<Array<Snapshot>>([]);
	const strokeRef = useRef<{x: number; y: number} | null>(null);
	const cropStartRef = useRef<{x: number; y: number} | null>(null);

	const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
	const [tool, setTool] = useState<Tool>('draw');
	const [color, setColor] = useState(PEN_COLORS[0]);
	const [size, setSize] = useState(6);
	const [crop, setCrop] = useState<Rect | null>(null);
	const [undoCount, setUndoCount] = useState(0);
	const [busy, setBusy] = useState(false);
	const cropRef = useRef<Rect | null>(null);
	cropRef.current = tool === 'crop' ? crop : null;

	const render = useCallback(() => {
		const view = viewRef.current;
		const base = baseRef.current;
		const ink = inkRef.current;
		if (!view || !base || !ink) return;
		if (view.width !== base.width || view.height !== base.height) {
			view.width = base.width;
			view.height = base.height;
		}
		const ctx = view.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, view.width, view.height);
		ctx.drawImage(base, 0, 0);
		ctx.drawImage(ink, 0, 0);
		const rect = cropRef.current;
		if (rect && rect.w > 0 && rect.h > 0) {
			// Dim everything outside the selection.
			ctx.save();
			ctx.fillStyle = 'rgb(0 0 0 / 0.55)';
			ctx.beginPath();
			ctx.rect(0, 0, view.width, view.height);
			ctx.rect(rect.x, rect.y, rect.w, rect.h);
			ctx.fill('evenodd');
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = Math.max(1, view.width / 600);
			ctx.setLineDash([ctx.lineWidth * 6, ctx.lineWidth * 4]);
			ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
			ctx.restore();
		}
	}, []);

	useEffect(() => {
		render();
	}, [render, crop, tool, state]);

	useEffect(() => {
		const controller = new AbortController();
		let bitmap: ImageBitmap | null = null;
		void (async () => {
			try {
				const bytes = await fetchAttachmentBytes(src, controller.signal);
				bitmap = await createImageBitmap(new Blob([bytes]));
				if (controller.signal.aborted) return;
				const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
				const base = makeCanvas(bitmap.width * scale, bitmap.height * scale);
				base.getContext('2d')?.drawImage(bitmap, 0, 0, base.width, base.height);
				baseRef.current = base;
				inkRef.current = makeCanvas(base.width, base.height);
				setState('ready');
			} catch {
				if (!controller.signal.aborted) setState('failed');
			} finally {
				bitmap?.close();
			}
		})();
		return () => controller.abort();
	}, [src]);

	const remember = useCallback(() => {
		const base = baseRef.current;
		const ink = inkRef.current;
		if (!base || !ink) return;
		undoRef.current.push({base: copyCanvas(base), ink: copyCanvas(ink)});
		if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
		setUndoCount(undoRef.current.length);
	}, []);

	const undo = useCallback(() => {
		const last = undoRef.current.pop();
		if (!last) return;
		baseRef.current = last.base;
		inkRef.current = last.ink;
		setUndoCount(undoRef.current.length);
		setCrop(null);
		render();
	}, [render]);

	/** Applies the same geometry change to the picture and the drawing. */
	const reshape = useCallback(
		(width: number, height: number, apply: (ctx: CanvasRenderingContext2D) => void) => {
			const base = baseRef.current;
			const ink = inkRef.current;
			if (!base || !ink) return;
			remember();
			baseRef.current = transformed(base, width, height, apply);
			inkRef.current = transformed(ink, width, height, apply);
			setCrop(null);
			render();
		},
		[remember, render],
	);

	const rotate = (clockwise: boolean) => {
		const base = baseRef.current;
		if (!base) return;
		const {width, height} = base;
		reshape(height, width, (ctx) => {
			if (clockwise) {
				ctx.translate(height, 0);
				ctx.rotate(Math.PI / 2);
			} else {
				ctx.translate(0, width);
				ctx.rotate(-Math.PI / 2);
			}
		});
	};

	const flip = (horizontal: boolean) => {
		const base = baseRef.current;
		if (!base) return;
		const {width, height} = base;
		reshape(width, height, (ctx) => {
			if (horizontal) {
				ctx.translate(width, 0);
				ctx.scale(-1, 1);
			} else {
				ctx.translate(0, height);
				ctx.scale(1, -1);
			}
		});
	};

	const applyCrop = () => {
		const rect = crop;
		if (!rect || rect.w < 2 || rect.h < 2) return;
		reshape(rect.w, rect.h, (ctx) => ctx.translate(-rect.x, -rect.y));
		setTool('draw');
	};

	const toImagePoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const view = event.currentTarget;
		const box = view.getBoundingClientRect();
		const x = ((event.clientX - box.left) / box.width) * view.width;
		const y = ((event.clientY - box.top) / box.height) * view.height;
		return {x: Math.min(view.width, Math.max(0, x)), y: Math.min(view.height, Math.max(0, y))};
	};

	const strokeTo = (from: {x: number; y: number}, to: {x: number; y: number}) => {
		const ink = inkRef.current;
		const view = viewRef.current;
		const ctx = ink?.getContext('2d');
		if (!ink || !view || !ctx) return;
		// The slider is in screen pixels; convert to image pixels.
		const perScreenPixel = view.width / Math.max(1, view.getBoundingClientRect().width);
		ctx.save();
		ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
		ctx.strokeStyle = color;
		ctx.lineWidth = Math.max(1, size * perScreenPixel * (tool === 'erase' ? 2.5 : 1));
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.beginPath();
		ctx.moveTo(from.x, from.y);
		ctx.lineTo(to.x, to.y);
		ctx.stroke();
		ctx.restore();
		render();
	};

	const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (state !== 'ready' || event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		const point = toImagePoint(event);
		if (tool === 'crop') {
			cropStartRef.current = point;
			setCrop({x: point.x, y: point.y, w: 0, h: 0});
			return;
		}
		remember();
		strokeRef.current = point;
		strokeTo(point, point);
	};

	const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const point = toImagePoint(event);
		if (tool === 'crop') {
			const start = cropStartRef.current;
			if (!start) return;
			setCrop({
				x: Math.round(Math.min(start.x, point.x)),
				y: Math.round(Math.min(start.y, point.y)),
				w: Math.round(Math.abs(point.x - start.x)),
				h: Math.round(Math.abs(point.y - start.y)),
			});
			return;
		}
		const last = strokeRef.current;
		if (!last) return;
		strokeTo(last, point);
		strokeRef.current = point;
	};

	const onPointerUp = () => {
		strokeRef.current = null;
		cropStartRef.current = null;
	};

	const exportBlob = useCallback(async (): Promise<Blob | null> => {
		const base = baseRef.current;
		const ink = inkRef.current;
		if (!base || !ink) return null;
		const out = copyCanvas(base);
		out.getContext('2d')?.drawImage(ink, 0, 0);
		return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
	}, []);

	const download = async () => {
		const blob = await exportBlob();
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = editedFileName(fileName);
		document.body.appendChild(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
	};

	const send = async () => {
		if (!channelId || busy) return;
		setBusy(true);
		try {
			const blob = await exportBlob();
			if (!blob) throw new Error('Nothing to send');
			const name = editedFileName(fileName);
			const formData = new FormData();
			formData.append(
				'payload_json',
				JSON.stringify({
					content: '',
					nonce: SnowflakeUtils.fromTimestamp(Date.now()),
					attachments: [{id: '0', filename: name, title: name}],
				}),
			);
			formData.append('files[0]', new File([blob], name, {type: 'image/png'}));
			await http.post(Endpoints.CHANNEL_MESSAGES(channelId), {body: formData});
			ToastCommands.success(t`Edited image sent.`);
			onClose();
		} catch {
			ToastCommands.error(t`Couldn't send the edited image. Try again.`);
		} finally {
			setBusy(false);
		}
	};

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				event.preventDefault();
				onClose();
			} else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
				event.stopPropagation();
				event.preventDefault();
				undo();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [onClose, undo]);

	const ready = state === 'ready';
	const toolButton = (value: Tool, label: string, icon: React.ReactNode) => (
		<button
			type="button"
			className={clsx(styles.button, tool === value && styles.buttonActive)}
			onClick={() => {
				setTool(value);
				if (value !== 'crop') setCrop(null);
			}}
			disabled={!ready}
			aria-pressed={tool === value}
			aria-label={label}
			title={label}
		>
			{icon}
		</button>
	);
	const actionButton = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
		<button
			type="button"
			className={styles.button}
			onClick={onClick}
			disabled={!ready || disabled}
			aria-label={label}
			title={label}
		>
			{icon}
		</button>
	);

	return createPortal(
		<div className={styles.root} role="dialog" aria-modal="true" aria-label={t`Image editor`}>
			<div className={styles.toolbar}>
				<div className={styles.group}>
					{toolButton('draw', t`Draw`, <PencilSimpleIcon size={18} weight="bold" />)}
					{toolButton('erase', t`Erase drawing`, <EraserIcon size={18} weight="bold" />)}
					{toolButton('crop', t`Crop`, <CropIcon size={18} weight="bold" />)}
				</div>
				{tool === 'crop' ? (
					<div className={styles.group}>
						<span className={styles.hint}>
							<Trans>Drag over the part to keep</Trans>
						</span>
						<button
							type="button"
							className={clsx(styles.button, styles.buttonWide, styles.buttonPrimary)}
							onClick={applyCrop}
							disabled={!crop || crop.w < 2 || crop.h < 2}
						>
							<CheckIcon size={16} weight="bold" />
							<Trans>Apply crop</Trans>
						</button>
					</div>
				) : (
					<div className={styles.group}>
						{tool === 'draw' &&
							PEN_COLORS.map((value) => (
								<button
									key={value}
									type="button"
									className={clsx(styles.swatch, color === value && styles.swatchActive)}
									style={{backgroundColor: value}}
									onClick={() => setColor(value)}
									aria-label={t`Pen colour ${value}`}
									aria-pressed={color === value}
								/>
							))}
						{tool === 'draw' && (
							<input
								type="color"
								className={styles.colorInput}
								value={color}
								onChange={(event) => setColor(event.target.value)}
								aria-label={t`Custom pen colour`}
								title={t`Custom pen colour`}
							/>
						)}
						<input
							type="range"
							className={styles.size}
							min={1}
							max={40}
							value={size}
							onChange={(event) => setSize(Number(event.target.value))}
							aria-label={t`Brush size`}
							title={t`Brush size`}
						/>
					</div>
				)}
				<div className={styles.group}>
					{actionButton(t`Rotate left`, <ArrowCounterClockwiseIcon size={18} weight="bold" />, () => rotate(false))}
					{actionButton(t`Rotate right`, <ArrowClockwiseIcon size={18} weight="bold" />, () => rotate(true))}
					{actionButton(t`Flip horizontally`, <ArrowsHorizontalIcon size={18} weight="bold" />, () => flip(true))}
					{actionButton(t`Flip vertically`, <ArrowsVerticalIcon size={18} weight="bold" />, () => flip(false))}
					{actionButton(t`Undo`, <ArrowUUpLeftIcon size={18} weight="bold" />, undo, undoCount === 0)}
				</div>
				<div className={styles.spacer} />
				<div className={styles.group}>
					<button
						type="button"
						className={clsx(styles.button, styles.buttonWide)}
						onClick={() => void download()}
						disabled={!ready}
					>
						<DownloadSimpleIcon size={16} weight="bold" />
						<Trans>Download</Trans>
					</button>
					{channelId && (
						<button
							type="button"
							className={clsx(styles.button, styles.buttonWide, styles.buttonPrimary)}
							onClick={() => void send()}
							disabled={!ready || busy}
						>
							<PaperPlaneRightIcon size={16} weight="fill" />
							{busy ? <Trans>Sending…</Trans> : <Trans>Send</Trans>}
						</button>
					)}
					<button type="button" className={styles.button} onClick={onClose} aria-label={t`Close`} title={t`Close`}>
						<XIcon size={18} weight="bold" />
					</button>
				</div>
			</div>
			<div className={styles.stage}>
				{state === 'loading' && (
					<p className={styles.message}>
						<Trans>Loading image…</Trans>
					</p>
				)}
				{state === 'failed' && (
					<p className={styles.message}>
						<Trans>This image couldn't be opened for editing.</Trans>
					</p>
				)}
				<canvas
					ref={viewRef}
					className={clsx(styles.canvas, !ready && styles.canvasHidden, tool === 'crop' && styles.canvasCrop)}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>
			</div>
		</div>,
		document.body,
	);
}
