# Swapping a vanilla Fluxer server for Sparkcord

Notes for an agent (or person) who runs a self-hosted Fluxer server from the official
compose bundle and wants it to run Sparkcord instead, keeping all data.

Sparkcord is a fork of Fluxer, based on `fluxer-release@2026.1113.182945`. It replaces
three containers and adds two. Everything else keeps running the released Fluxer images.

**Status:** this exact procedure has only been run on the local test stack
(`sparkcord/dev/dev.sh`, plain HTTP on localhost). It has not yet been run against a
production server. Take a backup first and read every step before running it.

## What changes

| Piece | Vanilla | Sparkcord |
| --- | --- | --- |
| `api`, `worker` | `ghcr.io/fluxerapp/fluxer-api` | the same image with Sparkcord's API bundle on top (`sparkcord/dev/Dockerfile.api`) |
| `app-proxy` | `ghcr.io/fluxerapp/fluxer-app-proxy-self-hosted` | the same image serving Sparkcord's web app (`sparkcord/dev/Dockerfile.app`) |
| `tracker` | none | new: WebTorrent tracker and STUN/TURN list for peer-to-peer file sharing (`sparkcord/dev/tracker`) |
| `turn` | none | new: coturn relay, port 3478 UDP and TCP |
| edge (Caddy) | bundle's Caddyfile | two extra snippets in `caddy.d/` |
| gateway, media proxy, LiveKit, Postgres, the rest | released images | unchanged |

The app proxy binary itself is the upstream one. Changes to `fluxer_app_proxy` Rust code
do not ship; response headers that need to differ are set by the edge snippets.

## Data

Sparkcord only adds tables; it does not change or remove existing ones. The API creates
missing tables at startup from `tools/dev/cassandra_target_schema.json`. The added
tables are:

`tuppers`, `tupper_settings`, `tupper_messages`, `name_fonts`, `group_name_colors`,
`personal_expressions`, `personal_expressions_by_user`, `soundboard_sounds`,
`soundboard_sounds_by_owner`.

Personal emoji and sticker images use the existing `emojis/{id}` and `stickers/{id}`
paths in the CDN bucket; soundboard audio is stored at `soundboard/{id}` in the same
bucket.

Going back to vanilla is a matter of removing the override file (see "Rolling back").
The extra tables stay behind unused. Messages that use Sparkcord-only features (tupper
proxies, extended markdown, peer-to-peer file links, personal emojis) show as plain text
or unknown emojis on vanilla.

## Requirements

- The server runs the official compose bundle of **Fluxer 2026.1113.182945**. On another
  version, update Fluxer first, or rebase Sparkcord onto that release and change the
  base image digests in the two Dockerfiles. Mixing versions is untested.
- A build machine with Docker, Node.js 26, Git Bash or a Unix shell, `curl` and
  `openssl`. pnpm is run through `npx` when it isn't installed. The web app image is
  built inside Docker (it compiles Rust to WebAssembly), which needs about 8 GB of free
  memory and a few GB of disk.
- Port **3478** (UDP and TCP) and UDP **49160-49200** reachable from the internet for
  the TURN relay.

## Steps

All paths are relative to the Sparkcord checkout unless they start with `$STACK`, which
is the directory on the server that holds Fluxer's `docker-compose.yml` and `.env`.

### 1. Back up

Stop writes or accept a moment of inconsistency, then back up the Postgres volume and
the object store (SeaweedFS volume or your external bucket), plus `$STACK/.env`.

### 2. Build the images

On the build machine:

```sh
git clone https://github.com/Sparkwave2/sparkcord.git && cd sparkcord
git checkout sparkcord
sparkcord/dev/dev.sh build
```

`dev.sh build` runs `build-api` then `build-app` and produces:

- `sparkcord/fluxer-api:dev`
- `sparkcord/fluxer-app-proxy:dev`

Optional assets, before `build-app`:

- Preset theme backgrounds: put images in `sparkcord/theme-images/` (see its README),
  then `sparkcord/dev/dev.sh theme-images`. They are not in the repository. Without
  them the preset themes have no background picture.
- Game BIOS files: `fluxer_app/assets/assets/emulatorjs/bios/` (see the README there).
  `build-app` fetches EmulatorJS itself.

Build the tracker image too:

```sh
docker build -t sparkcord/tracker:dev sparkcord/dev/tracker
```

If the build machine is not the server, move the three images across
(`docker save sparkcord/fluxer-api:dev sparkcord/fluxer-app-proxy:dev sparkcord/tracker:dev | ssh server docker load`),
or push them to a registry you control and set `SPARKCORD_API_IMAGE` /
`SPARKCORD_APP_IMAGE` in `.env` to those names. With a registry, also remove the
`pull_policy: never` lines from the override file.

### 3. Add the override and the edge snippets

Copy to the server:

