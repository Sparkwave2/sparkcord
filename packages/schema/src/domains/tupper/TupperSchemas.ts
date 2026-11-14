// SPDX-License-Identifier: AGPL-3.0-or-later

import {z} from 'zod';

const ProxyTagSchema = z.object({
	prefix: z.string().max(100).nullish().describe('Text before the message, e.g. "[" or "k:"'),
	suffix: z.string().max(100).nullish().describe('Text after the message, e.g. "]"'),
});

export const TupperProxyTagResponse = z.object({
	prefix: z.string().nullable(),
	suffix: z.string().nullable(),
});

export const TupperResponse = z.object({
	id: z.string().describe('Tupper ID (snowflake)'),
	name: z.string().describe('Name, unique per user'),
	display_name: z.string().nullable().describe('Name shown on proxied messages, if different'),
	avatar_url: z.string().nullable().describe('Avatar image URL'),
	avatar_proxy_url: z.string().nullable().describe('Avatar URL through the media proxy, for display'),
	proxy_tags: z.array(TupperProxyTagResponse),
	keep_proxy: z.boolean().describe('Keep the proxy tags in the sent message'),
	description: z.string().nullable(),
	pronouns: z.string().nullable(),
	color: z.number().int().nullable(),
	birthday: z.string().nullable().describe('YYYY-MM-DD'),
	tag: z.string().nullable().describe('Tag shown after the name; overrides the system tag'),
	position: z.number().int(),
	created_at: z.string(),
});

export type TupperResponse = z.infer<typeof TupperResponse>;

export const TupperListResponse = z.array(TupperResponse);

export const TupperCardResponse = z.object({
	id: z.string().describe('Tupper ID (snowflake)'),
	user_id: z.string().describe('The account that owns this tupper'),
	name: z.string().describe('Name shown on messages (display name if set)'),
	avatar_url: z.string().nullable().describe('Avatar URL through the media proxy'),
	description: z.string().nullable(),
	pronouns: z.string().nullable(),
	color: z.number().int().nullable(),
	birthday: z.string().nullable(),
	system_name: z.string().nullable().describe("The owner's system name"),
	system_tag: z.string().nullable().describe('Tag shown after the name (tupper tag or system tag)'),
});

export type TupperCardResponse = z.infer<typeof TupperCardResponse>;

const TupperFields = {
	display_name: z.string().max(100).nullish(),
	avatar_url: z.string().max(1024).nullish(),
	proxy_tags: z.array(ProxyTagSchema).max(25).optional(),
	keep_proxy: z.boolean().optional(),
	description: z.string().max(2000).nullish(),
	pronouns: z.string().max(100).nullish(),
	color: z.number().int().min(0).max(0xffffff).nullish(),
	birthday: z.string().max(10).nullish(),
	tag: z.string().max(79).nullish(),
	position: z.number().int().min(0).optional(),
};

export const TupperCreateRequest = z.object({name: z.string().min(1).max(100), ...TupperFields});
export type TupperCreateRequest = z.infer<typeof TupperCreateRequest>;

export const TupperUpdateRequest = z.object({name: z.string().min(1).max(100).optional(), ...TupperFields});
export type TupperUpdateRequest = z.infer<typeof TupperUpdateRequest>;

export const TupperAutoproxyMode = z.enum(['off', 'front', 'latch']);

export const TupperSettingsResponse = z.object({
	system_name: z.string().nullable(),
	system_tag: z.string().nullable(),
	proxy_enabled: z.boolean(),
	autoproxy_mode: TupperAutoproxyMode,
	autoproxy_tupper_id: z.string().nullable(),
	latch_tupper_id: z.string().nullable(),
});

export const TupperSettingsUpdateRequest = z.object({
	system_name: z.string().max(100).nullish(),
	system_tag: z.string().max(79).nullish(),
	proxy_enabled: z.boolean().optional(),
	autoproxy_mode: TupperAutoproxyMode.optional(),
	autoproxy_tupper_id: z.string().regex(/^\d{1,20}$/).nullish(),
});
export type TupperSettingsUpdateRequest = z.infer<typeof TupperSettingsUpdateRequest>;

export const TupperImportRequest = z.object({
	data: z.unknown().describe('The parsed contents of a Tupperbox or PluralKit JSON export'),
	replace: z.boolean().optional().describe('Delete all existing tuppers before importing'),
});
export type TupperImportRequest = z.infer<typeof TupperImportRequest>;

export const TupperImportResponse = z.object({
	source: z.enum(['tupperbox', 'pluralkit']),
	created: z.number().int(),
	updated: z.number().int(),
	skipped: z.number().int(),
	warnings: z.array(z.string()),
	tuppers: TupperListResponse,
});
