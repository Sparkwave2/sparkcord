// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ChannelID, MessageID, UserID} from '@app/api/BrandedTypes';
import {BatchBuilder, deleteOneOrMany, fetchMany, fetchOne, upsertOne} from '@app/api/database/CassandraQueryExecution';
import {
	type TupperID,
	type TupperMessageRow,
	TupperMessages,
	type TupperRow,
	Tuppers,
	TupperSettings,
	type TupperSettingsRow,
} from '@app/api/tupper/TupperTables';

const FETCH_TUPPERS_BY_USER = Tuppers.selectCql({where: Tuppers.where.eq('user_id')});
const FETCH_TUPPER = Tuppers.selectCql({
	where: [Tuppers.where.eq('user_id'), Tuppers.where.eq('tupper_id')],
	limit: 1,
});
const FETCH_SETTINGS = TupperSettings.selectCql({where: TupperSettings.where.eq('user_id'), limit: 1});
const FETCH_TUPPER_MESSAGES = TupperMessages.selectCql({
	where: [TupperMessages.where.eq('channel_id'), TupperMessages.where.in('message_id', 'message_ids')],
});

export class TupperRepository {
	async listByUser(userId: UserID): Promise<Array<TupperRow>> {
		const rows = await fetchMany<TupperRow>(FETCH_TUPPERS_BY_USER, {user_id: userId});
		return rows.sort((a, b) => a.position - b.position || (a.tupper_id < b.tupper_id ? -1 : 1));
	}

	async findById(userId: UserID, tupperId: TupperID): Promise<TupperRow | null> {
		return fetchOne<TupperRow>(FETCH_TUPPER, {user_id: userId, tupper_id: tupperId});
	}

	async upsert(row: TupperRow): Promise<void> {
		await upsertOne(Tuppers.upsertAll(row));
	}

	async upsertMany(rows: ReadonlyArray<TupperRow>): Promise<void> {
		for (let i = 0; i < rows.length; i += 50) {
			const batch = new BatchBuilder();
			for (const row of rows.slice(i, i + 50)) batch.addPrepared(Tuppers.upsertAll(row));
			await batch.execute();
		}
	}

	async delete(userId: UserID, tupperId: TupperID): Promise<void> {
		await deleteOneOrMany(Tuppers.deleteByPk({user_id: userId, tupper_id: tupperId}));
	}

	async getSettings(userId: UserID): Promise<TupperSettingsRow | null> {
		return fetchOne<TupperSettingsRow>(FETCH_SETTINGS, {user_id: userId});
	}

	async upsertSettings(row: TupperSettingsRow): Promise<void> {
		await upsertOne(TupperSettings.upsertAll(row));
	}

	async recordMessage(row: TupperMessageRow): Promise<void> {
		await upsertOne(TupperMessages.upsertAll(row));
	}

	async deleteMessage(channelId: ChannelID, messageId: MessageID): Promise<void> {
		await deleteOneOrMany(TupperMessages.deleteByPk({channel_id: channelId, message_id: messageId}));
	}

	async findMessages(channelId: ChannelID, messageIds: ReadonlyArray<MessageID>): Promise<Array<TupperMessageRow>> {
		if (messageIds.length === 0) return [];
		const out: Array<TupperMessageRow> = [];
		for (let i = 0; i < messageIds.length; i += 100) {
			out.push(
				...(await fetchMany<TupperMessageRow>(FETCH_TUPPER_MESSAGES, {
					channel_id: channelId,
					message_ids: messageIds.slice(i, i + 100),
				})),
			);
		}
		return out;
	}
}

let repository: TupperRepository | undefined;

export function getTupperRepository(): TupperRepository {
	repository ??= new TupperRepository();
	return repository;
}
