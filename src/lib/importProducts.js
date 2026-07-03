// src/lib/importProducts.js — CSV import runner (admin upload, Slice 3).
//
// Reconcile a batch of parsed CSV rows into the catalog: each row is parsed via
// parseProductRow (validation + word→enum + clearance mapping), then upserted on
// slug through an INJECTED upsertRow fn — so this is pure/testable without a DB,
// and the route supplies the real Prisma upsert. Per-row error isolation: a bad
// row (or a failed write) is collected with its CSV line number and the batch
// continues, matching the warn-and-report seed. Tested in tests/importProducts.test.js.
'use strict';
const { parseProductRow } = require('./productRow');

// rows:      array of CSV row objects (header already consumed by the parser).
// upsertRow: async ({ slug, data, clearances }) => 'created' | 'updated'.
// returns:   { total, created, updated, errors: [{ row, slug, error }] }.
async function importProducts(rows, upsertRow) {
  let created = 0;
  let updated = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const line = i + 2; // CSV line number (row 1 is the header)
    try {
      const parsed = parseProductRow(raw);
      const outcome = await upsertRow(parsed);
      if (outcome === 'updated') updated++;
      else created++;
    } catch (err) {
      errors.push({ row: line, slug: (raw && raw.id ? String(raw.id).trim() : ''), error: err.message });
    }
  }

  return { total: rows.length, created, updated, errors };
}

module.exports = { importProducts };
