// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: ad and tracker blocking for the desktop app. The uBlock Origin extension
// itself can't run here (this Electron no longer loads its extension format), so this
// uses Ghostery's open-source engine with uBlock Origin's own filter lists, EasyList and
// EasyPrivacy: network blocking, element hiding and uBlock's anti-ad scripts.
//
// It applies to everything embedded in the app (YouTube and other players, the radio,
// anything in an iframe) in every window. The app's own traffic to its instance is left
// alone on purpose, so a filter can never break chat, media or voice.
//
// The lists are downloaded on first start, kept as a compiled file in the user data
// folder and refreshed every few days. On by default; a switch in the desktop settings
// turns it off for this device.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {adsAndTrackingLists, FiltersEngine, Request} from '@ghostery/adblocker';
import {
	app,
	ipcMain,
	net,
	type Session,
	type WebContents,
	type WebFrameMain,
	webContents,
	webFrameMain,
} from 'electron';
import log from 'electron-log';

const SETTINGS_FILE = 'sparkcord-adblock.json';
const ENGINE_FILE = 'sparkcord-adblock-engine.bin';
const REFRESH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000;

export interface AdBlockStatus {
	enabled: boolean;
	/** The filter lists are loaded. False until the first download has finished. */
	ready: boolean;
	/** Requests blocked since the app started. */
	blocked: number;
	/** When the lists in use were downloaded (ms since epoch), or null. */
	listsUpdatedAt: number | null;
}

let enabled = true;
let engine: FiltersEngine | null = null;
let listsUpdatedAt: number | null = null;
let blocked = 0;
let refreshing = false;
let lastFailureAt = 0;

const userDataFile = (name: string): string => path.join(app.getPath('userData'), name);

function readEnabled(): boolean {
	try {
		const parsed = JSON.parse(fs.readFileSync(userDataFile(SETTINGS_FILE), 'utf8')) as {enabled?: unknown};
		return parsed.enabled !== false;
	} catch {
		return true;
	}
}

function writeEnabled(value: boolean): void {
	try {
		fs.writeFileSync(userDataFile(SETTINGS_FILE), JSON.stringify({enabled: value}));
	} catch (error) {
		log.warn('[AdBlock] Could not save the setting:', error);
	}
}

function status(): AdBlockStatus {
	return {enabled, ready: engine !== null, blocked, listsUpdatedAt};
}

// ----- the filter lists -----

async function loadStoredEngine(): Promise<void> {
	const file = userDataFile(ENGINE_FILE);
	try {
		const [bytes, stat] = await Promise.all([fs.promises.readFile(file), fs.promises.stat(file)]);
		// Throws when the file was written by a different version of the engine.
		engine = FiltersEngine.deserialize(new Uint8Array(bytes));
		listsUpdatedAt = stat.mtimeMs;
	} catch {
		engine = null;
		listsUpdatedAt = null;
	}
}

async function refreshLists(): Promise<void> {
	if (refreshing) return;
	refreshing = true;
	try {
		const fresh = await FiltersEngine.fromLists((url: string) => net.fetch(url), adsAndTrackingLists);
		const file = userDataFile(ENGINE_FILE);
		const temporary = `${file}.tmp`;
		await fs.promises.writeFile(temporary, fresh.serialize());
		await fs.promises.rename(temporary, file);
		engine = fresh;
		listsUpdatedAt = Date.now();
		log.info('[AdBlock] Filter lists updated');
	} catch (error) {
		lastFailureAt = Date.now();
		log.warn('[AdBlock] Could not update the filter lists:', error);
	} finally {
		refreshing = false;
	}
}

function refreshListsIfDue(): void {
	if (!enabled) return;
	const now = Date.now();
	if (now - lastFailureAt < RETRY_AFTER_FAILURE_MS) return;
	if (engine !== null && listsUpdatedAt !== null && now - listsUpdatedAt < REFRESH_AFTER_MS) return;
	void refreshLists();
}

