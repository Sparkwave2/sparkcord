// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: VirusTotal scans of attachments on the client. Whether scanning is set up
// on this instance, and a cache of scan results filled by batched lookups for the
// attachments on screen. The server keeps the API key; the client never sees it.

import {action, makeObservable, observable, runInAction} from 'mobx';

export type VirusTotalStatus = 'clean' | 'flagged' | 'unknown' | 'pending';
export type VirusTotalError = 'not_configured' | 'not_found' | 'too_large' | 'rate_limited' | 'invalid_key' | 'failed';

export interface VirusTotalScan {
	status: VirusTotalStatus;
	malicious: number;
	suspicious: number;
	total: number;
	sha256: string;
}

interface Config {
	configured: boolean;
	can_configure: boolean;
}

const BATCH_DELAY_MS = 40;
const MAX_BATCH = 100;
const STALE_AFTER_MS = 5 * 60_000;
const PENDING_POLL_MS = 20_000;

async function getHttp() {
	return (await import('@app/features/platform/transport/RestTransport')).http;
}

export function virusTotalReportUrl(sha256: string): string {
	return `https://www.virustotal.com/gui/file/${sha256}`;
}

class VirusTotalStore {
	config: Config | null = null;
	scans = observable.map<string, VirusTotalScan | null>();
	/** Attachments being checked right now (shown as "Checking with VirusTotal…"). */
	checking = observable.set<string>();
	private fetchedAt = new Map<string, number>();
	private queued = new Set<string>();
	private inflight = new Set<string>();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private configPromise: Promise<void> | null = null;

	constructor() {
		makeObservable(this, {config: observable, setConfig: action});
	}

	setConfig(config: Config): void {
		this.config = config;
	}

	/** Loads whether scanning is set up (once per session, or again with force). */
	ensureConfig(force = false): Promise<void> {
		if (this.configPromise && !force) return this.configPromise;
		this.configPromise = (async () => {
			try {
				const http = await getHttp();
				const res = await http.get<Config>('/virustotal/config');
				this.setConfig(res.body);
			} catch {
				this.configPromise = null;
			}
		})();
		return this.configPromise;
	}

	get configured(): boolean {
		return this.config?.configured ?? false;
	}

	get canConfigure(): boolean {
		return this.config?.can_configure ?? false;
	}

	/** Whether a scan can be started for this attachment (none stored, or VirusTotal didn't know the file). */
	canScan(attachmentId: string): boolean {
		if (!this.configured || this.checking.has(attachmentId)) return false;
		const scan = this.scans.get(attachmentId);
		return !scan || scan.status === 'unknown';
	}

	/** Queues a lookup of an attachment's stored result, unless one is fresh enough. */
	request(attachmentId: string): void {
		const at = this.fetchedAt.get(attachmentId);
		const scan = this.scans.get(attachmentId);
		const maxAge = scan?.status === 'pending' ? PENDING_POLL_MS : STALE_AFTER_MS;
		if ((at !== undefined && Date.now() - at < maxAge) || this.inflight.has(attachmentId)) return;
		this.inflight.add(attachmentId);
		this.queued.add(attachmentId);
		this.flushTimer ??= setTimeout(() => void this.flush(), BATCH_DELAY_MS);
	}

	private async flush(): Promise<void> {
		this.flushTimer = null;
		const ids = [...this.queued];
		this.queued.clear();
		const http = await getHttp();
		for (let i = 0; i < ids.length; i += MAX_BATCH) {
			const chunk = ids.slice(i, i + MAX_BATCH);
			try {
				const res = await http.post<{scans: Record<string, VirusTotalScan | null>}>('/virustotal/lookup', {
					body: {attachment_ids: chunk},
				});
				runInAction(() => {
					for (const id of chunk) this.scans.set(id, res.body.scans[id] ?? null);
				});
				for (const id of chunk) this.fetchedAt.set(id, Date.now());
			} catch {
				// Try again a while later rather than in a tight loop.
				for (const id of chunk) this.fetchedAt.set(id, Date.now() - STALE_AFTER_MS / 2);
			} finally {
				for (const id of chunk) this.inflight.delete(id);
			}
		}
	}

	/** Asks the server to check an attachment; upload sends the file when VirusTotal doesn't know it. */
	async scan(
		channelId: string,
		messageId: string,
		attachmentId: string,
		upload: boolean,
	): Promise<{scan: VirusTotalScan | null; error: VirusTotalError | null}> {
		const http = await getHttp();
		runInAction(() => this.checking.add(attachmentId));
		let res: {body: {scan: VirusTotalScan | null; error: VirusTotalError | null}};
		try {
			res = await http.post<{scan: VirusTotalScan | null; error: VirusTotalError | null}>(
				`/channels/${channelId}/messages/${messageId}/virustotal`,
				{body: {attachment_id: attachmentId, upload}},
			);
		} finally {
			runInAction(() => this.checking.delete(attachmentId));
		}
		if (res.body.scan) {
			const scan = res.body.scan;
			runInAction(() => this.scans.set(attachmentId, scan));
			this.fetchedAt.set(attachmentId, Date.now());
		}
		if (res.body.error === 'not_configured') this.setConfig({configured: false, can_configure: this.canConfigure});
		return res.body;
	}

	/** Saves (or with null, removes) the instance's API key. Admins only. */
	async saveApiKey(apiKey: string | null): Promise<{configured: boolean; error: 'invalid_key' | 'failed' | null}> {
		const http = await getHttp();
		const res = await http.put<{configured: boolean; error: 'invalid_key' | 'failed' | null}>('/virustotal/config', {
			body: {api_key: apiKey},
		});
		this.setConfig({configured: res.body.configured, can_configure: true});
		return res.body;
	}
}

const VirusTotal = new VirusTotalStore();
export default VirusTotal;
