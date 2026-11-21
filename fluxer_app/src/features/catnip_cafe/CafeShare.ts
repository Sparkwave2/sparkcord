// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Catnip Café: /cafe posts a card with your café's stats and your cat into the chat.
// It is a normal message with one rich embed (see CafeShareData), sent straight to the API
// because the composer's send queue has no embeds.

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {ACHIEVEMENTS} from '@app/features/catnip_cafe/CafeData';
import Cafe from '@app/features/catnip_cafe/CafeEngine';
import {formatPurrs} from '@app/features/catnip_cafe/CafeFormat';
import {buildCafeCardUrl, type CafeCardData} from '@app/features/catnip_cafe/CafeShareData';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {http} from '@app/features/platform/transport/RestTransport';
import Users from '@app/features/user/state/Users';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';

/** Café pink, as the embed's side colour. */
const CARD_COLOUR = 0xff7eb6;

/**
 * The site the card links to. Embed links need a domain with a dot in it, so a bare
 * "localhost" (a local test server) becomes sparkcord.localhost, which also points here.
 */
function cardOrigin(): string {
	const {protocol, hostname, port} = window.location;
	if (hostname.includes('.')) return window.location.origin;
	return `${protocol}//sparkcord.localhost${port ? `:${port}` : ''}`;
}

export function currentCafeCard(): CafeCardData {
	const state = Cafe.state;
	return {
		coat: state.outfit.coat,
		hat: state.outfit.hat,
		collar: state.outfit.collar,
		purrs: Math.floor(state.lifetimeAll),
		pps: Cafe.pps,
		lives: state.livesEarned,
		pets: state.pets,
		cats: state.cats.length,
		achievements: state.achievements.length,
		achievementsTotal: ACHIEVEMENTS.length,
		streak: state.streak,
	};
}

/** Posts your café card in a channel. Throws when the save can't be loaded or the send fails. */
export async function sendCafeCard(channelId: string): Promise<void> {
	await Cafe.load();
	const card = currentCafeCard();
	const user = Users.currentUser;
	const name = user ? NicknameUtils.getDisplayName(user) : 'Someone';
	// The text fields are what other apps show; Sparkcord draws the card from the link instead.
	const short = (value: number) => formatPurrs(value, 'short');
	const embed = {
		title: `${name}'s Catnip Café`,
		url: buildCafeCardUrl(cardOrigin(), card),
		color: CARD_COLOUR,
		fields: [
			{name: 'Purrs earned', value: short(card.purrs), inline: true},
			{name: 'Purrs per second', value: short(card.pps), inline: true},
			{name: 'Lives', value: String(card.lives), inline: true},
			{name: 'Cats', value: String(card.cats), inline: true},
			{name: 'Achievements', value: `${card.achievements}/${card.achievementsTotal}`, inline: true},
			{name: 'Daily streak', value: `${card.streak} days`, inline: true},
		],
		footer: {text: 'Catnip Café · /cafe'},
	};
	const response = await http.post<WireMessage>(Endpoints.CHANNEL_MESSAGES(channelId), {
		body: {content: '', embeds: [embed], nonce: SnowflakeUtils.fromTimestamp(Date.now())},
	});
	if (response.body) Messages.handleIncomingMessage({channelId, message: response.body});
}
