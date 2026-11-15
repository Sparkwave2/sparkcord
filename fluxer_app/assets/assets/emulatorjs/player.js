// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: starts EmulatorJS for the ROM the parent page passes in the query string
// (core, name, rom = a same-origin blob: URL). Saves and save states stay in this
// browser (EmulatorJS's IndexedDB storage, keyed by the game name). BIOS files are
// picked up from ./bios/ when present.
(() => {
	const params = new URLSearchParams(window.location.search);
	const core = params.get('core') || '';
	const rom = params.get('rom') || '';
	const name = params.get('name') || 'game';
	const color = params.get('color') || '#a855f7';
	if (!core || !rom.startsWith('blob:')) {
		document.body.textContent = 'Nothing to play.';
		return;
	}

	// Known BIOS file names per system; the first one found in ./bios/ is used.
	const BIOS = {
		psx: ['scph5501.bin', 'scph1001.bin', 'scph7001.bin', 'scph5500.bin', 'scph5502.bin', 'scph101.bin'],
		gba: ['gba_bios.bin'],
		lynx: ['lynxboot.img'],
		pce: ['syscard3.pce'],
		atari7800: ['7800 BIOS (U).rom'],
	};

	async function findBios() {
		for (const file of BIOS[core] || []) {
			const url = `bios/${encodeURIComponent(file)}`;
			try {
				const response = await fetch(url, {method: 'HEAD', cache: 'no-store'});
				const type = response.headers.get('content-type') || '';
				if (response.ok && !type.includes('text/html')) return url;
			} catch {
				// Not there.
			}
		}
		return '';
	}

	// EmulatorJS checks its CDN for updates in debug mode; Sparkcord ships a fixed version
	// and loads nothing third-party, so answer that request locally.
	const realFetch = window.fetch.bind(window);
	window.fetch = (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
		if (url.startsWith('https://cdn.emulatorjs.org/')) return Promise.resolve(new Response('{}', {status: 404}));
		return realFetch(input, init);
	};

	findBios().then((biosUrl) => {
		window.EJS_player = '#game';
		window.EJS_core = core;
		window.EJS_gameUrl = rom;
		window.EJS_gameName = name;
		window.EJS_pathtodata = './';
		window.EJS_startOnLoaded = true;
		window.EJS_color = color;
		window.EJS_backgroundColor = '#000';
		window.EJS_DEBUG_XX = true;
		window.EJS_threads = false;
		if (biosUrl) window.EJS_biosUrl = biosUrl;
		const script = document.createElement('script');
		script.src = 'loader.js';
		document.body.appendChild(script);
	});
})();
