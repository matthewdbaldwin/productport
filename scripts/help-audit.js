#!/usr/bin/env node
// scripts/help-audit.js — read-only static analyzer for ProductPort's Help
// Library. SPA-adapted from ClinicPort's model (per the PRD's explicit
// recommendation): ProductPort's whole authenticated UI is one route
// (web/app/page.tsx), so Check 1 is keyed by HELP_SECTIONS' components[]
// field rather than distinct page.tsx files.
//
//   1. Component coverage: every HELP_SECTIONS item's components[] entries
//      exist on disk. Unlike a route-keyed check, MULTIPLE items may
//      legitimately point at the same file (product-create and
//      product-edit both point at ProductEditModal.tsx) — this is NOT
//      flagged as double-coverage, unlike a route-keyed registry where
//      that would mean an ambiguous nav target.
//   2. Every registered slug has a real content module at
//      web/lib/help/content/<slug>.ts with slug/title/intro/lastUpdated/
//      sections/related present, in all 3 locales (en/zh/fr).
//   3. Locale parity for the 2 popovers (web/lib/help/popovers.ts + its
//      zh/fr siblings, which Task 4 creates — a missing sibling is a
//      WARNING not a blocker, same convention as Check 2's zh/fr articles:
//      the real enforcement is Task 4's own vitest suite, this is a
//      redundant regression detector).
//   4. Every content module's labels: [...] fields appear verbatim
//      somewhere in web/components/**, web/app/**, or web/messages/*.json
//      (stale-label detection).
//   5. Popover wiring, locale-aware. Task 7 mounts the two popovers as
//      <HelpButton content={galleryPopover} inline /> where
//      galleryPopover = getPopoverContent('gallery', locale) — NOT the raw
//      GALLERY_POPOVER / CLEARANCE_POPOVER constants — so grepping for
//      `content={GALLERY_POPOVER}` (the plan's original Check 5) would
//      always report two blockers against a correctly wired modal. This
//      check instead requires: (a) web/app/ProductEditModal.tsx exists
//      (blocker popover-host-missing); (b) the source corpus resolves each
//      key via getPopoverContent('gallery' | 'clearance', …) (blocker
//      popover-not-wired per missing key); (c) ProductEditModal.tsx mounts
//      at least two <HelpButton … content={…}> tags (blocker
//      popover-not-wired if fewer).
//
// Usage:
//   node scripts/help-audit.js          # human-readable summary
//   node scripts/help-audit.js --json   # machine-readable
// Also aliased as `npm run help:audit` (root package.json).

const fs   = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const WEB  = path.join(REPO, 'web');
const LOCALES = ['en', 'zh', 'fr'];

const findings = { blocker: [], warning: [], nit: [] };
const add = (sev, kind, msg, ref) => findings[sev].push({ kind, msg, ref });

function readAllSources() {
  const parts = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith('.test.tsx') && !e.name.endsWith('.test.ts')) {
        try { parts.push(fs.readFileSync(full, 'utf8')); } catch { /* ignore */ }
      }
    }
  }
  walk(path.join(WEB, 'components'));
  walk(path.join(WEB, 'app'));
  const msgDir = path.join(WEB, 'messages');
  if (fs.existsSync(msgDir)) {
    for (const e of fs.readdirSync(msgDir)) {
      if (e.endsWith('.json')) { try { parts.push(fs.readFileSync(path.join(msgDir, e), 'utf8')); } catch { /* ignore */ } }
    }
  }
  return parts.join('\n');
}

function loadHelpSections() {
  const file = path.join(WEB, 'lib', 'help', 'sections.ts');
  if (!fs.existsSync(file)) {
    add('blocker', 'missing-sections-registry', 'web/lib/help/sections.ts not found.', file);
    return [];
  }
  const src = fs.readFileSync(file, 'utf8');
  const items = [];
  const itemRe = /\{[^{}]*?slug:\s*'([\w-]+)'[^{}]*\}/g;
  let m;
  while ((m = itemRe.exec(src)) !== null) {
    const block = m[0];
    const statusMatch = block.match(/status:\s*'(live|stub)'/);
    if (!statusMatch) continue;
    const rolesMatch = block.match(/roles:\s*(ADMIN|\[([^\]]*)\])/);
    let roles = null;
    if (rolesMatch) roles = rolesMatch[1] === 'ADMIN' ? ['product_admin', 'superuser'] : (rolesMatch[2].match(/'([\w-]+)'/g) || []).map(s => s.replace(/'/g, ''));
    const componentsMatch = block.match(/components:\s*\[([^\]]*)\]/);
    const components = componentsMatch ? (componentsMatch[1].match(/'([^']*)'/g) || []).map(s => s.replace(/'/g, '')) : [];
    items.push({ slug: m[1], status: statusMatch[1], roles, components });
  }
  return items;
}

const helpItems = loadHelpSections();
const cachedSrc = readAllSources();

