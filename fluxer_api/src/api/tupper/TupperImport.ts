// SPDX-License-Identifier: AGPL-3.0-or-later

import {normalizeProxyTag, type ProxyTag} from '@app/api/tupper/TupperProxyMatcher';

export type TupperImportSource = 'tupperbox' | 'pluralkit';

export interface ImportedTupper {
	name: string;
	displayName: string | null;
	avatarUrl: string | null;
	proxyTags: Array<ProxyTag>;
	keepProxy: boolean;
	description: string | null;
	pronouns: string | null;
	color: number | null;
	birthday: string | null;
	tag: string | null;
	externalId: string | null;
}

export interface ParsedTupperImport {
	source: TupperImportSource;
	systemName: string | null;
	systemTag: string | null;
	tuppers: Array<ImportedTupper>;
	warnings: Array<string>;
}

export class TupperImportFormatError extends Error {}

export const TUPPER_NAME_MAX_LENGTH = 100;
export const TUPPER_DISPLAY_NAME_MAX_LENGTH = 100;
export const TUPPER_DESCRIPTION_MAX_LENGTH = 2000;
export const TUPPER_PRONOUNS_MAX_LENGTH = 100;
export const TUPPER_TAG_MAX_LENGTH = 79;
export const TUPPER_AVATAR_URL_MAX_LENGTH = 1024;
export const TUPPER_PROXY_TAG_MAX_LENGTH = 100;
export const TUPPER_MAX_PROXY_TAGS = 25;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	return trimmed.slice(0, maxLength);
}

export function sanitizeAvatarUrl(value: unknown): string | null {
	const url = str(value, TUPPER_AVATAR_URL_MAX_LENGTH);
	if (!url) return null;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
	} catch {
		return null;
	}
}

