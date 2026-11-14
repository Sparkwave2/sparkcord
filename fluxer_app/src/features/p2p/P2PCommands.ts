// SPDX-License-Identifier: AGPL-3.0-or-later
// Sharing files peer-to-peer from the composer: pick files, seed each, post its link.

import * as MessageCommands from '@app/features/messaging/commands/MessageCommands';
import {shareFile} from '@app/features/p2p/P2PClient';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';

export async function shareFilesP2P(channelId: string, files: ReadonlyArray<File>): Promise<void> {
	for (const file of files) {
		const magnet = await shareFile(file);
		await MessageCommands.send(channelId, {content: magnet, nonce: SnowflakeUtils.fromTimestamp(Date.now())});
	}
}
