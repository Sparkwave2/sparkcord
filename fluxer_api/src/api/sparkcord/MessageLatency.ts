// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: the high-latency mark on messages. A client that was on a slow connection
// when it sent a message may say so (its measured latency in milliseconds); that number
// is kept beside the message and returned with it, so viewers who opted in can see why
// the message may have arrived late or out of step with the conversation.

import type {ChannelID, MessageID} from '@app/api/BrandedTypes';
import {createChannelID, createMessageID} from '@app/api/BrandedTypes';
import {fetchMany, upsertOne} from '@app/api/database/CassandraQueryExecution';
import {defineTable} from '@app/api/database/CassandraTableDsl';
import {Logger} from '@app/api/Logger';
import type {MessageResponse} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

/** Reports below this are not worth keeping. */
export const MESSAGE_LATENCY_MIN_MS = 250;
const MESSAGE_LATENCY_MAX_MS = 60_000;

interface MessageLatencyRow {
	channel_id: ChannelID;
	message_id: MessageID;
	latency_ms: number;
}

const MESSAGE_LATENCY_COLUMNS = ['channel_id', 'message_id', 'latency_ms'] as const satisfies ReadonlyArray<
	keyof MessageLatencyRow
>;

const MessageLatencies = defineTable<MessageLatencyRow, 'channel_id' | 'message_id', 'channel_id'>({
	name: 'sparkcord_message_latency',
	columns: MESSAGE_LATENCY_COLUMNS,
	primaryKey: ['channel_id', 'message_id'],
	partitionKey: ['channel_id'],
});

const FETCH_LATENCIES = MessageLatencies.selectCql({
	where: [MessageLatencies.where.eq('channel_id'), MessageLatencies.where.in('message_id', 'message_ids')],
});

/** Keeps the latency a client reported for a message it just sent. Never throws. */
export async function recordMessageLatency(
	channelId: ChannelID,
	messageId: MessageID,
	latencyMs: number | null | undefined,
): Promise<void> {
	if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < MESSAGE_LATENCY_MIN_MS) return;
	try {
		await upsertOne(
			MessageLatencies.upsertAll({
				channel_id: channelId,
				message_id: messageId,
				latency_ms: Math.min(Math.round(latencyMs), MESSAGE_LATENCY_MAX_MS),
			}),
		);
	} catch (error) {
		Logger.warn({error, messageId: messageId.toString()}, '[latency] failed to record message latency');
	}
}

/** Adds `latency_ms` to the messages that have one. Returns the responses unchanged on failure. */
export async function attachMessageLatency<T extends MessageResponse>(responses: Array<T>): Promise<Array<T>> {
	if (responses.length === 0) return responses;
	try {
		const byChannel = new Map<string, Set<string>>();
		for (const response of responses) {
			if (!response?.id || !response.channel_id || response.webhook_id) continue;
			let ids = byChannel.get(response.channel_id);
			if (!ids) byChannel.set(response.channel_id, (ids = new Set()));
			ids.add(response.id);
		}
		const found = new Map<string, number>();
		await Promise.all(
			Array.from(byChannel.entries()).map(async ([channelId, ids]) => {
				const messageIds = Array.from(ids, (id) => createMessageID(BigInt(id)));
				for (let i = 0; i < messageIds.length; i += 100) {
					const rows = await fetchMany<MessageLatencyRow>(FETCH_LATENCIES, {
						channel_id: createChannelID(BigInt(channelId)),
						message_ids: messageIds.slice(i, i + 100),
					});
					for (const row of rows) found.set(row.message_id.toString(), row.latency_ms);
				}
			}),
		);
		if (found.size === 0) return responses;
		return responses.map((response) => {
			const latency = found.get(response.id);
			return latency === undefined ? response : {...response, latency_ms: latency};
		});
	} catch (error) {
		Logger.warn({error}, '[latency] failed to attach latency to messages');
		return responses;
	}
}
