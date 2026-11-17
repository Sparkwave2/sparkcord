// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: per-device adjustments on top of the active theme, set with sliders in
// Settings > Themes. They are written to the page as CSS variables, which the preset
// themes read, so moving a slider takes effect at once.

import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';
import {applyCornerRounding} from '@app/features/theme_presets/CornerRounding';
import {autorun} from 'mobx';

export const THEME_BLUR_DEFAULT_PX = 3;
export const THEME_BLUR_MAX_PX = 30;
export const THEME_TINT_DEFAULT_PERCENT = 35;
export const CORNER_ROUNDING_MAX_PERCENT = 300;

let started = false;

/** Starts keeping the page's CSS variables in step with the preferences (safe to call again). */
export function startThemeTweaks(): void {
	if (started || typeof document === 'undefined') return;
	started = true;
	autorun(() => {
		const blur = Math.min(THEME_BLUR_MAX_PX, Math.max(0, SparkcordPrefs.get('themeBlurPx')));
		document.documentElement.style.setProperty('--sparkcord-panel-blur', `${blur}px`);
	});
	autorun(() => {
		const tint = Math.min(100, Math.max(0, SparkcordPrefs.get('themeTintPercent')));
		document.documentElement.style.setProperty('--sparkcord-panel-tint', `${tint / 100}`);
	});
	autorun(() => {
		const percent = Math.min(CORNER_ROUNDING_MAX_PERCENT, Math.max(0, SparkcordPrefs.get('cornerRoundingPercent')));
		applyCornerRounding(percent / 100);
	});
}