// ----- which requests are looked at -----

/**
 * The embedded frame a frame belongs to: its ancestor that sits directly in a window's
 * top document. Null for the top document itself (the app).
 */
function embedOf(frame: WebFrameMain | null | undefined): WebFrameMain | null {
	let current = frame ?? null;
	if (current === null || current.parent === null) return null;
	while (current.parent !== null && current.parent.parent !== null) current = current.parent;
	return current;
}

function isWebUrl(url: string): boolean {
	return url.startsWith('https://') || url.startsWith('http://');
}

function installRequestBlocking(session: Session): void {
	session.webRequest.onBeforeRequest(
		{urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*']},
		(details, callback) => {
			const current = engine;
			if (!enabled || current === null || details.resourceType === 'mainFrame') {
				callback({});
				return;
			}
			try {
				// A frame being loaded is asked for by its parent; everything else by its own frame.
				const asker = details.resourceType === 'subFrame' ? details.frame?.parent : details.frame;
				const embed = embedOf(asker);
				if (embed === null || !isWebUrl(embed.url)) {
					// From the app itself, or not from a frame at all: never touched.
					callback({});
					return;
				}
				const {match, redirect} = current.match(
					Request.fromRawDetails({url: details.url, sourceUrl: embed.url, type: details.resourceType}),
				);
				if (redirect !== undefined) {
					blocked += 1;
					callback({redirectURL: redirect.dataUrl});
					return;
				}
				if (match) {
					blocked += 1;
					callback({cancel: true});
					return;
				}
			} catch {
				// The frame went away mid-request, or the engine tripped: let the request through.
			}
			callback({});
		},
	);
}

// ----- element hiding and anti-ad scripts inside embedded frames -----

function styleInjection(css: string): string {
	return `(() => {
	const css = ${JSON.stringify(css)};
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(css);
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
	} catch {
		const add = () => {
			const style = document.createElement('style');
			style.textContent = css;
			(document.head || document.documentElement).appendChild(style);
		};
		if (document.documentElement) add();
		else document.addEventListener('readystatechange', add, {once: true});
	}
})();`;
}

function installFrameInjection(contents: WebContents): void {
	contents.on('did-frame-navigate', (_event, url, _code, _status, isMainFrame, frameProcessId, frameRoutingId) => {
		const current = engine;
		if (!enabled || current === null || isMainFrame || !isWebUrl(url)) return;
		try {
			const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
			if (!frame || embedOf(frame) === null) return;
			const {hostname, domain} = Request.fromRawDetails({url});
			const {active, scripts, styles} = current.getCosmeticsFilters({
				url,
				hostname,
				domain,
				getBaseRules: true,
				getInjectionRules: true,
				getExtendedRules: false,
				getRulesFromDOM: false,
				getRulesFromHostname: true,
			});
			if (!active) return;
			// The scripts must be in place before the page's own scripts get going.
			for (const script of scripts) void frame.executeJavaScript(script).catch(() => {});
			if (styles.length > 0) void frame.executeJavaScript(styleInjection(styles)).catch(() => {});
		} catch {
			// The frame is already gone.
		}
	});
}

// ----- start-up -----

/** Call once, after the app is ready. */
export function installSparkcordAdBlock(session: Session): void {
	enabled = readEnabled();
	ipcMain.handle('sparkcord-adblock-status', (): AdBlockStatus => status());
	ipcMain.handle('sparkcord-adblock-set-enabled', (_event, value: unknown): AdBlockStatus => {
		enabled = value === true;
		writeEnabled(enabled);
		refreshListsIfDue();
		return status();
	});
	installRequestBlocking(session);
	for (const contents of webContents.getAllWebContents()) installFrameInjection(contents);
	app.on('web-contents-created', (_event, contents) => installFrameInjection(contents));
	void loadStoredEngine().then(() => {
		refreshListsIfDue();
		setInterval(refreshListsIfDue, REFRESH_CHECK_MS).unref();
	});
}
