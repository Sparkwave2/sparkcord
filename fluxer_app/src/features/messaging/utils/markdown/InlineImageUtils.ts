// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: `![alt](url)` inline images are shown in the message text using the message's
// own embed for that URL, so that embed is hidden below the message.

import type {MessageEmbed} from '@fluxer/schema/src/domains/message/EmbedSchemas';

const INLINE_IMAGE_URL_REGEX = /!\[[^\]\n]*\]\((https?:\/\/[^\s)]+)\)/g;

/** URLs used as `![alt](url)` inline images in the given message content. */
export function getInlineImageUrls(content: string): Set<string> {
	const urls = new Set<string>();
	if (!content.includes('![')) return urls;
	for (const match of content.matchAll(INLINE_IMAGE_URL_REGEX)) {
		urls.add(match[1]);
	}
	return urls;
}

export function isInlineImageEmbed(embed: MessageEmbed, inlineImageUrls: ReadonlySet<string>): boolean {
	return (
		(embed.url != null && inlineImageUrls.has(embed.url)) ||
		(embed.image?.url != null && inlineImageUrls.has(embed.image.url)) ||
		(embed.thumbnail?.url != null && inlineImageUrls.has(embed.thumbnail.url))
	);
}
