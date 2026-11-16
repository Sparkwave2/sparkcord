// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord role name styles: gradient, rainbow, alternating colours per letter, and an
// optional glow. A leaf module (only React, CSS and the per-device preferences) so it is
// safe to use from message and member list components without adding import cycles.
//
// With "simplified role colours" turned on (a per-device preference), every style is
// shown as one still colour with no glow: the colour the role's managers picked, or
// else the mix of the style's colours (a rainbow gets a colour of its own per role).

import styles from '@app/features/role_style/RoleNameStyle.module.css';
import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import type {GuildRoleStyle} from '@fluxer/schema/src/domains/guild/GuildRoleSchemas';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

/** A role style together with the role's plain colour (used for glow and fallbacks). */
export interface NameStyle {
	style: GuildRoleStyle;
	/** The role colour as an integer; 0 means "no colour". */
	color: number;
	/** The role's id: gives a rainbow role its own simplified colour. */
	seed?: string;
}

const RAINBOW = ['#ff5f6d', '#ffa53b', '#ffe14d', '#5fe08a', '#4fc3ff', '#8f7bff', '#ff6fd8'];

/** The name style of a role, or null when it has none. */
export function roleNameStyle(
	role: {style: GuildRoleStyle | null; color: number; id?: string} | null | undefined,
): NameStyle | null {
	return role?.style ? {style: role.style, color: role.color, seed: role.id} : null;
}

export function intToHex(value: number): string {
	return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
}

function mixColors(colors: ReadonlyArray<number>): number {
	let r = 0;
	let g = 0;
	let b = 0;
	for (const color of colors) {
		r += (color >> 16) & 0xff;
		g += (color >> 8) & 0xff;
		b += color & 0xff;
	}
	const n = colors.length;
	return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
}

/** A bright colour picked by the seed: random-looking, but always the same for one role. */
function seededColor(seed: string): number {
	let hash = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	const hue = (hash >>> 0) % 360;
	// HSL(hue, 75%, 62%) as RGB.
	const s = 0.75;
	const l = 0.62;
	const a = s * Math.min(l, 1 - l);
	const channel = (n: number) => {
		const k = (n + hue / 30) % 12;
		return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
	};
	return (channel(0) << 16) | (channel(8) << 8) | channel(4);
}

/**
 * The one colour a styled role is shown in when role colours are simplified, as an
 * integer; null means "the plain role colour" (whatever the caller already painted).
 */
export function simplifiedColor(nameStyle: NameStyle): number | null {
	const {style} = nameStyle;
	if (style.type === 'solid') return null;
	if (style.simple_color != null) return style.simple_color;
	if (style.type === 'rainbow') return seededColor(nameStyle.seed ?? 'rainbow');
	return style.colors.length > 0 ? mixColors(style.colors) : null;
}

export function simplifyRoleColors(): boolean {
	return SparkcordPrefs.get('simpleRoleColors');
}

function fillColors(nameStyle: NameStyle): Array<string> {
	const {style} = nameStyle;
	if (style.type === 'rainbow') return RAINBOW;
	if (style.type === 'gradient' || style.type === 'alternating') return style.colors.map(intToHex);
	return [];
}

function glowColor(nameStyle: NameStyle): string | null {
	const {style} = nameStyle;
	if (!style.glow) return null;
	if (style.glow_color != null) return intToHex(style.glow_color);
	if ((style.type === 'gradient' || style.type === 'alternating') && style.colors.length > 0) {
		return intToHex(style.colors[0]);
	}
	if (style.type === 'rainbow') return '#ffffff';
	return nameStyle.color ? intToHex(nameStyle.color) : 'currentColor';
}

/**
 * Style for a role's colour dot/swatch: the plain colour, or the role's gradient,
 * rainbow or colour stripes, plus a halo when the role glows. `fallback` is what the
 * caller painted before (e.g. a default grey for roles without a colour).
 */
