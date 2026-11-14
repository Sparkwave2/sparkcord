// SPDX-License-Identifier: AGPL-3.0-or-later
//
// End-to-end check of tuppers against the local stack started by dev.sh.
// Creates (once) a local test admin account using the setup token, stores its
// generated credentials in sparkcord/dev/stack/test-account.json (git-ignored),
// then exercises create/import/proxy/export over the real API and gateway.
//
//   node sparkcord/dev/smoke-test.mjs

import {randomBytes} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const DEV_DIR = dirname(fileURLToPath(import.meta.url));
const STACK_DIR = join(DEV_DIR, 'stack');
const ACCOUNT_FILE = join(STACK_DIR, 'test-account.json');
const ORIGIN = process.env.SPARKCORD_ORIGIN ?? 'http://localhost:8090';
const API = `${ORIGIN}/api/v1`;

function envValue(key) {
	const line = readFileSync(join(STACK_DIR, '.env'), 'utf8')
		.split('\n')
		.findLast((l) => l.startsWith(`${key}=`));
	return line?.slice(key.length + 1).trim();
}

let token = null;
let failures = 0;

async function api(method, path, body) {
	const response = await fetch(`${API}${path}`, {
		method,
		headers: {
			'content-type': 'application/json',
			origin: ORIGIN,
			...(token ? {authorization: token} : {}),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	const data = text ? JSON.parse(text) : null;
	if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
	return data;
}

function check(label, condition, detail) {
	if (condition) {
		console.log(`  ok    ${label}`);
	} else {
		failures++;
		console.log(`  FAIL  ${label}${detail ? `: ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
	}
}

async function ensureAccount() {
	if (existsSync(ACCOUNT_FILE)) {
		const account = JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8'));
		const login = await api('POST', '/auth/login', {login: account.username, password: account.password});
		return login.token;
	}
	const account = {username: `tester${randomBytes(3).toString('hex')}`, password: randomBytes(18).toString('base64url')};
	const registered = await api('POST', '/auth/register', {
		username: account.username,
		global_name: 'Sparkcord Tester',
		password: account.password,
		date_of_birth: '1990-01-01',
		consent: true,
		setup_token: envValue('FLUXER_SETUP_TOKEN'),
	});
	writeFileSync(ACCOUNT_FILE, JSON.stringify(account, null, 2));
	return registered.token;
}

/** Identifies on the gateway once, which marks the session as started (required before sending). */
async function startGatewaySession() {
	const ws = new WebSocket(`${ORIGIN.replace(/^http/, 'ws')}/gateway?v=1&encoding=json`);
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('gateway READY timeout')), 20000);
		ws.addEventListener('message', (event) => {
			const payload = JSON.parse(event.data);
			if (payload.op === 10) {
				ws.send(
					JSON.stringify({
						op: 2,
						d: {token, properties: {os: 'linux', browser: 'sparkcord-smoke-test', device: 'sparkcord-smoke-test'}},
					}),
				);
			} else if (payload.t === 'READY') {
				clearTimeout(timer);
				resolve(ws);
			} else if (payload.op === 9) {
				clearTimeout(timer);
				reject(new Error('gateway invalid session'));
			}
		});
		ws.addEventListener('error', (e) => reject(e.error ?? new Error('gateway error')));
	});
}

