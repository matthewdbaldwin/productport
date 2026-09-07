// Guards the 10 -> 8 re-filing rules against the real catalog data. The point is
// not that the rules are syntactically valid — it's that they are TOTAL over the
// 417 products and land the distribution the design doc committed to.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const {
  NEW_THERAPEUTIC_AREAS,
  RENAME,
  SPLIT_SOURCE,
  mapTherapeuticArea,
} = require('../src/lib/therapeuticAreaMigration');
const { THERAPEUTIC_AREAS } = require('../src/lib/therapeuticAreas');

const seedRows = () =>
  parse(fs.readFileSync(path.join(__dirname, '..', 'prisma', 'seed-data', 'seed_products.csv'), 'utf8'),
    { columns: true, bom: true, skip_empty_lines: true, trim: false });

describe('therapeutic-area migration rules', () => {
  test('the rule table targets exactly the shipped vocabulary', () => {
    // If the contract's areas and the migration's targets ever diverge, the
    // migration would write values the write path rejects.
    expect([...NEW_THERAPEUTIC_AREAS]).toEqual([...THERAPEUTIC_AREAS]);
  });

  test('every seed product maps to exactly one of the 8 — no row left behind', () => {
    const rows = seedRows();
    const unmapped = rows.filter((r) => mapTherapeuticArea(r.therapeutic_area, r.category) === null);
    expect(unmapped.map((r) => `${r.id} (${r.therapeutic_area})`)).toEqual([]);
    expect(rows).toHaveLength(417);
  });

  test('lands the distribution the design doc committed to', () => {
    // A rule error that still sums to 417 is the failure mode this catches.
    const counts = {};
    for (const r of seedRows()) {
      const a = mapTherapeuticArea(r.therapeutic_area, r.category);
      counts[a] = (counts[a] || 0) + 1;
    }
    expect(counts).toEqual({
      'Comprehensive Cardiac Care': 135,
      'Aortic and Peripheral Vascular Intervention': 33,
      'Robotics, Life Support, and Clinical AI': 25,
      'Neuroscience and Neural Interfaces': 26,
      'Orthopedic Joint, Spine, and Trauma': 105,
      'Urology, Oncology, and Gastroenterology': 54,
      'Endocrinology and Reproductive Health': 19,
      'Advanced Biotechnology and Medical Aesthetics': 20,
    });
  });

  test('is idempotent — re-running over migrated data changes nothing', () => {
    // The prod migration must be safe to re-run; this is the property that
    // makes each UPDATE a no-op the second time.
    for (const area of NEW_THERAPEUTIC_AREAS) {
      expect(mapTherapeuticArea(area)).toBe(area);
    }
  });

  test('the split area is the only one needing a category, and refuses to guess', () => {
    expect(RENAME[SPLIT_SOURCE]).toBeUndefined();
    // An uncategorised row in the retired area must fail loudly rather than
    // land somewhere arbitrary.
    expect(mapTherapeuticArea(SPLIT_SOURCE, '')).toBeNull();
    expect(mapTherapeuticArea(SPLIT_SOURCE, 'Something New')).toBeNull();
    expect(mapTherapeuticArea('Not An Area At All')).toBeNull();
  });

  test('the three unchanged names map to themselves', () => {
    for (const kept of [
      'Orthopedic Joint, Spine, and Trauma',
      'Urology, Oncology, and Gastroenterology',
      'Endocrinology and Reproductive Health',
    ]) {
      expect(mapTherapeuticArea(kept)).toBe(kept);
    }
  });
});
