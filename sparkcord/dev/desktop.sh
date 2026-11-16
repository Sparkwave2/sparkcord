#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Builds the Sparkcord desktop app (Electron) for this machine. The result is an
# unpacked app folder in fluxer_desktop/dist-electron/.
#
#   sparkcord/dev/desktop.sh                    release build: Fluxer + sparkcord.watermelon.quest
#   sparkcord/dev/desktop.sh --local            test build: also offers http://localhost:8090
#   sparkcord/dev/desktop.sh --shell-only [...] reuse the last web app build
#   sparkcord/dev/desktop.sh --package [...]    also make the files for the download page
#
# SPARKCORD_INSTANCE_URL overrides the main instance, SPARKCORD_LOCAL_URL the local one,
# SPARKCORD_DOWNLOAD_URL the download page (default https://watermelon.quest/sparkcord).
#
# The version comes from sparkcord/VERSION (or BUILD_VERSION). Raise it before a release:
# installed apps compare it with latest.json on the download page. --package writes
# Sparkcord-<version>-win-x64.zip, latest.json and index.html to
# fluxer_desktop/dist-electron/release/; upload that folder's contents to the page.
#
# Needs Node.js, Rust (with the MSVC tools on Windows) and the web app's WASM
# modules (dev.sh sync-wasm). Stop `dev.sh watch` first: both write fluxer_app/dist.

set -euo pipefail

DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEV_DIR/../.." && pwd)"
SHELL_ONLY=false
LOCAL=false
PACKAGE=false
for arg in "$@"; do
	case "$arg" in
		--shell-only) SHELL_ONLY=true ;;
		--local) LOCAL=true ;;
		--package) PACKAGE=true ;;
		*) echo "Unknown option: $arg" >&2; exit 1 ;;
	esac
done

export SPARKCORD_INSTANCE_URL="${SPARKCORD_INSTANCE_URL:-https://sparkcord.watermelon.quest}"
if [ "$LOCAL" = true ]; then
	export SPARKCORD_LOCAL_URL="${SPARKCORD_LOCAL_URL:-http://localhost:8090}"
else
	unset SPARKCORD_LOCAL_URL
fi
export BUILD_CHANNEL=development
export BUILD_VERSION="${BUILD_VERSION:-$(tr -d '[:space:]' <"$REPO_DIR/sparkcord/VERSION")}"
export SPARKCORD_DOWNLOAD_URL="${SPARKCORD_DOWNLOAD_URL:-https://watermelon.quest/sparkcord}"
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
	node "$DEV_DIR/ruffle.mjs"
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

if [ "$PACKAGE" = true ]; then
	echo ">> Packaging for the download page..."
	UNPACKED="$(find dist-electron -maxdepth 1 -type d -name '*unpacked' | head -n 1)"
	if [ -z "$UNPACKED" ]; then
		echo "No unpacked app folder found in dist-electron." >&2
		exit 1
	fi
	RELEASE_DIR="dist-electron/release"
	ZIP_NAME="Sparkcord-$BUILD_VERSION-win-$ELECTRON_ARCH.zip"
	rm -rf "$RELEASE_DIR"
	mkdir -p "$RELEASE_DIR"
	# A folder named Sparkcord inside the zip, so it unpacks tidily.
	rm -rf dist-electron/Sparkcord
	cp -r "$UNPACKED" dist-electron/Sparkcord
	(cd dist-electron && powershell.exe -NoProfile -Command "Compress-Archive -Path Sparkcord -DestinationPath 'release/$ZIP_NAME' -Force")
	rm -rf dist-electron/Sparkcord
	node "$DEV_DIR/release-files.mjs" "$RELEASE_DIR" "$BUILD_VERSION" "$ZIP_NAME"
	echo ">> Upload the contents of $REPO_DIR/fluxer_desktop/$RELEASE_DIR to $SPARKCORD_DOWNLOAD_URL"
	ls -la "$RELEASE_DIR"
fi