async function main() {
	console.log(`Sparkcord smoke test against ${ORIGIN}`);
	token = await ensureAccount();
	check('signed in', typeof token === 'string');
	const ws = await startGatewaySession();
	check('gateway session started', true);

	for (const tupper of await api('GET', '/users/@me/tuppers')) {
		await api('DELETE', `/users/@me/tuppers/${tupper.id}`);
	}
	await api('PATCH', '/users/@me/tuppers/settings', {autoproxy_mode: 'off', proxy_enabled: true});

	const created = await api('POST', '/users/@me/tuppers', {
		name: 'Echo',
		proxy_tags: [{prefix: 'e:', suffix: null}],
		color: 0x33aa88,
		pronouns: 'it/its',
	});
	check('create tupper', created.name === 'Echo' && created.proxy_tags[0].prefix === 'e:', created);

	const tb = await api('POST', '/users/@me/tuppers/import', {
		data: JSON.parse(readFileSync(join(DEV_DIR, '../examples/tupperbox-export.json'), 'utf8')),
	});
	check('import Tupperbox', tb.source === 'tupperbox' && tb.created === 2, tb);
	const pk = await api('POST', '/users/@me/tuppers/import', {
		data: JSON.parse(readFileSync(join(DEV_DIR, '../examples/pluralkit-export.json'), 'utf8')),
	});
	check('import PluralKit', pk.source === 'pluralkit' && pk.created === 2, pk);
	const again = await api('POST', '/users/@me/tuppers/import', {
		data: JSON.parse(readFileSync(join(DEV_DIR, '../examples/pluralkit-export.json'), 'utf8')),
	});
	check('re-import updates instead of duplicating', again.created === 0 && again.updated === 2, again);
	const list = await api('GET', '/users/@me/tuppers');
	check('5 tuppers listed', list.length === 5, list.map((t) => t.name));
	const settings = await api('GET', '/users/@me/tuppers/settings');
	check('system tag imported from PluralKit', settings.system_tag === '| TC', settings);

	const guild = await api('POST', '/guilds', {name: `Tupper test ${Date.now()}`});
	const channels = await api('GET', `/guilds/${guild.id}/channels`);
	const channel = channels.find((c) => c.type === 0);
	check('test guild with a text channel', Boolean(channel), channels);

	const proxied = await api('POST', `/channels/${channel.id}/messages`, {content: 'e: hello from Echo'});
	check('proxied: tag stripped', proxied.content === 'hello from Echo', proxied.content);
	check('proxied: proxy object on send response', proxied.proxy?.name === 'Echo', proxied.proxy);
	check('proxied: real author kept', proxied.author.username.startsWith('tester'), proxied.author);
	check('proxied: system tag', proxied.proxy?.system_tag === '| TC', proxied.proxy);

	const bracket = await api('POST', `/channels/${channel.id}/messages`, {content: '[bracketed Kai]'});
	check('Tupperbox brackets', bracket.proxy?.name === 'Kai 🌙' && bracket.content === 'bracketed Kai', bracket);
	check('group tag overrides system tag', bracket.proxy?.system_tag === '| night', bracket.proxy);
	check(
		'avatar goes through media proxy',
		typeof bracket.proxy?.avatar_url === 'string' && bracket.proxy.avatar_url.includes('/media/external/'),
		bracket.proxy?.avatar_url,
	);

	const suffix = await api('POST', `/channels/${channel.id}/messages`, {content: 'suffix style -s'});
	check('suffix tag', suffix.proxy?.name === 'Sol ☀' && suffix.content === 'suffix style', suffix);

	const escaped = await api('POST', `/channels/${channel.id}/messages`, {content: '\\e: not proxied'});
	check('backslash escapes proxying', !escaped.proxy, escaped.proxy);
	const plain = await api('POST', `/channels/${channel.id}/messages`, {content: 'plain message'});
	check('untagged message not proxied', !plain.proxy, plain.proxy);

	const reply = await api('POST', `/channels/${channel.id}/messages`, {
		content: 'replying as myself',
		message_reference: {message_id: proxied.id, channel_id: channel.id},
	});
	check('reply carries referenced proxy', reply.referenced_message?.proxy?.name === 'Echo', reply.referenced_message);

	await api('PATCH', '/users/@me/tuppers/settings', {autoproxy_mode: 'latch'});
	await api('POST', `/channels/${channel.id}/messages`, {content: 'r; latch on Rin'});
	const latched = await api('POST', `/channels/${channel.id}/messages`, {content: 'no tag, still Rin'});
	check('latch autoproxy', latched.proxy?.name === 'Rin', latched.proxy);
	await api('POST', `/channels/${channel.id}/messages`, {content: '\\\\ clear latch'});
	const unlatched = await api('POST', `/channels/${channel.id}/messages`, {content: 'back to me'});
	check('\\\\ clears latch', !unlatched.proxy, unlatched.proxy);
	await api('PATCH', '/users/@me/tuppers/settings', {autoproxy_mode: 'off'});

	const edited = await api('PATCH', `/channels/${channel.id}/messages/${proxied.id}`, {content: 'edited by owner'});
	check('owner can edit proxied message', edited.content === 'edited by owner' && edited.proxy?.name === 'Echo', edited);

	const history = await api('GET', `/channels/${channel.id}/messages?limit=50`);
	const fromHistory = history.find((m) => m.id === proxied.id);
	check('history includes proxy', fromHistory?.proxy?.name === 'Echo', fromHistory?.proxy);

	const exported = await api('GET', '/users/@me/tuppers/export');
	check('export is PluralKit-shaped', exported.version === 2 && exported.members.length === 5, exported.members?.length);

	await api('DELETE', `/channels/${proxied.channel_id}/messages/${proxied.id}`);
	check('owner can delete proxied message', true);
	await api('DELETE', `/guilds/${guild.id}`).catch(() => api('POST', `/guilds/${guild.id}/delete`, {}));
	ws.close();

	console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
