// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the radio popout (from the voice panel). Add YouTube links to the call's
// shared queue, play/pause, seek, skip and stop for everyone; volume and "show video"
// are only for this device.

import Radio, {MAX_QUEUE, type RadioItem} from '@app/features/radio/Radio';
import styles from '@app/features/radio/RadioPopout.module.css';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import Users from '@app/features/user/state/Users';
import {Trans, useLingui} from '@lingui/react/macro';
import {PauseIcon, PlayIcon, SkipForwardIcon, StopIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

function formatTime(seconds: number): string {
	const whole = Math.max(0, Math.floor(seconds));
	const h = Math.floor(whole / 3600);
	const m = Math.floor((whole % 3600) / 60);
	const s = whole % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

function itemTitle(item: RadioItem, playerTitle: string | null): string {
	return item.t ?? playerTitle ?? `youtu.be/${item.v}`;
}

const AddedBy = observer(function AddedBy({userId}: {userId: string}) {
	const user = Users.getUser(userId);
	if (!user) return null;
	const name = user.globalName || user.username;
	return (
		<span className={styles.addedBy}>
			<Trans>added by {name}</Trans>
		</span>
	);
});

const NowPlaying = observer(function NowPlaying({item}: {item: RadioItem}) {
	const {t} = useLingui();
	// While the slider is being dragged, show where it is instead of the live position.
	const [dragValue, setDragValue] = useState<number | null>(null);
	const duration = Radio.duration;
	const position = duration > 0 ? Math.min(Radio.position, duration) : Radio.position;
	const shown = dragValue ?? position;
	return (
		<section className={styles.now}>
			<div className={styles.nowTitle} title={itemTitle(item, Radio.playerTitle)}>
				{itemTitle(item, Radio.playerTitle)}
			</div>
			<AddedBy userId={item.by} />
			{Radio.blocked && (
				<button type="button" className={styles.blocked} onClick={() => Radio.unblock()}>
					<Trans>Your browser is holding playback back. Click here to listen.</Trans>
				</button>
			)}
			<div className={styles.seekRow}>
				<span className={styles.time}>{formatTime(shown)}</span>
				<input
					type="range"
					className={styles.seek}
					min={0}
					max={duration > 0 ? Math.floor(duration) : 1}
					step={1}
					disabled={duration <= 0}
					value={duration > 0 ? Math.floor(shown) : 0}
					onChange={(event) => setDragValue(Number(event.target.value))}
					onPointerUp={() => {
						if (dragValue !== null) Radio.seek(dragValue);
						setDragValue(null);
					}}
					onKeyUp={() => {
						if (dragValue !== null) Radio.seek(dragValue);
						setDragValue(null);
					}}
					aria-label={t`Position`}
				/>
				<span className={styles.time}>{duration > 0 ? formatTime(duration) : '–:––'}</span>
			</div>
			<div className={styles.controls}>
				<button
					type="button"
					className={styles.controlPrimary}
					onClick={() => Radio.togglePlaying()}
					aria-label={Radio.playing ? t`Pause for everyone` : t`Play for everyone`}
					title={Radio.playing ? t`Pause for everyone` : t`Play for everyone`}
				>
					{Radio.playing ? <PauseIcon size={18} weight="fill" /> : <PlayIcon size={18} weight="fill" />}
				</button>
				<button
					type="button"
					className={styles.control}
					onClick={() => Radio.skip()}
					aria-label={t`Skip for everyone`}
					title={t`Skip for everyone`}
				>
					<SkipForwardIcon size={18} weight="fill" />
				</button>
				<button
					type="button"
					className={styles.control}
					onClick={() => Radio.stop()}
					aria-label={t`Stop and clear the queue`}
					title={t`Stop and clear the queue`}
				>
					<StopIcon size={18} weight="fill" />
				</button>
				<label className={styles.videoToggle}>
					<input
						type="checkbox"
						checked={Radio.showVideo}
						onChange={(event) => Radio.setShowVideo(event.target.checked)}
					/>
					<Trans>Show video</Trans>
				</label>
			</div>
		</section>
	);
});

export const RadioPopout = observer(function RadioPopout() {
	const {t} = useLingui();
	const [link, setLink] = useState('');
	const [adding, setAdding] = useState(false);
	const current = Radio.current;
	const upcoming = Radio.items.slice(1);

	const add = async () => {
		const text = link.trim();
		if (!text || adding) return;
		setAdding(true);
		const problem = await Radio.add(text);
		setAdding(false);
		if (problem === 'invalid') ToastCommands.error(t`That doesn't look like a YouTube video link.`);
		else if (problem === 'full') ToastCommands.error(t`The queue is full (${MAX_QUEUE} videos).`);
		else if (problem === 'no-call') ToastCommands.error(t`Join a voice channel to use the radio.`);
		else setLink('');
	};

	return (
		<div className={styles.popout}>
			<div className={styles.header}>
				<span className={styles.title}>
					<Trans>Radio</Trans>
				</span>
				<span className={styles.hint}>
					<Trans>Shared with everyone in the call</Trans>
				</span>
			</div>
			<form
				className={styles.addRow}
				onSubmit={(event) => {
					event.preventDefault();
					void add();
				}}
			>
				<input
					className={styles.linkInput}
					value={link}
					onChange={(event) => setLink(event.target.value)}
					placeholder={t`Paste a YouTube link`}
					aria-label={t`YouTube link`}
					disabled={!Radio.canUse}
				/>
				<button type="submit" className={styles.addButton} disabled={!Radio.canUse || adding || !link.trim()}>
					{adding ? <Trans>Adding…</Trans> : <Trans>Add</Trans>}
				</button>
			</form>
			<div className={styles.body}>
				{current ? (
					<NowPlaying item={current} />
				) : (
					<p className={styles.empty}>
						<Trans>Nothing is playing. Add a YouTube link and everyone in the call hears it.</Trans>
					</p>
				)}
				{upcoming.length > 0 && (
					<section className={styles.queue}>
						<span className={styles.sectionTitle}>
							<Trans>Up next</Trans>
						</span>
						{upcoming.map((item) => (
							<div key={item.id} className={styles.queueItem}>
								<span className={styles.queueTitle} title={itemTitle(item, null)}>
									{itemTitle(item, null)}
								</span>
								<button
									type="button"
									className={styles.removeButton}
									onClick={() => Radio.remove(item.id)}
									aria-label={t`Remove from queue`}
									title={t`Remove from queue`}
								>
									<XIcon size={12} weight="bold" />
								</button>
							</div>
						))}
					</section>
				)}
			</div>
			<label className={styles.volume}>
				<span>
					<Trans>Radio volume</Trans>
				</span>
				<input
					type="range"
					min={0}
					max={100}
					value={Math.round(Radio.volume * 100)}
					onChange={(event) => Radio.setVolume(Number(event.target.value) / 100)}
					aria-label={t`Radio volume`}
				/>
				<span className={styles.volumeValue}>{Math.round(Radio.volume * 100)}%</span>
			</label>
		</div>
	);
});
