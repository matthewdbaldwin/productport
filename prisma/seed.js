// prisma/seed.js — one-time catalog import (PRD §P1).
//
// Imports the 372 products / 29 trials / 4-region clearance matrix from the
// snapshot CSVs (prisma/seed-data/) that the standalone ProductPort Builder
// emitted. Idempotent: upserts each product by its stable `slug`, then replaces
// that product's clearance + trial rows. Re-running reconciles to the CSV.
//
// Warn-and-report, never abort-on-row (the platform import pattern): a bad row
// is collected and reported at the end; the rest of the batch still imports.
//
// Run once against the target DB:
//   DATABASE_URL=... node prisma/seed.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const db = require('../src/lib/db');

const DATA_DIR = path.join(__dirname, 'seed-data');
const REGIONS = ['FDA', 'CE', 'NMPA', 'PMDA'];

// Clearance word (Builder CSV) → ClearanceStatus enum. Mirrors the Builder's
// MK_FROM_WORD map so the live catalog matches the offline HTML exactly.
const STATUS_FROM_WORD = {
  cleared: 'APPROVED',
  approved: 'APPROVED',
  'in progress': 'IN_PROGRESS',
  in_progress: 'IN_PROGRESS',
  submitted: 'SUBMITTED',
  'not cleared': 'NOT_APPROVED',
  not_approved: 'NOT_APPROVED',
  '': 'NONE',
  none: 'NONE',
};

function clearanceStatus(word) {
  return STATUS_FROM_WORD[(word || '').trim().toLowerCase()] ?? 'NONE';
}

function readCsv(file) {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
  return parse(raw, { columns: true, bom: true, skip_empty_lines: true, trim: false });
}

function blankToNull(v) {
  const s = (v == null ? '' : String(v)).trim();
  return s === '' ? null : s;
}

async function main() {
  const productRows = readCsv('seed_products.csv');
  const trialRows = fs.existsSync(path.join(DATA_DIR, 'seed_trials.csv'))
    ? readCsv('seed_trials.csv')
    : [];

  // Group trials by product slug (CSV `product_id` == product `id`/slug).
  const trialsBySlug = new Map();
  for (const t of trialRows) {
    const slug = (t.product_id || '').trim();
    if (!slug) continue;
    if (!trialsBySlug.has(slug)) trialsBySlug.set(slug, []);
    trialsBySlug.get(slug).push(t);
  }

  const errors = [];
  let imported = 0;
  let clearanceCount = 0;
  let trialCount = 0;

  for (const [i, r] of productRows.entries()) {
    const slug = (r.id || '').trim();
    try {
      if (!slug) throw new Error('missing id/slug');
      if (!r.name || !r.name.trim()) throw new Error('missing name');
      if (!r.subsidiary || !r.subsidiary.trim()) throw new Error('missing subsidiary');
      if (!r.therapeutic_area || !r.therapeutic_area.trim()) throw new Error('missing therapeutic_area');

      const data = {
        slug,
        name: r.name.trim(),
        subsidiary: r.subsidiary.trim(),
        therapeuticArea: r.therapeutic_area.trim(),
        category: blankToNull(r.category),
        type: blankToNull(r.type),
        tagline: blankToNull(r.tagline),
        overview: blankToNull(r.overview),
        features: blankToNull(r.features),
        indication: blankToNull(r.indication),
        patientPopulation: blankToNull(r.patient_population),
        specs: blankToNull(r.specs),
        regNotes: blankToNull(r.reg_notes),
        image: blankToNull(r.image),
        status: 'ACTIVE',
      };

      const product = await db.product.upsert({
        where: { slug },
        update: data,
        create: data,
      });

      // Replace this product's clearance matrix (4 region rows).
      await db.regulatoryClearance.deleteMany({ where: { productId: product.id } });
      const clearances = REGIONS.map((region) => ({
        productId: product.id,
        region,
        status: clearanceStatus(r[region.toLowerCase()]),
        notes: null,
      }));
      await db.regulatoryClearance.createMany({ data: clearances });
      clearanceCount += clearances.length;

      // Replace this product's trial rows.
      await db.trial.deleteMany({ where: { productId: product.id } });
      const trials = (trialsBySlug.get(slug) || []).map((t, order) => ({
        productId: product.id,
        trial: (t.trial || '').trim() || '(unnamed trial)',
        identifier: blankToNull(t.identifier),
        n: blankToNull(t.n),
        design: blankToNull(t.design),
        result: blankToNull(t.result),
        displayOrder: order,
      }));
      if (trials.length) {
        await db.trial.createMany({ data: trials });
        trialCount += trials.length;
      }

      imported += 1;
    } catch (err) {
      errors.push({ row: i + 2, slug: slug || '(none)', error: err.message }); // +2: header + 1-indexed
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed] imported ${imported}/${productRows.length} products, ` +
      `${clearanceCount} clearance rows, ${trialCount} trials.`,
  );
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.warn(`[seed] ${errors.length} row(s) skipped:`);
    for (const e of errors) {
      // eslint-disable-next-line no-console
      console.warn(`  row ${e.row} (${e.slug}): ${e.error}`);
    }
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
