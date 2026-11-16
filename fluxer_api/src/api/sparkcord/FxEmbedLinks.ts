// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: X/Twitter post links are embedded through FxEmbed (https://github.com/FxEmbed/FxEmbed).
// The unfurl service already builds a full embed (text, media, video, quotes, counts) for
// fxtwitter.com links, while plain x.com links only get a small card. So a post link is
// handed to the unfurler as its fxtwitter.com twin, and the links inside the finished
// embed are pointed back at the address that was actually posted.
//
// Bluesky links are left alone on purpose: they already get a full embed.

import type {MessageEmbedChildResponse, MessageEmbedResponse} from '@fluxer/schema/src/domains/message/EmbedSchemas';

const TWITTER_HOSTS = new Set(['twitter.com', 'x.com']);
const IGNORED_HOST_PREFIXES = ['www.', 'mobile.', 'm.'];
const STATUS_PATH = /^\/(?:[A-Za-z0-9_]{1,20}\/|i\/web\/)?status(?:es)?\/\d+(?:\/|$)/;

/**
 * The fxtwitter.com address for an X/Twitter post link, or null when the link is not an
 * X/Twitter post (profiles, searches and other sites are embedded as before).
 */
export function fxEmbedUrlFor(url: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
	let host = parsed.hostname.toLowerCase();
	for (const prefix of IGNORED_HOST_PREFIXES) {
		if (host.startsWith(prefix)) {
			host = host.slice(prefix.length);
			break;
		}
	}
	if (!TWITTER_HOSTS.has(host) || !STATUS_PATH.test(parsed.pathname)) return null;
	// "/i/web/status/1" is only understood by FxEmbed as "/i/status/1".
	const path = parsed.pathname.replace(/^\/i\/web\/status/, '/i/status');
	// The query string is tracking (?s=, ?t=) and would only split the unfurl cache.
	return `https://fxtwitter.com${path}`;
}

function restoreChild<T extends MessageEmbedChildResponse>(embed: T, fxUrl: string, originalUrl: string): T {
	const {author} = embed;
	return {
		...embed,
		url: embed.url === fxUrl ? originalUrl : embed.url,
		author: author && author.url === fxUrl ? {...author, url: originalUrl} : author,
	};
}

/** Points the embed's own links back at the posted address instead of fxtwitter.com. */
export function restorePostedUrl(
	embeds: Array<MessageEmbedResponse>,
	fxUrl: string,
	originalUrl: string,
): Array<MessageEmbedResponse> {
	return embeds.map((embed) => ({
		...restoreChild(embed, fxUrl, originalUrl),
		children: embed.children?.map((child) => restoreChild(child, fxUrl, originalUrl)),
	}));
}
