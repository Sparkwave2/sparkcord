// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Wraps fluxer_app/rspack.config.mjs for `dev.sh watch`. Something in the base config
// depends on the fluxer_app directory itself, and each build's clean of dist/ changes
// it, so plain `rspack --watch` rebuilds forever. Source files are still tracked one by
// one, so ignoring the bare directory (plus dist and node_modules) is safe.

import base from '../../fluxer_app/rspack.config.mjs';

export default async (env, argv) => {
	const config = typeof base === 'function' ? await base(env, argv) : base;
	config.watchOptions = {
		...config.watchOptions,
		aggregateTimeout: 300,
		ignored: /[\\/]fluxer_app[\\/]?$|[\\/](dist|node_modules|\.git)[\\/]/,
	};
	return config;
};
