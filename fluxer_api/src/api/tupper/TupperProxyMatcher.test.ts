// SPDX-License-Identifier: AGPL-3.0-or-later

import {matchProxyTags, parseProxyTemplate, type ProxyCandidate} from '@app/api/tupper/TupperProxyMatcher';
import {describe, expect, it} from 'vitest';

const kai: ProxyCandidate<string> = {tupper: 'kai', proxyTags: [{prefix: 'k:', suffix: null}], keepProxy: false};
const bracket: ProxyCandidate<string> = {tupper: 'b', proxyTags: [{prefix: '[', suffix: ']'}], keepProxy: false};
const double: ProxyCandidate<string> = {tupper: 'd', proxyTags: [{prefix: '[[', suffix: ']]'}], keepProxy: false};

describe('matchProxyTags', () => {
	it('matches a prefix tag and strips it', () => {
		expect(matchProxyTags('k: hello there', [kai])).toEqual({
			tupper: 'kai',
			content: 'hello there',
			tag: {prefix: 'k:', suffix: null},
		});
	});

	it('matches prefix and suffix tags', () => {
		expect(matchProxyTags('[hi]', [kai, bracket])?.tupper).toBe('b');
	});

	it('prefers the longest tag', () => {
		expect(matchProxyTags('[[hi]]', [bracket, double])).toMatchObject({tupper: 'd', content: 'hi'});
	});

	it('is case-insensitive', () => {
		expect(matchProxyTags('K: hey', [kai])?.content).toBe('hey');
	});

	it('ignores escaped messages', () => {
		expect(matchProxyTags('\\k: hey', [kai])).toBeNull();
	});

	it('requires content unless attachments are present', () => {
		expect(matchProxyTags('k:', [kai])).toBeNull();
		expect(matchProxyTags('k:', [kai], {allowEmptyContent: true})?.content).toBe('');
	});

	it('keeps the tags when keep_proxy is set', () => {
		expect(matchProxyTags('[hi]', [{...bracket, keepProxy: true}])?.content).toBe('[hi]');
	});

	it('returns null when nothing matches', () => {
		expect(matchProxyTags('plain message', [kai, bracket])).toBeNull();
	});
});

describe('parseProxyTemplate', () => {
	it('parses text placeholders', () => {
		expect(parseProxyTemplate('[text]')).toEqual({prefix: '[', suffix: ']'});
		expect(parseProxyTemplate('k:text')).toEqual({prefix: 'k:', suffix: null});
		expect(parseProxyTemplate('text -k')).toEqual({prefix: null, suffix: ' -k'});
		expect(parseProxyTemplate('nothing')).toBeNull();
	});
});
