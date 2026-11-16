// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Leaf module: tupper helpers shared by the message model, message rendering, the
// composer, the settings tab and the chat commands. Keep it free of runtime imports so
// it can't create an import cycle (the bundle fails at startup with a TDZ error if it does).

import type {MessageProxyResponse} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

export interface ProxyTag {
	prefix: string | null;
	suffix: string | null;
}

export interface TupperWire {
	id: string;
	name: string;
	display_name: string | null;
	avatar_url: string | null;
	avatar_proxy_url: string | null;
	proxy_tags: Array<ProxyTag>;
	keep_proxy: boolean;
	description: string | null;
	pronouns: string | null;
	color: number | null;
	birthday: string | null;
	tag: string | null;
	font?: string | null;
	position: number;
	created_at: string;
}

/** Prefix for tupper chat commands. They run locally and are never posted to the channel. */
export const TUPPER_COMMAND_PREFIX = 'tp!';

export function isTupperCommand(content: string): boolean {
	return content.trim().toLowerCase().startsWith(TUPPER_COMMAND_PREFIX);
}

export function getProxyDisplayName(proxy: Pick<MessageProxyResponse, 'name' | 'system_tag'>): string {
	return proxy.system_tag ? `${proxy.name} ${proxy.system_tag}` : proxy.name;
}

export function proxyColorString(color: number | null | undefined): string | undefined {
	return color != null ? `#${color.toString(16).padStart(6, '0')}` : undefined;
}

export function formatProxyTag(tag: ProxyTag): string {
	return `${tag.prefix ?? ''}text${tag.suffix ?? ''}`;
}

export function parseProxyTagLines(value: string): Array<ProxyTag> {
	const tags: Array<ProxyTag> = [];
	for (const line of value.split('\n')) {
		const index = line.toLowerCase().indexOf('text');
		if (index === -1) continue;
		const prefix = line.slice(0, index);
		const suffix = line.slice(index + 4);
		if (!prefix && !suffix) continue;
		tags.push({prefix: prefix || null, suffix: suffix || null});
	}
	return tags;
}

export interface TupperSettingsWire {
	system_name: string | null;
	system_tag: string | null;
	proxy_enabled: boolean;
	autoproxy_mode: 'off' | 'front' | 'latch';
	autoproxy_tupper_id: string | null;
	latch_tupper_id: string | null;
	/** Hide the system from other people. */
	system_private?: boolean;
}

/**
 * Client copy of the server's proxy-tag matcher (fluxer_api TupperProxyMatcher), used to
 * show a sent message as the tupper immediately. Keep the two in step: longest tag wins,
 * case-insensitive, leading backslash escapes, keep_proxy keeps the tags.
 */
export function matchProxyTagsLocal(
	content: string,
	tuppers: ReadonlyArray<TupperWire>,
	allowEmptyContent: boolean,
): {tupper: TupperWire; content: string} | null {
	if (content.startsWith('\\')) return null;
	const trimmed = content.trim();
	const ordered: Array<{tupper: TupperWire; prefix: string; suffix: string}> = [];
	for (const tupper of tuppers) {
		for (const tag of tupper.proxy_tags) {
			const prefix = tag.prefix ?? '';
			const suffix = tag.suffix ?? '';
			if (prefix !== '' || suffix !== '') ordered.push({tupper, prefix, suffix});
		}
	}
	ordered.sort((a, b) => b.prefix.length + b.suffix.length - (a.prefix.length + a.suffix.length));
	const lower = trimmed.toLowerCase();
	for (const {tupper, prefix, suffix} of ordered) {
		if (trimmed.length < prefix.length + suffix.length) continue;
		if (prefix && !lower.startsWith(prefix.toLowerCase())) continue;
		if (suffix && !lower.endsWith(suffix.toLowerCase())) continue;
		const inner = trimmed.slice(prefix.length, trimmed.length - suffix.length).trim();
		if (inner.length === 0 && !allowEmptyContent) continue;
		return {tupper, content: tupper.keep_proxy ? trimmed : inner};
	}
	return null;
}
