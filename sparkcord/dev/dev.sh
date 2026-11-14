#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Local Sparkcord test environment. Runs the released Fluxer compose stack with
# the API and web app replaced by locally built Sparkcord images.
#
#   sparkcord/dev/dev.sh setup       download the compose bundle, write .env
#   sparkcord/dev/dev.sh build       build-api + build-app
#   sparkcord/dev/dev.sh build-api   bundle fluxer_api and build its image (fast)
#   sparkcord/dev/dev.sh build-app   build the web app image (~3 min after the first build)
#   sparkcord/dev/dev.sh watch       rebuild the web app on file changes and serve it (fast)
#   sparkcord/dev/dev.sh sync-wasm   refresh the host's WASM modules after Rust changes
#   sparkcord/dev/dev.sh theme-images convert sparkcord/theme-images/* for the preset themes
#   sparkcord/dev/dev.sh up          start everything on http://localhost:8090
#   sparkcord/dev/dev.sh down        stop (keeps data)
#   sparkcord/dev/dev.sh logs [svc]  follow logs
#   sparkcord/dev/dev.sh token       print the first-admin setup token
#   sparkcord/dev/dev.sh clean       stop, delete data volumes, images and build cache
#
# Works in Git Bash on Windows, Linux and macOS. Needs Docker, curl, openssl
# and Node.js (pnpm is run through npx when it isn't installed).

set -euo pipefail

FLUXER_VERSION="2026.1113.182945"
PORT="${SPARKCORD_PORT:-8090}"
DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEV_DIR/../.." && pwd)"
STACK_DIR="$DEV_DIR/stack"
API_IMAGE="sparkcord/fluxer-api:dev"
ASSETS_IMAGE="sparkcord/app-assets:dev"
APP_IMAGE="sparkcord/fluxer-app-proxy:dev"

pnpm_cmd() {
	if command -v pnpm >/dev/null 2>&1; then pnpm "$@"; else npx -y pnpm@11.27.0 "$@"; fi
}

compose() {
	# Secret the tracker signs short-lived TURN credentials with (P2P file sharing).
	if [ -f "$STACK_DIR/.env" ] && [ -z "$(get_env SPARKCORD_TURN_SECRET)" ]; then
		set_env SPARKCORD_TURN_SECRET "$(openssl rand -hex 32)"
	fi
	local files=(-f docker-compose.yml -f "$DEV_DIR/docker-compose.sparkcord.yml")
	# While `dev.sh watch` runs, the app proxy serves fluxer_app/dist from the host.
	[ -f "$STACK_DIR/.watching" ] && files+=(-f "$DEV_DIR/docker-compose.watch.yml")
	(cd "$STACK_DIR" && docker compose -p sparkcord "${files[@]}" "$@")
}

set_env() {
	local key="$1" value="$2" file="$STACK_DIR/.env" tmp
	tmp="$(mktemp)"
	awk -v k="$key" -v v="$value" '
		BEGIN { done = 0 }
		$0 ~ "^#? ?" k "=" { if (!done) { print k "=" v; done = 1 }; next }
		{ print }
		END { if (!done) print k "=" v }
	' "$file" >"$tmp"
	mv "$tmp" "$file"
}

get_env() {
	grep -E "^$1=" "$STACK_DIR/.env" | tail -n1 | cut -d= -f2-
}

rand_hex() { openssl rand -hex 32; }

