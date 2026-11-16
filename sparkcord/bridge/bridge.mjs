#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord <-> Discord bridge. Mirrors messages between chosen channels of one Discord
// server and chosen Sparkcord channels, in both directions, including edits and deletes.
// Messages are re-posted through webhooks, so they show the original author's name and
// avatar. No dependencies: needs Node 22 or newer. Setup is in README.md.
//
//   node sparkcord/bridge/bridge.mjs [path/to/bridge.config.json]

import {readFileSync, writeFileSync, existsSync, renameSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(process.argv[2] ?? join(HERE, 'bridge.config.json'));
const WEBHOOK_NAME = 'Sparkcord bridge';
const MAX_CONTENT = 2000;
const MAX_REMEMBERED = 5000;

function log(...parts) {
	console.log(new Date().toISOString(), ...parts);
}

function fail(message) {
	console.error(`bridge: ${message}`);
	process.exit(1);
}

// ---- Configuration ----

if (!existsSync(CONFIG_PATH)) fail(`no config at ${CONFIG_PATH}. Copy bridge.config.example.json and fill it in.`);
let config;
try {
	config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch (error) {
	fail(`could not read ${CONFIG_PATH}: ${error.message}`);
}
const discordToken = process.env.BRIDGE_DISCORD_TOKEN || config.discord?.token;
const sparkcordToken = process.env.BRIDGE_SPARKCORD_TOKEN || config.sparkcord?.token;
const sparkcordUrl = String(config.sparkcord?.url ?? '').replace(/\/+$/, '');
const discordGuildId = String(config.discord?.guild_id ?? '');
const links = (config.links ?? []).map((link) => ({discord: String(link.discord), sparkcord: String(link.sparkcord)}));
if (!discordToken) fail('discord.token is missing (or set BRIDGE_DISCORD_TOKEN).');
if (!sparkcordToken) fail('sparkcord.token is missing (or set BRIDGE_SPARKCORD_TOKEN).');
if (!sparkcordUrl) fail('sparkcord.url is missing, for example https://sparkcord.example.com');
if (!discordGuildId) fail('discord.guild_id is missing.');
if (links.length === 0) fail('links is empty: add at least one {"discord": "...", "sparkcord": "..."} pair.');
const STATE_PATH = resolve(dirname(CONFIG_PATH), config.state_file ?? 'bridge.state.json');

// ---- Remembered state: webhooks and which message mirrors which ----

let state = {webhooks: {}, pairs: []};
try {
	if (existsSync(STATE_PATH)) state = {webhooks: {}, pairs: [], ...JSON.parse(readFileSync(STATE_PATH, 'utf8'))};
} catch {
	log('state file unreadable, starting fresh');
}
/** "discord:<id>" or "sparkcord:<id>" -> {platform, channel, id} of the mirrored copy. */
const mirrors = new Map();
for (const pair of state.pairs) rememberInMemory(pair);

function rememberInMemory(pair) {
	mirrors.set(`discord:${pair.d}`, {platform: 'sparkcord', channel: pair.sc, id: pair.s});
	mirrors.set(`sparkcord:${pair.s}`, {platform: 'discord', channel: pair.dc, id: pair.d});
}

let saveTimer = null;
function saveSoon() {
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		try {
			writeFileSync(`${STATE_PATH}.tmp`, JSON.stringify(state));
			renameSync(`${STATE_PATH}.tmp`, STATE_PATH);
		} catch (error) {
			log('could not save state:', error.message);
		}
	}, 2000);
}

function rememberPair(pair) {
	state.pairs.push(pair);
	while (state.pairs.length > MAX_REMEMBERED) {
		const old = state.pairs.shift();
		mirrors.delete(`discord:${old.d}`);
		mirrors.delete(`sparkcord:${old.s}`);
	}
	rememberInMemory(pair);
	saveSoon();
}

// ---- The two platforms (both speak the Discord-style REST and gateway protocol) ----

