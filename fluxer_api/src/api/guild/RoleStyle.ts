// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord role name styles (gradient, rainbow, alternating colours, glow). Stored on
// the role row as JSON text; anything that does not parse is treated as "no style".

import type {GuildRoleStyle} from '@fluxer/schema/src/domains/guild/GuildRoleSchemas';

type StyleInput = {
	type: GuildRoleStyle['type'];
	colors?: ReadonlyArray<number>;
	animated?: boolean;
	glow?: boolean;
	glow_color?: number | null;
};

const TYPES = new Set<GuildRoleStyle['type']>(['solid', 'gradient', 'rainbow', 'alternating']);

function isColor(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff;
}

/** Cleans up a style; returns null when it adds nothing over the plain role colour. */
export function normalizeRoleStyle(input: StyleInput | null | undefined): GuildRoleStyle | null {
	if (input == null || !TYPES.has(input.type)) return null;
	const colors = (input.colors ?? []).filter(isColor).slice(0, 4);
	let type = input.type;
	// Gradient and alternating need at least two colours; fall back to the plain colour.
	if ((type === 'gradient' || type === 'alternating') && colors.length < 2) type = 'solid';
	const glow = input.glow === true;
	const animated = input.animated === true && type !== 'solid';
	if (type === 'solid' && !glow) return null;
	return {
		type,
		colors: type === 'gradient' || type === 'alternating' ? colors : [],
		animated,
		glow,
		glow_color: glow && isColor(input.glow_color) ? input.glow_color : null,
	};
}

export function serializeRoleStyle(input: StyleInput | null | undefined): string | null {
	const style = normalizeRoleStyle(input);
	return style ? JSON.stringify(style) : null;
}

export function parseRoleStyle(stored: string | null | undefined): GuildRoleStyle | null {
	if (!stored) return null;
	try {
		return normalizeRoleStyle(JSON.parse(stored) as StyleInput);
	} catch {
		return null;
	}
}
