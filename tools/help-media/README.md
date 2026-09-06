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
# 1. Local database with the committed catalog snapshot (417 products).
DATABASE_URL=postgres://…localhost… node prisma/seed.js

# 2. Bring the app up BY HAND and leave it up. The capture config has no
#    webServer on purpose — recording does not parallelise.
cd web && npm run dev            # next dev -p 3100

# 3. In a second shell:
cd web && npm run help:capture   # writes tools/help-media/.out/<slug>/*
cd .. && npm run help:media      # writes web/public/help-media/<slug>/*
```

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