cmd_setup() {
	mkdir -p "$STACK_DIR"
	if [ ! -f "$STACK_DIR/docker-compose.yml" ]; then
		echo "Downloading the Fluxer $FLUXER_VERSION compose bundle..."
		curl -fsSL \
			"https://github.com/fluxerapp/fluxer/releases/download/fluxer-release%40$FLUXER_VERSION/fluxer-compose-$FLUXER_VERSION.tar.gz" \
			-o "$STACK_DIR/bundle.tar.gz"
		tar -xzf "$STACK_DIR/bundle.tar.gz" -C "$STACK_DIR"
		rm "$STACK_DIR/bundle.tar.gz"
	fi
	if [ -f "$STACK_DIR/.env" ]; then
		echo "$STACK_DIR/.env already exists; keeping it (delete it to start over)."
		return
	fi
	cp "$STACK_DIR/.env.example" "$STACK_DIR/.env"
	for key in POSTGRES_PASSWORD MEILI_MASTER_KEY FLUXER_S3_SECRET_KEY FLUXER_SUDO_MODE_SECRET \
		FLUXER_CONNECTION_INITIATION_SECRET FLUXER_PROFILE_PSEUDONYM_SECRET FLUXER_GATEWAY_RPC_AUTH_TOKEN \
		FLUXER_ERLANG_COOKIE FLUXER_MEDIA_PROXY_SECRET_KEY FLUXER_ADMIN_SECRET_KEY_BASE \
		FLUXER_ADMIN_OAUTH_CLIENT_SECRET LIVEKIT_API_SECRET FLUXER_SETUP_TOKEN; do
		set_env "$key" "$(rand_hex)"
	done
	set_env FLUXER_MEDIA_PROXY_UPLOAD_RELAY_SECRET_BASE64 "$(openssl rand -base64 32)"
	local pem
	pem="$(mktemp)"
	openssl ecparam -name prime256v1 -genkey -noout -out "$pem"
	set_env FLUXER_VAPID_PUBLIC_KEY \
		"$(openssl ec -in "$pem" -pubout -outform DER 2>/dev/null | tail -c 65 | base64 | tr '/+' '_-' | tr -d '=\n')"
	set_env FLUXER_VAPID_PRIVATE_KEY \
		"$(openssl ec -in "$pem" -outform DER 2>/dev/null | tail -c +8 | head -c 32 | base64 | tr '/+' '_-' | tr -d '=\n')"
	rm -f "$pem"
	# Plain HTTP on localhost, no certificates needed.
	set_env FLUXER_DOMAIN localhost
	set_env FLUXER_PUBLIC_SCHEME http
	set_env FLUXER_PUBLIC_PORT "$PORT"
	set_env FLUXER_PUBLIC_ORIGIN "http://localhost:$PORT"
	set_env FLUXER_HTTP_PORT "$PORT"
	set_env FLUXER_HTTPS_PORT "$((PORT + 363))"
	set_env FLUXER_EDGE_SITE_ADDRESS "http://localhost"
	set_env FLUXER_EDGE_PROTOCOLS "h1 h2"
	set_env FLUXER_EDGE_LISTEN_ADDRESS 127.0.0.1
	echo "Wrote $STACK_DIR/.env"
}

cmd_build_api() {
	echo "Bundling fluxer_api..."
	(cd "$REPO_DIR" && pnpm_cmd install --frozen-lockfile --filter "fluxer_api..." >/dev/null)
	(cd "$REPO_DIR" && pnpm_cmd --filter fluxer_api run build)
	docker build -f "$DEV_DIR/Dockerfile.api" -t "$API_IMAGE" "$REPO_DIR/fluxer_api/dist"
}

cmd_build_app() {
	echo "Building the web app (this compiles Rust/WASM and the SPA inside Docker)..."
	# A unique version per build makes browsers' service workers drop cached assets from
	# the previous build; reusing one version can mix old and new chunks and break startup.
	local version
	version="sparkcord-dev-$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo local)-$(date +%s)"
	# app-dist is the raw build output: skips brotli precompression (~2 min) and keeps
	# source maps. The app proxy serves uncompressed files when there's no .br sibling.
	docker build -f "$REPO_DIR/fluxer_app_proxy/Dockerfile" --target app-dist \
		--build-arg BUILD_VERSION="$version" -t "$ASSETS_IMAGE" "$REPO_DIR"
	docker build -f "$DEV_DIR/Dockerfile.app" --build-arg ASSETS_IMAGE="$ASSETS_IMAGE" -t "$APP_IMAGE" "$DEV_DIR"
}