// ── Check 1 — component coverage (relaxed uniqueness) ─────────────────────
for (const item of helpItems) {
  if (item.components.length === 0) {
    add('blocker', 'no-components-declared', `HELP_SECTIONS item "${item.slug}" declares no components[].`, item.slug);
    continue;
  }
  for (const comp of item.components) {
    const full = path.join(WEB, comp);
    if (!fs.existsSync(full)) add('blocker', 'component-missing', `"${item.slug}" points at ${comp}, which doesn't exist.`, comp);
  }
}

// ── Check 2 — content module + locale coverage ─────────────────────────────
for (const item of helpItems) {
  if (item.status !== 'live') continue;
  for (const locale of LOCALES) {
    const suffix = locale === 'en' ? '' : `.${locale}`;
    const file = path.join(WEB, 'lib', 'help', 'content', `${item.slug}${suffix}.ts`);
    if (!fs.existsSync(file)) {
      add(locale === 'en' ? 'blocker' : 'warning', 'content-locale-missing', `"${item.slug}" has no ${locale} content module.`, file);
      continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    for (const field of ['slug', 'title', 'intro', 'lastUpdated', 'sections', 'related']) {
      if (!new RegExp(`\\b${field}:`).test(src)) add('blocker', 'content-field-missing', `"${item.slug}" (${locale}) content is missing the "${field}" field.`, file);
    }
  }
}

// ── Check 3 — popover locale parity ─────────────────────────────────────────
// Same severity convention as Check 2: the real enforcement is Task 4's own
// vitest suite (buildSearchDocs resolves locale-aware content); this is a
// redundant regression detector, so a missing zh/fr module is a warning, not
// a blocker — same as a missing zh/fr article module above.
const popoverFile = path.join(WEB, 'lib', 'help', 'popovers.ts');
if (!fs.existsSync(popoverFile)) {
  add('blocker', 'popovers-missing', 'web/lib/help/popovers.ts not found.', popoverFile);
} else {
  for (const locale of ['zh', 'fr']) {
    const file = path.join(WEB, 'lib', 'help', `popovers.${locale}.ts`);
    if (!fs.existsSync(file)) {
      add('warning', 'popover-locale-missing', `popovers.ts has no ${locale} translation module.`, file);
    }
  }
}

// ── Check 4 — stale-label detection ─────────────────────────────────────────
const contentDir = path.join(WEB, 'lib', 'help', 'content');
if (fs.existsSync(contentDir)) {
  for (const f of fs.readdirSync(contentDir)) {
    if (!f.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(contentDir, f), 'utf8');
    const labelsMatch = src.match(/labels:\s*\[([^\]]*)\]/g) || [];
    for (const block of labelsMatch) {
      const labels = (block.match(/'([^']*)'/g) || []).map(s => s.replace(/'/g, ''));
      for (const label of labels) {
        if (label.length < 3) continue;
        if (!cachedSrc.includes(label)) add('warning', 'stale-ui-label-in-article', `"${label}" (in ${f}) not found verbatim in web/components, web/app, or messages.`, f);
      }
    }
  }
}

// ── Check 5 — popover wiring (locale-aware) ─────────────────────────────────
// Task 7 wires the popovers through getPopoverContent(key, locale) and mounts
// the resolved value as <HelpButton content={galleryPopover} inline />, so the
// exported GALLERY_POPOVER / CLEARANCE_POPOVER names never appear at the call
// site. Detect the call sites the way Task 7 actually writes them.
const POPOVER_HOST = path.join('app', 'ProductEditModal.tsx');
const popoverHostFile = path.join(WEB, POPOVER_HOST);
if (!fs.existsSync(popoverHostFile)) {
  add('blocker', 'popover-host-missing', `web/${POPOVER_HOST} not found — the gallery and Clearance popovers have no host component.`, popoverHostFile);
}
for (const [key, label] of [['gallery', 'gallery popover'], ['clearance', 'Clearance popover']]) {
  if (!new RegExp(`getPopoverContent\\(\\s*'${key}'`).test(cachedSrc)) {
    add('blocker', 'popover-not-wired', `The ${label} is never resolved via getPopoverContent('${key}', …) anywhere in web/app/** or web/components/**.`, key);
  }
}
if (fs.existsSync(popoverHostFile)) {
  const hostSrc = fs.readFileSync(popoverHostFile, 'utf8');
  const mounted = (hostSrc.match(/<HelpButton\b[^>]*\bcontent=\{/g) || []).length;
  if (mounted < 2) {
    add('blocker', 'popover-not-wired', `web/${POPOVER_HOST} mounts ${mounted} <HelpButton content={…}> tag(s); expected at least 2 (gallery + Clearance).`, popoverHostFile);
  }
}

// ── output ───────────────────────────────────────────────────────────────────
const totals = { blocker: findings.blocker.length, warning: findings.warning.length, nit: findings.nit.length };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ totals, findings }, null, 2));
} else {
  for (const sev of ['blocker', 'warning', 'nit']) {
    for (const f of findings[sev]) console.log(`[${sev.toUpperCase()}] ${f.kind}: ${f.msg} (${f.ref})`);
  }
  console.log(`\nTotals: ${totals.blocker} blocker(s), ${totals.warning} warning(s), ${totals.nit} nit(s).`);
}
process.exit(totals.blocker > 0 ? 1 : 0);
