// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: where the radio's YouTube player lives. It is always mounted (the player
// must keep running while only listening), invisible in a corner for the radio and a
// small movable window when the video is shown (watch-together). The player element
// itself is created by Radio and must never be re-parented, or it would reload.

import Radio from '@app/features/radio/Radio';
import styles from '@app/features/radio/RadioWindow.module.css';
import {useLingui} from '@lingui/react/macro';
import {ArrowsInSimpleIcon, ArrowsOutSimpleIcon, CornersOutIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

export const RadioWindow = observer(function RadioWindow() {
	const {t} = useLingui();
	const playerRef = useRef<HTMLDivElement>(null);
	const [large, setLarge] = useState(false);
	// Distance of the window from the bottom right corner of the app.
	const [offset, setOffset] = useState({right: 16, bottom: 96});
	const drag = useRef<{x: number; y: number; right: number; bottom: number} | null>(null);

	useEffect(() => {
		Radio.setContainer(playerRef.current);
		return () => Radio.setContainer(null);
	}, []);

	const visible = Radio.active && Radio.showVideo;
	const title = Radio.current?.t ?? Radio.playerTitle ?? t`Radio`;

	const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest('button')) return;
		drag.current = {x: event.clientX, y: event.clientY, right: offset.right, bottom: offset.bottom};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const start = drag.current;
		if (!start) return;
		setOffset({
			right: Math.min(window.innerWidth - 120, Math.max(0, start.right - (event.clientX - start.x))),
			bottom: Math.min(window.innerHeight - 60, Math.max(0, start.bottom - (event.clientY - start.y))),
		});
	};
	const onPointerUp = () => {
		drag.current = null;
	};

	return (
		<div
			className={visible ? (large ? `${styles.window} ${styles.large}` : styles.window) : styles.hidden}
			style={visible ? {right: offset.right, bottom: offset.bottom} : undefined}
			aria-hidden={!visible}
			// The overlay layer makes its children clickable; the hidden player must not be, or it
			// blocks whatever sits under it (the composer's emoji button).
			data-overlay-pass-through={visible ? undefined : ''}
		>
			<div
				className={styles.header}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			>
				<span className={styles.title}>{title}</span>
				<button
					type="button"
					className={styles.headerButton}
					onClick={() => setLarge(!large)}
					aria-label={large ? t`Smaller` : t`Larger`}
					title={large ? t`Smaller` : t`Larger`}
				>
					{large ? <ArrowsInSimpleIcon size={14} /> : <ArrowsOutSimpleIcon size={14} />}
				</button>
				<button
					type="button"
					className={styles.headerButton}
					onClick={() => void playerRef.current?.requestFullscreen?.().catch(() => {})}
					aria-label={t`Full screen`}
					title={t`Full screen`}
				>
					<CornersOutIcon size={14} />
				</button>
				<button
					type="button"
					className={styles.headerButton}
					onClick={() => Radio.setShowVideo(false)}
					aria-label={t`Hide video`}
					title={t`Hide video`}
				>
					<XIcon size={14} weight="bold" />
				</button>
			</div>
			<div ref={playerRef} className={styles.player} />
		</div>
	);
});
