#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Checks the web app after changes: stops a leftover watcher, regenerates CSS types,
# extracts and compiles translations, then typechecks. Run with `dev.sh watch` stopped
# (they need a lot of memory together).
#
#   sparkcord/dev/check.sh

set -uo pipefail

DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEV_DIR/../.." && pwd)"

# A watcher whose terminal was closed leaves these behind.
if command -v powershell >/dev/null 2>&1; then
	powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'rspack' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" >/dev/null 2>&1
fi
rm -f "$DEV_DIR/stack/.watching"

cd "$REPO_DIR/fluxer_app"
status=0
run() {
	local label="$1"
	shift
	if "$@" >"/tmp/sparkcord-check-$label.log" 2>&1; then
		echo "$label: ok"
	else
		echo "$label: FAILED"
		grep -v '^ *[0-9]*: 0000' "/tmp/sparkcord-check-$label.log" | head -25 | cut -c1-240
		status=1
	fi
}
run css-types npx --no-install tsx scripts/GenerateCssTypes.ts
run extract npx --no-install lingui extract --clean
run compile npx --no-install lingui compile --strict
run typecheck npx --no-install tsc --noEmit -p .
exit $status
