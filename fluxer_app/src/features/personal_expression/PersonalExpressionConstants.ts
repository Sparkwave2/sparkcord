// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord personal emojis/stickers sit in the emoji and sticker stores under this
// pseudo community id, so pickers, autocomplete and lookups pick them up. A leaf module.

import {i18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

export const PERSONAL_EXPRESSION_GUILD_ID = 'personal';

const PERSONAL_LABEL = msg({
	message: 'Personal',
	comment: 'Section in the emoji and sticker pickers for your own personal emojis/stickers.',
});

export function isPersonalExpressionGuildId(guildId: string | null | undefined): boolean {
	return guildId === PERSONAL_EXPRESSION_GUILD_ID;
}

/** Stand-in for Guilds.getGuild() in picker sections. */
export function personalExpressionGuildStub(): {id: string; name: string; icon: null} {
	return {id: PERSONAL_EXPRESSION_GUILD_ID, name: i18n._(PERSONAL_LABEL), icon: null};
}
