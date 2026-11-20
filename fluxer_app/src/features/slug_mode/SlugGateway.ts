// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord Slug Mode, gateway side. The gateway can't see the device-key cookie, so before
// a Slug account connects, the app asks the API for a proof (the request carries the cookie)
// and identifies with "<token>#slug:<proof>". The proof is kept in memory only. Which
// accounts on this device are Slug accounts is remembered (not secret) so normal accounts
// never wait for this.

import {Endpoints} from '@app/features/app/constants/Endpoints';
import SparkcordPrefs from '@app/features/sparkcord_prefs/SparkcordPrefs';

const proofs = new Map<string, Promise<string | null>>();

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

async function userIdForToken(token: string): Promise<string | null> {
	const {default: Accounts} = await import('@app/features/auth/state/Accounts');
	return Accounts.getAllAccounts().find((account) => account.token === token)?.userId ?? null;
}

async function fetchProof(token: string): Promise<string | null> {
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
		console.warn('[slug] could not get the gateway proof', error);
		return null;
	}
}

/** The token to identify with: the plain token, or with the Slug proof for Slug accounts. */
export async function slugIdentifyToken(token: string): Promise<string> {
	if (slugUserIds().size === 0) return token;
	const userId = await userIdForToken(token);
	if (!isSlugUser(userId)) return token;
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
