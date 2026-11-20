// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: shows the game being played, fullscreen or minimized to a small window you can
// drag around while chatting. The page structure stays the same in both states, so the
// game's frame is never moved or reloaded when switching between them.

import styles from '@app/features/game_player/GameWindow.module.css';
import GamePlayer from '@app/features/game_player/GamePlayer';
import {FLASH_CORE} from '@app/features/channel/components/embeds/attachments/RomSystems';
import {useLingui} from '@lingui/react/macro';
import {ArrowsOutSimpleIcon, GameControllerIcon, MinusIcon, XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

const CLOSE_ANIMATION_MS = 200;

export const GameWindow = observer(function GameWindow() {
	const {t} = useLingui();
	const game = GamePlayer.game;
	const minimized = GamePlayer.minimized;
	const [closing, setClosing] = useState(false);
	const frameRef = useRef<HTMLIFrameElement>(null);
	// Distance of the small window from the bottom right corner of the app.
	const [offset, setOffset] = useState({right: 16, bottom: 96});
	const drag = useRef<{x: number; y: number; right: number; bottom: number} | null>(null);

	const requestClose = useCallback(() => {
		setClosing(true);
		window.setTimeout(() => {
			setClosing(false);
			GamePlayer.close();
		}, CLOSE_ANIMATION_MS);
	}, []);

	useEffect(() => {
		if (!game || minimized) return;
		// Esc only reaches this window when the game doesn't have focus. It minimizes rather
		// than closes, so the game isn't lost by accident.
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				GamePlayer.minimize();
			}
		};
		window.addEventListener('keydown', onKey, true);
		frameRef.current?.focus();
		return () => window.removeEventListener('keydown', onKey, true);
	}, [game, minimized]);

	const src = useMemo(() => {
		if (!game) return '';
		const accent = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#a855f7';
		return game.system.core === FLASH_CORE
			? `/assets/ruffle/player.html?${new URLSearchParams({swf: game.romUrl}).toString()}`
			: `/assets/emulatorjs/player.html?${new URLSearchParams({
					core: game.system.core,
					name: game.fileName,
					rom: game.romUrl,
					color: accent,
				}).toString()}`;
	}, [game]);

	if (!game) return null;

	const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!minimized || (event.target as HTMLElement).closest('button')) return;
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

	return createPortal(
		<div
			className={clsx(styles.root, minimized && styles.rootMinimized, closing && styles.closing)}
			role="dialog"
			aria-modal={!minimized}
			aria-label={game.fileName}
		>
			{!minimized && <div className={styles.blur} aria-hidden="true" />}
			{!minimized && <div className={styles.tint} aria-hidden="true" onClick={() => GamePlayer.minimize()} />}
			<div
				className={clsx(styles.frameWrap, minimized ? styles.mini : styles.full)}
				style={minimized ? {right: offset.right, bottom: offset.bottom} : undefined}
			>
				<div
					className={clsx(styles.header, minimized && styles.headerDraggable)}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onDoubleClick={(event) => {
						if (minimized && !(event.target as HTMLElement).closest('button')) GamePlayer.maximize();
					}}
				>
					<GameControllerIcon size={minimized ? 14 : 18} weight="fill" />
					<span className={styles.title}>{game.fileName}</span>
					{!minimized && <span className={styles.system}>{game.system.label}</span>}
					{minimized ? (
						<button
							type="button"
							className={styles.headerButton}
							onClick={() => GamePlayer.maximize()}
							aria-label={t`Maximize`}
							title={t`Maximize`}
						>
							<ArrowsOutSimpleIcon size={16} weight="bold" />
						</button>
					) : (
						<button
							type="button"
							className={styles.headerButton}
							onClick={() => GamePlayer.minimize()}
							aria-label={t`Minimize`}
							title={t`Minimize`}
						>
							<MinusIcon size={18} weight="bold" />
						</button>
					)}
					<button
						type="button"
						className={styles.headerButton}
						onClick={requestClose}
						aria-label={t`Close`}
						title={t`Close`}
					>
						<XIcon size={minimized ? 16 : 18} weight="bold" />
					</button>
				</div>
				<iframe
					ref={frameRef}
					className={styles.frame}
					src={src}
					title={game.fileName}
					allow="gamepad; fullscreen; autoplay"
					allowFullScreen
				/>
			</div>
		</div>,
		document.body,
	);
});
