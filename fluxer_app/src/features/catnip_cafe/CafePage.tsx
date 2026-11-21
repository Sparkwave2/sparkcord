// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the game page. Pet the cat on the left (keep a rhythm, watch its
// mood, feed it treats, catch mice), hire helpers on the right, and use the tabs in the
// middle for upgrades, cats, the garden, daily goals, trophies, Nine Lives and rankings.

import Authentication from '@app/features/auth/state/Authentication';
import {type CatExpression, CafeCat} from '@app/features/catnip_cafe/CafeCat';
import {CatsTab} from '@app/features/catnip_cafe/CafeCatsTab';
import {CafeEmoji} from '@app/features/catnip_cafe/CafeEmoji';
import Cafe from '@app/features/catnip_cafe/CafeEngine';
import {formatDuration, formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import {GardenTab} from '@app/features/catnip_cafe/CafeGardenTab';
import {GoalsTab} from '@app/features/catnip_cafe/CafeGoalsTab';
import {LeaderboardTab, LivesTab, TrophiesTab} from '@app/features/catnip_cafe/CafeMoreTabs';
import styles from '@app/features/catnip_cafe/CafePage.module.css';
import {HelperShop, UpgradesTab} from '@app/features/catnip_cafe/CafeShop';
import {cafeSound} from '@app/features/catnip_cafe/CafeSound';
import {CafeWardrobe} from '@app/features/catnip_cafe/CafeWardrobe';
import {MAX_RHYTHM, MOOD_MAX, MOUSE_RUN_MS, TREATS} from '@app/features/catnip_cafe/CafeWorld';
import {useLingui} from '@lingui/react/macro';
import {CoatHangerIcon, SpeakerHighIcon, SpeakerLowIcon, SpeakerSlashIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

const SoundControls = observer(function SoundControls() {
	const {t} = useLingui();
	const silent = cafeSound.muted || cafeSound.volume <= 0;
	const Icon = silent ? SpeakerSlashIcon : cafeSound.volume < 0.4 ? SpeakerLowIcon : SpeakerHighIcon;
	return (
		<div className={styles.sound} data-flx="catnip-cafe.sound">
			<button
				type="button"
				className={styles.soundButton}
				onClick={() => cafeSound.setMuted(!silent)}
				aria-label={silent ? t`Turn café sounds on` : t`Mute café sounds`}
				title={silent ? t`Turn café sounds on` : t`Mute café sounds`}
				aria-pressed={silent}
			>
				<Icon weight="bold" />
			</button>
			<input
				type="range"
				className={styles.soundSlider}
				min={0}
				max={100}
				step={5}
				value={cafeSound.muted ? 0 : Math.round(cafeSound.volume * 100)}
				onChange={(event) => cafeSound.setVolume(Number(event.currentTarget.value) / 100)}
				aria-label={t`Café sound volume`}
			/>
		</div>
	);
});

/** Eases a shown number towards its real value, so big jumps roll up instead of snapping. */
function useRollingNumber(target: number): number {
	const [shown, setShown] = useState(target);
	const shownRef = useRef(target);
	useEffect(() => {
		const from = shownRef.current;
		// Small steady changes (the tick) show directly; big jumps roll for a moment.
		if (Math.abs(target - from) <= Math.max(1, Math.abs(from) * 0.02)) {
			shownRef.current = target;
			setShown(target);
			return;
		}
		const start = performance.now();
		let frame = 0;
		const step = (time: number) => {
			const progress = Math.min(1, (time - start) / 450);
			const eased = 1 - (1 - progress) ** 3;
			shownRef.current = from + (target - from) * eased;
			setShown(shownRef.current);
			if (progress < 1) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		// Animation frames pause in hidden tabs; never leave a stale number behind.
		const snap = setTimeout(() => {
			cancelAnimationFrame(frame);
			shownRef.current = target;
			setShown(target);
		}, 600);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(snap);
		};
	}, [target]);
	return shown;
}

const MoodBar = observer(function MoodBar() {
	const {t} = useLingui();
	const mood = Cafe.mood;
	const bliss = Cafe.blissActive;
	return (
		<div className={styles.moodRow}>
			<span className={styles.moodLabel} title={t`Pet the cat in a steady rhythm to raise its mood. Full mood sets off Bliss.`}>
				<CafeEmoji className={styles.inlineEmoji} emoji={bliss ? '💖' : mood.emoji} /> {bliss ? t`Bliss!` : mood.name}
			</span>
			<span className={clsx(styles.moodBar, bliss && styles.moodBliss)}>
				<span
					className={styles.moodFill}
					style={{width: `${bliss ? 100 : (Cafe.state.mood / MOOD_MAX) * 100}%`}}
				/>
			</span>
			<span className={clsx(styles.rhythm, Cafe.rhythm >= MAX_RHYTHM && styles.rhythmFull)} title={t`Petting rhythm`}>
				♪ ×{Cafe.rhythm}
			</span>
		</div>
	);
});

const TreatBar = observer(function TreatBar() {
	const {t} = useLingui();
	return (
		<div className={styles.treats}>
			{TREATS.map((treat) => {
				const count = Cafe.state.treats[treat.id] ?? 0;
				const cost = Cafe.treatCost(treat);
				if (treat.id === 'sardine' && count <= 0) return null;
				const usable = count > 0 || (cost > 0 && Cafe.state.purrs >= cost);
				return (
					<button
						key={treat.id}
						type="button"
						className={clsx(styles.treat, usable && styles.affordable)}
						onClick={() => Cafe.feed(treat.id)}
						disabled={!usable}
						title={`${treat.name}: ${treat.description}`}
					>
						<CafeEmoji className={styles.treatEmoji} emoji={treat.emoji} />
						<span className={styles.treatCount}>{count > 0 ? `×${count}` : `🐾 ${formatPurrs(cost)}`}</span>
					</button>
				);
			})}
			<span className={styles.treatHint}>{t`Treats`}</span>
		</div>
	);
});

const WelcomeCard = observer(function WelcomeCard() {
	const {t} = useLingui();
	const welcome = Cafe.welcome;
	if (!welcome) return null;
	const ready = Cafe.readyPlots;
	const goals = Cafe.state.goals.list.filter((goal) => !goal.claimed).length;
	return (
		<div className={styles.overlay}>
			<div className={styles.welcome}>
				<CafeCat className={styles.welcomeCat} coat={Cafe.state.outfit.coat} expression="happy" hat={Cafe.state.outfit.hat} />
				<h2 className={styles.welcomeTitle}>{t`Welcome back!`}</h2>
				<p className={styles.welcomeLine}>{t`You were away for ${formatDuration(welcome.awayMs)}.`}</p>
				{welcome.purrs >= 1 && (
					<p className={styles.welcomeBig}>🐾 +{formatPurrs(welcome.purrs)}</p>
				)}
				<ul className={styles.welcomeList}>
					{welcome.awayMs > Cafe.awayCapMs && (
						<li>{t`Your café earns for up to ${formatDuration(Cafe.awayCapMs)} while you're away.`}</li>
					)}
					{ready > 0 && <li>{t`🌿 ${ready} plants are ready to harvest.`}</li>}
					{goals > 0 && <li>{t`🎯 ${goals} daily goals are waiting.`}</li>}
					{Cafe.residentCats.length > 0 && <li>{t`🐈 Your cats grew a little closer.`}</li>}
				</ul>
				<button type="button" className={styles.primaryButton} onClick={() => Cafe.dismissWelcome()}>
					{t`Back to petting`}
				</button>
			</div>
		</div>
	);
});

const CONFETTI_COLOURS = ['#ff7eb6', '#ffd166', '#06d6a0', '#4cc9f0', '#c3a6ff'];

const Celebration = observer(function Celebration() {
	const {t} = useLingui();
	const celebration = Cafe.celebration;
	if (!celebration) return null;
	return (
		<div key={celebration.id} className={styles.celebration} aria-live="polite">
			{Array.from({length: 18}, (_, index) => (
				<span
					key={index}
					className={styles.confetti}
					style={
						{
							left: `${5 + ((index * 53) % 90)}%`,
							background: CONFETTI_COLOURS[index % CONFETTI_COLOURS.length],
							animationDelay: `${(index % 6) * 0.06}s`,
							'--drift': `${((index * 37) % 60) - 30}px`,
						} as React.CSSProperties
					}
				/>
			))}
			<div className={styles.celebrationBanner}>
				<CafeEmoji className={styles.inlineEmoji} emoji="🏆" /> {t`Achievement unlocked:`} <strong>{celebration.name}</strong>
			</div>
		</div>
	);
});

type Tab = 'upgrades' | 'cats' | 'garden' | 'goals' | 'trophies' | 'lives' | 'leaderboard';

export const CafePage = observer(function CafePage() {
	const {t} = useLingui();
	const [tab, setTab] = useState<Tab>('upgrades');
	const [squish, setSquish] = useState(0);
	const [justPetted, setJustPetted] = useState(false);
	const [wardrobe, setWardrobe] = useState(false);
	const [look, setLook] = useState({x: 0, y: 0});
	const stageRef = useRef<HTMLDivElement>(null);
	const catRef = useRef<HTMLButtonElement>(null);
	const petTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const userId = Authentication.currentUserId;
	const purrs = useRollingNumber(Cafe.state.purrs);

	useEffect(() => {
		if (!userId) return;
		cafeSound.preload();
		return Cafe.start(userId);
	}, [userId]);
	useEffect(() => () => {
		if (petTimer.current) clearTimeout(petTimer.current);
	}, []);
	// The eyes follow the pointer anywhere in the window, not just over the cat's panel.
	useEffect(() => {
		const onPointerMove = (event: PointerEvent) => {
			const cat = catRef.current?.getBoundingClientRect();
			if (!cat) return;
			const clamp = (value: number) => Math.max(-1, Math.min(1, value));
			const x = clamp((event.clientX - (cat.left + cat.width / 2)) / (cat.width * 0.8));
			const y = clamp((event.clientY - (cat.top + cat.height * 0.45)) / (cat.height * 0.8));
			setLook((look) => (Math.abs(x - look.x) > 0.05 || Math.abs(y - look.y) > 0.05 ? {x, y} : look));
		};
		window.addEventListener('pointermove', onPointerMove, {passive: true});
		return () => window.removeEventListener('pointermove', onPointerMove);
	}, []);

	if (Cafe.loadFailed) {
		return (
			<div className={styles.page}>
				<p className={styles.empty}>{t`Couldn't open your café. Try again in a moment.`}</p>
			</div>
		);
	}
	if (!Cafe.loaded) {
		return (
			<div className={styles.page}>
				<p className={styles.empty}>{t`Opening the café…`}</p>
			</div>
		);
	}

	const onPet = (event: React.MouseEvent<HTMLButtonElement>) => {
		const stage = stageRef.current?.getBoundingClientRect();
		const x = stage ? event.clientX - stage.left : 0;
		const y = stage ? event.clientY - stage.top : 0;
		Cafe.pet(x, y);
		setSquish((value) => value + 1);
		setJustPetted(true);
		if (petTimer.current) clearTimeout(petTimer.current);
		petTimer.current = setTimeout(() => setJustPetted(false), 450);
	};

	const buff = Cafe.activeBuff;
	const bliss = Cafe.blissActive;
	const expression: CatExpression = justPetted
		? 'happy'
		: buff || bliss
			? 'excited'
			: Cafe.mood.id === 'grumpy'
				? 'bored'
				: 'normal';
	const goalsWaiting = Cafe.unclaimedGoals;
	const tabs: Array<{id: Tab; label: string; badge?: number}> = [
		{id: 'upgrades', label: t`Upgrades`},
		{id: 'cats', label: t`Cats`},
		{id: 'garden', label: t`Garden`, badge: Cafe.readyPlots},
		{id: 'goals', label: t`Goals`, badge: goalsWaiting},
		{id: 'trophies', label: t`Trophies`},
		{id: 'lives', label: t`Nine Lives`},
		{id: 'leaderboard', label: t`Ranks`},
	];

	return (
		<div className={styles.page}>
			<div className={styles.stage} ref={stageRef}>
				<div className={styles.stageTop}>
					<button
						type="button"
						className={styles.soundButton}
						onClick={() => setWardrobe(true)}
						title={t`Wardrobe`}
						aria-label={t`Wardrobe`}
					>
						<CoatHangerIcon weight="bold" />
					</button>
					<SoundControls />
				</div>
				<h1 className={styles.title}>{t`Catnip Café`}</h1>
				<div className={styles.purrs}>🐾 {formatPurrs(purrs)}</div>
				<div className={styles.rate}>
					{t`${formatPurrs(Cafe.pps)} purrs per second`}
					{buff && (
						<span className={styles.buff}>
							{buff.kind === 'zoomies' ? t`Zoomies!` : t`Petting frenzy!`}{' '}
							{Math.max(0, Math.ceil((buff.until - Cafe.now) / 1000))}s
						</span>
					)}
					{bliss && (
						<span className={clsx(styles.buff, styles.buffBliss)}>
							{t`Bliss`} {Math.max(0, Math.ceil((Cafe.state.blissUntil - Cafe.now) / 1000))}s
						</span>
					)}
				</div>
				<MoodBar />
				<button
					type="button"
					key={squish}
					ref={catRef}
					className={clsx(styles.catButton, bliss && styles.catBliss)}
					onClick={onPet}
					aria-label={t`Pet the cat`}
				>
					<CafeCat
						className={styles.cat}
						coat={Cafe.state.outfit.coat}
						hat={Cafe.state.outfit.hat}
						collar={Cafe.state.outfit.collar}
						expression={expression}
						look={look}
						animated
					/>
				</button>
				<div className={styles.petHint}>{t`Pet the cat! Each pet: ${formatPurrs(Cafe.petValue)}`}</div>
				<TreatBar />
				{Cafe.floaters.map((floater) => (
					<span
						key={floater.id}
						className={clsx(
							floater.kind === 'number' ? styles.floater : styles.particle,
							floater.kind === 'heart' && styles.particleHeart,
						)}
						style={
							{
								left: floater.x,
								top: floater.y,
								'--dx': `${floater.dx}px`,
								'--dy': `${floater.dy}px`,
							} as React.CSSProperties
						}
					>
						{floater.text}
					</span>
				))}
				{Cafe.mouse && (
					<button
						key={Cafe.mouse.id}
						type="button"
						className={clsx(styles.mouse, Cafe.mouse.fromLeft ? styles.mouseRight : styles.mouseLeft)}
						style={{top: `${Cafe.mouse.y}%`, animationDuration: `${MOUSE_RUN_MS}ms`}}
						onClick={() => Cafe.catchMouse()}
						aria-label={t`Catch the mouse`}
						title={t`A mouse! Catch it!`}
					>
						<CafeEmoji className={styles.mouseEmoji} emoji="🐁" />
					</button>
				)}
				<div className={styles.notices}>
					{Cafe.notices.map((notice) => (
						<button
							key={notice.id}
							type="button"
							className={styles.notice}
							onClick={() => Cafe.dismissNotice(notice.id)}
						>
							{notice.text}
						</button>
					))}
				</div>
				<Celebration />
				{wardrobe && <CafeWardrobe onClose={() => setWardrobe(false)} />}
				<WelcomeCard />
			</div>
			<div className={styles.middle}>
				<div className={styles.tabs} role="tablist">
					{tabs.map((entry) => (
						<button
							key={entry.id}
							type="button"
							role="tab"
							aria-selected={tab === entry.id}
							className={clsx(styles.tab, tab === entry.id && styles.tabActive)}
							onClick={() => setTab(entry.id)}
						>
							{entry.label}
							{entry.badge ? <span className={styles.tabBadge}>{entry.badge}</span> : null}
						</button>
					))}
				</div>
				<div className={styles.tabBody}>
					{tab === 'upgrades' && <UpgradesTab />}
					{tab === 'cats' && <CatsTab />}
					{tab === 'garden' && <GardenTab />}
					{tab === 'goals' && <GoalsTab />}
					{tab === 'trophies' && <TrophiesTab />}
					{tab === 'lives' && <LivesTab />}
					{tab === 'leaderboard' && <LeaderboardTab />}
				</div>
			</div>
			<HelperShop />
			{Cafe.lucky && (
				<button
					type="button"
					className={styles.lucky}
					style={{left: `${Cafe.lucky.x}%`, top: `${Cafe.lucky.y}%`}}
					onClick={() => Cafe.catchLucky()}
					aria-label={t`Catch the Lucky Cat`}
					title={t`Lucky Cat! Click it.`}
				>
					<CafeEmoji className={styles.luckyEmoji} emoji="🐈" />
				</button>
			)}
		</div>
	);
});

export default CafePage;
