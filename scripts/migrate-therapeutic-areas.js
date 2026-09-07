#!/usr/bin/env node
// scripts/migrate-therapeutic-areas.js — re-file the seed CSVs onto the new 8
// therapeutic areas. Dry-run by default; --apply writes in place.
//
//   node scripts/migrate-therapeutic-areas.js            # report only
//   node scripts/migrate-therapeutic-areas.js --apply    # rewrite the CSVs
//
// Rules live in src/lib/therapeuticAreaMigration.js so the Prisma data
// migration re-uses the same table rather than restating it.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { NEW_THERAPEUTIC_AREAS, mapTherapeuticArea } = require('../src/lib/therapeuticAreaMigration');

const FILES = [
  'prisma/seed-data/seed_products.csv',
  'prisma/seed-data/brochure_master.csv',
];
const COL = 'therapeutic_area';

// Minimal RFC4180 serializer. Quotes only when required, which is the dialect
// both seed CSVs already use — verified per-file by the identity round-trip below.
const needsQuote = (v) => /[",\r\n]/.test(v);
const cell = (v) => (needsQuote(v) ? `"${v.replace(/"/g, '""')}"` : v);
// eol is per-file: seed_products.csv is LF, brochure_master.csv is CRLF, and
// normalising either one would rewrite all 417 lines and bury the real diff.
const toCsv = (header, rows, eol) =>
  [header.map(cell).join(','), ...rows.map((r) => header.map((h) => cell(r[h] ?? '')).join(','))].join(eol) + eol;

// The two seed CSVs drifted from each other before this migration. seed_products.csv
// was regenerated wholesale from the live prod export (b31ca89), so where they
// disagree PROD is the truth and brochure_master.csv is the stale side. Left
// alone, the next `import-brochure` run would silently reassign these products.
const RECONCILE = {
  // brochure id -> seed id. 'tigertrieve' is a typo: on import it would CREATE a
  // duplicate product rather than update the existing 'tigertriever' row.
  ids: { tigertrieve: 'tigertriever' },
  // seed id -> the area prod holds, overriding whatever brochure_master says.
  areas: {
    basilica:          'Urology, Oncology, and Gastroenterology',
    'la-paloma-autoex': 'Urology, Oncology, and Gastroenterology',
  },
};

function reconcile(rel, rows) {
  if (!rel.includes('brochure_master')) return [];
  const notes = [];
  for (const row of rows) {
    const fixedId = RECONCILE.ids[row.id];
    if (fixedId) { notes.push(`id ${row.id} -> ${fixedId} (typo would create a duplicate on import)`); row.id = fixedId; }
    const prodArea = RECONCILE.areas[row.id];
    if (prodArea && row[COL] !== prodArea) { notes.push(`${row.id}: ${row[COL]} -> ${prodArea} (prod is authoritative)`); row[COL] = prodArea; }
  }
  return notes;
}

function run({ apply }) {
  let failed = false;

  for (const rel of FILES) {
    const file = path.join(__dirname, '..', rel);
    const raw = fs.readFileSync(file, 'utf8');
    const rows = parse(raw, { columns: true, bom: true, skip_empty_lines: true, trim: false });
    const header = Object.keys(rows[0]);
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';

    // Identity round-trip: if re-serializing the UNCHANGED rows does not
    // reproduce the file byte-for-byte, this serializer's dialect differs from
    // the file's and any diff it produces would be untrustworthy. Refuse.
    const identity = toCsv(header, rows, eol);
    const faithful = identity === raw;

    // Reconcile against prod truth BEFORE mapping, so the drifted rows are
    // re-filed from the area prod actually holds rather than the stale one.
    const notes = reconcile(rel, rows);

    const counts = Object.fromEntries(NEW_THERAPEUTIC_AREAS.map((a) => [a, 0]));
    const unmapped = [];
    let changed = 0;

    for (const row of rows) {
      const next = mapTherapeuticArea(row[COL], row.category);
      if (next === null) { unmapped.push(`${row.id} (${row[COL]} / ${row.category || 'no category'})`); continue; }
      if (next !== row[COL]) changed += 1;
      row[COL] = next;
      counts[next] += 1;
    }

    console.log(`\n=== ${rel}`);
    console.log(`    rows ${rows.length} · rewritten ${changed} · unchanged ${rows.length - changed}`);
    console.log(`    serializer faithful (identity round-trip): ${faithful ? 'YES' : 'NO'}`);
    for (const a of NEW_THERAPEUTIC_AREAS) console.log(`      ${String(counts[a]).padStart(4)}  ${a}`);
    if (notes.length) { console.log(`    reconciled against prod (${notes.length}):`); for (const n of notes) console.log(`      - ${n}`); }
    if (unmapped.length) {
      failed = true;
      console.log(`    UNMAPPED (${unmapped.length}):`);
      for (const u of unmapped) console.log(`      - ${u}`);
    }

    if (!faithful) { failed = true; console.log('    REFUSING to write: serializer would reformat unrelated rows.'); continue; }

    if (apply) {
      fs.writeFileSync(file, toCsv(header, rows, eol));
      console.log('    written.');
    }
  }

  if (failed) { console.error('\nFAILED — nothing written for the affected file(s).'); process.exit(1); }
  console.log(apply ? '\nApplied.' : '\nDry run — pass --apply to write.');
}

run({ apply: process.argv.includes('--apply') });
