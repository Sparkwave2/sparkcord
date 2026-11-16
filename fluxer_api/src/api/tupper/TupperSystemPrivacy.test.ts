// SPDX-License-Identifier: AGPL-3.0-or-later

import type {UserID} from '@app/api/BrandedTypes';
import type {TupperRepository} from '@app/api/tupper/TupperRepository';
import {TupperService} from '@app/api/tupper/TupperService';
import type {TupperRow, TupperSettingsRow} from '@app/api/tupper/TupperTables';
import {describe, expect, it} from 'vitest';

const OWNER = 1n as UserID;
const VIEWER = 2n as UserID;

function tupper(): TupperRow {
	return {
		user_id: OWNER,
		tupper_id: 10n,
		name: 'Kit',
		display_name: null,
		avatar_url: null,
		proxy_tags: '[]',
		keep_proxy: false,
		description: 'A fox.',
		pronouns: 'she/her',
		color: null,
		birthday: '2000-01-01',
		tag: null,
		external_id: null,
		import_source: null,
		position: 0,
		created_at: new Date(0),
		updated_at: new Date(0),
	};
}

function service(systemPrivate: boolean): TupperService {
	const settings: TupperSettingsRow = {
		user_id: OWNER,
		system_name: 'Foxes',
		system_tag: '[F]',
		proxy_enabled: true,
		autoproxy_mode: 'off',
		autoproxy_tupper_id: null,
		latch_tupper_id: null,
		updated_at: new Date(0),
		system_private: systemPrivate,
	};
	const repo = {
		getSettings: async () => settings,
		listByUser: async () => [tupper()],
		findById: async () => tupper(),
	} as unknown as TupperRepository;
	return new TupperService(repo);
}

describe('private tupper systems', () => {
	it('shows a public system to everyone', async () => {
		const system = await service(false).getSystem(OWNER, VIEWER);
		expect(system.private).toBe(false);
		expect(system.system_name).toBe('Foxes');
		expect(system.tuppers.map((t) => t.name)).toEqual(['Kit']);
	});

	it('hides a private system from other people', async () => {
		const system = await service(true).getSystem(OWNER, VIEWER);
		expect(system).toEqual({user_id: '1', private: true, system_name: null, system_tag: null, tuppers: []});
	});

	it('still shows a private system to its owner', async () => {
		const system = await service(true).getSystem(OWNER, OWNER);
		expect(system.private).toBe(true);
		expect(system.tuppers).toHaveLength(1);
	});

	it('trims the card of a private system for other people only', async () => {
		const forViewer = await service(true).getCard(OWNER, '10', VIEWER);
		expect(forViewer.description).toBeNull();
		expect(forViewer.birthday).toBeNull();
		expect(forViewer.system_name).toBeNull();
		expect(forViewer.pronouns).toBe('she/her');
		expect(forViewer.system_tag).toBe('[F]');
		expect(forViewer.system_private).toBe(true);
		const forOwner = await service(true).getCard(OWNER, '10', OWNER);
		expect(forOwner.description).toBe('A fox.');
		expect(forOwner.system_name).toBe('Foxes');
	});
});
