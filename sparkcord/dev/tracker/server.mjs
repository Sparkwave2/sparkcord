// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord peer-to-peer file sharing: a WebTorrent (WebSocket) tracker, so browsers
// sharing a file can find each other without a public tracker, plus the ICE servers
// (STUN/TURN) they should use, taken from the voice server's (LiveKit's) settings.
//   :8000  WebSocket tracker   (edge: /tracker)
//   :8001  GET /ice -> {iceServers} (edge: /tracker-ice)

import {createHmac} from 'node:crypto';
import http from 'node:http';
import Server from 'bittorrent-tracker/server';

const TRACKER_PORT = 8000;
const ICE_PORT = 8001;

function stunEntry(value) {
	if (!value) return null;
	return {urls: value.startsWith('stun:') ? value : `stun:${value}`};
}

function turnEntries(raw) {
	// LiveKit's turn_servers list: [{host, port, protocol, username, credential}].
	try {
		const list = JSON.parse(raw || '[]');
		return Array.isArray(list)
			? list
					.filter((t) => t && t.host)
					.map((t) => ({
						urls: `${t.protocol === 'tls' ? 'turns' : 'turn'}:${t.host}:${t.port ?? 3478}${
							t.protocol === 'tcp' ? '?transport=tcp' : ''
						}`,
						username: t.username,
						credential: t.credential,
					}))
			: [];
	} catch {
		return [];
	}
}

const staticIceServers = [
	stunEntry(process.env.STUN_PRIMARY),
	stunEntry(process.env.STUN_SECONDARY),
	...turnEntries(process.env.TURN_SERVERS),
].filter(Boolean);

const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_PORT = process.env.TURN_PORT || '3478';
const TURN_TTL_SECONDS = 24 * 60 * 60;

/**
 * Sparkcord's own TURN relay (coturn, --use-auth-secret): time-limited credentials per
 * the TURN REST convention, so no fixed password is handed out. The relay is reached on
 * the same host name the browser used for Sparkcord.
 */
function sparkcordTurn(req) {
	if (!TURN_SECRET) return [];
	const host = (process.env.TURN_HOST || String(req.headers['x-forwarded-host'] || req.headers.host || ''))
		.split(',')[0]
		.trim()
		.replace(/:\d+$/, '');
	if (!host) return [];
	const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS}:sparkcord`;
	const credential = createHmac('sha1', TURN_SECRET).update(username).digest('base64');
	return [
		{
			urls: [`turn:${host}:${TURN_PORT}?transport=udp`, `turn:${host}:${TURN_PORT}?transport=tcp`],
			username,
			credential,
		},
	];
}

http
	.createServer((req, res) => {
		if (req.url === '/ice' || req.url?.startsWith('/ice?')) {
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Cache-Control': 'private, max-age=300',
				// The desktop app's page has its own origin.
				'Access-Control-Allow-Origin': '*',
			});
			res.end(JSON.stringify({iceServers: [...staticIceServers, ...sparkcordTurn(req)]}));
			return;
		}
		if (req.url === '/_health') {
			res.writeHead(200).end('OK');
			return;
		}
		res.writeHead(404).end();
	})
	.listen(ICE_PORT, () =>
		console.log(`ICE config on :${ICE_PORT} (${staticIceServers.length} static, TURN relay ${TURN_SECRET ? 'on' : 'off'})`),
	);

const tracker = new Server({udp: false, http: false, ws: true, stats: false, trustProxy: true});
tracker.on('error', (err) => console.error('tracker error:', err.message));
tracker.on('warning', (err) => console.warn('tracker warning:', err.message));
// One short line per peer joining/leaving/finishing a share (no addresses logged).
for (const event of ['start', 'complete', 'stop']) {
	tracker.on(event, (_addr, params) =>
		console.log(
			`${event} ${String(params.info_hash).slice(0, 8)} peer=${String(params.peer_id).slice(-6)} offers=${params.offers?.length ?? 0} left=${params.left}`,
		),
	);
}
tracker.listen(TRACKER_PORT, () => console.log(`WebTorrent tracker on :${TRACKER_PORT}`));
