// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: a cat face, drawn here. Used for the cat you pet (animated, with
// moods, outfits and eyes that follow the pointer) and for the cats in your collection.

import styles from '@app/features/catnip_cafe/CafePage.module.css';
import {COAT_BY_ID, type CoatDef} from '@app/features/catnip_cafe/CafeWorld';
import {clsx} from 'clsx';
import type React from 'react';
import {useId} from 'react';

export type CatExpression = 'normal' | 'happy' | 'bored' | 'excited';

interface CafeCatProps {
	className?: string;
	coat?: string;
	expression?: CatExpression;
	hat?: string | null;
	collar?: string | null;
	/** Where the eyes look, from -1 to 1 on each axis. */
	look?: {x: number; y: number};
	/** Blinking, ear twitches and a swishing tail. */
	animated?: boolean;
}

const HEAD = {cx: 100, cy: 112, rx: 76, ry: 66};
const STAR_DOTS = [
	[58, 80, 2.2],
	[140, 72, 1.6],
	[84, 152, 1.8],
	[150, 140, 2.4],
	[112, 60, 1.4],
	[44, 128, 1.5],
	[124, 164, 1.3],
];

function Hat({id}: {id: string}): React.ReactElement | null {
	switch (id) {
		case 'party':
			return (
				<g>
					<path d="M74 58 104 -6 132 56Z" fill="#ff7eb6" stroke="#c2407e" strokeWidth="4" strokeLinejoin="round" />
					<path d="M86 32 118 28M80 46 126 42" stroke="#ffe066" strokeWidth="6" strokeLinecap="round" />
					<circle cx="104" cy="-8" r="9" fill="#ffe066" stroke="#d4a017" strokeWidth="3" />
				</g>
			);
		case 'beanie':
			return (
				<g>
					<path d="M46 70Q100 -14 154 70Z" fill="#4f7cff" stroke="#2f4fb8" strokeWidth="4" strokeLinejoin="round" />
					<rect x="42" y="58" width="116" height="18" rx="9" fill="#7c9bff" stroke="#2f4fb8" strokeWidth="4" />
					<circle cx="100" cy="10" r="12" fill="#ffffff" stroke="#c9d4f5" strokeWidth="3" />
				</g>
			);
		case 'flowers':
			return (
				<g>
					{[
						[52, 64, '#ff8fb1'],
						[74, 50, '#ffd166'],
						[100, 45, '#9ad1ff'],
						[126, 50, '#c3a6ff'],
						[148, 64, '#ff8fb1'],
					].map(([x, y, colour]) => (
						<g key={`${x}`}>
							{[0, 72, 144, 216, 288].map((angle) => (
								<circle
									key={angle}
									cx={(x as number) + Math.cos((angle * Math.PI) / 180) * 7}
									cy={(y as number) + Math.sin((angle * Math.PI) / 180) * 7}
									r="6"
									fill={colour as string}
								/>
							))}
							<circle cx={x as number} cy={y as number} r="5" fill="#fff4b0" />
						</g>
					))}
				</g>
			);
		case 'tophat':
			return (
				<g>
					<rect x="70" y="-6" width="60" height="60" rx="4" fill="#2b2b33" stroke="#111" strokeWidth="4" />
					<rect x="70" y="36" width="60" height="12" fill="#c0392b" />
					<ellipse cx="100" cy="56" rx="46" ry="9" fill="#2b2b33" stroke="#111" strokeWidth="4" />
				</g>
			);
		case 'wizard':
			return (
				<g>
					<path d="M58 64 118 -34 142 64Z" fill="#5b3fd1" stroke="#33207f" strokeWidth="4" strokeLinejoin="round" />
					<path d="m100 20 3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#ffe066" />
					<circle cx="122" cy="40" r="3" fill="#ffe066" />
					<circle cx="112" cy="2" r="2.5" fill="#ffe066" />
					<ellipse cx="100" cy="64" rx="56" ry="9" fill="#6d50e6" stroke="#33207f" strokeWidth="4" />
				</g>
			);
		case 'crown':
			return (
				<g>
					<path
						d="M62 62 66 22l18 20 16-30 16 30 18-20 4 40Z"
						fill="#ffd34d"
						stroke="#b8860b"
						strokeWidth="4"
						strokeLinejoin="round"
					/>
					<circle cx="100" cy="46" r="6" fill="#e63946" />
					<circle cx="78" cy="50" r="4" fill="#4cc9f0" />
					<circle cx="122" cy="50" r="4" fill="#4cc9f0" />
				</g>
			);
		case 'halo':
			return (
				<ellipse
					cx="100"
					cy="0"
					rx="42"
					ry="10"
					fill="none"
					stroke="#ffe066"
					strokeWidth="7"
					style={{filter: 'drop-shadow(0 0 6px #ffe066)'}}
				/>
			);
		default:
			return null;
	}
}

