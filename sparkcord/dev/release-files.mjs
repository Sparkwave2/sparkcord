// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Writes the two small files that go next to the desktop app's zip on the download
// page (see desktop.sh --package and sparkcord/DOWNLOAD_PAGE.md):
//
//   latest.json  what installed apps read to learn about a newer version
//   index.html   the download page itself (sparkcord/download-page/index.html)
//
// Usage: node sparkcord/dev/release-files.mjs <release dir> <version> <zip file name>
// SPARKCORD_RELEASE_NOTES sets the short text shown in the app's update notice.

import {createHash} from 'node:crypto';
import {copyFileSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const [releaseDir, version, zipName] = process.argv.slice(2);
if (!releaseDir || !version || !zipName) {
	console.error('Usage: node release-files.mjs <release dir> <version> <zip file name>');
	process.exit(1);
}

const zipPath = join(releaseDir, zipName);
const latest = {
	version,
	notes: process.env.SPARKCORD_RELEASE_NOTES || '',
	windows: {
		file: zipName,
		size: statSync(zipPath).size,
		sha256: createHash('sha256').update(readFileSync(zipPath)).digest('hex'),
	},
	date: new Date().toISOString().slice(0, 10),
};
writeFileSync(join(releaseDir, 'latest.json'), `${JSON.stringify(latest, null, '\t')}\n`);

const page = join(dirname(fileURLToPath(import.meta.url)), '..', 'download-page', 'index.html');
copyFileSync(page, join(releaseDir, 'index.html'));
console.log(`Wrote latest.json (version ${version}) and index.html to ${releaseDir}`);