| From the checkout | To |
| --- | --- |
| `sparkcord/dev/docker-compose.sparkcord.yml` | `$STACK/docker-compose.sparkcord.yml` |
| `sparkcord/dev/tracker/tracker.caddy` | `$STACK/caddy.d/sparkcord-tracker.caddy` |
| `sparkcord/dev/emulatorjs.caddy` | `$STACK/caddy.d/sparkcord-emulatorjs.caddy` |

In the copied override file, the `tracker` service has `build: ../tracker`. That path
only exists in the checkout. Delete that line on the server (the image is already
built), or copy `sparkcord/dev/tracker` next to it and fix the path.

The bundle's Caddyfile imports `/etc/caddy/conf.d/*.caddy`, and its compose file mounts
`./caddy.d` there. If your edge is your own reverse proxy instead of the bundled one,
add equivalent rules: `/tracker` to `tracker:8000` (WebSocket), `/tracker-ice`
rewritten to `/ice` on `tracker:8001`, and for `/assets/emulatorjs/*` the relaxed
`X-Frame-Options` and `Content-Security-Policy` from `emulatorjs.caddy`.

### 4. Settings

Add to `$STACK/.env`:

```sh
SPARKCORD_TURN_SECRET=<output of: openssl rand -hex 32>
```

Do **not** copy the local test stack's voice settings. `dev.sh up` sets
`FLUXER_LIVEKIT_NODE_IP` to a LAN address and `FLUXER_LIVEKIT_USE_EXTERNAL_IP=false`
because a local stack can't be reached on its public address. A real server keeps
Fluxer's defaults.

### 5. Swap

```sh
cd $STACK
docker compose -f docker-compose.yml -f docker-compose.sparkcord.yml up -d
docker compose -f docker-compose.yml -f docker-compose.sparkcord.yml restart edge
```

Use the same `-p` project name and the same extra `-f` files (object store, proxy,
IPv6 and so on) that the server already uses; add the Sparkcord file last. Only `api`,
`worker` and `app-proxy` are recreated, and `tracker` and `turn` are created. Users see
a short reconnect.

### 6. Check

- `docker compose ... ps`: `api`, `worker`, `app-proxy` healthy; `tracker` and `turn` up.
- `curl -s https://<domain>/tracker-ice` returns JSON with a `turn:` entry.
- `docker compose ... logs api | grep -i schema` shows no errors (the new tables are
  created on first start).
- In the web app (hard refresh): Settings has "My emojis & stickers" and "Soundboard";
  sending `==highlight==` renders highlighted; a `.glb` attachment shows a 3D viewer.
- Do not run `sparkcord/dev/smoke-test.mjs` against a real server: it is written for
  the local stack and deletes the test account's tuppers.

## Rolling back

```sh
cd $STACK
docker compose -f docker-compose.yml up -d --remove-orphans
```

That recreates `api`, `worker` and `app-proxy` from the released images and removes
`tracker` and `turn`. Delete the two `sparkcord-*.caddy` files and restart `edge`.

## Updating Sparkcord later

Pull, rerun `sparkcord/dev/dev.sh build`, move the images if needed, and rerun the
`up -d` command from step 5. Each web app build gets a new version string, so browsers
drop the previous build's cached files.

## Desktop app

`sparkcord/dev/desktop.sh` builds the Windows desktop app
(`fluxer_desktop/dist-electron/win-unpacked/Sparkcord.exe`). Its sign-in offers Fluxer
and the instance in `SPARKCORD_INSTANCE_URL` (default
`https://sparkcord.watermelon.quest`). `--local` also lists `http://localhost:8090` for
testing. It has no auto-updater and is not code-signed, so Windows SmartScreen warns on
first start. The script reuses the web app's WebAssembly modules from `fluxer_app/pkgs`
(`dev.sh sync-wasm`) because a host build of them needs a clang that targets wasm32.
It is the "development" channel of the Fluxer desktop app under a new name, so its data
lives in `%APPDATA%\fluxerdevelopment-distro`. Only the Windows build has been made and
tested.

## Local test stack

`sparkcord/dev/dev.sh setup && sparkcord/dev/dev.sh build && sparkcord/dev/dev.sh up`
starts everything on http://localhost:8090. `dev.sh watch` rebuilds the web app on file
changes. The header of `dev.sh` lists every command.

## Features Sparkcord adds

Tuppers (proxy members, with Tupperbox and PluralKit import), typing-indicator toggles,
preset themes, role name styles, name fonts, peer-to-peer file sharing, in-app PDF
viewer, extended markdown (rules, task lists, images, highlight, super/subscript, math,
footnotes), per-user name colours in group chats, personal emojis and stickers, a
soundboard (personal and per community), in-app play of game ROMs (EmulatorJS), an
inline 3D model viewer, and the desktop app with per-application screen-share audio.