function Collar({id}: {id: string}): React.ReactElement | null {
	const band = 'M46 158Q100 200 154 158';
	switch (id) {
		case 'bell':
			return (
				<g>
					<path d={band} fill="none" stroke="#e63946" strokeWidth="11" strokeLinecap="round" />
					<circle cx="100" cy="186" r="10" fill="#ffd34d" stroke="#b8860b" strokeWidth="3" />
					<path d="M94 188h12" stroke="#8a6508" strokeWidth="3" strokeLinecap="round" />
				</g>
			);
		case 'bowtie':
			return (
				<g>
					<path d="M100 182 74 168v28Z" fill="#c0392b" stroke="#7d1f15" strokeWidth="3" strokeLinejoin="round" />
					<path d="M100 182 126 168v28Z" fill="#c0392b" stroke="#7d1f15" strokeWidth="3" strokeLinejoin="round" />
					<circle cx="100" cy="182" r="6" fill="#e74c3c" stroke="#7d1f15" strokeWidth="3" />
				</g>
			);
		case 'scarf':
			return (
				<g>
					<path d={band} fill="none" stroke="#2a9d8f" strokeWidth="16" strokeLinecap="round" />
					<path d={band} fill="none" stroke="#f4f1de" strokeWidth="16" strokeDasharray="8 12" />
					<path d="M126 178l10 28h-16Z" fill="#2a9d8f" stroke="#1d6f65" strokeWidth="3" strokeLinejoin="round" />
				</g>
			);
		case 'gold':
			return (
				<g>
					<path d={band} fill="none" stroke="#ffd34d" strokeWidth="7" strokeDasharray="6 4" strokeLinecap="round" />
					<circle cx="100" cy="186" r="11" fill="#ffd34d" stroke="#b8860b" strokeWidth="3" />
					<path d="m100 180 2 4 4 .5-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.5Z" fill="#b8860b" />
				</g>
			);
		default:
			return null;
	}
}

function Eyes({expression, coat, look}: {expression: CatExpression; coat: CoatDef; look: {x: number; y: number}}) {
	const ink = coat.id === 'black' || coat.id === 'tuxedo' || coat.id === 'galaxy' ? '#151515' : '#4a2b14';
	const iris = coat.id === 'black' || coat.id === 'tuxedo' ? '#f5c542' : coat.id === 'siamese' ? '#4aa3ff' : null;
	if (expression === 'happy') {
		const stroke = iris ? '#f5e7b8' : ink;
		return (
			<g>
				<path d="M60 106q12-12 24 0" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
				<path d="M116 106q12-12 24 0" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
			</g>
		);
	}
	const dx = look.x * 3.5;
	const dy = look.y * 2.5;
	if (expression === 'bored') {
		return (
			<g>
				{[72, 128].map((x) => (
					<g key={x}>
						<path d={`M${x - 11} 104a11 8 0 0 0 22 0Z`} fill={iris ?? ink} />
						<circle cx={x + dx} cy={107} r="2" fill="#fff" opacity="0.8" />
						<path d={`M${x - 13} 104h26`} stroke={coat.stroke} strokeWidth="4" strokeLinecap="round" />
					</g>
				))}
			</g>
		);
	}
	const big = expression === 'excited';
	return (
		<g className={styles.catEyes}>
			{[72, 128].map((x) => (
				<g key={x}>
					<ellipse cx={x} cy={104} rx={big ? 12 : 10} ry={big ? 14 : 12} fill={iris ?? ink} />
					{iris && <ellipse cx={x + dx} cy={104 + dy} rx="3.5" ry={big ? 10 : 8} fill="#151515" />}
					<circle cx={x - 3 + dx} cy={99 + dy} r={big ? 4.5 : 3.5} fill="#fff" />
					{big && <circle cx={x + 4 + dx} cy={108 + dy} r="2" fill="#fff" />}
				</g>
			))}
		</g>
	);
}

function Mouth({expression}: {expression: CatExpression}) {
	switch (expression) {
		case 'bored':
			return <path d="M92 134h16" stroke="#4a2b14" strokeWidth="4" strokeLinecap="round" />;
		case 'excited':
			return <path d="M88 130q12 20 24 0Z" fill="#c2405a" stroke="#4a2b14" strokeWidth="3.5" strokeLinejoin="round" />;
		case 'happy':
			return (
				<g>
					<path d="M100 128q-6 10-14 6M100 128q6 10 14 6" fill="none" stroke="#4a2b14" strokeWidth="4" strokeLinecap="round" />
					<path d="M95 134q5 8 10 0Z" fill="#ff8fa3" />
				</g>
			);
		default:
			return (
				<path d="M100 128q-6 10-14 6M100 128q6 10 14 6" fill="none" stroke="#4a2b14" strokeWidth="4" strokeLinecap="round" />
			);
	}
}