export function parseHexColor(value: unknown): number | null {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
	if (typeof value !== 'string') return null;
	const hex = value.trim().replace(/^#/, '');
	if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
	return Number.parseInt(hex, 16);
}

function parseBirthday(value: unknown): string | null {
	const raw = str(value, 40);
	if (!raw) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
	return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function clampTag(tag: ProxyTag | null): ProxyTag | null {
	if (!tag) return null;
	return normalizeProxyTag({
		prefix: tag.prefix?.slice(0, TUPPER_PROXY_TAG_MAX_LENGTH),
		suffix: tag.suffix?.slice(0, TUPPER_PROXY_TAG_MAX_LENGTH),
	});
}

function dedupeTags(tags: Array<ProxyTag | null>): Array<ProxyTag> {
	const seen = new Set<string>();
	const out: Array<ProxyTag> = [];
	for (const tag of tags) {
		const clamped = clampTag(tag);
		if (!clamped) continue;
		const key = `${clamped.prefix ?? ''}\u0000${clamped.suffix ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(clamped);
		if (out.length >= TUPPER_MAX_PROXY_TAGS) break;
	}
	return out;
}

export function detectImportSource(data: unknown): TupperImportSource {
	if (isObject(data) && Array.isArray(data.tuppers)) return 'tupperbox';
	if (isObject(data) && Array.isArray(data.members)) return 'pluralkit';
	throw new TupperImportFormatError(
		'Unrecognised file. Expected a Tupperbox export (with "tuppers") or a PluralKit export (with "members").',
	);
}

function parseTupperbox(data: JsonObject, warnings: Array<string>): ParsedTupperImport {
	const groups = new Map<string, JsonObject>();
	if (Array.isArray(data.groups)) {
		for (const group of data.groups) {
			if (isObject(group) && group.id != null) groups.set(String(group.id), group);
		}
	}
	const tuppers: Array<ImportedTupper> = [];
	for (const [index, raw] of (data.tuppers as Array<unknown>).entries()) {
		if (!isObject(raw)) {
			warnings.push(`Skipped entry #${index + 1}: not an object.`);
			continue;
		}
		const name = str(raw.name, TUPPER_NAME_MAX_LENGTH);
		if (!name) {
			warnings.push(`Skipped entry #${index + 1}: missing name.`);
			continue;
		}
		const brackets = Array.isArray(raw.brackets) ? raw.brackets : [];
		const tags: Array<ProxyTag | null> = [];
		for (let i = 0; i + 1 < brackets.length; i += 2) {
			const prefix = typeof brackets[i] === 'string' ? (brackets[i] as string) : null;
			const suffix = typeof brackets[i + 1] === 'string' ? (brackets[i + 1] as string) : null;
			tags.push(normalizeProxyTag({prefix, suffix}));
		}
		const proxyTags = dedupeTags(tags);
		if (proxyTags.length === 0) warnings.push(`"${name}" has no brackets; it can only be used with autoproxy.`);
		const group = raw.group_id != null ? groups.get(String(raw.group_id)) : undefined;
		tuppers.push({
			name,
			displayName: str(raw.nick, TUPPER_DISPLAY_NAME_MAX_LENGTH),
			avatarUrl: sanitizeAvatarUrl(raw.avatar_url),
			proxyTags,
			keepProxy: raw.show_brackets === true,
			description: str(raw.description, TUPPER_DESCRIPTION_MAX_LENGTH),
			pronouns: null,
			color: null,
			birthday: parseBirthday(raw.birthday),
			tag: str(raw.tag, TUPPER_TAG_MAX_LENGTH) ?? (group ? str(group.tag, TUPPER_TAG_MAX_LENGTH) : null),
			externalId: raw.id != null ? String(raw.id) : null,
		});
	}
	return {source: 'tupperbox', systemName: null, systemTag: null, tuppers, warnings};
}

function parsePluralKit(data: JsonObject, warnings: Array<string>): ParsedTupperImport {
	const tuppers: Array<ImportedTupper> = [];
	for (const [index, raw] of (data.members as Array<unknown>).entries()) {
		if (!isObject(raw)) {
			warnings.push(`Skipped member #${index + 1}: not an object.`);
			continue;
		}
		const name = str(raw.name, TUPPER_NAME_MAX_LENGTH);
		if (!name) {
			warnings.push(`Skipped member #${index + 1}: missing name.`);
			continue;
		}
		const rawTags = Array.isArray(raw.proxy_tags) ? raw.proxy_tags : [];
		const proxyTags = dedupeTags(
			rawTags.map((tag) =>
				isObject(tag)
					? normalizeProxyTag({
							prefix: typeof tag.prefix === 'string' ? tag.prefix : null,
							suffix: typeof tag.suffix === 'string' ? tag.suffix : null,
						})
					: null,
			),
		);
		if (proxyTags.length === 0) warnings.push(`"${name}" has no proxy tags; it can only be used with autoproxy.`);
		tuppers.push({
			name,
			displayName: str(raw.display_name, TUPPER_DISPLAY_NAME_MAX_LENGTH),
			avatarUrl: sanitizeAvatarUrl(raw.webhook_avatar_url) ?? sanitizeAvatarUrl(raw.avatar_url),
			proxyTags,
			keepProxy: raw.keep_proxy === true,
			description: str(raw.description, TUPPER_DESCRIPTION_MAX_LENGTH),
			pronouns: str(raw.pronouns, TUPPER_PRONOUNS_MAX_LENGTH),
			color: parseHexColor(raw.color),
			birthday: parseBirthday(raw.birthday),
			tag: null,
			externalId: typeof raw.id === 'string' ? raw.id : typeof raw.uuid === 'string' ? raw.uuid : null,
		});
	}
	return {
		source: 'pluralkit',
		systemName: str(data.name, TUPPER_NAME_MAX_LENGTH),
		systemTag: str(data.tag, TUPPER_TAG_MAX_LENGTH),
		tuppers,
		warnings,
	};
}

export function parseTupperImport(data: unknown): ParsedTupperImport {
	const source = detectImportSource(data);
	const warnings: Array<string> = [];
	return source === 'tupperbox'
		? parseTupperbox(data as JsonObject, warnings)
		: parsePluralKit(data as JsonObject, warnings);
}
