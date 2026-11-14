// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord personal emojis and stickers: owned by a user instead of a community, and
// usable by their owner everywhere (any community, DM or group). Everyone sees them in
// messages; others can save a copy into their own collection. Images are stored under
// the same keys as community emojis/stickers (emojis/{id}, stickers/{id}), so clients
// render <:name:id> and sticker items without any change. Deleting one keeps its image
// so old messages still show it.

import {createEmojiID, createStickerID, createUserID, type UserID} from '@app/api/BrandedTypes';
import {deleteOneOrMany, fetchMany, fetchOne, upsertOne} from '@app/api/database/CassandraQueryExecution';
import {defineTable} from '@app/api/database/CassandraTableDsl';
import {DefaultUserOnly, LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {getSnowflakeService} from '@app/api/middleware/ServiceRegistry';
import {getAvatarService, getUserRepository} from '@app/api/middleware/ServiceSingletons';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import {UnknownGuildEmojiError} from '@fluxer/errors/src/domains/guild/UnknownGuildEmojiError';
import {GuildEmojiCreateRequest, GuildStickerCreateRequest} from '@fluxer/schema/src/domains/guild/GuildRequestSchemas';
import {createBase64ImageType} from '@fluxer/schema/src/primitives/FileValidators';
import {SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

export type PersonalExpressionKind = 'emoji' | 'sticker';

export const MAX_PERSONAL_EMOJIS = 100;
export const MAX_PERSONAL_STICKERS = 50;

interface PersonalExpressionRow {
	id: bigint;
	user_id: UserID;
	kind: string;
	name: string;
	animated: boolean;
	created_at: Date;
}

const COLUMNS = ['id', 'user_id', 'kind', 'name', 'animated', 'created_at'] as const satisfies ReadonlyArray<
	keyof PersonalExpressionRow
>;

/** Looked up by id when a message, reaction or info card uses one. */
const PersonalExpressions = defineTable<PersonalExpressionRow, 'id', 'id'>({
	name: 'personal_expressions',
	columns: COLUMNS,
	primaryKey: ['id'],
	partitionKey: ['id'],
});

/** A user's collection, for listing. */
const PersonalExpressionsByUser = defineTable<PersonalExpressionRow, 'user_id' | 'id', 'user_id'>({
	name: 'personal_expressions_by_user',
	columns: COLUMNS,
	primaryKey: ['user_id', 'id'],
	partitionKey: ['user_id'],
});

const FETCH_BY_ID = PersonalExpressions.selectCql({where: PersonalExpressions.where.eq('id')});
const FETCH_BY_USER = PersonalExpressionsByUser.selectCql({where: PersonalExpressionsByUser.where.eq('user_id')});

export async function getPersonalExpression(id: bigint): Promise<PersonalExpressionRow | null> {
	return (await fetchOne<PersonalExpressionRow>(FETCH_BY_ID, {id})) ?? null;
}

/** The personal expression with this id if `userId` owns it, else null. */
export async function getOwnedPersonalExpression(
	userId: UserID | null | undefined,
	id: bigint,
	kind: PersonalExpressionKind,
): Promise<PersonalExpressionRow | null> {
	if (!userId) return null;
	const row = await getPersonalExpression(id);
	return row && row.kind === kind && row.user_id === userId ? row : null;
}

async function listFor(userId: UserID): Promise<Array<PersonalExpressionRow>> {
	return fetchMany<PersonalExpressionRow>(FETCH_BY_USER, {user_id: userId});
}

async function saveRow(row: PersonalExpressionRow): Promise<void> {
	await upsertOne(PersonalExpressions.upsertAll(row));
	await upsertOne(PersonalExpressionsByUser.upsertAll(row));
}

function toResponse(row: PersonalExpressionRow) {
	const base = {id: row.id.toString(), name: row.name, animated: row.animated};
	return row.kind === 'sticker' ? {...base, description: '', tags: [] as Array<string>} : base;
}

const EmojiItem = z.object({id: z.string(), name: z.string(), animated: z.boolean()});
const StickerItem = EmojiItem.extend({description: z.string(), tags: z.array(z.string())});
const ListResponse = z.object({emojis: z.array(EmojiItem), stickers: z.array(StickerItem)});
const ItemResponse = z.union([StickerItem, EmojiItem]);
const InfoResponse = z.object({
	id: z.string(),
	kind: z.enum(['emoji', 'sticker']),
	name: z.string(),
	animated: z.boolean(),
	owner: z.object({id: z.string(), username: z.string().nullable(), global_name: z.string().nullable()}),
});

const EmojiName = GuildEmojiCreateRequest.shape.name;
const StickerName = GuildStickerCreateRequest.shape.name;
const CreateRequest = z.discriminatedUnion('kind', [
	z.object({kind: z.literal('emoji'), name: EmojiName, image: createBase64ImageType()}),
	z.object({kind: z.literal('sticker'), name: StickerName, image: createBase64ImageType()}),
]);
const RenameRequest = z.object({name: z.string().min(2).max(32)});
const CopyRequest = z.object({name: z.string().min(2).max(32).nullish()});
const IdParam = z.object({id: SnowflakeType});

function validateName(kind: PersonalExpressionKind, name: string): string {
	const result = (kind === 'emoji' ? EmojiName : StickerName).safeParse(name);
	if (!result.success) throw InputValidationError.create('name', result.error.issues[0]?.message ?? 'Invalid name.');
	return result.data;
}

function ensureRoom(rows: ReadonlyArray<PersonalExpressionRow>, kind: PersonalExpressionKind): void {
	const count = rows.filter((row) => row.kind === kind).length;
	const max = kind === 'emoji' ? MAX_PERSONAL_EMOJIS : MAX_PERSONAL_STICKERS;
	if (count >= max) {
		throw InputValidationError.create(
			'kind',
			kind === 'emoji' ? `You can have up to ${max} personal emojis.` : `You can have up to ${max} personal stickers.`,
		);
	}
}

const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];
const tags = ['Personal expressions'];

export function PersonalExpressionController(app: HonoApp) {
	app.get(
		'/users/@me/personal-expressions',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'list_my_personal_expressions',
			summary: 'List my personal emojis and stickers',
			responseSchema: ListResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Your personal emojis and stickers, newest first.',
		}),
		async (ctx) => {
			const rows = (await listFor(ctx.get('user').id)).sort((a, b) => (a.id < b.id ? 1 : -1));
			return ctx.json({
				emojis: rows.filter((row) => row.kind === 'emoji').map(toResponse),
				stickers: rows.filter((row) => row.kind === 'sticker').map(toResponse),
			});
		},
	);

	app.post(
		'/users/@me/personal-expressions',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateRequest),
		OpenAPI({
			operationId: 'create_personal_expression',
			summary: 'Upload a personal emoji or sticker',
			responseSchema: ItemResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Adds an emoji or sticker to your personal collection.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {kind, name, image} = ctx.req.valid('json');
			ensureRoom(await listFor(userId), kind);
			const avatarService = getAvatarService();
			const id = await getSnowflakeService().generate();
			let animated: boolean;
			if (kind === 'emoji') {
				const processed = await avatarService.processEmoji({errorPath: 'image', base64Image: image, guildFeatures: []});
				animated = processed.animated;
				await avatarService.uploadEmoji({prefix: 'emojis', emojiId: createEmojiID(id), imageBuffer: processed.imageBuffer});
			} else {
				const processed = await avatarService.processSticker({
					errorPath: 'image',
					base64Image: image,
					guildFeatures: [],
				});
				animated = processed.animated;
				await avatarService.uploadSticker({
					prefix: 'stickers',
					stickerId: createStickerID(id),
					imageBuffer: processed.imageBuffer,
				});
			}
			const row: PersonalExpressionRow = {id, user_id: userId, kind, name, animated, created_at: new Date()};
			await saveRow(row);
			return ctx.json(toResponse(row));
		},
	);

	app.patch(
		'/users/@me/personal-expressions/:id',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', IdParam),
		Validator('json', RenameRequest),
		OpenAPI({
			operationId: 'rename_personal_expression',
			summary: 'Rename a personal emoji or sticker',
			responseSchema: ItemResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Renames one of your personal emojis or stickers.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const row = await getPersonalExpression(BigInt(ctx.req.valid('param').id));
			if (!row || row.user_id !== userId) throw new UnknownGuildEmojiError();
			const kind = row.kind as PersonalExpressionKind;
			const updated = {...row, name: validateName(kind, ctx.req.valid('json').name)};
			await saveRow(updated);
			return ctx.json(toResponse(updated));
		},
	);

	app.delete(
		'/users/@me/personal-expressions/:id',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', IdParam),
		OpenAPI({
			operationId: 'delete_personal_expression',
			summary: 'Delete a personal emoji or sticker',
			responseSchema: null,
			statusCode: 204,
			security,
			tags,
			description: 'Removes one of your personal emojis or stickers. Messages that used it keep showing it.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const row = await getPersonalExpression(BigInt(ctx.req.valid('param').id));
			if (!row || row.user_id !== userId) throw new UnknownGuildEmojiError();
			await deleteOneOrMany(PersonalExpressions.deleteByPk({id: row.id}));
			await deleteOneOrMany(PersonalExpressionsByUser.deleteByPk({user_id: userId, id: row.id}));
			return ctx.body(null, 204);
		},
	);

	app.get(
		'/personal-expressions/:id',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		Validator('param', IdParam),
		OpenAPI({
			operationId: 'get_personal_expression',
			summary: 'Get a personal emoji or sticker',
			responseSchema: InfoResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Who owns a personal emoji or sticker (404 if the id is not a personal one).',
		}),
		async (ctx) => {
			const row = await getPersonalExpression(BigInt(ctx.req.valid('param').id));
			if (!row) throw new UnknownGuildEmojiError();
			const owner = await getUserRepository().findUnique(createUserID(BigInt(row.user_id)));
			return ctx.json({
				id: row.id.toString(),
				kind: row.kind as PersonalExpressionKind,
				name: row.name,
				animated: row.animated,
				owner: {
					id: row.user_id.toString(),
					username: owner?.username ?? null,
					global_name: owner?.globalName ?? null,
				},
			});
		},
	);

	app.post(
		'/users/@me/personal-expressions/:id/copy',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', IdParam),
		Validator('json', CopyRequest),
		OpenAPI({
			operationId: 'copy_personal_expression',
			summary: "Save a copy of someone's personal emoji or sticker",
			responseSchema: ItemResponse,
			statusCode: 200,
			security,
			tags,
			description: "Adds a copy of another user's personal emoji or sticker to your own collection.",
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const source = await getPersonalExpression(BigInt(ctx.req.valid('param').id));
			if (!source) throw new UnknownGuildEmojiError();
			const kind = source.kind as PersonalExpressionKind;
			const name = validateName(kind, ctx.req.valid('json').name ?? source.name);
			ensureRoom(await listFor(userId), kind);
			const avatarService = getAvatarService();
			const id = await getSnowflakeService().generate();
			if (kind === 'emoji') {
				await avatarService.cloneEmojiImage({sourceEmojiId: source.id, emojiId: id});
			} else {
				await avatarService.cloneStickerImage({sourceStickerId: source.id, stickerId: id});
			}
			const row: PersonalExpressionRow = {
				id,
				user_id: userId,
				kind,
				name,
				animated: source.animated,
				created_at: new Date(),
			};
			await saveRow(row);
			return ctx.json(toResponse(row));
		},
	);
}
