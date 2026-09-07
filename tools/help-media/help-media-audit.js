#!/usr/bin/env node
// tools/help-media/help-media-audit.js — read-only gate for help-article
// media blocks and the built media files they point at.
//
// Ported from OpsPort's scripts/help-media-audit.js (the reference — see
// its own header for why this check was hoisted out of a satellite-specific
// help-audit.js in the first place: it reads only
// web/lib/help/content/*.ts and web/public/help-media/, no route-group or
// popover coupling, which is what makes it portable). This is a copy by
// design, not an oversight: hoisting it into a shared package is explicitly
// out of scope for now, so each satellite keeps its own.
//
// ── Deliberate divergence from OpsPort's script ──
// OpsPort's version enforces wiring only (checks 1-6 below); it never re-
// checks a clip's size or duration once built. That gap is exactly what this
// ticket exists to close: tools/help-media/build.js enforces the size and
// duration gates at TRANSCODE time, but nothing re-checks a file already
// sitting under web/public/help-media/ — one hand-replaced .mp4, and the
// gate that mattered never ran again. Check 7 below closes that: it re-reads
// every referenced clip/poster from disk and re-applies build.js's own
// limits (imported, not retyped, so the two literally cannot disagree).
// Doing that needs ffmpeg (no ffprobe in ffmpeg-static — same story as
// build.js), which is why this file lives here next to build.js and not in
// scripts/: ffmpeg-static unpacks a ~75MB binary, and scripts/ runs off the
// ROOT package.json, which ships into the production Docker image
// (Dockerfile prunes only devDependencies). tools/help-media has its own
// package.json, installed by hand, exactly to keep that binary out of CI
// and the image. See this directory's README.
//
// What it enforces:
//   1. Every media src is a same-origin /help-media/ path (never a CDN or a
//      third-party embed).
//   2. Every referenced src and poster exists under web/public.
//   3. Every media block carries non-empty alt text.
//   4. Every clip (.mp4/.webm) carries a poster.
//   5. Translated twins (foo.fr, foo.zh) show the same assets as foo — only
//      alt and caption are translated; src and poster are shared.
//   6. Nothing is committed under web/public/help-media that no article
//      references (warning: staging an asset ahead of its article is fine).
//   7. Every referenced clip is at most CLIP_MAX_BYTES and CLIP_MAX_SECONDS;
//      every referenced poster/still is at most STILL_MAX_BYTES — the same
//      three numbers build.js enforces at transcode time, imported from it.
//
// Usage:
//   node tools/help-media/help-media-audit.js          # human-readable
//   node tools/help-media/help-media-audit.js --json   # machine-readable
//   npm run help:media:audit                           # from the repo root
//
// Exits 1 on any blocker.

const fs   = require('fs');
const path = require('path');
const { CLIP_MAX_BYTES, CLIP_MAX_SECONDS, STILL_MAX_BYTES, durationSeconds } = require('./build.js');

// help-media-audit.js and build.js are siblings, both directly under
// tools/help-media/, so both resolve REPO the same two levels up.
const REPO = path.resolve(__dirname, '..', '..');
const WEB  = path.join(REPO, 'web');

const findings = { blocker: [], warning: [], nit: [] };
const add = (sev, kind, msg, ref) => findings[sev].push({ kind, msg, ref });

// Strip JS comments so a media block shown as an EXAMPLE in a doc-comment is
// not audited as a real reference.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')        // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');   // line comments (keep http:// etc.)
}

const CONTENT = path.join(WEB, 'lib', 'help', 'content');
const MEDIA   = path.join(WEB, 'public', 'help-media');

