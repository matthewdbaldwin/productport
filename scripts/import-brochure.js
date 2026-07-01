// scripts/import-brochure.js — one-off bulk load of the GloMatrix brochure catalog.
//
// Loads prisma/seed-data/brochure_master.csv (the 417-row reconciled catalog:
// 372 seed rows enriched from the brochure + the outsight/decypher split + 44
// net-new products) through the SAME import path the admin upload endpoint uses
// (importProducts + the shared upsertProductRow) — so this dogfoods the uploader.
//
// Run via a one-off Fargate task (dev ECS-exec is disabled), reference:
// reference_seed_dev_db_via_run_task.
//   aws ecs run-task ... --overrides '{"containerOverrides":[{"name":"productport-api",
//     "command":["node","scripts/import-brochure.js"]}]}'
//
// Guard rail: NODE_ENV is "production" even on dev ECS, and the dev DB NAME is
// plain "productport" (the dev-ness is in the HOST: platform-db-dev), so gate on
// the whole DATABASE_URL containing "-dev". Prod's URL lives in Secrets Manager
// with host platform-db (no "-dev"). Set ALLOW_PROD_IMPORT=1 for the prod load.
// DRY_RUN=1 classifies created/updated with NO writes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const db = require('../src/lib/db');
const { importProducts } = require('../src/lib/importProducts');
const { upsertProductRow } = require('../src/lib/productUpsert');

const CSV_PATH = path.join(__dirname, '..', 'prisma', 'seed-data', 'brochure_master.csv');
const DRY_RUN = process.env.DRY_RUN === '1';

function assertDbTarget() {
  const url = process.env.DATABASE_URL || '';
  const host = (url.replace(/^[a-z]+:\/\/[^@]*@/i, '').split('/')[0] || '').split('?')[0];
  const isDev = url.includes('-dev');
  if (isDev || process.env.ALLOW_PROD_IMPORT === '1') return host || '(unknown host)';
  throw new Error(
    `refusing to import — host "${host}" is not a dev host (no "-dev"). Set ALLOW_PROD_IMPORT=1 to load prod.`,
  );
}

async function main() {
  const host = assertDbTarget();
  const rows = parse(fs.readFileSync(CSV_PATH, 'utf8'), {
    columns: true, bom: true, skip_empty_lines: true, trim: false,
  });
  console.log(`[import-brochure] target=${host} rows=${rows.length} dryRun=${DRY_RUN}`);

  // Real write, or dry-run classify (read-only findUnique, no upsert).
  const upsertRow = DRY_RUN
    ? async ({ slug }) => ((await db.product.findUnique({ where: { slug }, select: { id: true } })) ? 'updated' : 'created')
    : (row) => upsertProductRow(db, row);

  const result = await importProducts(rows, upsertRow);
  console.log(
    `[import-brochure] ${DRY_RUN ? 'DRY-RUN ' : ''}total=${result.total} ` +
      `created=${result.created} updated=${result.updated} errors=${result.errors.length}`,
  );
  for (const e of result.errors) console.warn(`  row ${e.row} (${e.slug || '?'}): ${e.error}`);

  if (!DRY_RUN) {
    const total = await db.product.count({ where: { deletedAt: null } });
    console.log(`[import-brochure] catalog now has ${total} active products.`);
  }
}

main()
  .catch((err) => { console.error('[import-brochure] fatal:', err.message); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
