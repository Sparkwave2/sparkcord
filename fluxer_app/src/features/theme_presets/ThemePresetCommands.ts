// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ThemeProfileCommands from '@app/features/theme/commands/ThemeProfileCommands';
import ThemeEditTarget from '@app/features/theme/state/ThemeEditTarget';
import ThemeLibrary from '@app/features/theme/state/ThemeLibrary';
import {startThemeTweaks} from '@app/features/theme_presets/ThemeTweaks';
import {
	buildPresetCss,
	presetThemeId,
	THEME_PRESET_ID_PREFIX,
	THEME_PRESETS,
	type ThemePreset,
} from '@app/features/theme_presets/ThemePresets';

export function activePresetId(): string | null {
	const enabled = ThemeLibrary.enabledIdsFor(ThemeEditTarget.target);
	const id = enabled.find((themeId) => themeId.startsWith(THEME_PRESET_ID_PREFIX));
	return id === undefined ? null : id.slice(THEME_PRESET_ID_PREFIX.length);
}

/**
 * Installs the preset as a library theme (refreshing its CSS), turns off any other preset,
 * turns this one on and switches the base theme to the preset's dark or light base.
 */
export async function applyPreset(preset: ThemePreset): Promise<void> {
	const target = ThemeEditTarget.target;
	const id = presetThemeId(preset);
	const now = Date.now();
	const existing = ThemeLibrary.themes.find((theme) => theme.id === id);
	await ThemeLibrary.saveTheme({
		id,
		name: preset.name,
		description: preset.description,
		author: 'Sparkcord',
		version: '1',
		tags: ['preset'],
		css: buildPresetCss(preset),
		fileName: `${preset.id}.css`,
		source: 'import',
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	});
	for (const other of ThemeLibrary.enabledIdsFor(target)) {
		if (other !== id && other.startsWith(THEME_PRESET_ID_PREFIX)) {
			await ThemeProfileCommands.setThemeEnabled(other, false, target);
		}
	}
	await ThemeProfileCommands.setThemeEnabled(id, true, target);
	ThemeProfileCommands.setThemePreference(preset.base, target);
}

export async function turnOffPresets(): Promise<void> {
	const target = ThemeEditTarget.target;
	for (const id of ThemeLibrary.enabledIdsFor(target)) {
		if (id.startsWith(THEME_PRESET_ID_PREFIX)) {
			await ThemeProfileCommands.setThemeEnabled(id, false, target);
		}
	}
}

/**
 * Updates installed preset themes whose saved CSS is from an older Sparkcord build, so
 * changes to the presets reach people who already use one. Edited copies are made with
 * "Duplicate", which gives them a different id, so they are left alone.
 */
export async function refreshInstalledPresets(): Promise<void> {
	startThemeTweaks();
	for (const preset of THEME_PRESETS) {
		const id = presetThemeId(preset);
		const installed = ThemeLibrary.themes.find((theme) => theme.id === id);
		if (!installed) continue;
		const css = buildPresetCss(preset);
		if (installed.css === css) continue;
		await ThemeLibrary.saveTheme({...installed, css, updatedAt: Date.now()});
	}
}