# Copies the WASM modules and generated sources that need Rust out of the Docker
# build, so the web app can be built on the host. Rerun after changing Rust code.
cmd_sync_wasm() {
	echo "Building the WASM modules in Docker and copying them to fluxer_app..."
	local image="sparkcord/app-build:tmp" cid
	docker build -q -f "$REPO_DIR/fluxer_app_proxy/Dockerfile" --target app-build 		--build-arg BUILD_VERSION="sparkcord-dev-wasm" -t "$image" "$REPO_DIR" >/dev/null
	cid="$(docker create "$image")"
	for path in pkgs/libfluxcore pkgs/libfluxwebp pkgs/markdown_parser src/features/theme/styles/generated 		src/features/ui/components/SVGMasks.tsx src/features/ui/constants/AvatarStatusGeometry.ts; do
		rm -rf "$REPO_DIR/fluxer_app/$path"
		docker cp -q "$cid:/usr/src/app/fluxer_app/$path" "$REPO_DIR/fluxer_app/$path"
	done
	docker rm "$cid" >/dev/null
	docker image rm "$image" >/dev/null
}

# Fast web-app iteration: rspack rebuilds fluxer_app/dist on the host when a file
# changes (~25 s), and the app proxy serves it directly. Refresh the browser to see
# changes. Ctrl+C stops watching and switches back to the image's built-in assets.
cmd_watch() {
	[ -f "$REPO_DIR/fluxer_app/pkgs/libfluxcore/libfluxcore.js" ] || cmd_sync_wasm
	(cd "$REPO_DIR/fluxer_app" && npx --no-install lingui compile --strict >/dev/null)
	mkdir -p "$REPO_DIR/fluxer_app/dist"
	touch "$STACK_DIR/.watching"
	trap 'rm -f "$STACK_DIR/.watching"; echo; echo "Restoring the built-in web app..."; compose up -d app-proxy' EXIT
	compose up -d app-proxy
	echo "Watching fluxer_app. The first build takes ~1.5 min; then refresh http://localhost:$PORT after each rebuild."
	cd "$REPO_DIR/fluxer_app"
	# The proxy reads index.html once at startup, so restart it after every rebuild.
	BUILD_VERSION="sparkcord-watch-$(date +%s)" npx --no-install rspack build --mode production --watch -c "$DEV_DIR/rspack.watch.mjs" 2>&1 |
		while IFS= read -r line; do
			case "$line" in
				*"Conflicting order"* | *"│"* | *"├"* | *"╰"* | *"╭"*) ;;
				*"compiled"*)
					echo "$line"
					compose restart app-proxy >/dev/null 2>&1 && echo ">> Ready: refresh http://localhost:$PORT"
					;;
				*) echo "$line" ;;
			esac
		done
}

cmd_up() {
	[ -f "$STACK_DIR/.env" ] || cmd_setup
	# The edge loads extra routes from caddy.d; add the P2P tracker routes.
	cp "$DEV_DIR/tracker/tracker.caddy" "$STACK_DIR/caddy.d/sparkcord-tracker.caddy"
	compose up -d --build tracker turn
	compose up -d
	compose restart edge >/dev/null
	echo
	echo "Sparkcord is starting at http://localhost:$PORT"
	echo "First admin setup token: $(get_env FLUXER_SETUP_TOKEN)"
	echo "Follow progress with: sparkcord/dev/dev.sh logs"
}

cmd_clean() {
	compose down -v --remove-orphans || true
	docker image rm "$API_IMAGE" "$APP_IMAGE" "$ASSETS_IMAGE" 2>/dev/null || true
	docker builder prune -f >/dev/null || true
	echo "Removed containers, volumes, Sparkcord images and build cache."
}

case "${1:-}" in
	setup) cmd_setup ;;
	build) cmd_build_api && cmd_build_app ;;
	build-api) cmd_build_api ;;
	build-app) cmd_build_app ;;
	watch) cmd_watch ;;
	sync-wasm) cmd_sync_wasm ;;
	theme-images) node "$DEV_DIR/theme-images.mjs" ;;
	up) cmd_up ;;
	down) compose down ;;
	logs) shift; compose logs -f --tail=100 "$@" ;;
	ps) compose ps ;;
	token) get_env FLUXER_SETUP_TOKEN ;;
	clean) cmd_clean ;;
	*) sed -n '4,20p' "$0"; exit 1 ;;
esac
