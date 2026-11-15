// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fetches EmulatorJS (GPL-3.0, https://github.com/EmulatorJS/EmulatorJS) and the
// emulator cores Sparkcord uses from npm into fluxer_app/assets/assets/emulatorjs/,
// which the web app serves at /assets/emulatorjs/. The files are not committed (about
// 70 MB); dev.sh runs this when they are missing. player.html / player.js and the bios/
// folder are Sparkcord's own and are kept.
//
// Usage: node sparkcord/dev/emulatorjs.mjs [--force]

import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const VERSION = '4.2.3';
const CORES = [
	'fceumm', // NES
	'snes9x', // SNES
	'gambatte', // Game Boy / Color
	'mgba', // Game Boy Advance
	'genesis_plus_gx', // Master System, Game Gear, Mega Drive
	'mupen64plus_next', // Nintendo 64
	'melonds', // Nintendo DS
	'pcsx_rearmed', // PlayStation
	'mednafen_pce', // PC Engine
	'stella2014', // Atari 2600
	'prosystem', // Atari 7800
	'handy', // Lynx
	'mednafen_ngp', // Neo Geo Pocket
	'mednafen_wswan', // WonderSwan
	'beetle_vb', // Virtual Boy
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'fluxer_app', 'assets', 'assets', 'emulatorjs');
const force = process.argv.includes('--force');

if (!force && existsSync(join(OUT_DIR, 'loader.js')) && existsSync(join(OUT_DIR, 'cores', 'pcsx_rearmed-wasm.data'))) {
	console.log('EmulatorJS is already in place.');
	process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const work = mkdtempSync(join(tmpdir(), 'sparkcord-emulatorjs-'));

function fetchPackage(name) {
	const destName = name.replace(/[@/]/g, '_');
	const dest = join(work, destName);
	mkdirSync(dest, {recursive: true});
	const file = execFileSync(npm, ['pack', `${name}@${VERSION}`, '--silent', '--pack-destination', work], {
		cwd: work,
		encoding: 'utf8',
		shell: process.platform === 'win32',
	})
		.trim()
		.split(/\r?\n/)
		.pop();
	// Relative paths: GNU tar on Windows reads "C:" as a remote host.
	execFileSync('tar', ['-xzf', file, '-C', destName], {cwd: work});
	return join(dest, 'package');
}

try {
	console.log(`Fetching EmulatorJS ${VERSION}…`);
	const player = fetchPackage('@emulatorjs/emulatorjs');
	for (const entry of ['loader.js', 'emulator.css', 'version.json', 'src', 'compression', 'localization']) {
		rmSync(join(OUT_DIR, entry), {recursive: true, force: true});
		cpSync(join(player, 'data', entry), join(OUT_DIR, entry), {recursive: true});
	}
	cpSync(join(player, 'LICENSE'), join(OUT_DIR, 'LICENSE'));
	const coresDir = join(OUT_DIR, 'cores');
	rmSync(coresDir, {recursive: true, force: true});
	mkdirSync(join(coresDir, 'reports'), {recursive: true});
	for (const core of CORES) {
		console.log(`  core ${core}`);
		const pkg = fetchPackage(`@emulatorjs/core-${core}`);
		for (const file of readdirSync(pkg)) {
			// Skip the threaded builds: they need cross-origin isolation, which the app doesn't use.
			if (file.endsWith('.data') && !file.includes('-thread-')) cpSync(join(pkg, file), join(coresDir, file));
		}
		if (existsSync(join(pkg, 'reports'))) cpSync(join(pkg, 'reports'), join(coresDir, 'reports'), {recursive: true});
	}
	mkdirSync(join(OUT_DIR, 'bios'), {recursive: true});
	console.log(`EmulatorJS is in ${OUT_DIR}`);
} finally {
	rmSync(work, {recursive: true, force: true});
}
