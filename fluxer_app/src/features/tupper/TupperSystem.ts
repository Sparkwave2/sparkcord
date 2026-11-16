// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: reading someone's tupper system (its name, tag and members) for the
// "view system" window. Kept small so profile cards can import it without pulling in
// the window itself, which is loaded when first opened.

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';

export interface TupperSystemMemberWire {
	id: string;
	name: string;
	avatar_url: string | null;
	pronouns: string | null;
	description: string | null;
	color: number | null;
	tag: string | null;
	font?: string | null;
}

export interface TupperSystemWire {
	user_id: string;
	/** The owner keeps the system private. Other people then get no name, tag or members. */
	private: boolean;
	system_name: string | null;
	system_tag: string | null;
	tuppers: Array<TupperSystemMemberWire>;
}

const FRESH_FOR_MS = 60_000;
const cache = new Map<string, {at: number; pending: Promise<TupperSystemWire | null>}>();

/** Loads a system, reusing a recent answer unless `fresh` is set. Null when it can't be read. */
export function loadTupperSystem(userId: string, fresh = false): Promise<TupperSystemWire | null> {
	const cached = cache.get(userId);
	if (cached && !fresh && Date.now() - cached.at < FRESH_FOR_MS) return cached.pending;
	const pending = http
		.get<TupperSystemWire>(Endpoints.USER_TUPPER_SYSTEM(userId))
		.then((response) => response.body)
		.catch(() => {
			cache.delete(userId);
			return null;
		});
	cache.set(userId, {at: Date.now(), pending});
	return pending;
}

/** Forgets a cached system (after its owner changed it). */
export function forgetTupperSystem(userId: string): void {
	cache.delete(userId);
}

/** Opens the window that lists a person's system. */
export function openTupperSystem(userId: string): void {
	void Promise.all([
		import('@app/features/tupper/TupperSystemModal'),
		import('@app/features/ui/commands/ModalCommands'),
	]).then(([view, commands]) => {
		commands.push(commands.modal(() => view.createTupperSystemModal(userId)));
	});
}
