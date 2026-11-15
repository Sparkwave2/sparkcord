// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord preset themes: a background image behind the whole app, see-through
// panels tinted to match, and an accent colour. Each preset is installed as a normal
// theme in the theme library (Settings > Themes), so it can be turned off, edited
// or duplicated like any other.

import type {ThemeType} from '@fluxer/constants/src/UserConstants';

export interface ThemePreset {
	id: string;
	name: string;
	description: string;
	base: Extract<ThemeType, 'dark' | 'light'>;
	/** Panel tint as "r, g, b". */
	panel: string;
	accent: string;
	accentLight: string;
	/** Text on accent-coloured buttons. */
	onAccent: string;
	link: string;
	/** CSS gradient used when there is no image, and while it loads. */
	gradient: string;
}

export const THEME_PRESET_ID_PREFIX = 'sparkcord-preset-';

export const THEME_PRESETS: ReadonlyArray<ThemePreset> = [
	{
		id: 'starry-night',
		name: 'Starry Night',
		description: 'A deep navy sky full of stars.',
		base: 'dark',
		panel: '10, 14, 32',
		accent: '#8fa8ff',
		accentLight: '#c9d4ff',
		onAccent: '#0b1022',
		link: '#a9c1ff',
		gradient:
			'radial-gradient(ellipse at 20% 10%, #1f2b5c 0%, transparent 55%), radial-gradient(ellipse at 80% 90%, #2a1f4f 0%, transparent 50%), linear-gradient(160deg, #0a0f24 0%, #050814 100%)',
	},
	{
		id: 'forest-mist',
		name: 'Forest Mist',
		description: 'A misty pine forest at dawn.',
		base: 'dark',
		panel: '14, 24, 20',
		accent: '#7cc49a',
		accentLight: '#c2ead2',
		onAccent: '#0c1a12',
		link: '#9fdcb8',
		gradient:
			'radial-gradient(ellipse at 50% 0%, #4a5e55 0%, transparent 60%), linear-gradient(180deg, #24342d 0%, #101a15 70%, #0a110d 100%)',
	},
	{
		id: 'ocean-depths',
		name: 'Ocean Depths',
		description: 'Deep blue water with light from above.',
		base: 'dark',
		panel: '6, 22, 36',
		accent: '#3fc8d4',
		accentLight: '#b4eef2',
		onAccent: '#04161c',
		link: '#7fdde5',
		gradient:
			'radial-gradient(ellipse at 50% -10%, #1f6f8f 0%, transparent 55%), linear-gradient(180deg, #0b3b55 0%, #062436 55%, #02101a 100%)',
	},
	{
		id: 'cherry-blossom',
		name: 'Cherry Blossom',
		description: 'Pale pink sakura branches.',
		base: 'light',
		panel: '255, 245, 248',
		accent: '#d9557f',
		accentLight: '#f7c4d4',
		onAccent: '#ffffff',
		link: '#c23d68',
		gradient:
			'radial-gradient(ellipse at 15% 20%, #ffd6e4 0%, transparent 55%), radial-gradient(ellipse at 85% 80%, #ffe9f0 0%, transparent 55%), linear-gradient(160deg, #fff4f7 0%, #fbe3ea 100%)',
	},
	{
		id: 'synthwave-sunset',
		name: 'Synthwave Sunset',
		description: 'A neon grid under a retro sunset.',
		base: 'dark',
		panel: '24, 10, 36',
		accent: '#ff4fa3',
		accentLight: '#ffb3d8',
		onAccent: '#1a0618',
		link: '#7fd8ff',
		gradient:
			'linear-gradient(180deg, #2b0b45 0%, #6b1b6b 40%, #e8447f 62%, #ffb04f 70%, #1a0626 71%, #0d0318 100%)',
	},
	{
		id: 'rainy-cafe',
		name: 'Rainy Café',
		description: 'Rain on a café window at night.',
		base: 'dark',
		panel: '28, 20, 14',
		accent: '#e0a050',
		accentLight: '#f5d3a6',
		onAccent: '#1f1408',
		link: '#f0bd7a',
		gradient:
			'radial-gradient(ellipse at 30% 30%, #5a3d22 0%, transparent 50%), radial-gradient(ellipse at 75% 70%, #3a2a1c 0%, transparent 55%), linear-gradient(160deg, #1f1610 0%, #0f0b08 100%)',
	},
	{
		id: 'aurora',
		name: 'Aurora',
		description: 'Northern lights over snowy hills.',
		base: 'dark',
		panel: '10, 18, 30',
		accent: '#5ee6a8',
		accentLight: '#c3f6de',
		onAccent: '#06180f',
		link: '#a99bff',
		gradient:
			'radial-gradient(ellipse at 30% 20%, rgba(94, 230, 168, 0.35) 0%, transparent 50%), radial-gradient(ellipse at 70% 25%, rgba(140, 110, 255, 0.35) 0%, transparent 50%), linear-gradient(180deg, #08142a 0%, #0b1d33 60%, #1c2a3d 100%)',
	},
	{
		id: 'pastel-clouds',
		name: 'Pastel Clouds',
		description: 'A soft pastel sky.',
		base: 'light',
		panel: '248, 246, 255',
		accent: '#8c7ae6',
		accentLight: '#d8d0fb',
		onAccent: '#ffffff',
		link: '#6a56d6',
		gradient:
			'radial-gradient(ellipse at 20% 15%, #ffe3f1 0%, transparent 50%), radial-gradient(ellipse at 80% 30%, #dff1ff 0%, transparent 55%), radial-gradient(ellipse at 50% 90%, #ece6ff 0%, transparent 60%), linear-gradient(180deg, #f6f3ff 0%, #eef4ff 100%)',
	},
	{
		id: 'blue-diva',
		name: 'Blue Diva',
		description: 'Teal and pink, inspired by Hatsune Miku.',
		base: 'dark',
		panel: '10, 26, 32',
		accent: '#39c5bb',
		accentLight: '#b5ece8',
		onAccent: '#05201d',
		link: '#ff6fb1',
		gradient:
			'radial-gradient(ellipse at 15% 15%, rgba(57, 197, 187, 0.45) 0%, transparent 50%), radial-gradient(ellipse at 85% 85%, rgba(225, 40, 133, 0.3) 0%, transparent 50%), linear-gradient(160deg, #0d2a30 0%, #081619 100%)',
	},
	{
		id: 'red-diva',
		name: 'Red Diva',
		description: 'Crimson and charcoal, inspired by Kasane Teto.',
		base: 'dark',
		panel: '30, 12, 16',
		accent: '#e0485a',
		accentLight: '#f6b6be',
		onAccent: '#ffffff',
		link: '#ff8c99',
		gradient:
			'radial-gradient(ellipse at 20% 20%, rgba(224, 72, 90, 0.45) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(120, 30, 45, 0.5) 0%, transparent 55%), linear-gradient(160deg, #2a0f14 0%, #12070a 100%)',
	},
];

