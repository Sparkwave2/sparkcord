// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Converts the theme preset background images in sparkcord/theme-images/ into the
// compressed WebP files the web app serves from /assets/theme-presets/:
//   <id>.webp        background, at most 2560 px wide
//   <id>-thumb.webp  card preview for Settings > Themes, 480 px wide
//
//   node sparkcord/dev/theme-images.mjs        (also run by `dev.sh theme-images`)

import {existsSync, mkdirSync, readdirSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_DIR = join(ROOT, 'sparkcord', 'theme-images');
const OUT_DIR = join(ROOT, 'fluxer_app', 'assets', 'assets', 'theme-presets');
// sharp is a dependency of the web app.
const sharp = createRequire(join(ROOT, 'fluxer_app', 'package.json'))('sharp');

const PRESET_IDS = [
	'starry-night',
	'forest-mist',
	'ocean-depths',
	'cherry-blossom',
	'synthwave-sunset',
	'rainy-cafe',
	'aurora',
	'pastel-clouds',
	'blue-diva',
	'red-diva',
];
const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.tif', '.tiff'];

mkdirSync(OUT_DIR, {recursive: true});
const files = existsSync(SOURCE_DIR) ? readdirSync(SOURCE_DIR) : [];
let converted = 0;
for (const id of PRESET_IDS) {
	const source = files.find(
		(name) => name.slice(0, name.length - extname(name).length).toLowerCase() === id && EXTENSIONS.includes(extname(name).toLowerCase()),
	);
	if (!source) {
		console.log(`  -     ${id}: no image (the theme uses its gradient)`);
		continue;
	}
	const input = join(SOURCE_DIR, source);
	const background = join(OUT_DIR, `${id}.webp`);
	const thumb = join(OUT_DIR, `${id}-thumb.webp`);
	await sharp(input, {animated: false})
		.rotate()
		.resize({width: 2560, height: 1600, fit: 'inside', withoutEnlargement: true})
		.webp({quality: 80, effort: 5})
		.toFile(background);
	await sharp(input, {animated: false})
		.rotate()
		.resize({width: 480, height: 270, fit: 'cover', position: 'attention'})
		.webp({quality: 75})
		.toFile(thumb);
	const kb = (path) => Math.round(statSync(path).size / 1024);
	console.log(`  ok    ${id}: ${source} -> ${kb(background)} KB (+ ${kb(thumb)} KB preview)`);
	converted++;
}
console.log(`\n${converted} of ${PRESET_IDS.length} theme images converted into ${OUT_DIR}`);