export function CafeCat({
	className,
	coat: coatId = 'ginger',
	expression = 'normal',
	hat = null,
	collar = null,
	look = {x: 0, y: 0},
	animated = false,
}: CafeCatProps): React.ReactElement {
	const uid = useId().replace(/:/g, '');
	const coat = COAT_BY_ID.get(coatId) ?? (COAT_BY_ID.get('ginger') as CoatDef);
	const furId = `cafe-fur-${uid}`;
	const clipId = `cafe-head-${uid}`;
	const earFill = coat.points ?? coat.furDark;
	return (
		// overflow: the swishing tail reaches past the right edge of the drawing area.
		<svg viewBox="-20 -40 240 250" className={className} overflow="visible" aria-hidden="true">
			<defs>
				<radialGradient id={furId} cx="50%" cy="40%" r="65%">
					<stop offset="0%" stopColor={coat.fur} />
					<stop offset="100%" stopColor={coat.furDark} />
				</radialGradient>
				<clipPath id={clipId}>
					<ellipse {...HEAD} />
				</clipPath>
			</defs>
			{/* Tail, peeking out behind the head */}
			<g className={clsx(animated && styles.catTail)}>
				<path d="M136 174C196 186 226 150 212 106" fill="none" stroke={coat.stroke} strokeWidth="22" strokeLinecap="round" />
				<path d="M136 174C196 186 226 150 212 106" fill="none" stroke={coat.furDark} strokeWidth="14" strokeLinecap="round" />
				{coat.points && (
					<path d="M220 136C222 124 218 114 212 106" fill="none" stroke={coat.points} strokeWidth="14" strokeLinecap="round" />
				)}
			</g>
			{/* Ears */}
			<g className={clsx(animated && styles.catEar)}>
				<path d="M38 78 48 18l46 38Z" fill={earFill} stroke={coat.stroke} strokeWidth="5" strokeLinejoin="round" />
				<path d="M52 66 56 36l22 18Z" fill="#ffb3c1" />
			</g>
			<path d="M162 78 152 18l-46 38Z" fill={earFill} stroke={coat.stroke} strokeWidth="5" strokeLinejoin="round" />
			<path d="M148 66 144 36l-22 18Z" fill="#ffb3c1" />
			{/* Head */}
			<ellipse {...HEAD} fill={`url(#${furId})`} />
			<g clipPath={`url(#${clipId})`}>
				{coat.patches?.map((patch) => (
					<path key={patch.d} d={patch.d} fill={patch.colour} opacity="0.95" />
				))}
				{coat.muzzle && <ellipse cx="100" cy="150" rx="44" ry="34" fill={coat.muzzle} />}
				{coat.points && <ellipse cx="100" cy="128" rx="36" ry="28" fill={coat.points} opacity="0.75" />}
				{coat.stars &&
					STAR_DOTS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" opacity="0.85" />)}
			</g>
			<ellipse {...HEAD} fill="none" stroke={coat.stroke} strokeWidth="5" />
			{coat.stripe && (
				<path d="M100 48v18M86 51l4 15M114 51l-4 15" stroke={coat.stripe} strokeWidth="5" strokeLinecap="round" />
			)}
			<Eyes expression={expression} coat={coat} look={look} />
			{/* Blush */}
			<ellipse cx="58" cy="128" rx="11" ry="7" fill="#ff8fa3" opacity={expression === 'happy' ? 0.85 : 0.55} />
			<ellipse cx="142" cy="128" rx="11" ry="7" fill="#ff8fa3" opacity={expression === 'happy' ? 0.85 : 0.55} />
			{/* Nose and mouth */}
			<path d="M93 120h14l-7 8Z" fill="#e5677d" />
			<Mouth expression={expression} />
			{/* Whiskers */}
			<path
				d="M44 122 12 116M44 132 12 136M156 122l32-6M156 132l32 4"
				stroke={coat.id === 'white' || coat.id === 'cream' || coat.id === 'siamese' ? '#9c8f80' : '#fff4e6'}
				strokeWidth="3"
				strokeLinecap="round"
			/>
			{collar && <Collar id={collar} />}
			{hat && <Hat id={hat} />}
		</svg>
	);
}