export function roleSwatchStyle(
	role: {style: GuildRoleStyle | null; color: number; id?: string} | null | undefined,
	fallback: string | undefined,
): React.CSSProperties {
	const base: React.CSSProperties = {backgroundColor: fallback};
	const nameStyle = roleNameStyle(role);
	if (!nameStyle) return base;
	if (simplifyRoleColors()) {
		const simple = simplifiedColor(nameStyle);
		if (simple !== null) base.backgroundColor = intToHex(simple);
		return base;
	}
	const {style} = nameStyle;
	const colors = fillColors(nameStyle);
	if (style.type === 'gradient' || style.type === 'rainbow') {
		base.backgroundImage = `linear-gradient(135deg, ${colors.join(', ')})`;
	} else if (style.type === 'alternating') {
		const step = 100 / colors.length;
		base.backgroundImage = `linear-gradient(135deg, ${colors
			.map((c, i) => `${c} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`)
			.join(', ')})`;
	}
	const glow = glowColor(nameStyle);
	if (glow) base.boxShadow = `0 0 6px ${glow === 'currentColor' ? (fallback ?? 'currentColor') : glow}`;
	return base;
}

function splitGraphemes(text: string): Array<string> {
	const Segmenter = (Intl as unknown as {Segmenter?: typeof Intl.Segmenter}).Segmenter;
	if (Segmenter) {
		return Array.from(new Segmenter(undefined, {granularity: 'grapheme'}).segment(text), (s) => s.segment);
	}
	return Array.from(text);
}

type StyleVars = React.CSSProperties & Record<`--${string}`, string | number>;

export const StyledName = observer(function StyledName({
	nameStyle,
	children,
	className,
}: {
	nameStyle: NameStyle | null | undefined;
	children: string;
	className?: string;
}) {
	const simplify = simplifyRoleColors();
	const rendered = useMemo(() => {
		if (!nameStyle) return null;
		const {style} = nameStyle;
		const colors = fillColors(nameStyle);
		const glow = glowColor(nameStyle);
		const vars: StyleVars = {};
		if (glow) vars['--name-glow'] = glow;
		if (style.type === 'gradient' || style.type === 'rainbow') {
			// Repeat the first colour at the end so the moving version loops seamlessly.
			const stops = style.animated ? [...colors, colors[0]] : colors;
			vars['--name-gradient'] = `linear-gradient(90deg, ${stops.join(', ')})`;
			return {kind: 'gradient' as const, vars};
		}
		if (style.type === 'alternating') {
			colors.forEach((c, i) => {
				vars[`--name-c${i}`] = c;
			});
			vars['--name-count'] = colors.length;
			return {kind: 'alternating' as const, vars, count: colors.length, colors};
		}
		return {kind: 'solid' as const, vars};
	}, [nameStyle]);

	const letters = useMemo(
		() => (rendered?.kind === 'alternating' ? splitGraphemes(children) : null),
		[rendered, children],
	);

	if (!nameStyle || !rendered) return <>{children}</>;
	if (simplify) {
		const simple = simplifiedColor(nameStyle);
		if (simple === null) return <>{children}</>;
		return (
			<span className={className} style={{color: intToHex(simple)}}>
				{children}
			</span>
		);
	}
	const {style} = nameStyle;
	const glowClass = style.glow && styles.glow;

	if (rendered.kind === 'gradient') {
		return (
			<span
				className={clsx(styles.gradient, style.animated && styles.animatedGradient, glowClass, className)}
				style={rendered.vars}
				data-text={children}
			>
				{children}
			</span>
		);
	}
	if (rendered.kind === 'alternating' && letters) {
		const n = rendered.count;
		let visible = 0;
		return (
			<span className={clsx(styles.alternating, glowClass, className)} style={rendered.vars} aria-label={children}>
				{letters.map((letter, i) => {
					const isSpace = letter.trim() === '';
					const index = isSpace ? visible : visible++;
					const letterStyle: StyleVars = {color: rendered.colors[index % n]};
					if (style.animated) {
						letterStyle['--name-delay'] = `${-(index % n) * 0.6}s`;
					}
					return (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: letters of a fixed string
							key={i}
							aria-hidden="true"
							className={clsx(style.animated && styles[`cycle${n}` as keyof typeof styles])}
							style={letterStyle}
						>
							{letter}
						</span>
					);
				})}
			</span>
		);
	}
	return (
		<span className={clsx(glowClass, className)} style={rendered.vars}>
			{children}
		</span>
	);
});
