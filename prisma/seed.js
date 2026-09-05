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
// Production targets are refused by ./seed-guard.js — the real import needs
//   SEED_ALLOW_PROD=1 DATABASE_URL=... node prisma/seed.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { assertSeedTargetAllowed } = require('./seed-guard');

// Refuses production targets (platform-db*.rds) — SEED_ALLOW_PROD=1 to override.
assertSeedTargetAllowed();

const db = require('../src/lib/db');
const { parseProductRow, parseTrialRow } = require('../src/lib/productRow');

const DATA_DIR = path.join(__dirname, 'seed-data');

function readCsv(file) {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
  return parse(raw, { columns: true, bom: true, skip_empty_lines: true, trim: false });
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
    let slug = (r.id || '').trim();
    try {
      const parsed = parseProductRow(r);
      slug = parsed.slug;

      const product = await db.product.upsert({
        where: { slug },
        update: parsed.data,
        create: parsed.data,
      });

      // Replace this product's clearance matrix (4 region rows).
      await db.regulatoryClearance.deleteMany({ where: { productId: product.id } });
      const clearances = parsed.clearances.map((c) => ({ ...c, productId: product.id }));
      await db.regulatoryClearance.createMany({ data: clearances });
      clearanceCount += clearances.length;

      // Replace this product's trial rows.
      await db.trial.deleteMany({ where: { productId: product.id } });
      const trials = (trialsBySlug.get(slug) || []).map((t, order) => ({
        ...parseTrialRow(t, order),
        productId: product.id,
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
