// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord soundboard: short sounds (up to 10 seconds, 1 MB) owned by a user (personal,
// playable in any voice channel) or by a community (playable by its members in its voice
// channels). Playing happens on the clients: the player tells the others in the call
// over the voice connection, and each listener fetches the audio from here and plays it
// at their own soundboard volume.

import {createGuildID, type GuildID, type UserID} from '@app/api/BrandedTypes';
import {Config} from '@app/api/Config';
import {deleteOneOrMany, fetchMany, fetchOne, upsertOne} from '@app/api/database/CassandraQueryExecution';
import {defineTable} from '@app/api/database/CassandraTableDsl';
import {DefaultUserOnly, LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {getGatewayService, getSnowflakeService} from '@app/api/middleware/ServiceRegistry';
import {getGuildRepository, getStorageService} from '@app/api/middleware/ServiceSingletons';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {requirePermission} from '@app/api/utils/PermissionUtils';
import {Validator} from '@app/api/Validator';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import {MissingAccessError} from '@fluxer/errors/src/domains/core/MissingAccessError';
import {UnknownGuildEmojiError} from '@fluxer/errors/src/domains/guild/UnknownGuildEmojiError';
import {SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

export const MAX_SOUND_BYTES = 1024 * 1024;
export const MAX_SOUND_DURATION_MS = 10_000;
export const MAX_PERSONAL_SOUNDS = 50;
export const MAX_COMMUNITY_SOUNDS = 50;

const ALLOWED_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm']);

interface SoundRow {
	id: bigint;
	/** A user id for personal sounds, a community id for community sounds. */
	owner_id: bigint;
	owner_kind: string;
	name: string;
	emoji: string | null;
	duration_ms: number;
	content_type: string;
	creator_id: UserID;
	created_at: Date;
}

const COLUMNS = [
	'id',
	'owner_id',
	'owner_kind',
	'name',
	'emoji',
	'duration_ms',
	'content_type',
	'creator_id',
	'created_at',
] as const satisfies ReadonlyArray<keyof SoundRow>;

const Sounds = defineTable<SoundRow, 'id', 'id'>({
	name: 'soundboard_sounds',
	columns: COLUMNS,
	primaryKey: ['id'],
	partitionKey: ['id'],
});

const SoundsByOwner = defineTable<SoundRow, 'owner_id' | 'id', 'owner_id'>({
	name: 'soundboard_sounds_by_owner',
	columns: COLUMNS,
	primaryKey: ['owner_id', 'id'],
	partitionKey: ['owner_id'],
});

const FETCH_BY_ID = Sounds.selectCql({where: Sounds.where.eq('id')});
const FETCH_BY_OWNER = SoundsByOwner.selectCql({where: SoundsByOwner.where.eq('owner_id')});

const storageKey = (id: bigint) => `soundboard/${id.toString()}`;

async function getSound(id: bigint): Promise<SoundRow | null> {
	return (await fetchOne<SoundRow>(FETCH_BY_ID, {id})) ?? null;
}

async function listSounds(ownerId: bigint): Promise<Array<SoundRow>> {
	const rows = await fetchMany<SoundRow>(FETCH_BY_OWNER, {owner_id: ownerId});
	return rows.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function toResponse(row: SoundRow) {
	return {
		id: row.id.toString(),
		name: row.name,
		emoji: row.emoji,
		duration_ms: row.duration_ms,
		owner_kind: row.owner_kind as 'user' | 'guild',
		owner_id: row.owner_id.toString(),
		creator_id: row.creator_id.toString(),
	};
}

const SoundItem = z.object({
	id: z.string(),
	name: z.string(),
	emoji: z.string().nullable(),
	duration_ms: z.number(),
	owner_kind: z.enum(['user', 'guild']),
	owner_id: z.string(),
	creator_id: z.string(),
});
const ListResponse = z.object({sounds: z.array(SoundItem)});

const CreateRequest = z.object({
	name: z.string().trim().min(1).max(32),
	emoji: z.string().max(16).nullish(),
	duration_ms: z.number().int().min(1).max(MAX_SOUND_DURATION_MS + 250),
	sound: z.string().max(Math.ceil((MAX_SOUND_BYTES * 4) / 3) + 200).describe('data:audio/...;base64,...'),
});
const UpdateRequest = z.object({
	name: z.string().trim().min(1).max(32).optional(),
	emoji: z.string().max(16).nullish(),
});
const GuildParam = z.object({guild_id: SnowflakeType});
const SoundParam = z.object({sound_id: SnowflakeType});
const GuildSoundParam = GuildParam.extend({sound_id: SnowflakeType});

function decodeSound(dataUri: string): {bytes: Uint8Array; contentType: string} {
	const match = /^data:([a-z0-9.+/-]+)(?:;[^,]*)?;base64,(.*)$/is.exec(dataUri);
	if (!match) throw InputValidationError.create('sound', 'Expected an audio file.');
	const contentType = match[1]!.toLowerCase();
	if (!ALLOWED_TYPES.has(contentType)) {
		throw InputValidationError.create('sound', 'Use an MP3, OGG, WAV or WebM audio file.');
	}
	const bytes = new Uint8Array(Buffer.from(match[2]!, 'base64'));
	if (bytes.length === 0) throw InputValidationError.create('sound', 'The audio file is empty.');
	if (bytes.length > MAX_SOUND_BYTES) throw InputValidationError.create('sound', 'Sounds can be at most 1 MB.');
	return {bytes, contentType};
}

async function createSound(params: {
	ownerId: bigint;
	ownerKind: 'user' | 'guild';
	creatorId: UserID;
	max: number;
	body: z.infer<typeof CreateRequest>;
}): Promise<SoundRow> {
	const {ownerId, ownerKind, creatorId, max, body} = params;
	if ((await listSounds(ownerId)).length >= max) {
		throw InputValidationError.create('sound', `There can be at most ${max} sounds here.`);
	}
	const {bytes, contentType} = decodeSound(body.sound);
	const id = await getSnowflakeService().generate();
	await getStorageService().uploadObject({bucket: Config.s3.buckets.cdn, key: storageKey(id), body: bytes, contentType});
	const row: SoundRow = {
		id,
		owner_id: ownerId,
		owner_kind: ownerKind,
		name: body.name,
		emoji: body.emoji || null,
		duration_ms: Math.min(body.duration_ms, MAX_SOUND_DURATION_MS),
		content_type: contentType,
		creator_id: creatorId,
		created_at: new Date(),
	};
	await upsertOne(Sounds.upsertAll(row));
	await upsertOne(SoundsByOwner.upsertAll(row));
	return row;
}

async function updateSound(row: SoundRow, body: z.infer<typeof UpdateRequest>): Promise<SoundRow> {
	const updated: SoundRow = {
		...row,
		name: body.name ?? row.name,
		emoji: body.emoji === undefined ? row.emoji : body.emoji || null,
	};
	await upsertOne(Sounds.upsertAll(updated));
	await upsertOne(SoundsByOwner.upsertAll(updated));
	return updated;
}

async function deleteSound(row: SoundRow): Promise<void> {
	await deleteOneOrMany(Sounds.deleteByPk({id: row.id}));
	await deleteOneOrMany(SoundsByOwner.deleteByPk({owner_id: row.owner_id, id: row.id}));
	await getStorageService()
		.deleteObject(Config.s3.buckets.cdn, storageKey(row.id))
		.catch(() => {});
}

async function requireMember(guildId: GuildID, userId: UserID): Promise<void> {
	const member = await getGuildRepository().getMember(guildId, userId);
	if (!member) throw new MissingAccessError();
}

async function requireGuildSound(guildId: GuildID, soundId: bigint): Promise<SoundRow> {
	const row = await getSound(soundId);
	if (!row || row.owner_kind !== 'guild' || row.owner_id !== BigInt(guildId)) throw new UnknownGuildEmojiError();
	return row;
}

const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];
const tags = ['Soundboard'];

export function SoundboardController(app: HonoApp) {
	// Personal sounds
	app.get(
		'/users/@me/soundboard',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'list_my_soundboard_sounds',
			summary: 'List my soundboard sounds',
			responseSchema: ListResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Your personal soundboard sounds.',
		}),
		async (ctx) => ctx.json({sounds: (await listSounds(ctx.get('user').id)).map(toResponse)}),
	);

	app.post(
		'/users/@me/soundboard',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateRequest),
		OpenAPI({
			operationId: 'create_my_soundboard_sound',
			summary: 'Add a personal soundboard sound',
			responseSchema: SoundItem,
			statusCode: 200,
			security,
			tags,
			description: 'Uploads a sound (up to 10 seconds, 1 MB) to your personal soundboard.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const row = await createSound({
				ownerId: userId,
				ownerKind: 'user',
				creatorId: userId,
				max: MAX_PERSONAL_SOUNDS,
				body: ctx.req.valid('json'),
			});
			return ctx.json(toResponse(row));
		},
	);

	app.patch(
		'/users/@me/soundboard/:sound_id',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', SoundParam),
		Validator('json', UpdateRequest),
		OpenAPI({
			operationId: 'update_my_soundboard_sound',
			summary: 'Rename a personal soundboard sound',
			responseSchema: SoundItem,
			statusCode: 200,
			security,
			tags,
			description: 'Changes the name or emoji of one of your sounds.',
		}),
		async (ctx) => {
			const row = await getSound(BigInt(ctx.req.valid('param').sound_id));
			if (!row || row.owner_kind !== 'user' || row.owner_id !== ctx.get('user').id) throw new UnknownGuildEmojiError();
			return ctx.json(toResponse(await updateSound(row, ctx.req.valid('json'))));
		},
	);

	app.delete(
		'/users/@me/soundboard/:sound_id',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', SoundParam),
		OpenAPI({
			operationId: 'delete_my_soundboard_sound',
			summary: 'Delete a personal soundboard sound',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description: 'Removes one of your sounds.',
		}),
		async (ctx) => {
			const row = await getSound(BigInt(ctx.req.valid('param').sound_id));
			if (!row || row.owner_kind !== 'user' || row.owner_id !== ctx.get('user').id) throw new UnknownGuildEmojiError();
			await deleteSound(row);
			return ctx.body(null, 204);
		},
	);

	// Community sounds
	app.get(
		'/guilds/:guild_id/soundboard',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		Validator('param', GuildParam),
		OpenAPI({
			operationId: 'list_guild_soundboard_sounds',
			summary: "List a community's soundboard sounds",
			responseSchema: ListResponse,
			statusCode: 200,
			security,
			tags,
			description: "The community's soundboard sounds (members only).",
		}),
		async (ctx) => {
			const guildId = createGuildID(BigInt(ctx.req.valid('param').guild_id));
			await requireMember(guildId, ctx.get('user').id);
			return ctx.json({sounds: (await listSounds(BigInt(guildId))).map(toResponse)});
		},
	);

	app.post(
		'/guilds/:guild_id/soundboard',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		Validator('param', GuildParam),
		Validator('json', CreateRequest),
		OpenAPI({
			operationId: 'create_guild_soundboard_sound',
			summary: 'Add a community soundboard sound',
			responseSchema: SoundItem,
			statusCode: 200,
			security,
			tags,
			description: 'Uploads a sound to the community soundboard (needs the Create Expressions permission).',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(BigInt(ctx.req.valid('param').guild_id));
			await requirePermission(getGatewayService(), {guildId, userId, permission: Permissions.CREATE_EXPRESSIONS});
			const row = await createSound({
				ownerId: BigInt(guildId),
				ownerKind: 'guild',
				creatorId: userId,
				max: MAX_COMMUNITY_SOUNDS,
				body: ctx.req.valid('json'),
			});
			return ctx.json(toResponse(row));
		},
	);

	app.patch(
		'/guilds/:guild_id/soundboard/:sound_id',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		Validator('param', GuildSoundParam),
		Validator('json', UpdateRequest),
		OpenAPI({
			operationId: 'update_guild_soundboard_sound',
			summary: 'Rename a community soundboard sound',
			responseSchema: SoundItem,
			statusCode: 200,
			security,
			tags,
			description: 'Changes the name or emoji of a community sound.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {guild_id, sound_id} = ctx.req.valid('param');
			const guildId = createGuildID(BigInt(guild_id));
			const row = await requireGuildSound(guildId, BigInt(sound_id));
			await requirePermission(getGatewayService(), {
				guildId,
				userId,
				permission: row.creator_id === userId ? Permissions.CREATE_EXPRESSIONS : Permissions.MANAGE_EXPRESSIONS,
			});
			return ctx.json(toResponse(await updateSound(row, ctx.req.valid('json'))));
		},
	);

	app.delete(
		'/guilds/:guild_id/soundboard/:sound_id',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		Validator('param', GuildSoundParam),
		OpenAPI({
			operationId: 'delete_guild_soundboard_sound',
			summary: 'Delete a community soundboard sound',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description: 'Removes a community sound (your own with Create Expressions, others with Manage Expressions).',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {guild_id, sound_id} = ctx.req.valid('param');
			const guildId = createGuildID(BigInt(guild_id));
			const row = await requireGuildSound(guildId, BigInt(sound_id));
			await requirePermission(getGatewayService(), {
				guildId,
				userId,
				permission: row.creator_id === userId ? Permissions.CREATE_EXPRESSIONS : Permissions.MANAGE_EXPRESSIONS,
			});
			await deleteSound(row);
			return ctx.body(null, 204);
		},
	);

	// Audio, for whoever hears it played in a call.
	app.get(
		'/soundboard-sounds/:sound_id/audio',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		Validator('param', SoundParam),
		OpenAPI({
			operationId: 'get_soundboard_sound_audio',
			summary: 'Get soundboard sound audio',
			responseSchema: null,
			statusCode: 200,
			security,
			tags,
			description: 'The audio file of a soundboard sound.',
		}),
		async (ctx) => {
			const row = await getSound(BigInt(ctx.req.valid('param').sound_id));
			if (!row) throw new UnknownGuildEmojiError();
			const bytes = await getStorageService().readObject(Config.s3.buckets.cdn, storageKey(row.id), MAX_SOUND_BYTES);
			return new Response(new Uint8Array(bytes), {
				status: 200,
				headers: {'Content-Type': row.content_type, 'Cache-Control': 'private, max-age=86400'},
			});
		},
	);
}
