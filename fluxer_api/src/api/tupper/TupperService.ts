// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ChannelID, MessageID, UserID} from '@app/api/BrandedTypes';
import {createChannelID, createMessageID} from '@app/api/BrandedTypes';
import {Logger} from '@app/api/Logger';
import {getMediaService, getSnowflakeService} from '@app/api/middleware/ServiceRegistry';
import {
	type ImportedTupper,
	parseTupperImport,
	sanitizeAvatarUrl,
	TUPPER_DESCRIPTION_MAX_LENGTH,
	TUPPER_DISPLAY_NAME_MAX_LENGTH,
	TUPPER_MAX_PROXY_TAGS,
	TUPPER_NAME_MAX_LENGTH,
	TUPPER_PRONOUNS_MAX_LENGTH,
	TUPPER_PROXY_TAG_MAX_LENGTH,
	TUPPER_TAG_MAX_LENGTH,
	type TupperImportSource,
	TupperImportFormatError,
} from '@app/api/tupper/TupperImport';
import {matchProxyTags, normalizeProxyTag, type ProxyTag} from '@app/api/tupper/TupperProxyMatcher';
import {getTupperRepository, type TupperRepository} from '@app/api/tupper/TupperRepository';
import type {
	AutoproxyMode,
	TupperID,
	TupperMessageRow,
	TupperRow,
	TupperSettingsRow,
} from '@app/api/tupper/TupperTables';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import type {MessageResponse} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {isNameFontId} from '@fluxer/constants/src/NameFonts';

export const MAX_TUPPERS_PER_USER = 1000;
const AUTOPROXY_MODES: ReadonlySet<string> = new Set(['off', 'front', 'latch']);

export interface TupperResponse {
	id: string;
	name: string;
	display_name: string | null;
	avatar_url: string | null;
	avatar_proxy_url: string | null;
	proxy_tags: Array<ProxyTag>;
	keep_proxy: boolean;
	description: string | null;
	pronouns: string | null;
	color: number | null;
	birthday: string | null;
	tag: string | null;
	font: string | null;
	position: number;
	created_at: string;
}

export interface TupperSettingsResponse {
	system_name: string | null;
	system_tag: string | null;
	proxy_enabled: boolean;
	autoproxy_mode: AutoproxyMode;
	autoproxy_tupper_id: string | null;
	latch_tupper_id: string | null;
}

export interface MessageProxyResponse {
	tupper_id: string;
	name: string;
	avatar_url: string | null;
	color: number | null;
	pronouns: string | null;
	system_tag: string | null;
	font: string | null;
	system_private: boolean;
}

export interface TupperSystemResponse {
	user_id: string;
	private: boolean;
	system_name: string | null;
	system_tag: string | null;
	tuppers: Array<{
		id: string;
		name: string;
		avatar_url: string | null;
		pronouns: string | null;
		description: string | null;
		color: number | null;
		tag: string | null;
		font: string | null;
	}>;
}

export interface TupperInput {
	name?: string;
	display_name?: string | null;
	avatar_url?: string | null;
	proxy_tags?: Array<{prefix?: string | null; suffix?: string | null}>;
	keep_proxy?: boolean;
	description?: string | null;
	pronouns?: string | null;
	color?: number | null;
	birthday?: string | null;
	tag?: string | null;
	font?: string | null;
	position?: number;
}

export interface TupperSettingsInput {
	system_name?: string | null;
	system_tag?: string | null;
	proxy_enabled?: boolean;
	autoproxy_mode?: AutoproxyMode;
	autoproxy_tupper_id?: string | null;
	system_private?: boolean;
}

export interface TupperImportResult {
	source: TupperImportSource;
	created: number;
	updated: number;
	skipped: number;
	warnings: Array<string>;
	tuppers: Array<TupperResponse>;
}

export interface ResolvedProxy {
	tupper: TupperRow;
	content: string;
	settings: TupperSettingsRow;
}

function parseTags(json: string): Array<ProxyTag> {
	try {
		const value = JSON.parse(json) as unknown;
		if (!Array.isArray(value)) return [];
		return value.flatMap((tag) => {
			const normalized = normalizeProxyTag(tag as {prefix?: string | null; suffix?: string | null});
			return normalized ? [normalized] : [];
		});
	} catch {
		return [];
	}
}

