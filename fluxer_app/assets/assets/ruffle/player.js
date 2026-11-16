// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: starts Ruffle for the SWF the parent page passes in the query string
// (swf = a same-origin blob: URL). The movie is cut off from everything outside
// itself: it can't call scripts on the page, load or send anything over the network,
// or open links.
(() => {
	const stage = document.getElementById('stage');
	const params = new URLSearchParams(window.location.search);
	const swf = params.get('swf') || '';
	if (!swf.startsWith('blob:')) {
		stage.textContent = 'Nothing to play.';
		return;
	}

	window.RufflePlayer = window.RufflePlayer || {};
	window.RufflePlayer.config = {publicPath: './', polyfills: false};

	const script = document.createElement('script');
	script.src = 'ruffle.js';
	script.onerror = () => {
		stage.textContent = 'The Flash player is not installed on this server.';
	};
	script.onload = async () => {
		try {
			const bytes = new Uint8Array(await (await fetch(swf)).arrayBuffer());
			const player = window.RufflePlayer.newest().createPlayer();
			stage.appendChild(player);
			const api = typeof player.ruffle === 'function' ? player.ruffle() : player;
			await api.load({
				data: bytes,
				allowScriptAccess: false,
				allowNetworking: 'none',
				openUrlMode: 'deny',
				autoplay: 'on',
				unmuteOverlay: 'hidden',
				splashScreen: false,
				letterbox: 'on',
				contextMenu: 'on',
				warnOnUnsupportedContent: false,
				upgradeToHttps: false,
				logLevel: 'error',
			});
			player.focus();
		} catch (error) {
			stage.textContent = 'This Flash file could not be played.';
			console.error(error);
		}
	};
	document.body.appendChild(script);
})();
