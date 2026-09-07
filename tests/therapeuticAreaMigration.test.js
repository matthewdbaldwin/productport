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
  SPLIT_BY_CATEGORY,
  mapTherapeuticArea,
  MIGRATION_DIR,
  buildMigrationSql,
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

// Apply the migration's UPDATEs the way Postgres would: in file order, each one
// rewriting every row its WHERE matches. Only the two statement shapes this
// migration emits are understood — an unrecognised one throws rather than being
// silently skipped, which would make the whole simulation vacuously pass.
const UPDATE_RE = /^UPDATE "products" SET "therapeuticArea" = '(.+?)' WHERE "therapeuticArea" = '(.+?)'(?: AND "category" = '(.+?)')?;$/;

function applyMigration(rows) {
  const statements = buildMigrationSql().split('\n').filter((l) => l.startsWith('UPDATE '));
  expect(statements.length).toBeGreaterThan(0);
  for (const statement of statements) {
    const m = UPDATE_RE.exec(statement);
    if (!m) throw new Error(`unsupported statement shape: ${statement}`);
    const [, to, fromArea, fromCategory] = m;
    for (const row of rows) {
      if (row.therapeuticArea !== fromArea) continue;
      if (fromCategory !== undefined && row.category !== fromCategory) continue;
      row.therapeuticArea = to;
    }
  }
  return rows;
}

describe('the Prisma data migration (Release 2)', () => {
  const migrationSql = () =>
    fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', MIGRATION_DIR, 'migration.sql'), 'utf8');

  test('the committed migration still matches the rule table', () => {
    // The migration is a PROJECTION of the rules, not a second copy of them.
    // Edit one side only and this is what catches it; without it the two would
    // first disagree in prod, as mis-filed rows nobody is looking for.
    expect(migrationSql()).toBe(buildMigrationSql());
  });

  test('the SQL agrees with mapTherapeuticArea on every input the rules define', () => {
    // Byte-equality above proves the file matches the generator. This proves the
    // generator matches the function the CSV rewriter and seed data were built
    // from — otherwise both could be self-consistently wrong.
    const inputs = [
      ...Object.keys(RENAME).map((therapeuticArea) => ({ therapeuticArea, category: null })),
      ...Object.keys(SPLIT_BY_CATEGORY).map((category) => ({ therapeuticArea: SPLIT_SOURCE, category })),
      // Already-migrated rows must survive a re-run untouched.
      ...NEW_THERAPEUTIC_AREAS.map((therapeuticArea) => ({ therapeuticArea, category: null })),
    ];
    const expected = inputs.map((r) => mapTherapeuticArea(r.therapeuticArea, r.category));
    const actual = applyMigration(inputs.map((r) => ({ ...r }))).map((r) => r.therapeuticArea);
    expect(actual).toEqual(expected);
  });

  test('no statement can re-update a row an earlier one already moved', () => {
    // Sequential UPDATEs cascade if any target is also a later WHERE value — a
    // row would land two areas past where the rules put it. It is not true here,
    // and this is what keeps it true as the table grows.
    const sql = buildMigrationSql();
    const targets = new Set([...sql.matchAll(/SET "therapeuticArea" = '([^']+)'/g)].map((m) => m[1]));
    const sources = [...sql.matchAll(/WHERE "therapeuticArea" = '([^']+)'/g)].map((m) => m[1]);
    expect(sources.filter((s) => targets.has(s))).toEqual([]);
  });

  test('never names a surviving area in a WHERE — the 177 untouched rows stay untouched', () => {
    const sources = [...buildMigrationSql().matchAll(/WHERE "therapeuticArea" = '([^']+)'/g)].map((m) => m[1]);
    for (const kept of [
      'Orthopedic Joint, Spine, and Trauma',
      'Urology, Oncology, and Gastroenterology',
      'Endocrinology and Reproductive Health',
    ]) {
      expect(sources).not.toContain(kept);
    }
  });

  test('writes only values the shipped vocabulary accepts', () => {
    const targets = [...buildMigrationSql().matchAll(/SET "therapeuticArea" = '([^']+)'/g)].map((m) => m[1]);
    expect([...new Set(targets)].filter((t) => !THERAPEUTIC_AREAS.includes(t))).toEqual([]);
  });

  test('refuses to finish with rows stranded in the retired split area', () => {
    // The SQL counterpart of mapTherapeuticArea returning null: an uncategorised
    // row would otherwise be left holding a value Release 3 will reject.
    const sql = buildMigrationSql();
    expect(sql).toContain(`SELECT count(*) INTO stranded FROM "products" WHERE "therapeuticArea" = '${SPLIT_SOURCE}';`);
    expect(sql).toContain('RAISE EXCEPTION');
  });
});