export function presetThemeId(preset: ThemePreset): string {
	return `${THEME_PRESET_ID_PREFIX}${preset.id}`;
}

export function presetImageUrl(preset: ThemePreset, thumb = false): string {
	return `/assets/theme-presets/${preset.id}${thumb ? '-thumb' : ''}.webp`;
}

/**
 * Layout wrappers that would otherwise paint the same see-through colour on top of each
 * other (making panels opaque again). Matched by CSS-module class name prefix, so they
 * survive rebuilds; if one stops matching, that area just looks more solid.
 */
const TRANSPARENT_WRAPPERS = [
	'App.module__appContainer',
	'OutlineFrame.module__frame',
	'GuildsLayout.module__guildsLayoutContainer',
	'GuildsLayout.module__contentContainer',
	'GuildsLayout.module__contentInner',
	'GuildsLayout.module__guildListScrollerWrapper',
	'GuildLayout.module__guildLayoutContainer',
	'GuildLayout.module__guildMainContent',
	'ChannelLayout.module__channelLayoutContainer',
	'ChannelIndexPage.module__channelGrid',
	'DirectMessageLayout.module__dmLayoutContainer',
	'DirectMessageLayout.module__contentColumn',
	'DirectMessageLayout.module__contentInner',
	'DirectMessageLayout.module__dmListColumn',
	'DirectMessageList.module__dmListContainer',
];

/** The main panels, which blur what is behind them (the "frosted glass" look). */
const FROSTED_PANELS = [
	'GuildsLayout.module__guildListScrollContainer',
	'GuildNavbar.module__guildNavbarContainer',
	'ChannelChatLayout.module__container',
	'DMFriendsView.module__container',
];

/**
 * Cards that float over the chat (user and tupper popouts). They sit on top of busy
 * content, so they get a much stronger blur and a more solid tint than the panels.
 */
const FLOATING_CARDS = ['ProfileCardLayout.module__profileCard', 'TupperCard.module__card'];

/**
 * Settings screens (user and community settings): one tinted, heavily blurred layer.
 * Their nested wrappers each paint a see-through colour too, which stacked up to an
 * almost solid panel, so those are made clear and only the sidebar keeps a light tint.
 */
const SETTINGS_SURFACE = ['SettingsModalLayout.module__container'];
const SETTINGS_CLEAR = [
	'Modal.module__fullscreen',
	'SettingsModalLayout.module__desktopContent',
	'SettingsModalLayout.module__desktopHeader',
];
const SETTINGS_SIDEBAR = ['SettingsModalLayout.module__desktopSidebar'];
/** The dark layer behind modals (85% black by default), which hid the artwork. */
const MODAL_BACKDROP = ['Modal.module__modalBackdrop'];

/** How much clearer than the base opacities the panels are (user preference: show the art). */
const PANEL_CLEARNESS = 0.12;

