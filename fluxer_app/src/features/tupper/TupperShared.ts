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
