#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Builds the Sparkcord desktop app (Electron) for this machine. The result is an
# unpacked app folder in fluxer_desktop/dist-electron/.
#
#   sparkcord/dev/desktop.sh [instance-url]     default: http://localhost:8090
#   sparkcord/dev/desktop.sh --shell-only [...] reuse the last web app build
#
# Needs Node.js, Rust (with the MSVC tools on Windows) and the web app's WASM
# modules (dev.sh sync-wasm). Stop `dev.sh watch` first: both write fluxer_app/dist.

set -euo pipefail

DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEV_DIR/../.." && pwd)"
SHELL_ONLY=false
if [ "${1:-}" = "--shell-only" ]; then SHELL_ONLY=true; shift; fi

export SPARKCORD_INSTANCE_URL="${1:-http://localhost:8090}"
export BUILD_CHANNEL=development
export BUILD_VERSION="${BUILD_VERSION:-1.0.0}"
export NODE_ENV=production
export ELECTRON_ARCH="${ELECTRON_ARCH:-x64}"
# No auto-updater: there is no Sparkcord update feed.
export FLUXER_OFFLINE=1

if [ -f "$DEV_DIR/stack/.watching" ]; then
	echo "dev.sh watch is running. Stop it first." >&2
	exit 1
fi

cd "$REPO_DIR/fluxer_app"
if [ "$SHELL_ONLY" = false ]; then
	[ -f pkgs/libfluxcore/libfluxcore.js ] || bash "$DEV_DIR/dev.sh" sync-wasm
	echo ">> Building the web app for desktop..."
	node "$DEV_DIR/emulatorjs.mjs"
	npx --no-install lingui compile --strict >/dev/null
	rm -rf dist
	FLUXER_DESKTOP_RENDERER=true npx --no-install rspack build --mode production
fi

cd "$REPO_DIR/fluxer_desktop"
echo ">> Building the desktop shell and its native modules..."
rm -rf dist/renderer
mkdir -p dist
cp -r "$REPO_DIR/fluxer_app/dist" dist/renderer
rm -f dist/renderer/sw.js dist/renderer/sw.js.map
node scripts/build.mjs --use-shared-renderer

echo ">> Packaging..."
npx --no-install electron-builder --config electron-builder.config.cjs --dir "--$ELECTRON_ARCH"
echo ">> Done: $REPO_DIR/fluxer_desktop/dist-electron"
ls dist-electron