const byModuleClass =(names: ReadonlyArray<string>) =>
	names.map((name) => `html:root [class*="${name}___"]`).join(',\n');

/**
 * The theme CSS for a preset. Panels are the panel colour at partial opacity over a
 * background (image over gradient) fixed to the window.
 */
export function buildPresetCss(preset: ThemePreset): string {
	const p = preset.panel;
	const light = preset.base === 'light';
	// Panels are kept fairly clear so the artwork stays recognisable; the light blur
	// below is what keeps text readable over it.
	const a = (dark: number, lightValue: number) => Math.round(((light ? lightValue : dark) - PANEL_CLEARNESS) * 100) / 100;
	return `/* Sparkcord preset theme: ${preset.name}. Generated; duplicate it to customise. */
html:root {
	--sparkcord-preset-image: url("${presetImageUrl(preset)}");
	--sparkcord-preset-gradient: ${preset.gradient};
	--brand-primary: ${preset.accent};
	--brand-secondary: ${preset.accent};
	--brand-primary-light: ${preset.accentLight};
	--accent-primary: ${preset.accent};
	--text-on-brand-primary: ${preset.onAccent};
	--text-link: ${preset.link};
	--button-primary-fill: ${preset.accent};
	--button-primary-active-fill: color-mix(in srgb, ${preset.accent} 85%, ${light ? 'black' : 'white'});
	--button-primary-text: ${preset.onAccent};
	--background-primary: rgba(${p}, ${a(0.62, 0.66)});
	--background-secondary: rgba(${p}, ${a(0.7, 0.72)});
	--background-secondary-alt: rgba(${p}, ${a(0.74, 0.76)});
	--background-secondary-lighter: rgba(${p}, ${a(0.62, 0.66)});
	--background-tertiary: rgba(${p}, ${a(0.78, 0.8)});
	--composer-surface-color: rgba(${p}, ${a(0.62, 0.66)});
	--outline-frame-background: transparent;
	--background-channel-header: rgba(${p}, ${a(0.7, 0.74)});
	--background-header-primary: rgba(${p}, 0.76);
	--background-header-secondary: rgba(${p}, 0.8);
	--background-textarea: rgba(${p}, ${a(0.72, 0.8)});
}

html:root body {
	background-color: rgb(${p});
	background-image: var(--sparkcord-preset-image), var(--sparkcord-preset-gradient);
	background-size: cover, cover;
	background-position: center, center;
	background-repeat: no-repeat, no-repeat;
	background-attachment: fixed, fixed;
}

${byModuleClass(TRANSPARENT_WRAPPERS)} {
	background: transparent !important;
}

${byModuleClass(FROSTED_PANELS)} {
	backdrop-filter: blur(var(--sparkcord-panel-blur, 3px)) saturate(1.1);
}

${byModuleClass(FLOATING_CARDS)} {
	background-color: rgba(${p}, ${light ? 0.8 : 0.78}) !important;
	backdrop-filter: blur(32px) saturate(1.3);
}

${byModuleClass(MODAL_BACKDROP)} {
	opacity: 0.35 !important;
}

${byModuleClass(SETTINGS_CLEAR)} {
	background: transparent !important;
}

${byModuleClass(SETTINGS_SURFACE)} {
	background-color: rgba(${p}, ${light ? 0.55 : 0.5}) !important;
}

/* The blur behind modals lives on the full-screen layer behind them rather than on the
   panel: browsers can't draw a blur inside a panel that is still fading in, so it would
   pop in at the end. This layer doesn't fade, so the blur builds up while the panel
   expands (about the length of its opening spring) and is complete when it settles. */
html:root .modal-backdrop {
	backdrop-filter: blur(40px) saturate(1.3);
	animation: sparkcordModalBlurIn 0.35s ease-out both;
}

@keyframes sparkcordModalBlurIn {
	from {
		backdrop-filter: blur(0px) saturate(1);
	}
	to {
		backdrop-filter: blur(40px) saturate(1.3);
	}
}

/* Closing: the blur fades back out with the panel instead of vanishing at the end. */
html:root .modal-backdrop[data-modal-closing] {
	backdrop-filter: blur(0px) saturate(1);
	animation: sparkcordModalBlurOut 0.25s ease-in both;
}

@keyframes sparkcordModalBlurOut {
	from {
		backdrop-filter: blur(40px) saturate(1.3);
	}
	to {
		backdrop-filter: blur(0px) saturate(1);
	}
}

html.reduced-motion .modal-backdrop,
html.reduced-motion .modal-backdrop[data-modal-closing] {
	animation: none;
}

@media (prefers-reduced-motion: reduce) {
	html:root .modal-backdrop,
	html:root .modal-backdrop[data-modal-closing] {
		animation: none;
	}
}

${byModuleClass(SETTINGS_SIDEBAR)} {
	background: rgba(${p}, ${light ? 0.25 : 0.22}) !important;
}
`;
}
