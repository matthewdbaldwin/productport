// src/lib/verifyImportHeader.js — the bulk-import format gate.
//
// The CSV import (routes/products.js POST /import) is a FULL reconcile: each row
// upserts the product AND replaces its whole clearance matrix (deleteMany +
// createMany). So a column that is ABSENT from the CSV header is written as null
// on every product — an old export (pre model_numbers / tier / status / TGA /
// per-region cert+qualifier) re-imported would silently wipe exactly that data.
// Rather than clobber, the endpoint rejects a header that doesn't carry the full
// canonical column set. The supported input is a file the current Export CSV
// produced (optionally edited); surgical single-field edits use the per-product
// editor, not the bulk importer. Tested in tests/verifyImportHeader.test.js.
'use strict';
const { EXPORT_COLUMNS } = require('./serializeProductRow');

// The canonical header the current export emits === what a safe import must carry.
const REQUIRED_COLUMNS = EXPORT_COLUMNS;

// columns: the CSV's header cells (array). Returns:
//   { ok, missing, unknown, expected }
// ok       — header carries every required column (extras allowed)
// missing  — required columns absent from the header (the reject reason)
// unknown  — header columns we don't recognize (warning only; parseProductRow ignores them)
// expected — the canonical column set (so the caller / UI can show the template)
function verifyImportHeader(columns) {
  const present = new Set(
    (Array.isArray(columns) ? columns : [])
      .map((c) => (c == null ? '' : String(c)).trim())
      .filter(Boolean),
  );
  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  const unknown = [...present].filter((c) => !REQUIRED_COLUMNS.includes(c));
  return { ok: missing.length === 0, missing, unknown, expected: REQUIRED_COLUMNS };
}

module.exports = { verifyImportHeader, REQUIRED_COLUMNS };
