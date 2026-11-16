// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: scan message attachments with VirusTotal. An instance admin saves a
// VirusTotal API key (it never leaves the server again). Any member who can see a
// message may then ask for one of its attachments to be checked:
//
//   1. the file's SHA-256 is looked up on VirusTotal, which sends no file;
//   2. only when VirusTotal doesn't know the file, and the member confirmed it, the file
//      itself is uploaded for a full scan.
//
// Results are stored per attachment and shown to everyone as a badge; clients fetch them
// in batches for the attachments on screen.

import {createChannelID, createMessageID} from '@app/api/BrandedTypes';
import {makeAttachmentCdnKey} from '@app/api/channel/services/message/MessageHelpers';
import {Config} from '@app/api/Config';
import {fetchMany, upsertOne, deleteOneOrMany} from '@app/api/database/CassandraQueryExecution';
import {defineTable} from '@app/api/database/CassandraTableDsl';
import {viewerFromCtx} from '@app/api/experiment/ChannelThreadsGate';
import {Logger} from '@app/api/Logger';
import {hasAdminACL, requireAdminACL} from '@app/api/middleware/AdminMiddleware';
import {LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {ChannelIdMessageIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

const VT_API = 'https://www.virustotal.com/api/v3';
/** VirusTotal's limit for a plain upload. */
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const MAX_LOOKUP = 100;
const PENDING_RECHECK_MS = 15_000;
/** An upload whose analysis never finished is forgotten after this long. */
const PENDING_GIVE_UP_MS = 30 * 60_000;
const SETTINGS_ID = 'default';

type ScanStatus = 'clean' | 'flagged' | 'unknown' | 'pending';
type ScanError = 'not_configured' | 'not_found' | 'too_large' | 'rate_limited' | 'invalid_key' | 'failed';

interface SettingsRow {
	id: string;
	api_key: string;
	updated_at: Date;
}

interface ScanRow {
	attachment_id: bigint;
	sha256: string;
	status: string;
	malicious: number;
	suspicious: number;
	total: number;
	analysis_id: string | null;
	created_at: Date;
	updated_at: Date;
}

const SETTINGS_COLUMNS = ['id', 'api_key', 'updated_at'] as const satisfies ReadonlyArray<keyof SettingsRow>;
const SCAN_COLUMNS = [
	'attachment_id',
	'sha256',
	'status',
	'malicious',
	'suspicious',
	'total',
	'analysis_id',
	'created_at',
	'updated_at',
] as const satisfies ReadonlyArray<keyof ScanRow>;

const Settings = defineTable<SettingsRow, 'id', 'id'>({
	name: 'virustotal_settings',
	columns: SETTINGS_COLUMNS,
	primaryKey: ['id'],
	partitionKey: ['id'],
});
const Scans = defineTable<ScanRow, 'attachment_id', 'attachment_id'>({
	name: 'virustotal_scans',
	columns: SCAN_COLUMNS,
	primaryKey: ['attachment_id'],
	partitionKey: ['attachment_id'],
});

const FETCH_SETTINGS = Settings.selectCql({where: Settings.where.eq('id')});
const FETCH_SCAN = Scans.selectCql({where: Scans.where.eq('attachment_id')});

class VirusTotalFailure extends Error {
	constructor(readonly code: ScanError) {
		super(code);
	}
}

async function getApiKey(): Promise<string | null> {
	const rows = await fetchMany<SettingsRow>(FETCH_SETTINGS, {id: SETTINGS_ID});
	return rows[0]?.api_key || null;
}

async function getScan(attachmentId: bigint): Promise<ScanRow | null> {
	const rows = await fetchMany<ScanRow>(FETCH_SCAN, {attachment_id: attachmentId});
	return rows[0] ?? null;
}

async function vtFetch(apiKey: string, path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(path.startsWith('http') ? path : `${VT_API}${path}`, {
			...init,
			headers: {...init.headers, 'x-apikey': apiKey, accept: 'application/json'},
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		Logger.warn({error}, '[virustotal] request failed');
		throw new VirusTotalFailure('failed');
	}
	if (response.status === 401 || response.status === 403) throw new VirusTotalFailure('invalid_key');
	if (response.status === 429) throw new VirusTotalFailure('rate_limited');
	return response;
}

interface Stats {
	malicious?: number;
	suspicious?: number;
	undetected?: number;
	harmless?: number;
}

function verdict(stats: Stats | undefined): Pick<ScanRow, 'status' | 'malicious' | 'suspicious' | 'total'> {
	const malicious = stats?.malicious ?? 0;
	const suspicious = stats?.suspicious ?? 0;
	const total = malicious + suspicious + (stats?.undetected ?? 0) + (stats?.harmless ?? 0);
	return {status: malicious + suspicious > 0 ? 'flagged' : 'clean', malicious, suspicious, total};
}

/** The stored report for a hash, or null when VirusTotal has never seen the file. */
async function lookupHash(apiKey: string, sha256: string): Promise<Stats | null> {
	const response = await vtFetch(apiKey, `/files/${sha256}`);
	if (response.status === 404) return null;
	if (!response.ok) throw new VirusTotalFailure('failed');
	const body = (await response.json()) as {data?: {attributes?: {last_analysis_stats?: Stats}}};
	return body.data?.attributes?.last_analysis_stats ?? {};
}

/** The result of an upload's analysis, or null while VirusTotal is still working on it. */
async function lookupAnalysis(apiKey: string, analysisId: string): Promise<Stats | null> {
	const response = await vtFetch(apiKey, `/analyses/${encodeURIComponent(analysisId)}`);
	if (!response.ok) throw new VirusTotalFailure('failed');
	const body = (await response.json()) as {data?: {attributes?: {status?: string; stats?: Stats}}};
	return body.data?.attributes?.status === 'completed' ? (body.data.attributes.stats ?? {}) : null;
}

async function uploadFile(apiKey: string, bytes: Uint8Array, filename: string): Promise<string> {
	const form = new FormData();
	form.append('file', new Blob([Buffer.from(bytes)]), filename);
	const response = await vtFetch(apiKey, '/files', {method: 'POST', body: form}, 120_000);
	if (!response.ok) throw new VirusTotalFailure('failed');
	const body = (await response.json()) as {data?: {id?: string}};
	if (!body.data?.id) throw new VirusTotalFailure('failed');
	return body.data.id;
}

async function saveScan(row: ScanRow): Promise<ScanRow> {
	await upsertOne(Scans.upsertAll(row));
	return row;
}

/** Asks VirusTotal whether a pending upload has finished, at most every few seconds. */
async function refreshPending(apiKey: string, row: ScanRow): Promise<ScanRow> {
	if (row.status !== 'pending' || !row.analysis_id) return row;
	const now = Date.now();
	if (now - row.updated_at.getTime() < PENDING_RECHECK_MS) return row;
	if (now - row.created_at.getTime() > PENDING_GIVE_UP_MS) {
		return saveScan({...row, status: 'unknown', analysis_id: null, updated_at: new Date()});
	}
	// Stamp it first, so several viewers don't all ask VirusTotal at once.
	await saveScan({...row, updated_at: new Date()});
	const stats = await lookupAnalysis(apiKey, row.analysis_id);
	if (!stats) return row;
	return saveScan({...row, ...verdict(stats), analysis_id: null, updated_at: new Date()});
}

const ScanSchema = z.object({
	status: z.enum(['clean', 'flagged', 'unknown', 'pending']).describe('clean/flagged: scanned; unknown: VirusTotal has never seen the file; pending: uploaded, being scanned'),
	malicious: z.number().int().describe('Scanners that called the file malicious'),
	suspicious: z.number().int().describe('Scanners that called the file suspicious'),
	total: z.number().int().describe('Scanners that gave a verdict'),
	sha256: z.string().describe('SHA-256 of the file'),
});

function toResponse(row: ScanRow): z.infer<typeof ScanSchema> {
	return {
		status: row.status as ScanStatus,
		malicious: row.malicious,
		suspicious: row.suspicious,
		total: row.total,
		sha256: row.sha256,
	};
}

const ConfigResponse = z.object({
	configured: z.boolean().describe('Whether a VirusTotal API key is saved'),
	can_configure: z.boolean().describe('Whether the current user may change the key'),
});
const SetKeyRequest = z.object({
	api_key: z.string().trim().max(200).nullable().describe('VirusTotal API key, or null to remove it'),
});
const SetKeyResponse = z.object({
	configured: z.boolean(),
	error: z.enum(['invalid_key', 'failed']).nullable().describe('Why the key was not saved'),
});
const LookupRequest = z.object({attachment_ids: z.array(SnowflakeType).min(1).max(MAX_LOOKUP)});
const LookupResponse = z.object({
	scans: z.record(z.string(), ScanSchema.nullable()).describe('Scan result per attachment id; null = never scanned'),
});
const ScanRequest = z.object({
	attachment_id: SnowflakeType,
	upload: z.boolean().default(false).describe('Upload the file when VirusTotal does not know it'),
});
const ScanResponse = z.object({
	scan: ScanSchema.nullable(),
	error: z
		.enum(['not_configured', 'not_found', 'too_large', 'rate_limited', 'invalid_key', 'failed'])
		.nullable()
		.describe('Why there is no result'),
});

const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];
const tags = ['VirusTotal'];
const ATTACHMENT_PATH = /\/attachments\/(\d+)\/(\d+)\/([^/?#]+)/u;

interface ResponseAttachment {
	id: string;
	filename: string;
	url?: string | null;
}

/** Where an attachment's file lives: under the channel in its URL (a forward keeps the original's), else the message's. */
async function findStorageKey(
	storage: {getObjectMetadata(bucket: string, key: string): Promise<unknown>},
	attachment: ResponseAttachment,
	channelId: bigint,
): Promise<string | null> {
	const candidates: Array<string> = [];
	const match = attachment.url ? ATTACHMENT_PATH.exec(attachment.url) : null;
	if (match && match[2] === attachment.id) {
		try {
			candidates.push(`attachments/${match[1]}/${match[2]}/${decodeURIComponent(match[3])}`);
		} catch {}
	}
	candidates.push(makeAttachmentCdnKey(createChannelID(channelId), BigInt(attachment.id), attachment.filename));
	for (const key of new Set(candidates)) {
		try {
			if (await storage.getObjectMetadata(Config.s3.buckets.cdn, key)) return key;
		} catch {}
	}
	return null;
}

export function VirusTotalController(app: HonoApp) {
	app.get(
		'/virustotal/config',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		OpenAPI({
			operationId: 'get_virustotal_config',
			summary: 'Get VirusTotal scanning status',
			responseSchema: ConfigResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Whether attachment scanning with VirusTotal is set up, and whether the current user may set it up.',
		}),
		async (ctx) =>
			ctx.json({
				configured: (await getApiKey()) !== null,
				can_configure: hasAdminACL(ctx.get('user').acls, AdminACLs.INSTANCE_CONFIG_UPDATE),
			}),
	);

	app.put(
		'/virustotal/config',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_WRITE),
		requireAdminACL(AdminACLs.INSTANCE_CONFIG_UPDATE),
		Validator('json', SetKeyRequest),
		OpenAPI({
			operationId: 'set_virustotal_config',
			summary: 'Set the VirusTotal API key',
			responseSchema: SetKeyResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Saves (after checking it with VirusTotal) or removes the API key used to scan attachments. Instance admins only.',
		}),
		async (ctx) => {
			const apiKey = ctx.req.valid('json').api_key || null;
			if (apiKey === null) {
				await deleteOneOrMany(Settings.deleteByPk({id: SETTINGS_ID}));
				return ctx.json({configured: false, error: null});
			}
			try {
				const response = await vtFetch(apiKey, `/users/${encodeURIComponent(apiKey)}`);
				if (response.status === 404) throw new VirusTotalFailure('invalid_key');
			} catch (error) {
				if (error instanceof VirusTotalFailure && error.code === 'invalid_key') {
					return ctx.json({configured: (await getApiKey()) !== null, error: 'invalid_key' as const});
				}
				// VirusTotal couldn't be reached or is rate limiting: the key may well be fine.
				if (!(error instanceof VirusTotalFailure)) throw error;
			}
			await upsertOne(Settings.upsertAll({id: SETTINGS_ID, api_key: apiKey, updated_at: new Date()}));
			return ctx.json({configured: true, error: null});
		},
	);

	app.post(
		'/virustotal/lookup',
		RateLimitMiddleware(RateLimitConfigs.NAME_FONT_READ),
		LoginRequired,
		Validator('json', LookupRequest),
		OpenAPI({
			operationId: 'lookup_virustotal_scans',
			summary: 'Look up VirusTotal scan results',
			responseSchema: LookupResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Returns the stored VirusTotal result of each attachment (null = never scanned).',
		}),
		async (ctx) => {
			const ids = [...new Set(ctx.req.valid('json').attachment_ids.map(String))];
			const apiKey = await getApiKey();
			const entries = await Promise.all(
				ids.map(async (id) => {
					let row = await getScan(BigInt(id));
					if (row && apiKey) {
						try {
							row = await refreshPending(apiKey, row);
						} catch {}
					}
					return [id, row ? toResponse(row) : null] as const;
				}),
			);
			return ctx.json({scans: Object.fromEntries(entries)});
		},
	);

	app.post(
		'/channels/:channel_id/messages/:message_id/virustotal',
		RateLimitMiddleware(RateLimitConfigs.VIRUSTOTAL_SCAN),
		LoginRequired,
		Validator('param', ChannelIdMessageIdParam),
		Validator('json', ScanRequest),
		OpenAPI({
			operationId: 'scan_attachment_with_virustotal',
			summary: 'Scan an attachment with VirusTotal',
			responseSchema: ScanResponse,
			statusCode: 200,
			security,
			tags,
			description:
				'Checks an attachment of a message the user can see. Looks the file up by hash first; uploads it to VirusTotal only when it is unknown there and upload is true.',
		}),
		async (ctx) => {
			const {channel_id, message_id} = ctx.req.valid('param');
			const body = ctx.req.valid('json');
			const attachmentId = String(body.attachment_id);
			const fail = (error: ScanError) => ctx.json({scan: null, error});

			const apiKey = await getApiKey();
			if (!apiKey) return fail('not_configured');

			// Throws unless the user may read this message.
			const message = await ctx.get('messageRequestService').getMessage({
				viewer: viewerFromCtx(ctx),
				userId: ctx.get('user').id,
				channelId: createChannelID(channel_id),
				messageId: createMessageID(message_id),
				requestCache: ctx.get('requestCache'),
			});
			const attachments: Array<ResponseAttachment> = [
				...(message.attachments ?? []),
				...(message.message_snapshots ?? []).flatMap((snapshot) => snapshot.attachments ?? []),
			];
			const attachment = attachments.find((candidate) => candidate.id === attachmentId);
			if (!attachment) return fail('not_found');

			try {
				let row = await getScan(BigInt(attachmentId));
				if (row?.status === 'pending') row = await refreshPending(apiKey, row);
				if (row && (row.status !== 'unknown' || !body.upload)) {
					if (row.status !== 'unknown') return ctx.json({scan: toResponse(row), error: null});
				}

				const storage = ctx.get('storageService');
				const key = await findStorageKey(storage, attachment, BigInt(channel_id));
				if (!key) return fail('not_found');
				const sha256 = row?.sha256 ?? (await storage.computeObjectSha256(Config.s3.buckets.cdn, key));
				const now = new Date();
				const base: ScanRow = {
					attachment_id: BigInt(attachmentId),
					sha256,
					status: 'unknown',
					malicious: 0,
					suspicious: 0,
					total: 0,
					analysis_id: null,
					created_at: now,
					updated_at: now,
				};

				const known = await lookupHash(apiKey, sha256);
				if (known) return ctx.json({scan: toResponse(await saveScan({...base, ...verdict(known)})), error: null});
				if (!body.upload) return ctx.json({scan: toResponse(await saveScan(base)), error: null});

				const metadata = await storage.getObjectMetadata(Config.s3.buckets.cdn, key);
				if (!metadata || metadata.contentLength > MAX_UPLOAD_BYTES) return fail('too_large');
				const bytes = await storage.readObject(Config.s3.buckets.cdn, key, MAX_UPLOAD_BYTES);
				const analysisId = await uploadFile(apiKey, bytes, attachment.filename);
				const pending = await saveScan({...base, status: 'pending', analysis_id: analysisId});
				return ctx.json({scan: toResponse(pending), error: null});
			} catch (error) {
				if (error instanceof VirusTotalFailure) return fail(error.code);
				Logger.error({error}, '[virustotal] scan failed');
				return fail('failed');
			}
		},
	);
}
