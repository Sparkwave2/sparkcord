// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ProxyTag {
	prefix: string | null;
	suffix: string | null;
}

export interface ProxyCandidate<T> {
	tupper: T;
	proxyTags: ReadonlyArray<ProxyTag>;
	keepProxy: boolean;
}

export interface ProxyMatch<T> {
	tupper: T;
	content: string;
	tag: ProxyTag;
}

export const PROXY_ESCAPE_PREFIX = '\\';

export function normalizeProxyTag(tag: {prefix?: string | null; suffix?: string | null}): ProxyTag | null {
	const prefix = tag.prefix ? tag.prefix : null;
	const suffix = tag.suffix ? tag.suffix : null;
	if (prefix === null && suffix === null) return null;
	return {prefix, suffix};
}

function tagLength(tag: ProxyTag): number {
	return (tag.prefix?.length ?? 0) + (tag.suffix?.length ?? 0);
}

/**
 * Finds the tupper whose proxy tag matches the message content. Longer tags win, so
 * `[[text]]` beats `[text]` when both exist. Returns null for escaped content
 * (leading backslash) or when nothing matches.
 *
 * `allowEmptyContent` lets a message that is only a tag (e.g. `k:` with an image
 * attached) still be proxied.
 */
export function matchProxyTags<T>(
	content: string,
	candidates: ReadonlyArray<ProxyCandidate<T>>,
	options: {allowEmptyContent?: boolean} = {},
): ProxyMatch<T> | null {
	if (content.startsWith(PROXY_ESCAPE_PREFIX)) return null;
	const trimmed = content.trim();
	const ordered: Array<{candidate: ProxyCandidate<T>; tag: ProxyTag}> = [];
	for (const candidate of candidates) {
		for (const tag of candidate.proxyTags) {
			ordered.push({candidate, tag});
		}
	}
	ordered.sort((a, b) => tagLength(b.tag) - tagLength(a.tag));
	for (const {candidate, tag} of ordered) {
		const prefix = tag.prefix ?? '';
		const suffix = tag.suffix ?? '';
		if (prefix === '' && suffix === '') continue;
		if (trimmed.length < prefix.length + suffix.length) continue;
		if (!startsWithCaseInsensitive(trimmed, prefix)) continue;
		if (!endsWithCaseInsensitive(trimmed, suffix)) continue;
		const inner = trimmed.slice(prefix.length, trimmed.length - suffix.length).trim();
		if (inner.length === 0 && !options.allowEmptyContent) continue;
		return {
			tupper: candidate.tupper,
			content: candidate.keepProxy ? trimmed : inner,
			tag,
		};
	}
	return null;
}

function startsWithCaseInsensitive(value: string, prefix: string): boolean {
	return prefix === '' || value.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();
}

function endsWithCaseInsensitive(value: string, suffix: string): boolean {
	return suffix === '' || value.slice(value.length - suffix.length).toLowerCase() === suffix.toLowerCase();
}

/** Parses the `text` placeholder form used by both bots: `[text]`, `k:text`, `text -k`. */
export function parseProxyTemplate(template: string): ProxyTag | null {
	const index = template.toLowerCase().indexOf('text');
	if (index === -1) return null;
	return normalizeProxyTag({prefix: template.slice(0, index), suffix: template.slice(index + 4)});
}

export function formatProxyTag(tag: ProxyTag): string {
	return `${tag.prefix ?? ''}text${tag.suffix ?? ''}`;
}