const platforms = {
	discord: {
		name: 'discord',
		api: 'https://discord.com/api/v10',
		token: discordToken,
		gatewayQuery: '?v=10&encoding=json',
		// GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT
		intents: (1 << 0) | (1 << 9) | (1 << 15),
		avatarUrl: (user) =>
			user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : undefined,
	},
	sparkcord: {
		name: 'sparkcord',
		api: `${sparkcordUrl}/api/v1`,
		token: sparkcordToken,
		gatewayQuery: '?v=1&encoding=json&compress=none',
		intents: undefined,
		media: `${sparkcordUrl}/media`,
		avatarUrl(user) {
			return user?.avatar ? `${this.media}/avatars/${user.id}/${user.avatar}.png?size=128` : undefined;
		},
	},
};
const other = (platform) => (platform.name === 'discord' ? platforms.sparkcord : platforms.discord);

async function rest(platform, method, path, body, {auth = true} = {}) {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const response = await fetch(`${platform.api}${path}`, {
			method,
			headers: {
				...(auth ? {authorization: `Bot ${platform.token}`} : {}),
				...(body === undefined ? {} : {'content-type': 'application/json'}),
				'user-agent': 'SparkcordBridge (https://github.com/Sparkwave2/sparkcord, 1.0)',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		if (response.status === 429) {
			const info = await response.json().catch(() => ({}));
			const waitMs = Math.min(30_000, Math.ceil((Number(info.retry_after) || 1) * 1000) + 100);
			await new Promise((done) => setTimeout(done, waitMs));
			continue;
		}
		if (response.status === 204) return null;
		const text = await response.text();
		if (!response.ok) {
			const error = new Error(`${platform.name} ${method} ${path} -> ${response.status} ${text.slice(0, 300)}`);
			error.status = response.status;
			throw error;
		}
		return text ? JSON.parse(text) : null;
	}
	throw new Error(`${platform.name} ${method} ${path}: still rate limited after retries`);
}

/** The bridge's webhook in a channel, made on first use. Needs the Manage Webhooks permission. */
async function webhookFor(platform, channelId) {
	const key = `${platform.name}:${channelId}`;
	const known = state.webhooks[key];
	if (known) return known;
	const existing = await rest(platform, 'GET', `/channels/${channelId}/webhooks`);
	let hook = (existing ?? []).find((candidate) => candidate.name === WEBHOOK_NAME && candidate.token);
	if (!hook) hook = await rest(platform, 'POST', `/channels/${channelId}/webhooks`, {name: WEBHOOK_NAME});
	state.webhooks[key] = {id: String(hook.id), token: hook.token};
	saveSoon();
	return state.webhooks[key];
}

function isOwnWebhook(platform, webhookId) {
	if (!webhookId) return false;
	return Object.entries(state.webhooks).some(
		([key, hook]) => key.startsWith(`${platform.name}:`) && hook.id === String(webhookId),
	);
}

// ---- Turning a message from one side into a post for the other ----

function authorName(platform, message) {
	if (message.proxy?.name) return message.proxy.name;
	const user = message.author ?? {};
	return message.member?.nick || user.global_name || user.username || 'Unknown';
}

function authorAvatar(platform, message) {
	if (message.proxy?.avatar_url) return message.proxy.avatar_url;
	return platform.avatarUrl(message.author);
}

function buildContent(message) {
	const parts = [];
	const reply = message.referenced_message;
	if (reply) {
		const name = reply.proxy?.name || reply.author?.global_name || reply.author?.username || 'someone';
		const quoted = String(reply.content ?? '').replace(/\s+/g, ' ').slice(0, 80);
		parts.push(`> ↪ **${name}**${quoted ? `: ${quoted}` : ''}`);
	}
	if (message.content) parts.push(message.content);
	for (const attachment of message.attachments ?? []) {
		if (attachment.url) parts.push(attachment.url);
	}
	for (const sticker of message.sticker_items ?? message.stickers ?? []) {
		if (sticker.name) parts.push(`[sticker: ${sticker.name}]`);
	}
	const content = parts.join('\n').trim();
	return content.length > MAX_CONTENT ? `${content.slice(0, MAX_CONTENT - 1)}…` : content;
}

function webhookName(platform, message) {
	// Discord refuses webhook names containing "discord" or "clyde", and limits them to 80.
	const name = authorName(platform, message)
		.replace(/discord/gi, 'D1scord')
		.replace(/clyde/gi, 'C1yde')
		.trim()
		.slice(0, 80);
	return name || 'Unknown';
}

function linkedChannel(platform, channelId) {
	const link = links.find((candidate) => candidate[platform.name] === String(channelId));
	return link ? link[other(platform).name] : null;
}

async function onMessageCreate(platform, message) {
	const targetChannel = linkedChannel(platform, message.channel_id);
	if (!targetChannel) return;
	if (isOwnWebhook(platform, message.webhook_id)) return;
	// Ordinary messages and replies only (no joins, pins, calls and so on).
	if (message.type !== undefined && message.type !== 0 && message.type !== 19) return;
	const content = buildContent(message);
	if (!content) return;
	const target = other(platform);
	const hook = await webhookFor(target, targetChannel);
	const posted = await rest(
		target,
		'POST',
		`/webhooks/${hook.id}/${hook.token}?wait=true`,
		{
			content,
			username: webhookName(platform, message),
			avatar_url: authorAvatar(platform, message),
			allowed_mentions: {parse: []},
		},
		{auth: false},
	);
	if (!posted?.id) return;
	const pair =
		platform.name === 'discord'
			? {d: String(message.id), dc: String(message.channel_id), s: String(posted.id), sc: String(targetChannel)}
			: {d: String(posted.id), dc: String(targetChannel), s: String(message.id), sc: String(message.channel_id)};
	rememberPair(pair);
}

async function onMessageUpdate(platform, message) {
	// Edits arrive without content when only an embed changed.
	if (typeof message.content !== 'string') return;
	if (isOwnWebhook(platform, message.webhook_id)) return;
	const mirror = mirrors.get(`${platform.name}:${message.id}`);
	if (!mirror) return;
	const target = other(platform);
	const hook = await webhookFor(target, mirror.channel);
	const content = buildContent(message);
	if (!content) return;
	await rest(
		target,
		'PATCH',
		`/webhooks/${hook.id}/${hook.token}/messages/${mirror.id}`,
		{content, allowed_mentions: {parse: []}},
		{auth: false},
	);
}

async function onMessageDelete(platform, data) {
	const mirror = mirrors.get(`${platform.name}:${data.id}`);
	if (!mirror) return;
	const target = other(platform);
	const hook = await webhookFor(target, mirror.channel);
	await rest(target, 'DELETE', `/webhooks/${hook.id}/${hook.token}/messages/${mirror.id}`, undefined, {
		auth: false,
	}).catch((error) => {
		if (error.status !== 404) throw error;
	});
}

function handleDispatch(platform, type, data) {
	let task = null;
	if (type === 'MESSAGE_CREATE') task = onMessageCreate(platform, data);
	else if (type === 'MESSAGE_UPDATE') task = onMessageUpdate(platform, data);
	else if (type === 'MESSAGE_DELETE') task = onMessageDelete(platform, data);
	else if (type === 'MESSAGE_DELETE_BULK') {
		task = Promise.all((data.ids ?? []).map((id) => onMessageDelete(platform, {id})));
	}
	task?.catch((error) => log(`[${platform.name}] ${type} failed:`, error.message));
}

// ---- Gateway connection (one per platform) ----

function connect(platform) {
	let socket = null;
	let heartbeat = null;
	let sequence = null;
	let sessionId = null;
	let resumeUrl = null;
	let acked = true;
	let attempts = 0;

	const send = (payload) => {
		if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
	};

	const reconnect = (canResume) => {
		clearInterval(heartbeat);
		heartbeat = null;
		if (!canResume) {
			sessionId = null;
			sequence = null;
			resumeUrl = null;
		}
		try {
			socket?.close();
		} catch {}
		socket = null;
		attempts += 1;
		const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
		log(`[${platform.name}] reconnecting in ${Math.round(delay / 1000)}s`);
		setTimeout(open, delay);
	};

	async function open() {
		let base = resumeUrl;
		try {
			if (!base) base = (await rest(platform, 'GET', '/gateway/bot')).url;
		} catch (error) {
			log(`[${platform.name}] could not get the gateway address:`, error.message);
			if (error.status === 401) fail(`the ${platform.name} token was rejected.`);
			return reconnect(false);
		}
		const current = new WebSocket(`${String(base).replace(/\/+$/, '')}/${platform.gatewayQuery}`);
		socket = current;
		current.addEventListener('message', (event) => {
			if (socket !== current) return;
			let payload;
			try {
				payload = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
			} catch {
				return;
			}
			if (typeof payload.s === 'number') sequence = payload.s;
			switch (payload.op) {
				case 10: {
					const interval = payload.d?.heartbeat_interval ?? 41_250;
					acked = true;
					clearInterval(heartbeat);
					heartbeat = setInterval(() => {
						if (!acked) {
							log(`[${platform.name}] heartbeat not answered`);
							return reconnect(true);
						}
						acked = false;
						send({op: 1, d: sequence});
					}, interval);
					if (sessionId) {
						send({op: 6, d: {token: platform.token, session_id: sessionId, seq: sequence}});
					} else {
						send({
							op: 2,
							d: {
								token: platform.token,
								...(platform.intents === undefined ? {} : {intents: platform.intents}),
								properties: {os: process.platform, browser: 'sparkcord-bridge', device: 'sparkcord-bridge'},
							},
						});
					}
					break;
				}
				case 11:
					acked = true;
					break;
				case 1:
					send({op: 1, d: sequence});
					break;
				case 7:
					reconnect(true);
					break;
				case 9:
					reconnect(payload.d === true);
					break;
				case 0:
					if (payload.t === 'READY') {
						attempts = 0;
						sessionId = payload.d?.session_id ?? null;
						resumeUrl = payload.d?.resume_gateway_url ?? null;
						log(`[${platform.name}] connected as ${payload.d?.user?.username ?? 'bot'}`);
					} else if (payload.t === 'RESUMED') {
						attempts = 0;
						log(`[${platform.name}] resumed`);
					} else {
						handleDispatch(platform, payload.t, payload.d ?? {});
					}
					break;
			}
		});
		current.addEventListener('close', (event) => {
			if (socket !== current) return;
			log(`[${platform.name}] connection closed (${event.code}${event.reason ? ` ${event.reason}` : ''})`);
			// Discord: bad token, bad or disallowed intents. Reconnecting can't fix these.
			if ([4004, 4013, 4014].includes(event.code)) {
				fail(
					event.code === 4014
						? 'Discord refused the intents. Turn on "Message Content Intent" for the bot in the Discord Developer Portal.'
						: `the ${platform.name} gateway refused the bot (close code ${event.code}).`,
				);
			}
			reconnect(![4007, 4009].includes(event.code));
		});
		current.addEventListener('error', () => {});
	}

	void open();
}

// ---- Start ----

async function main() {
	// Sparkcord may serve media from somewhere other than <url>/media.
	try {
		const discovery = await fetch(`${sparkcordUrl}/.well-known/fluxer`).then((response) => response.json());
		if (discovery?.endpoints?.media) platforms.sparkcord.media = String(discovery.endpoints.media).replace(/\/+$/, '');
		if (discovery?.endpoints?.api) platforms.sparkcord.api = `${String(discovery.endpoints.api).replace(/\/+$/, '')}/v1`;
	} catch {
		log('could not read the Sparkcord instance details; using defaults');
	}
	// Check the Discord channels really belong to the chosen server before mirroring anything.
	const channels = await rest(platforms.discord, 'GET', `/guilds/${discordGuildId}/channels`).catch((error) =>
		fail(`could not list the Discord server's channels (is the bot in the server?): ${error.message}`),
	);
	const known = new Set(channels.map((channel) => String(channel.id)));
	for (const link of links) {
		if (!known.has(link.discord)) fail(`Discord channel ${link.discord} is not in server ${discordGuildId}.`);
	}
	// Make the webhooks now so permission problems show at start, not on the first message.
	for (const link of links) {
		await webhookFor(platforms.discord, link.discord).catch((error) =>
			fail(`no webhook in Discord channel ${link.discord} (the bot needs Manage Webhooks): ${error.message}`),
		);
		await webhookFor(platforms.sparkcord, link.sparkcord).catch((error) =>
			fail(`no webhook in Sparkcord channel ${link.sparkcord} (the bot needs Manage Webhooks): ${error.message}`),
		);
	}
	log(`bridging ${links.length} channel pair(s)`);
	connect(platforms.discord);
	connect(platforms.sparkcord);
}

main().catch((error) => fail(error.message));
