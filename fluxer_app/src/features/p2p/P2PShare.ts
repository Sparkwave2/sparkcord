// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord peer-to-peer file shares: a message whose whole content is a magnet link
// marked with `x.sc=1` is drawn as a download card. The file never touches the server;
// the sender's browser seeds it (WebTorrent over WebRTC) through this instance's
// tracker. Leaf module: no imports, safe to use from message components.

export const P2P_MARKER = 'x.sc=1';

export interface P2PShareInfo {
	magnet: string;
	infoHash: string;
	name: string;
	/** Size in bytes, when the sender included it. */
	size: number | null;
	/**
	 * Set on the sender's local placeholder while the file is still being prepared
	 * (before its share link exists): the id of that preparation.
	 */
	pendingId: string | null;
}

export function parseP2PShare(content: string | null | undefined): P2PShareInfo | null {
	const text = content?.trim();
	if (!text || !text.startsWith('magnet:?') || /\s/.test(text) || !text.includes(P2P_MARKER)) return null;
	let params: URLSearchParams;
	try {
		params = new URLSearchParams(text.slice('magnet:?'.length));
	} catch {
		return null;
	}
	const xt = params.get('xt') ?? '';
	const match = /^urn:btih:([0-9a-fA-F]{40})$/.exec(xt);
	if (!match) return null;
	const size = Number(params.get('xl'));
	return {
		magnet: text,
		infoHash: match[1].toLowerCase(),
		name: params.get('dn') || 'file',
		size: Number.isFinite(size) && size >= 0 ? size : null,
		pendingId: params.get('x.pending'),
	};
}

/** Placeholder content for a share that is still being prepared (local only). */
export function pendingShareContent(name: string, size: number, pendingId: string): string {
	const params = new URLSearchParams({dn: name, xl: String(size), 'x.pending': pendingId});
	return `magnet:?xt=urn:btih:${'0'.repeat(40)}&${params.toString()}&${P2P_MARKER}`;
}

/** Adds the size and the Sparkcord marker to a magnet link from WebTorrent. */
export function markMagnet(magnet: string, size: number): string {
	return `${magnet}&xl=${size}&${P2P_MARKER}`;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Opens the file picker straight from the click (browsers block delayed pickers), then
 * loads the sharing code and shares the chosen files in the channel.
 */
export function openP2PFilePicker(channelId: string): void {
	const input = document.createElement('input');
	input.type = 'file';
	input.multiple = true;
	input.addEventListener('change', () => {
		const files = Array.from(input.files ?? []);
		if (files.length === 0) return;
		void import('@app/features/p2p/P2PCommands')
			.then((m) => m.shareFilesP2P(channelId, files))
			.catch((error) => console.error('[p2p] share failed', error));
	});
	input.click();
}
