// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Downloads the name fonts (packages/constants/src/NameFonts.ts) from Google Fonts as
// latin-subset WOFF2 into fluxer_app/assets/assets/name-fonts/, so the app serves them
// itself. Bold (700) is used where the font has it, since names are shown bold.
//   node sparkcord/dev/name-fonts.mjs

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'fluxer_app/assets/assets/name-fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const source = await readFile(path.join(ROOT, 'packages/constants/src/NameFonts.ts'), 'utf8');
const fonts = [...source.matchAll(/\{id: '([^']+)', family: '([^']+)'/g)].map(([, id, family]) => ({id, family}));

async function css(query) {
	const res = await fetch(`https://fonts.googleapis.com/css2?family=${query}&display=swap`, {headers: {'User-Agent': UA}});
	return res.ok ? res.text() : null;
}

function latinUrl(text) {
	const blocks = text.split('/* ');
	const latin = blocks.find((b) => b.startsWith('latin */')) ?? blocks.at(-1);
	return latin.match(/url\((https:[^)]+\.woff2)\)/)?.[1] ?? null;
}

await mkdir(OUT, {recursive: true});
let total = 0;
for (const {id, family} of fonts) {
	const name = family.replace(/ /g, '+');
	const text = (await css(`${name}:wght@700`)) ?? (await css(name));
	const url = text && latinUrl(text);
	if (!url) {
		console.error(`  ${id}: no WOFF2 found`);
		process.exitCode = 1;
		continue;
	}
	const data = Buffer.from(await (await fetch(url)).arrayBuffer());
	await writeFile(path.join(OUT, `${id}.woff2`), data);
	total += data.length;
	console.log(`  ${id}.woff2  ${(data.length / 1024).toFixed(0)} KB`);
}
console.log(`${fonts.length} fonts, ${(total / 1024).toFixed(0)} KB total -> ${path.relative(ROOT, OUT)}`);