// The block regex treats quoted runs as opaque, so a '}' inside a string value
// does not end the match. An earlier version stopped at the first '}' on the
// theory that a media block has no nested object. That is true and beside the
// point: alt text and captions are prose, and prose says things like
// "click {Export}". Truncating there reported a real alt and a real poster as
// missing, in a gate that fails a merge on valid content.
const MEDIA_RE = /\{\s*kind:\s*'media'(?:[^'"}]|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")*?\}/g;

// Values may be single- OR double-quoted: a French caption containing an
// apostrophe is written with double quotes. Matching only one style would read
// those as empty and raise a false media-alt-missing blocker. The
// (?:\\.|[^\\])*? run skips backslash escapes, so an escaped quote inside a
// value does not end it early.
const field  = (block, name) => (block.match(new RegExp(name + ':\\s*([\'"])((?:\\\\.|[^\\\\])*?)\\1')) || [null, null, ''])[2];
const isClip = (src) => /\.(mp4|webm)$/i.test(src);

let mediaRefCount = 0;
const perModule  = new Map();   // moduleId ('catalog-browse', 'catalog-browse.fr') -> sorted src list
const referenced = new Set();

const modules = fs.existsSync(CONTENT)
  ? fs.readdirSync(CONTENT).filter(f => f.endsWith('.ts')
      && !f.endsWith('.test.ts') && f !== 'index.ts' && f !== 'types.ts')
  : [];

for (const file of modules) {
  const moduleId = file.replace(/\.ts$/, '');
  const source   = stripComments(fs.readFileSync(path.join(CONTENT, file), 'utf8'));
  const srcs     = [];

  for (const block of source.match(MEDIA_RE) || []) {
    const src    = field(block, 'src');
    const alt    = field(block, 'alt');
    const poster = field(block, 'poster');
    mediaRefCount++;
    srcs.push(src);

    if (!src.startsWith('/help-media/')) {
      add('blocker', 'media-src-origin',
        `${moduleId} has a media src "${src}" that is not a same-origin /help-media/ path`, moduleId);
      continue;
    }
    referenced.add(src);
    if (!fs.existsSync(path.join(WEB, 'public', src.replace(/^\//, '')))) {
      add('blocker', 'media-src-missing',
        `${moduleId} references ${src} but no such file exists under web/public`, moduleId);
    }
    if (!alt.trim()) {
      add('blocker', 'media-alt-missing',
        `${moduleId} has a media block with empty alt text (${src}), a clip with no alt is invisible to screen readers and to help search`, moduleId);
    }
    if (isClip(src)) {
      if (!poster) {
        add('blocker', 'media-poster-missing',
          `${moduleId} clip ${src} has no poster, reduced-motion readers would see a blank frame`, moduleId);
      } else {
        referenced.add(poster);
        if (!poster.startsWith('/help-media/')) {
          add('blocker', 'media-src-origin',
            `${moduleId} has a media poster "${poster}" that is not a same-origin /help-media/ path`, moduleId);
        } else if (!fs.existsSync(path.join(WEB, 'public', poster.replace(/^\//, '')))) {
          add('blocker', 'media-poster-missing',
            `${moduleId} clip ${src} names poster ${poster}, which does not exist under web/public`, moduleId);
        }
      }
    }
  }
  perModule.set(moduleId, srcs.slice().sort());
}

// Twin parity: a translated article shows the same assets as its English
// original. Only alt and caption are translated; src and poster are shared.
for (const [moduleId, srcs] of perModule) {
  const m = moduleId.match(/^(.+)\.(fr|zh)$/);
  if (!m) continue;
  const base = perModule.get(m[1]);
  if (!base) continue;
  if (base.join('|') !== srcs.join('|')) {
    add('warning', 'media-twin-mismatch',
      `${moduleId} shows [${srcs.join(', ') || 'none'}] but ${m[1]} shows [${base.join(', ') || 'none'}], translated twins should carry the same media`, moduleId);
  }
}

// Orphans: committed bytes nothing points at. A warning, not a blocker,
// because an asset staged ahead of its article is legitimate.
if (fs.existsSync(MEDIA)) {
  const walkMedia = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walkMedia(full); continue; }
      const urlPath = '/' + path.relative(path.join(WEB, 'public'), full).split(path.sep).join('/');
      if (!referenced.has(urlPath)) {
        add('warning', 'media-orphan',
          `${urlPath} is committed under web/public/help-media but no article references it`, urlPath);
      }
    }
  };
  walkMedia(MEDIA);
}

// Check 7 — size and duration, re-checked against the files actually on
// disk, not just at transcode time. Runs only over paths that already
// resolved in checks 1-2 above: a missing file is already a blocker there,
// and probing a path we know does not exist would just add a confusing
// second finding for the same root cause.
for (const urlPath of referenced) {
  const filePath = path.join(WEB, 'public', urlPath.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) continue;
  const bytes = fs.statSync(filePath).size;

  if (isClip(urlPath)) {
    if (bytes > CLIP_MAX_BYTES) {
      add('blocker', 'media-clip-oversize',
        `${urlPath} is ${bytes} bytes, over the ${CLIP_MAX_BYTES} limit build.js enforces at transcode time — rebuild from a trimmed source`, urlPath);
    }
    const secs = durationSeconds(filePath);
    if (secs === null) {
      add('blocker', 'media-clip-duration-unreadable',
        `${urlPath} has no readable duration (ffmpeg produced no parseable Duration: line)`, urlPath);
    } else if (secs > CLIP_MAX_SECONDS) {
      add('blocker', 'media-clip-duration',
        `${urlPath} runs ${secs.toFixed(1)}s, over the ${CLIP_MAX_SECONDS}s limit build.js enforces at transcode time`, urlPath);
    }
  } else if (bytes > STILL_MAX_BYTES) {
    add('blocker', 'media-still-oversize',
      `${urlPath} is ${bytes} bytes, over the ${STILL_MAX_BYTES} limit build.js enforces at transcode time`, urlPath);
  }
}

// ── output ───────────────────────────────────────────────────────────
const totals = {
  blocker: findings.blocker.length,
  warning: findings.warning.length,
  nit:     findings.nit.length,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    totals,
    findings,
    scanned: { contentModules: modules.length, mediaRefs: mediaRefCount },
  }, null, 2));
} else {
  console.log('\n══════ help-media-audit ══════');
  console.log(`Scanned: ${modules.length} content modules, ${mediaRefCount} media refs`);
  console.log(`Totals:  ${totals.blocker} blocker / ${totals.warning} warning / ${totals.nit} nit\n`);
  for (const sev of ['blocker', 'warning', 'nit']) {
    const list = findings[sev];
    if (!list.length) continue;
    console.log(`── ${sev.toUpperCase()} (${list.length}) ──`);
    for (const f of list) {
      console.log(`  [${f.kind}] ${f.msg}`);
      if (f.ref) console.log(`             ref: ${f.ref}`);
    }
    console.log('');
  }
}
if (totals.blocker > 0) process.exit(1);
