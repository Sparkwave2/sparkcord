// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord role name styles: gradient, rainbow, alternating colours per letter, and an
// optional glow. A leaf module (only React and CSS) so it is safe to use from message
// and member list components without adding import cycles.

import styles from '@app/features/role_style/RoleNameStyle.module.css';
import type {GuildRoleStyle} from '@fluxer/schema/src/domains/guild/GuildRoleSchemas';
import {clsx} from 'clsx';
import type React from 'react';
import {useMemo} from 'react';

/** A role style together with the role's plain colour (used for glow and fallbacks). */
export interface NameStyle {
	style: GuildRoleStyle;
	/** The role colour as an integer; 0 means "no colour". */
	color: number;
}

const RAINBOW = ['#ff5f6d', '#ffa53b', '#ffe14d', '#5fe08a', '#4fc3ff', '#8f7bff', '#ff6fd8'];

/** The name style of a role, or null when it has none. */
export function roleNameStyle(role: {style: GuildRoleStyle | null; color: number} | null | undefined): NameStyle | null {
	return role?.style ? {style: role.style, color: role.color} : null;
}

export function intToHex(value: number): string {
	return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
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
	role: {style: GuildRoleStyle | null; color: number} | null | undefined,
	fallback: string | undefined,
): React.CSSProperties {
	const base: React.CSSProperties = {backgroundColor: fallback};
	const nameStyle = roleNameStyle(role);
	if (!nameStyle) return base;
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

export function StyledName({
	nameStyle,
	children,
	className,
}: {
	nameStyle: NameStyle | null | undefined;
	children: string;
	className?: string;
}) {
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
}
