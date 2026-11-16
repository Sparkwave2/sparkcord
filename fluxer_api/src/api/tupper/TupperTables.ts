// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ChannelID, MessageID, UserID} from '@app/api/BrandedTypes';
import {defineTable} from '@app/api/database/CassandraTableDsl';

export type TupperID = bigint;

export interface TupperRow {
	user_id: UserID;
	tupper_id: TupperID;
	name: string;
	display_name: string | null;
	avatar_url: string | null;
	/** JSON array of {prefix, suffix}. */
	proxy_tags: string;
	keep_proxy: boolean;
	description: string | null;
	pronouns: string | null;
	color: number | null;
	birthday: string | null;
	tag: string | null;
	external_id: string | null;
	import_source: string | null;
	position: number;
	created_at: Date;
	updated_at: Date;
	/** Sparkcord name font id, or null. */
	font?: string | null;
}

export const TUPPER_COLUMNS = [
	'user_id',
	'tupper_id',
	'name',
	'display_name',
	'avatar_url',
	'proxy_tags',
	'keep_proxy',
	'description',
	'pronouns',
	'color',
	'birthday',
	'tag',
	'external_id',
	'import_source',
	'position',
	'created_at',
	'updated_at',
	'font',
] as const satisfies ReadonlyArray<keyof TupperRow>;

export type AutoproxyMode = 'off' | 'front' | 'latch';

export interface TupperSettingsRow {
	user_id: UserID;
	system_name: string | null;
	system_tag: string | null;
	proxy_enabled: boolean;
	autoproxy_mode: string;
	autoproxy_tupper_id: TupperID | null;
	latch_tupper_id: TupperID | null;
	updated_at: Date;
	/** Sparkcord: hide the system (member list, descriptions, system name) from other people. */
	system_private?: boolean | null;
}

export const TUPPER_SETTINGS_COLUMNS = [
	'user_id',
	'system_name',
	'system_tag',
	'proxy_enabled',
	'autoproxy_mode',
	'autoproxy_tupper_id',
	'latch_tupper_id',
	'updated_at',
	'system_private',
] as const satisfies ReadonlyArray<keyof TupperSettingsRow>;

/** Snapshot of who a proxied message was sent as, taken at send time. */
export interface TupperMessageRow {
	channel_id: ChannelID;
	message_id: MessageID;
	user_id: UserID;
	tupper_id: TupperID;
	name: string;
	avatar_url: string | null;
	color: number | null;
	pronouns: string | null;
	system_tag: string | null;
	font?: string | null;
}

export const TUPPER_MESSAGE_COLUMNS = [
	'channel_id',
	'message_id',
	'user_id',
	'tupper_id',
	'name',
	'avatar_url',
	'color',
	'pronouns',
	'system_tag',
	'font',
] as const satisfies ReadonlyArray<keyof TupperMessageRow>;

export const Tuppers = defineTable<TupperRow, 'user_id' | 'tupper_id', 'user_id'>({
	name: 'tuppers',
	columns: TUPPER_COLUMNS,
	primaryKey: ['user_id', 'tupper_id'],
	partitionKey: ['user_id'],
});

export const TupperSettings = defineTable<TupperSettingsRow, 'user_id'>({
	name: 'tupper_settings',
	columns: TUPPER_SETTINGS_COLUMNS,
	primaryKey: ['user_id'],
});

export const TupperMessages = defineTable<TupperMessageRow, 'channel_id' | 'message_id', 'channel_id'>({
	name: 'tupper_messages',
	columns: TUPPER_MESSAGE_COLUMNS,
	primaryKey: ['channel_id', 'message_id'],
	partitionKey: ['channel_id'],
});
