// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: a snail icon for Slug Mode, drawn to match the Phosphor icons used in the app
// (256-unit grid, rounded strokes in the current colour). Phosphor has no snail.

import type React from 'react';

interface SnailIconProps {
	size?: number | string;
	weight?: 'regular' | 'bold' | 'fill';
	className?: string;
}

export function SnailIcon({size = 24, weight = 'regular', className}: SnailIconProps): React.ReactElement {
	const stroke = weight === 'bold' ? 24 : 16;
	const filled = weight === 'fill';
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 256 256"
			width={size}
			height={size}
			fill="none"
			stroke="currentColor"
			strokeWidth={stroke}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			{/* Body, from the tail under the shell to the head. */}
			<path
				d="M24,200H200a32,32,0,0,0,32-32V120"
				fill={filled ? 'currentColor' : 'none'}
				fillOpacity={filled ? 0.25 : 0}
			/>
			{/* Eye stalks. */}
			<path d="M216,120,200,72" />
			<path d="M240,120l8-48" />
			{/* Shell with its spiral. */}
			<circle cx="104" cy="128" r="72" fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.25 : 0} />
			<path d="M104,128a24,24,0,1,1,24,24,48,48,0,1,1-48-48" />
		</svg>
	);
}
