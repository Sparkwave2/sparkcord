// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: the cat you pet. Drawn here (a round ginger cat face).

import type React from 'react';

export function CafeCat({className}: {className?: string}): React.ReactElement {
	return (
		<svg viewBox="0 0 200 200" className={className} aria-hidden="true">
			<defs>
				<radialGradient id="cafe-cat-fur" cx="50%" cy="40%" r="65%">
					<stop offset="0%" stopColor="#ffc983" />
					<stop offset="100%" stopColor="#ef9a4a" />
				</radialGradient>
			</defs>
			{/* Ears */}
			<path d="M38 78 48 18l46 38Z" fill="#ef9a4a" stroke="#b9682a" strokeWidth="5" strokeLinejoin="round" />
			<path d="M162 78 152 18l-46 38Z" fill="#ef9a4a" stroke="#b9682a" strokeWidth="5" strokeLinejoin="round" />
			<path d="M52 66 56 36l22 18Z" fill="#ffb3c1" />
			<path d="M148 66 144 36l-22 18Z" fill="#ffb3c1" />
			{/* Head */}
			<ellipse cx="100" cy="112" rx="76" ry="66" fill="url(#cafe-cat-fur)" stroke="#b9682a" strokeWidth="5" />
			{/* Stripes */}
			<path d="M100 48v18M86 51l4 15M114 51l-4 15" stroke="#c9752f" strokeWidth="5" strokeLinecap="round" />
			{/* Eyes, happy and closed */}
			<path d="M60 104q12-12 24 0" fill="none" stroke="#4a2b14" strokeWidth="6" strokeLinecap="round" />
			<path d="M116 104q12-12 24 0" fill="none" stroke="#4a2b14" strokeWidth="6" strokeLinecap="round" />
			{/* Blush */}
			<ellipse cx="58" cy="128" rx="11" ry="7" fill="#ff8fa3" opacity="0.6" />
			<ellipse cx="142" cy="128" rx="11" ry="7" fill="#ff8fa3" opacity="0.6" />
			{/* Nose and mouth */}
			<path d="M93 120h14l-7 8Z" fill="#e5677d" />
			<path d="M100 128q-6 10-14 6M100 128q6 10 14 6" fill="none" stroke="#4a2b14" strokeWidth="4" strokeLinecap="round" />
			{/* Whiskers */}
			<path
				d="M44 122 12 116M44 132 12 136M156 122l32-6M156 132l32 4"
				stroke="#fff4e6"
				strokeWidth="3"
				strokeLinecap="round"
			/>
		</svg>
	);
}
