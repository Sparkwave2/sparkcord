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

## Iterating

| Changed                       | Run                                                   |
|-------------------------------|-------------------------------------------------------|
| `fluxer_api/**`               | `dev.sh build-api && dev.sh up`                      |
| `fluxer_app/**`               | `dev.sh build-app && dev.sh up`                      |
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

## Stopping and cleaning up

```bash
sparkcord/dev/dev.sh down     # stop, keep data
sparkcord/dev/dev.sh clean    # stop and delete volumes, Sparkcord images and build cache
```
