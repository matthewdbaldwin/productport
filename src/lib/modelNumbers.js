// src/lib/modelNumbers.js — the one normaliser for `Product.modelNumbers`.
//
// `modelNumbers` is a pipe-delimited @db.Text blob and every consumer splits on
// `|`. Nothing enforced that on write, so a value pasted from a spreadsheet
// arrived newline-separated and became ONE opaque token: prod row
// `evermend-asd-occluder` holds 32 `KW…` codes in a single 287-character value
// with zero pipes. Invisible to search, to a human reading the field, and to any
// future ProductModel.partNumber normalisation — a pipe-only migration would
// load that whole string into a part-number column.
// (Audit backlog 2026-07-31, B5.)
//
// Both writers call this — the admin editor (productWrite.js) and the CSV import
// (productRow.js). Fixing one alone leaves the other open, and the field is
// reachable from both.
//
// Reader-side workarounds are NOT a substitute: microport/scripts/
// partnum_classify.py already splits on `[|\r\n]` defensively, but without the
// write-side fix the next paste simply re-creates the problem.
'use strict';

/**
 * Normalise a modelNumbers value to the canonical pipe-delimited form.
 *
 * Splits on pipes AND newlines (the two delimiters that actually occur in the
 * data), trims each code, drops empty segments, and re-joins with `|`.
 * Returns null for null/blank input, and for a value that is only delimiters —
 * so a field cleared to "|\n|" stores null rather than a meaningless string.
 *
 * Idempotent: an already-correct value comes back unchanged.
 */
function normalizeModelNumbers(value) {
  if (value == null) return null;
  const codes = String(value)
    .split(/[|\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return codes.length ? codes.join('|') : null;
}

module.exports = { normalizeModelNumbers };
