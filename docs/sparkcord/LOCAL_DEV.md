# Running Sparkcord locally

The local environment runs the released Fluxer Docker Compose stack, with two images
swapped for locally built ones:

- `sparkcord/fluxer-api:dev`: the released API image with `fluxer_api/dist` replaced by our build.
- `sparkcord/fluxer-app-proxy:dev`: the released web-app proxy with the web app replaced by our build.

Every other service (gateway, messages, media proxy and so on) uses the pinned upstream images
from the release this fork is based on (`fluxer-release@2026.1113.182945`).

## Requirements

- Docker Desktop (or Docker Engine with Compose v2)
- Git Bash on Windows, or any bash on Linux/macOS
- Node.js 22+ (pnpm is run through `npx` if it isn't installed)
- Disk: about 10 GB free for Docker. The web-app build alone needs about 5 GB of temporary
  build cache. On Windows Docker keeps its data on C: unless you move the disk image
  (Docker Desktop → Settings → Resources → Advanced).

## First run

```bash
sparkcord/dev/dev.sh setup    # downloads the compose bundle into sparkcord/dev/stack, writes .env
sparkcord/dev/dev.sh build    # API (fast) + web app (slow: Rust/WASM + JS bundle)
sparkcord/dev/dev.sh up       # http://localhost:8090
```

`sparkcord/dev/stack/` is git-ignored. It holds the generated secrets and local data.

On the very first start the API and worker can race on the database schema. If a service
stays unhealthy, run `sparkcord/dev/dev.sh up` again.

## Creating an account

1. Open http://localhost:8090 and register. The first account becomes admin when you enter
   the setup token: `sparkcord/dev/dev.sh token`.
2. Sign-up and sign-in use a proof-of-work CAPTCHA. For scripted testing, turn it off in the
   admin panel (Captcha → provider "none").

## Fast web-app iteration (watch mode)

```bash
sparkcord/dev/dev.sh watch
```

This builds the web app on your machine with rspack in watch mode and serves it straight from
`fluxer_app/dist` through the running stack. The first build takes about 1.5 minutes; after
that, saving a file rebuilds in ~20 seconds and restarts the app proxy, then you refresh the
browser. Ctrl+C stops it and switches back to the web app baked into the image.

The WASM modules (Rust) are built in Docker once and copied into `fluxer_app/pkgs`. If you
change Rust code under `fluxer_app/rust`, run `sparkcord/dev/dev.sh sync-wasm`.

## Iterating

| Changed                       | Run                                                   |
|-------------------------------|-------------------------------------------------------|
| `fluxer_api/**`               | `dev.sh build-api && dev.sh up`                      |
| `fluxer_app/**`               | `dev.sh watch` (or `dev.sh build-app && dev.sh up`)  |
| Unit tests (matcher/importer) | `cd fluxer_api && pnpm vitest run src/api/tupper`    |

## End-to-end smoke test

The smoke test signs in with an account you created, then checks tupper CRUD, Tupperbox and
PluralKit imports, proxying, replies, latch autoproxy, edit/delete and export against the
running stack. **It deletes that account's existing tuppers**, so use a test account.

```bash
echo '{"username": "you@example.com", "password": "..."}' > sparkcord/dev/stack/test-account.json
node sparkcord/dev/smoke-test.mjs
```

You can also set `SPARKCORD_TEST_LOGIN` / `SPARKCORD_TEST_PASSWORD`.

## Trying tuppers by hand

- **Settings → Tuppers**: create tuppers, import `sparkcord/examples/*.json`, and set the system tag and autoproxy.
- In any channel, type `tp!help`. Replies to `tp!` commands are only visible to you.
- Send `k: hi` or `[hi]` after importing the Tupperbox example. The message shows as Kai.

## Peer-to-peer file sharing

"Share peer-to-peer" in the composer's + menu seeds a file from the browser with
WebTorrent and posts a magnet link, which Sparkcord shows as a download card. Nothing
is uploaded to the server. The stack runs a small tracker container
(`sparkcord/dev/tracker`), which the edge serves at `/tracker`. Its `/tracker-ice`
route hands out the voice server's STUN/TURN settings (`FLUXER_LIVEKIT_STUN_*`,
`FLUXER_LIVEKIT_TURN_SERVERS`). Files are shared only while the sender's tab is open.
When two browsers can't reach each other directly (same computer, strict routers),
they relay through the stack's TURN server (coturn, port 3478 UDP/TCP).
`/tracker-ice` hands out credentials for it that expire after 24 hours, signed with
`SPARKCORD_TURN_SECRET`; `dev.sh` writes that secret to `.env` on first use.
Set `SPARKCORD_TRACKER_DEBUG=bittorrent-tracker:server` when running `dev.sh up` to
log announces, offers and answers.

## Stopping and cleaning up

```bash
sparkcord/dev/dev.sh down     # stop, keep data
sparkcord/dev/dev.sh clean    # stop and delete volumes, Sparkcord images and build cache
```
