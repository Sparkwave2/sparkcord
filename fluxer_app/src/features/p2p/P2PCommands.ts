// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sharing files peer-to-peer from the composer. Each file gets a placeholder message
// straight away (a "Preparing" card, visible only to you while it's sending); the files
// are then prepared one at a time and each placeholder is replaced by the real share
// link, sent with the same nonce.

import * as MessageCommands from '@app/features/messaging/commands/MessageCommands';
import {Message} from '@app/features/messaging/models/MessagingMessage';
import {queuePreparing, ShareCancelledError, shareFile} from '@app/features/p2p/P2PClient';
import {pendingShareContent} from '@app/features/p2p/P2PShare';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import Users from '@app/features/user/state/Users';
import {MessageStates, MessageTypes} from '@fluxer/constants/src/ChannelConstants';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';
import {i18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const SHARE_FAILED = msg({
	message: "Couldn't share {name}.",
	comment: 'Toast when preparing a peer-to-peer file share fails. {name} is the file name.',
});

export async function shareFilesP2P(channelId: string, files: ReadonlyArray<File>): Promise<void> {
	const currentUser = Users.getCurrentUser();
	if (!currentUser) return;
	const now = Date.now();
	const jobs = files.map((file, index) => {
		const nonce = SnowflakeUtils.fromTimestamp(now + index);
		const placeholder = new Message({
			id: nonce,
			channel_id: channelId,
			author: currentUser.toJSON(),
			type: MessageTypes.DEFAULT,
			flags: 0,
			pinned: false,
			mention_everyone: false,
			content: pendingShareContent(file.name, file.size, nonce),
			timestamp: new Date(now + index).toISOString(),
			mentions: [],
			state: MessageStates.SENDING,
			nonce,
		});
		MessageCommands.createOptimistic(channelId, placeholder.toJSON());
		queuePreparing(nonce, file.size);
		return {file, nonce};
	});
	for (const {file, nonce} of jobs) {
		try {
			const magnet = await shareFile(file, nonce);
			await MessageCommands.send(channelId, {content: magnet, nonce});
		} catch (error) {
			MessageCommands.deleteOptimistic(channelId, nonce);
			if (!(error instanceof ShareCancelledError)) {
				console.error('[p2p] share failed', error);
				ToastCommands.error(i18n._(SHARE_FAILED, {name: file.name}));
			}
		}
	}
}
