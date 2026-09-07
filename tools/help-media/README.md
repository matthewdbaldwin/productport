# help-media

Transcodes Help Library screen captures into the files `web/public/help-media/` serves.

## Why this is its own package

`ffmpeg-static` unpacks a ~75MB binary. As a `web/` devDependency it would land in
every CI `npm ci` and in the Docker build, which copies all of `web/`. Nothing in the
app imports it, so it lives here and is installed by hand. Being at the repo root also
keeps it outside the `./web` build context entirely, so `web/.dockerignore` needs no
entry for it.

## Install once

```bash
cd tools/help-media && npm install
```

`node_modules/` and `.out/` here are gitignored.

## Use

```bash
# 0. Repo root .env needs, all local-only (see the README's env var table and
#    web/e2e/helpers/mint-session.cjs's header for the one-liner that
#    generates the keypair): DATABASE_URL, IDP_API_URL (placeholder is fine —
#    nothing here dials it), SALESPORT_JWT_ISSUER, SALESPORT_JWT_PUBLIC_KEY,
#    E2E_JWT_PRIVATE_KEY.

# 1. A local Postgres, migrated (`npx prisma migrate dev` from the repo
#    root — see the main README's Local development section) and seeded
#    with the committed catalog snapshot (417 products) DATABASE_URL points
#    at:
DATABASE_URL=postgres://…localhost… node prisma/seed.js

# 2. Bring the API and the web app up BY HAND and leave them up. The capture
#    config has no webServer on purpose — recording does not parallelise.
node src/server.js                             # API on :4006 (or $PORT)
cd web && API_ORIGIN=http://localhost:<port> npm run dev   # web on :3100

# 3. In a third shell:
cd web && npm run help:capture   # writes tools/help-media/.out/<slug>/*
cd .. && npm run help:media      # writes web/public/help-media/<slug>/*
```

Step 3's `help:capture` signs in via `e2e/capture.setup.ts`, which mints a
session directly with the local keypair from step 0 — no HubPort IdP needed,
and no browser login form driven. It writes `e2e/.auth/admin.json`, then each
`*.admin.capture.ts` spec in `e2e/help-captures/` runs against that session.
See that file's header for the full rationale (ProductPort has no login of
its own; this is not a backdoor — nothing here runs in the server process,
and a token minted this way is rejected by any API not deliberately
configured to trust this keypair, i.e. every deployed one).

On this devbox `npx playwright install chromium` hard-fails on Ubuntu 26.04, so the
capture run needs the same browser escape hatch the e2e suite uses — either
`PLAYWRIGHT_CHANNEL=chrome` or `PLAYWRIGHT_CHROMIUM=/path/to/chrome`.

The capture config refuses any `BASE_URL` that is not localhost. Captures must come
from the local seeded catalog, never from `product-dev.microport.com` or production.

## Inputs

| File | Meaning |
|---|---|
| `.out/<slug>/<name>.webm` | A clip. Becomes `<name>.mp4`. |
| `.out/<slug>/<name>.png` with a matching `.webm` | That clip's poster. Always emitted as `<name>.jpg` at 1280 wide. |
| `.out/<slug>/<name>.png` with no `.webm` | A still. |
| `.out/<slug>/<name>.json` | Optional `{ "trimStart": 1.5, "trimEnd": 14, "format": "jpg" }`. |

## Gates

A clip must be at most 1,500,000 bytes and 25 seconds. A poster or still must be at
most 200,000 bytes. Posters keep the clip's 1280 width and are always JPEG, because a
poster is what a reduced-motion reader sees instead of the video. Standalone stills
downscale to 1024 wide and stay PNG unless a sidecar asks for JPEG. Over a limit the
build exits non-zero and names the file and the fix.

## Encoder settings

`scale=1280:-2,fps=24`, `libx264 -crf 28 -preset slow`, `yuv420p`, `+faststart`, no
audio track. 720p, silent, and progressive-downloadable, which is what a muted
looping help clip needs and nothing more.
