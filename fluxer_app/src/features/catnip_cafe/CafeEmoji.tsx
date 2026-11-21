// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: an emoji drawn with the app's own emoji images (the ones chat
// uses), so every icon shows even where the system emoji font lacks it.

import {getEmojiURL} from '@app/features/expressions/utils/EmojiUtils';

export function CafeEmoji({emoji, className}: {emoji: string; className?: string}) {
	const url = getEmojiURL(emoji);
	if (!url) return <span className={className}>{emoji}</span>;
	return <img className={className} src={url} alt={emoji} draggable={false} />;
}
