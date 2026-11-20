// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Slug Mode: accounts that live on one device. A Slug account has no email or
// password; on top of that, its sign-in token only works together with a device key the
// server hands out once, in a long-lived HttpOnly cookie ("sparkcord_slug_<user id>").
// The server keeps only a hash of that key. Copying the token to another device doesn't
// work, and if the cookie is lost the account can't be used again (it is deleted after
// SLUG_INACTIVE_DAYS without a visit). Adding an email (claiming the account) turns it
// into a normal account and the device key stops mattering.

import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import type {IKVProvider} from '@pkgs/kv_client/src/IKVProvider';

const KEY_PREFIX = 'sparkcord:slug:';
const COOKIE_PREFIX = 'sparkcord_slug_';
/** Browsers cap cookie lifetimes at 400 days; the cookie is renewed on every visit. */
export const SLUG_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
/** A Slug account nobody has opened for this long is deleted (its cookie has expired by then). */
export const SLUG_INACTIVE_DAYS = 400;
const CACHE_MS = 60_000;
const CACHE_LIMIT = 20_000;

interface CacheEntry {
	hash: string | null;
	at: number;
}

const cache = new Map<string, CacheEntry>();

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function remember(userId: string, hash: string | null): void {
	if (cache.size >= CACHE_LIMIT) cache.clear();
	cache.set(userId, {hash, at: Date.now()});
}

/** The stored device-key hash of a Slug account, or null for any other account. */
export async function slugKeyHash(kv: IKVProvider, userId: string): Promise<string | null> {
	const cached = cache.get(userId);
	if (cached && Date.now() - cached.at < CACHE_MS) return cached.hash;
	const hash = await kv.get(KEY_PREFIX + userId);
	remember(userId, hash);
	return hash;
}

export async function isSlugAccount(kv: IKVProvider, userId: string): Promise<boolean> {
	return (await slugKeyHash(kv, userId)) !== null;
}

/** Makes the account a Slug account and returns its new device key (for the cookie). */
export async function markSlugAccount(kv: IKVProvider, userId: string): Promise<string> {
	const key = randomBytes(32).toString('base64url');
	const hash = sha256(key);
	await kv.set(KEY_PREFIX + userId, hash);
	remember(userId, hash);
	return key;
}

export async function clearSlugAccount(kv: IKVProvider, userId: string): Promise<void> {
	await kv.del(KEY_PREFIX + userId);
	remember(userId, null);
}

export function slugCookieName(userId: string): string {
	return COOKIE_PREFIX + userId;
}

/** Reads the device key for `userId` from a Cookie header. */
export function slugKeyFromCookieHeader(cookieHeader: string | null | undefined, userId: string): string | null {
	if (!cookieHeader) return null;
	const name = slugCookieName(userId);
	for (const part of cookieHeader.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
	}
	return null;
}

export type SlugAccess = 'not-slug' | 'allowed' | 'refused';

/**
 * Whether a request (or gateway session) for `userId` may use its token. Accounts that
 * aren't Slug accounts, or were claimed with an email, are always allowed.
 */
export async function checkSlugAccess(
	kv: IKVProvider,
	user: {id: {toString(): string}; email: string | null},
	cookieHeader: string | null | undefined,
): Promise<SlugAccess> {
	const userId = user.id.toString();
	const hash = await slugKeyHash(kv, userId);
	if (hash === null) return 'not-slug';
	if (user.email) {
		// Claimed with an email: a normal account now.
		await clearSlugAccount(kv, userId).catch(() => {});
		return 'not-slug';
	}
	const key = slugKeyFromCookieHeader(cookieHeader, userId);
	if (!key) return 'refused';
	const expected = Buffer.from(hash, 'hex');
	const actual = Buffer.from(sha256(key), 'hex');
	return expected.length === actual.length && timingSafeEqual(expected, actual) ? 'allowed' : 'refused';
}

/**
 * The gateway can't see cookies, so a Slug account's app fetches a proof over the API (which
 * needs the cookie) and identifies with "<token>#slug:<proof>". The proof is derived from the
 * stored key hash; it is only ever kept in the app's memory.
 */
export function slugGatewayProofFor(hash: string): string {
	return sha256(`${hash}:gateway`);
}

const SLUG_TOKEN_SEPARATOR = '#slug:';

export function splitSlugGatewayToken(token: string): {token: string; proof: string | null} {
	const index = token.indexOf(SLUG_TOKEN_SEPARATOR);
	if (index === -1) return {token, proof: null};
	return {token: token.slice(0, index), proof: token.slice(index + SLUG_TOKEN_SEPARATOR.length) || null};
}

/** Whether a gateway session for this user may start with the given proof. */
export async function slugGatewayProofAccepted(
	kv: IKVProvider,
	user: {id: {toString(): string}; email: string | null},
	proof: string | null,
): Promise<boolean> {
	if (user.email) return true;
	const hash = await slugKeyHash(kv, user.id.toString());
	if (hash === null) return true;
	if (!proof) return false;
	const expected = Buffer.from(slugGatewayProofFor(hash), 'hex');
	const actual = Buffer.from(proof, 'hex');
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** The Set-Cookie value that stores (or renews) the device key. */
export function slugSetCookie(userId: string, key: string, secure: boolean): string {
	const attributes = [
		`${slugCookieName(userId)}=${key}`,
		'Path=/',
		`Max-Age=${SLUG_COOKIE_MAX_AGE_SECONDS}`,
		'HttpOnly',
		secure ? 'SameSite=None' : 'SameSite=Lax',
	];
	if (secure) attributes.push('Secure');
	return attributes.join('; ');
}

/** Whether the request reached us over HTTPS (directly or through the proxy). */
export function requestIsSecure(request: Request): boolean {
	const forwarded = request.headers.get('x-forwarded-proto');
	if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
	return new URL(request.url).protocol === 'https:';
}
