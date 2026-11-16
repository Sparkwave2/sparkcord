// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fetches Ruffle (the Flash Player emulator, MIT/Apache-2.0, https://ruffle.rs) from npm
// into fluxer_app/assets/assets/ruffle/, which the web app serves at /assets/ruffle/.
// The files are not committed (about 29 MB); dev.sh and desktop.sh run this when they
// are missing. player.html / player.js are Sparkcord's own and are kept.
//
// Usage: node sparkcord/dev/ruffle.mjs [--force]

import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const VERSION = '0.7.1';
const KEEP = new Set(['player.html', 'player.js']);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'fluxer_app', 'assets', 'assets', 'ruffle');
const force = process.argv.includes('--force');

if (!force && existsSync(join(OUT_DIR, 'ruffle.js')) && existsSync(join(OUT_DIR, `.version-${VERSION}`))) {
	console.log('Ruffle is already in place.');
	process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const work = mkdtempSync(join(tmpdir(), 'sparkcord-ruffle-'));

try {
	console.log(`Fetching Ruffle ${VERSION}…`);
	const file = execFileSync(npm, ['pack', `@ruffle-rs/ruffle@${VERSION}`, '--silent', '--pack-destination', work], {
		cwd: work,
		encoding: 'utf8',
		shell: process.platform === 'win32',
	})
		.trim()
		.split(/\r?\n/)
		.pop();
	mkdirSync(join(work, 'out'));
	// Relative paths: GNU tar on Windows reads "C:" as a remote host.
	execFileSync('tar', ['-xzf', file, '-C', 'out'], {cwd: work});
	const pkg = join(work, 'out', 'package');
	mkdirSync(OUT_DIR, {recursive: true});
	for (const entry of readdirSync(OUT_DIR)) {
		if (!KEEP.has(entry)) rmSync(join(OUT_DIR, entry), {recursive: true, force: true});
	}
	for (const entry of readdirSync(pkg)) {
		// Source maps are large and not needed; package.json and the README stay behind.
		if (entry.endsWith('.map') || entry === 'package.json' || entry === 'README.md') continue;
		cpSync(join(pkg, entry), join(OUT_DIR, entry));
	}
	cpSync(join(pkg, 'LICENSE_MIT'), join(OUT_DIR, `.version-${VERSION}`));
	console.log(`Ruffle is in ${OUT_DIR}`);
} finally {
	rmSync(work, {recursive: true, force: true});
}
