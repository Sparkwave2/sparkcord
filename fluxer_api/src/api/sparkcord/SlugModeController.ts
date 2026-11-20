// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Slug Mode endpoints. A Slug account starts as a normal instant account (display
// name only, created through the usual instant-account flow, so its abuse protection
// applies); right after creation the client calls POST /sparkcord/slug, which ties the
// account to this device with a device-key cookie. See SlugMode.ts.

import {LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import {
	isSlugAccount,
	markSlugAccount,
	requestIsSecure,
	slugGatewayProofFor,
	slugKeyHash,
	slugSetCookie,
} from '@app/api/sparkcord/SlugMode';
import type {HonoApp, HonoEnv} from '@app/api/types/HonoEnv';
import type {Context} from 'hono';
import {snowflakeToDate} from '@fluxer/snowflake/src/Snowflake';
import {z} from 'zod';

/** Only accounts this new can become Slug accounts (right after their creation). */
const MAX_ACCOUNT_AGE_MS = 15 * 60 * 1000;

const SlugStatusResponse = z.object({slug: z.boolean()});

/**
 * Called after a sign-up that asked for Slug Mode (X-Sparkcord-Slug: 1): makes the new
 * account a Slug account and sets the device-key cookie on the sign-up response. Only an
 * account without email or password qualifies; anything else stays a normal account.
 */
export async function finishSlugSignUp(ctx: Context<HonoEnv>, result: unknown): Promise<void> {
	if (typeof result !== 'object' || result === null || !('user_id' in result) || !('token' in result)) return;
	const userId = String((result as {user_id: unknown}).user_id);
	const user = await ctx.get('apiContext').services.users.findUnique(BigInt(userId) as never);
	if (!user || user.email !== null || user.passwordHash !== null) return;
	const key = await markSlugAccount(ctx.get('apiContext').services.kv, userId);
	ctx.header('Set-Cookie', slugSetCookie(userId, key, requestIsSecure(ctx.req.raw)), {append: true});
}
const SlugProofResponse = z.object({proof: z.string()});

const security: Array<'sessionToken'> = ['sessionToken'];
const tags = ['Sparkcord'];

export function SlugModeController(app: HonoApp) {
	app.post(
		'/sparkcord/slug',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_WRITE),
		LoginRequired,
		OpenAPI({
			operationId: 'enable_slug_mode',
			summary: 'Enable Slug Mode',
			responseSchema: SlugStatusResponse,
			statusCode: 200,
			security,
			tags,
			description:
				'Ties a just-created account without email, password or passkey to this device: the server sets a long-lived device-key cookie, and from then on the account only works together with it.',
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const kv = ctx.get('apiContext').services.kv;
			if (ctx.get('authTokenType') !== 'session' || user.isBot) {
				return ctx.json({message: 'Slug Mode needs a normal sign-in.', code: 'SLUG_NOT_ALLOWED'}, 400);
			}
			if (await isSlugAccount(kv, user.id.toString())) {
				return ctx.json({message: 'This is already a Slug account.', code: 'SLUG_ALREADY'}, 400);
			}
			const age = Date.now() - snowflakeToDate(BigInt(user.id.toString())).getTime();
			const passkeys = await ctx.get('apiContext').services.users.listWebAuthnCredentials(user.id);
			if (user.email !== null || user.passwordHash !== null || passkeys.length > 0 || age > MAX_ACCOUNT_AGE_MS) {
				return ctx.json(
					{message: 'Only a brand-new account without email or password can use Slug Mode.', code: 'SLUG_NOT_ALLOWED'},
					400,
				);
			}
			const key = await markSlugAccount(kv, user.id.toString());
			ctx.header('Set-Cookie', slugSetCookie(user.id.toString(), key, requestIsSecure(ctx.req.raw)), {append: true});
			return ctx.json({slug: true});
		},
	);

	app.get(
		'/sparkcord/slug',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_READ),
		LoginRequired,
		OpenAPI({
			operationId: 'get_slug_mode',
			summary: 'Get Slug Mode status',
			responseSchema: SlugStatusResponse,
			statusCode: 200,
			security,
			tags,
			description: 'Whether the current account is a Slug account (tied to one device).',
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const slug = user.email === null && (await isSlugAccount(ctx.get('apiContext').services.kv, user.id.toString()));
			return ctx.json({slug});
		},
	);

	app.get(
		'/sparkcord/slug/proof',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_PLATFORM_READ),
		LoginRequired,
		OpenAPI({
			operationId: 'get_slug_gateway_proof',
			summary: 'Get Slug gateway proof',
			responseSchema: SlugProofResponse,
			statusCode: 200,
			security,
			tags,
			description:
				"For a Slug account (reachable here only with its device-key cookie): the proof its app adds to the token when connecting to the gateway, which can't see cookies.",
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const hash = user.email === null ? await slugKeyHash(ctx.get('apiContext').services.kv, user.id.toString()) : null;
			if (hash === null) return ctx.json({message: 'Not a Slug account.', code: 'SLUG_NOT_SLUG'}, 404);
			ctx.header('Cache-Control', 'no-store');
			return ctx.json({proof: slugGatewayProofFor(hash)});
		},
	);
}