function optionalText(value: string | null | undefined, max: number): string | null {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

function defaultSettings(userId: UserID): TupperSettingsRow {
	return {
		user_id: userId,
		system_name: null,
		system_tag: null,
		proxy_enabled: true,
		autoproxy_mode: 'off',
		autoproxy_tupper_id: null,
		latch_tupper_id: null,
		updated_at: new Date(),
	};
}

function parseTupperId(value: string, path: string): TupperID {
	if (!/^\d{1,20}$/.test(value)) throw InputValidationError.create(path, 'Invalid tupper id.');
	return BigInt(value);
}

export function proxiedAvatarUrl(url: string | null): string | null {
	if (!url) return null;
	try {
		return getMediaService().getExternalMediaProxyURL(url);
	} catch {
		return url;
	}
}

export function toTupperResponse(row: TupperRow): TupperResponse {
	return {
		id: row.tupper_id.toString(),
		name: row.name,
		display_name: row.display_name,
		avatar_url: row.avatar_url,
		avatar_proxy_url: proxiedAvatarUrl(row.avatar_url),
		proxy_tags: parseTags(row.proxy_tags),
		keep_proxy: row.keep_proxy,
		description: row.description,
		pronouns: row.pronouns,
		color: row.color,
		birthday: row.birthday,
		tag: row.tag,
		font: row.font ?? null,
		position: row.position,
		created_at: row.created_at.toISOString(),
	};
}

export interface TupperCardResponse {
	id: string;
	user_id: string;
	name: string;
	avatar_url: string | null;
	description: string | null;
	pronouns: string | null;
	color: number | null;
	birthday: string | null;
	system_name: string | null;
	system_tag: string | null;
	font: string | null;
}

export function toSettingsResponse(row: TupperSettingsRow): TupperSettingsResponse {
	return {
		system_name: row.system_name,
		system_tag: row.system_tag,
		proxy_enabled: row.proxy_enabled,
		autoproxy_mode: (AUTOPROXY_MODES.has(row.autoproxy_mode) ? row.autoproxy_mode : 'off') as AutoproxyMode,
		autoproxy_tupper_id: row.autoproxy_tupper_id?.toString() ?? null,
		latch_tupper_id: row.latch_tupper_id?.toString() ?? null,
		system_private: row.system_private === true,
	};
}

export function toMessageProxyResponse(row: TupperMessageRow): MessageProxyResponse {
	return {
		tupper_id: row.tupper_id.toString(),
		name: row.name,
		avatar_url: proxiedAvatarUrl(row.avatar_url),
		color: row.color,
		pronouns: row.pronouns,
		system_tag: row.system_tag,
		font: row.font ?? null,
	};
}

export class TupperService {
	constructor(private readonly repo: TupperRepository = getTupperRepository()) {}

	async list(userId: UserID): Promise<Array<TupperRow>> {
		return this.repo.listByUser(userId);
	}

	async get(userId: UserID, tupperId: string): Promise<TupperRow> {
		const row = await this.repo.findById(userId, parseTupperId(tupperId, 'tupper_id'));
		if (!row) throw InputValidationError.create('tupper_id', 'Unknown tupper.');
		return row;
	}

	/** Public card shown when someone clicks a proxied message. Readable by any signed-in user. */
	async getCard(userId: UserID, tupperId: string, viewerId?: UserID): Promise<TupperCardResponse> {
		const [row, settings] = await Promise.all([
			this.repo.findById(userId, parseTupperId(tupperId, 'tupper_id')),
			this.repo.getSettings(userId),
		]);
		if (!row) throw InputValidationError.create('tupper_id', 'Unknown tupper.');
		// A private system still shows what its messages already show (name, avatar,
		// pronouns, colour, tag); the rest is only for the owner.
		const hidden = settings?.system_private === true && viewerId !== userId;
		return {
			id: row.tupper_id.toString(),
			user_id: userId.toString(),
			name: row.display_name || row.name,
			avatar_url: proxiedAvatarUrl(row.avatar_url),
			description: hidden ? null : row.description,
			pronouns: row.pronouns,
			color: row.color,
			birthday: hidden ? null : row.birthday,
			system_name: hidden ? null : (settings?.system_name ?? null),
			system_tag: row.tag ?? settings?.system_tag ?? null,
			font: row.font ?? null,
			system_private: settings?.system_private === true,
		};
	}

	/** Someone's whole system, for the "view system" window. Empty for others when private. */
	async getSystem(userId: UserID, viewerId: UserID): Promise<TupperSystemResponse> {
		const settings = await this.repo.getSettings(userId);
		if (settings?.system_private === true && viewerId !== userId) {
			return {user_id: userId.toString(), private: true, system_name: null, system_tag: null, tuppers: []};
		}
		const tuppers = await this.repo.listByUser(userId);
		return {
			user_id: userId.toString(),
			private: settings?.system_private === true,
			system_name: settings?.system_name ?? null,
			system_tag: settings?.system_tag ?? null,
			tuppers: [...tuppers]
				.sort((a, b) => a.position - b.position)
				.map((row) => ({
					id: row.tupper_id.toString(),
					name: row.display_name || row.name,
					avatar_url: proxiedAvatarUrl(row.avatar_url),
					pronouns: row.pronouns,
					description: row.description,
					color: row.color,
					tag: row.tag,
					font: row.font ?? null,
				})),
		};
	}

	async findByName(userId: UserID, name: string): Promise<TupperRow | null> {
		const lower = name.trim().toLowerCase();
		const tuppers = await this.repo.listByUser(userId);
		return tuppers.find((t) => t.name.toLowerCase() === lower) ?? null;
	}

	private applyInput(row: TupperRow, input: TupperInput): TupperRow {
		const next = {...row};
		if (input.name !== undefined) {
			const name = optionalText(input.name, TUPPER_NAME_MAX_LENGTH);
			if (!name) throw InputValidationError.create('name', 'Name is required.');
			next.name = name;
		}
		if (input.display_name !== undefined)
			next.display_name = optionalText(input.display_name, TUPPER_DISPLAY_NAME_MAX_LENGTH);
		if (input.avatar_url !== undefined) {
			if (input.avatar_url && !sanitizeAvatarUrl(input.avatar_url)) {
				throw InputValidationError.create('avatar_url', 'Avatar must be an http(s) URL.');
			}
			next.avatar_url = sanitizeAvatarUrl(input.avatar_url);
		}
		if (input.proxy_tags !== undefined) {
			if (input.proxy_tags.length > TUPPER_MAX_PROXY_TAGS) {
				throw InputValidationError.create('proxy_tags', `At most ${TUPPER_MAX_PROXY_TAGS} proxy tags.`);
			}
			const tags = input.proxy_tags.flatMap((tag) => {
				const normalized = normalizeProxyTag(tag);
				if (!normalized) return [];
				if (
					(normalized.prefix?.length ?? 0) > TUPPER_PROXY_TAG_MAX_LENGTH ||
					(normalized.suffix?.length ?? 0) > TUPPER_PROXY_TAG_MAX_LENGTH
				) {
					throw InputValidationError.create('proxy_tags', 'Proxy tag is too long.');
				}
				return [normalized];
			});
			next.proxy_tags = JSON.stringify(tags);
		}
		if (input.keep_proxy !== undefined) next.keep_proxy = input.keep_proxy;
		if (input.description !== undefined)
			next.description = optionalText(input.description, TUPPER_DESCRIPTION_MAX_LENGTH);
		if (input.pronouns !== undefined) next.pronouns = optionalText(input.pronouns, TUPPER_PRONOUNS_MAX_LENGTH);
		if (input.color !== undefined) {
			if (input.color !== null && (!Number.isInteger(input.color) || input.color < 0 || input.color > 0xffffff)) {
				throw InputValidationError.create('color', 'Color must be an integer between 0 and 16777215.');
			}
			next.color = input.color;
		}
		if (input.birthday !== undefined) {
			const birthday = optionalText(input.birthday, 10);
			if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
				throw InputValidationError.create('birthday', 'Birthday must be YYYY-MM-DD.');
			}
			next.birthday = birthday;
		}
		if (input.tag !== undefined) next.tag = optionalText(input.tag, TUPPER_TAG_MAX_LENGTH);
		if (input.font !== undefined) {
			if (input.font !== null && !isNameFontId(input.font)) throw InputValidationError.create('font', 'Unknown font.');
			next.font = input.font;
		}
		if (input.position !== undefined) next.position = Math.max(0, Math.trunc(input.position));
		next.updated_at = new Date();
		return next;
	}

	async create(userId: UserID, input: TupperInput): Promise<TupperRow> {
		const existing = await this.repo.listByUser(userId);
		if (existing.length >= MAX_TUPPERS_PER_USER) {
			throw InputValidationError.create('name', `You can have at most ${MAX_TUPPERS_PER_USER} tuppers.`);
		}
		if (!input.name) throw InputValidationError.create('name', 'Name is required.');
		const now = new Date();
		const base: TupperRow = {
			user_id: userId,
			tupper_id: await getSnowflakeService().generate(),
			name: '',
			display_name: null,
			avatar_url: null,
			proxy_tags: '[]',
			keep_proxy: false,
			description: null,
			pronouns: null,
			color: null,
			birthday: null,
			tag: null,
			external_id: null,
			import_source: null,
			position: existing.reduce((max, t) => Math.max(max, t.position + 1), 0),
			created_at: now,
			updated_at: now,
		};
		const row = this.applyInput(base, input);
		await this.repo.upsert(row);
		return row;
	}

	async update(userId: UserID, tupperId: string, input: TupperInput): Promise<TupperRow> {
		const row = this.applyInput(await this.get(userId, tupperId), input);
		await this.repo.upsert(row);
		return row;
	}

	async delete(userId: UserID, tupperId: string): Promise<void> {
		const row = await this.get(userId, tupperId);
		await this.repo.delete(userId, row.tupper_id);
		const settings = await this.repo.getSettings(userId);
		if (settings && (settings.autoproxy_tupper_id === row.tupper_id || settings.latch_tupper_id === row.tupper_id)) {
			await this.repo.upsertSettings({
				...settings,
				autoproxy_tupper_id: settings.autoproxy_tupper_id === row.tupper_id ? null : settings.autoproxy_tupper_id,
				latch_tupper_id: settings.latch_tupper_id === row.tupper_id ? null : settings.latch_tupper_id,
				autoproxy_mode: settings.autoproxy_tupper_id === row.tupper_id && settings.autoproxy_mode === 'front'
					? 'off'
					: settings.autoproxy_mode,
				updated_at: new Date(),
			});
		}
	}

	async getSettings(userId: UserID): Promise<TupperSettingsRow> {
		return (await this.repo.getSettings(userId)) ?? defaultSettings(userId);
	}

	async updateSettings(userId: UserID, input: TupperSettingsInput): Promise<TupperSettingsRow> {
		const next = {...(await this.getSettings(userId))};
		if (input.system_name !== undefined) next.system_name = optionalText(input.system_name, TUPPER_NAME_MAX_LENGTH);
		if (input.system_tag !== undefined) next.system_tag = optionalText(input.system_tag, TUPPER_TAG_MAX_LENGTH);
		if (input.proxy_enabled !== undefined) next.proxy_enabled = input.proxy_enabled;
		if (input.system_private !== undefined) next.system_private = input.system_private;
		if (input.autoproxy_tupper_id !== undefined) {
			if (input.autoproxy_tupper_id === null) {
				next.autoproxy_tupper_id = null;
			} else {
				next.autoproxy_tupper_id = (await this.get(userId, input.autoproxy_tupper_id)).tupper_id;
			}
		}
		if (input.autoproxy_mode !== undefined) {
			if (!AUTOPROXY_MODES.has(input.autoproxy_mode)) {
				throw InputValidationError.create('autoproxy_mode', 'Mode must be off, front or latch.');
			}
			next.autoproxy_mode = input.autoproxy_mode;
			if (input.autoproxy_mode !== 'latch') next.latch_tupper_id = null;
		}
		if (next.autoproxy_mode === 'front' && next.autoproxy_tupper_id === null) {
			throw InputValidationError.create('autoproxy_tupper_id', 'Front mode needs a tupper.');
		}
		next.updated_at = new Date();
		await this.repo.upsertSettings(next);
		return next;
	}

	async importData(userId: UserID, data: unknown, options: {replace?: boolean} = {}): Promise<TupperImportResult> {
		let parsed: ReturnType<typeof parseTupperImport>;
		try {
			parsed = parseTupperImport(data);
		} catch (error) {
			if (error instanceof TupperImportFormatError) throw InputValidationError.create('file', error.message);
			throw error;
		}
		let existing = await this.repo.listByUser(userId);
		if (options.replace) {
			for (const row of existing) await this.repo.delete(userId, row.tupper_id);
			existing = [];
		}
		const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row] as const));
		const rows: Array<TupperRow> = [];
		let created = 0;
		let updated = 0;
		let skipped = 0;
		let position = existing.reduce((max, t) => Math.max(max, t.position + 1), 0);
		const now = new Date();
		for (const imported of parsed.tuppers) {
			const current = byName.get(imported.name.toLowerCase());
			if (!current && existing.length + created >= MAX_TUPPERS_PER_USER) {
				skipped++;
				continue;
			}
			const row = this.rowFromImport(userId, imported, parsed.source, current, current ? current.position : position);
			if (current) {
				updated++;
			} else {
				row.tupper_id = await getSnowflakeService().generate();
				row.created_at = now;
				created++;
				position++;
			}
			byName.set(imported.name.toLowerCase(), row);
			rows.push(row);
		}
		if (skipped > 0) parsed.warnings.push(`${skipped} tuppers skipped: the limit is ${MAX_TUPPERS_PER_USER}.`);
		await this.repo.upsertMany(rows);
		if (parsed.systemName || parsed.systemTag) {
			const settings = await this.getSettings(userId);
			await this.repo.upsertSettings({
				...settings,
				system_name: settings.system_name ?? parsed.systemName,
				system_tag: settings.system_tag ?? parsed.systemTag,
				updated_at: now,
			});
		}
		Logger.info({userId: userId.toString(), source: parsed.source, created, updated, skipped}, 'Imported tuppers');
		return {
			source: parsed.source,
			created,
			updated,
			skipped,
			warnings: parsed.warnings,
			tuppers: (await this.repo.listByUser(userId)).map(toTupperResponse),
		};
	}

	private rowFromImport(
		userId: UserID,
		imported: ImportedTupper,
		source: TupperImportSource,
		current: TupperRow | undefined,
		position: number,
	): TupperRow {
		const now = new Date();
		return {
			user_id: userId,
			tupper_id: current?.tupper_id ?? 0n,
			name: imported.name,
			display_name: imported.displayName,
			avatar_url: imported.avatarUrl,
			proxy_tags: JSON.stringify(imported.proxyTags),
			keep_proxy: imported.keepProxy,
			description: imported.description,
			pronouns: imported.pronouns,
			color: imported.color,
			birthday: imported.birthday,
			tag: imported.tag,
			external_id: imported.externalId,
			import_source: source,
			position,
			created_at: current?.created_at ?? now,
			updated_at: now,
		};
	}

	async exportData(userId: UserID): Promise<Record<string, unknown>> {
		const [tuppers, settings] = await Promise.all([this.repo.listByUser(userId), this.getSettings(userId)]);
		return {
			version: 2,
			name: settings.system_name,
			tag: settings.system_tag,
			members: tuppers.map((row) => ({
				id: row.tupper_id.toString(),
				name: row.name,
				display_name: row.display_name,
				avatar_url: row.avatar_url,
				color: row.color === null ? null : row.color.toString(16).padStart(6, '0'),
				pronouns: row.pronouns,
				description: row.description,
				birthday: row.birthday,
				keep_proxy: row.keep_proxy,
				proxy_tags: parseTags(row.proxy_tags),
				created: row.created_at.toISOString(),
			})),
		};
	}

	/**
	 * Decides whether an outgoing message should be proxied. Explicit tags win over
	 * autoproxy; a leading backslash disables both (and `\\` also clears a latch).
	 */
	async resolveProxy(params: {
		userId: UserID;
		content: string | undefined;
		hasAttachments: boolean;
	}): Promise<ResolvedProxy | null> {
		const content = params.content ?? '';
		if (content.length === 0 && !params.hasAttachments) return null;
		const settings = await this.repo.getSettings(params.userId);
		if (settings && !settings.proxy_enabled) return null;
		const tuppers = await this.repo.listByUser(params.userId);
		if (tuppers.length === 0) return null;
		const effective = settings ?? defaultSettings(params.userId);
		if (content.startsWith('\\')) {
			if (content.startsWith('\\\\') && effective.autoproxy_mode === 'latch' && effective.latch_tupper_id !== null) {
				await this.repo.upsertSettings({...effective, latch_tupper_id: null, updated_at: new Date()});
			}
			return null;
		}
		const match = matchProxyTags(
			content,
			tuppers.map((row) => ({tupper: row, proxyTags: parseTags(row.proxy_tags), keepProxy: row.keep_proxy})),
			{allowEmptyContent: params.hasAttachments},
		);
		if (match) {
			if (effective.autoproxy_mode === 'latch' && effective.latch_tupper_id !== match.tupper.tupper_id) {
				await this.repo.upsertSettings({...effective, latch_tupper_id: match.tupper.tupper_id, updated_at: new Date()});
			}
			return {tupper: match.tupper, content: match.content, settings: effective};
		}
		const autoId =
			effective.autoproxy_mode === 'front'
				? effective.autoproxy_tupper_id
				: effective.autoproxy_mode === 'latch'
					? effective.latch_tupper_id
					: null;
		if (autoId === null) return null;
		const tupper = tuppers.find((row) => row.tupper_id === autoId);
		return tupper ? {tupper, content, settings: effective} : null;
	}

	snapshotFor(resolved: ResolvedProxy, channelId: ChannelID, messageId: MessageID, userId: UserID): TupperMessageRow {
		const {tupper, settings} = resolved;
		return {
			channel_id: channelId,
			message_id: messageId,
			user_id: userId,
			tupper_id: tupper.tupper_id,
			name: tupper.display_name ?? tupper.name,
			avatar_url: tupper.avatar_url,
			color: tupper.color,
			pronouns: tupper.pronouns,
			system_tag: tupper.tag ?? settings.system_tag,
			font: tupper.font ?? null,
		};
	}

	async recordProxiedMessage(row: TupperMessageRow): Promise<void> {
		await this.repo.recordMessage(row);
	}

	async forgetMessage(channelId: ChannelID, messageId: MessageID): Promise<void> {
		await this.repo.deleteMessage(channelId, messageId);
	}

	/**
	 * Adds `proxy` to every message (and referenced message) that was sent through a
	 * tupper. Failures are logged and the responses are returned unchanged, so a
	 * tupper problem can never break message delivery.
	 */
	async enrichResponses<T extends MessageResponse>(responses: Array<T>): Promise<Array<T>> {
		if (responses.length === 0) return responses;
		try {
			const byChannel = new Map<string, Set<string>>();
			const collect = (message: MessageResponse | null | undefined) => {
				if (!message?.id || !message.channel_id || message.webhook_id) return;
				let ids = byChannel.get(message.channel_id);
				if (!ids) byChannel.set(message.channel_id, (ids = new Set()));
				ids.add(message.id);
			};
			for (const response of responses) {
				collect(response);
				collect(response.referenced_message as MessageResponse | null | undefined);
			}
			const found = new Map<string, MessageProxyResponse>();
			await Promise.all(
				Array.from(byChannel.entries()).map(async ([channelId, ids]) => {
					const rows = await this.repo.findMessages(
						createChannelID(BigInt(channelId)),
						Array.from(ids, (id) => createMessageID(BigInt(id))),
					);
					for (const row of rows) found.set(row.message_id.toString(), toMessageProxyResponse(row));
				}),
			);
			if (found.size === 0) return responses;
			return responses.map((response) => {
				const proxy = found.get(response.id);
				const referenced = response.referenced_message as MessageResponse | null | undefined;
				const referencedProxy = referenced ? found.get(referenced.id) : undefined;
				if (!proxy && !referencedProxy) return response;
				return {
					...response,
					...(proxy ? {proxy} : {}),
					...(referenced && referencedProxy ? {referenced_message: {...referenced, proxy: referencedProxy}} : {}),
				};
			});
		} catch (error) {
			Logger.warn({error}, '[tuppers] failed to attach proxy info to messages');
			return responses;
		}
	}
}

let service: TupperService | undefined;

export function getTupperService(): TupperService {
	service ??= new TupperService();
	return service;
}
