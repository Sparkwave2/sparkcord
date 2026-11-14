// SPDX-License-Identifier: AGPL-3.0-or-later

import {parseTupperImport, TupperImportFormatError} from '@app/api/tupper/TupperImport';
import {describe, expect, it} from 'vitest';

describe('parseTupperImport', () => {
	it('parses a Tupperbox export', () => {
		const result = parseTupperImport({
			tuppers: [
				{
					id: 42,
					name: 'Kai',
					avatar_url: 'https://cdn.example.com/kai.png',
					brackets: ['k:', '', '[', ']'],
					show_brackets: false,
					birthday: '2001-02-03T00:00:00.000Z',
					description: 'hello',
					nick: 'Kai 🌙',
					tag: null,
					group_id: 7,
				},
				{name: '', brackets: []},
			],
			groups: [{id: 7, name: 'Crew', tag: '| crew'}],
		});
		expect(result.source).toBe('tupperbox');
		expect(result.tuppers).toHaveLength(1);
		expect(result.tuppers[0]).toMatchObject({
			name: 'Kai',
			displayName: 'Kai 🌙',
			avatarUrl: 'https://cdn.example.com/kai.png',
			proxyTags: [
				{prefix: 'k:', suffix: null},
				{prefix: '[', suffix: ']'},
			],
			birthday: '2001-02-03',
			tag: '| crew',
			externalId: '42',
		});
		expect(result.warnings).toHaveLength(1);
	});

	it('parses a PluralKit export', () => {
		const result = parseTupperImport({
			version: 2,
			name: 'The Collective',
			tag: '| TC',
			members: [
				{
					id: 'abcde',
					name: 'Rin',
					display_name: null,
					color: 'ff00aa',
					pronouns: 'she/her',
					avatar_url: 'https://cdn.example.com/a.png',
					webhook_avatar_url: 'https://cdn.example.com/w.png',
					keep_proxy: true,
					proxy_tags: [{prefix: 'r;', suffix: null}, {prefix: null, suffix: null}],
				},
			],
			switches: [],
		});
		expect(result.source).toBe('pluralkit');
		expect(result.systemName).toBe('The Collective');
		expect(result.systemTag).toBe('| TC');
		expect(result.tuppers[0]).toMatchObject({
			name: 'Rin',
			color: 0xff00aa,
			pronouns: 'she/her',
			avatarUrl: 'https://cdn.example.com/w.png',
			keepProxy: true,
			proxyTags: [{prefix: 'r;', suffix: null}],
			externalId: 'abcde',
		});
	});

	it('drops non-http avatars', () => {
		const result = parseTupperImport({tuppers: [{name: 'X', avatar_url: 'javascript:alert(1)', brackets: ['x:', '']}]});
		expect(result.tuppers[0]!.avatarUrl).toBeNull();
	});

	it('rejects unknown files', () => {
		expect(() => parseTupperImport({foo: 1})).toThrow(TupperImportFormatError);
	});
});
