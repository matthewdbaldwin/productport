// The import format verifier: the bulk CSV import is a FULL upsert + clearance
// matrix replace, so a CSV whose header is missing any canonical column would
// silently null that data on every row. verifyImportHeader is the gate the
// endpoint uses to REJECT an old/incompatible export before it clobbers — it
// requires the header to carry the full canonical column set (EXPORT_COLUMNS).
'use strict';
const { verifyImportHeader } = require('../src/lib/verifyImportHeader');
const { EXPORT_COLUMNS } = require('../src/lib/serializeProductRow');

// The header the ORIGINAL builder snapshot / pre-WS2 export carried — before
// model_numbers, tier/classification/status, the new brochure columns, TGA, and
// the per-region cert/qualifier columns existed.
const OLD_HEADER = [
  'id', 'name', 'subsidiary', 'therapeutic_area', 'category', 'type', 'tagline', 'overview',
  'features', 'indication', 'patient_population', 'specs', 'fda', 'ce', 'nmpa', 'pmda', 'reg_notes', 'image',
];

describe('verifyImportHeader', () => {
  test('the current canonical header passes clean', () => {
    const v = verifyImportHeader(EXPORT_COLUMNS);
    expect(v.ok).toBe(true);
    expect(v.missing).toEqual([]);
    expect(v.unknown).toEqual([]);
  });

  test('column order does not matter', () => {
    const v = verifyImportHeader([...EXPORT_COLUMNS].reverse());
    expect(v.ok).toBe(true);
    expect(v.missing).toEqual([]);
  });

  test('an old-format export is rejected, naming the missing columns', () => {
    const v = verifyImportHeader(OLD_HEADER);
    expect(v.ok).toBe(false);
    // the data-bearing columns whose absence would clobber
    expect(v.missing).toEqual(expect.arrayContaining([
      'model_numbers', 'tga', 'fda_cert', 'fda_qualifier', 'nmpa_cert', 'status', 'business_segment',
    ]));
    // it must NOT claim a column the old header actually has is missing
    expect(v.missing).not.toContain('id');
    expect(v.missing).not.toContain('fda');
  });

  test('unknown extra columns are reported (as a warning, not a hard fail)', () => {
    const v = verifyImportHeader([...EXPORT_COLUMNS, 'legacy_notes', 'internal_sku']);
    expect(v.ok).toBe(true); // extras do not block — parseProductRow ignores them
    expect(v.unknown).toEqual(['legacy_notes', 'internal_sku']);
  });

  test('whitespace-padded and blank header cells are normalized', () => {
    const padded = EXPORT_COLUMNS.map((c) => ` ${c} `);
    const v = verifyImportHeader([...padded, '', '   ']);
    expect(v.ok).toBe(true);
    expect(v.unknown).toEqual([]); // blank cells are dropped, not treated as unknown
  });

  test('an empty or missing header rejects with everything missing', () => {
    for (const input of [[], null, undefined]) {
      const v = verifyImportHeader(input);
      expect(v.ok).toBe(false);
      expect(v.missing).toEqual(EXPORT_COLUMNS);
    }
  });
});
