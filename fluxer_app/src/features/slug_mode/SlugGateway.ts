// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Slug Mode, gateway side. The gateway can't see the device-key cookie, so before
// a Slug account connects, the app asks the API for a proof (the request carries the cookie)
// and identifies with "<token>#slug:<proof>". The proof is kept in memory only. Accounts
// with an email are never Slug accounts, so they never wait for this.

import {Endpoints} from '@app/features/app/constants/Endpoints';
import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';

const proofs = new Map<string, Promise<string | null>>();
/** Tokens known not to be Slug accounts (asked once per app run). */
const notSlug = new Set<string>();

function slugUserIds(): Set<string> {
	return new Set(
		SparkcordPrefs.get('slugUserIds')
			.split(',')
			.filter((id) => id !== ''),
	);
}

export function markSlugUser(userId: string): void {
	const ids = slugUserIds();
	ids.add(userId);
	SparkcordPrefs.set('slugUserIds', [...ids].join(','));
}

export function isSlugUser(userId: string | null | undefined): boolean {
	return userId != null && slugUserIds().has(userId);
}

/**
 * Whether a token may belong to a Slug account: its account has no email (Slug accounts
 * never do), or it isn't in the account list yet (just created).
 */
async function mayBeSlugToken(token: string): Promise<boolean> {
	const {default: Accounts} = await import('@app/features/auth/state/Accounts');
	const account = Accounts.getAllAccounts().find((entry) => entry.token === token);
	if (!account) return true;
	if (isSlugUser(account.userId)) return true;
	return account.userData != null && !account.userData.email;
}

async function fetchProof(token: string): Promise<string | null> {
	// Returns null when there is no proof; marks the token when the server says it isn't a
	// Slug account, so it isn't asked again this run.
	const {instanceRequest, instanceTargetFromSnapshot} = await import('@app/features/platform/transport/InstanceHTTP');
	const {default: RuntimeConfig} = await import('@app/features/app/state/RuntimeConfig');
	const snapshot = RuntimeConfig.getSnapshotOrNull();
	if (!snapshot) return null;
	try {
		const response = await instanceRequest<{proof: string}>({
			method: 'GET',
			path: Endpoints.SPARKCORD_SLUG_PROOF,
			target: instanceTargetFromSnapshot(snapshot),
			auth: 'none',
			headers: {Authorization: token},
		});
		return typeof response.body?.proof === 'string' ? response.body.proof : null;
	} catch (error) {
		if ((error as {status?: number} | null)?.status === 404) notSlug.add(token);
		else console.warn('[slug] could not get the gateway proof', error);
		return null;
	}
}

/** The token to identify with: the plain token, or with the Slug proof for Slug accounts. */
export async function slugIdentifyToken(token: string): Promise<string> {
	// The server answers "not a Slug account" (404) for the others, so asking is harmless.
	if (notSlug.has(token) || !(await mayBeSlugToken(token))) return token;
	let proof = proofs.get(token);
	if (!proof) {
		proof = fetchProof(token);
		proofs.set(token, proof);
	}
	const value = await proof;
	if (value === null) {
		proofs.delete(token);
		return token;
	}
	return `${token}#slug:${value}`;
}
