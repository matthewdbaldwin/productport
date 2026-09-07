// src/lib/therapeuticAreaMigration.js — the canonical 10 → new 8 re-filing rules.
//
// Single source of truth for the taxonomy migration, shared by the seed-CSV
// rewriter (scripts/migrate-therapeutic-areas.js) and the Prisma data migration.
// Design + rationale: docs/superpowers/specs/2026-09-06-productport-therapeutic-area-taxonomy-design.md
//
// Two rules cover all 417 catalog rows:
//   1. RENAME — destination depends only on the old area (9 of the old 10).
//   2. SPLIT  — 'Emergency and Critical Care' is retired with no successor and
//      splits on `category`. It is the ONLY area needing row-level logic.
'use strict';

// The new eight, in display order. Area 7 is deliberately 'Endocrinology and
// Reproductive Health' and NOT the stakeholder's '...and Regenerative Medicine':
// the regenerative products belong in area 8, so that name would advertise
// content the area does not hold. See Decision A in the design doc.
const NEW_THERAPEUTIC_AREAS = [
  'Comprehensive Cardiac Care',
  'Aortic and Peripheral Vascular Intervention',
  'Robotics, Life Support, and Clinical AI',
  'Neuroscience and Neural Interfaces',
  'Orthopedic Joint, Spine, and Trauma',
  'Urology, Oncology, and Gastroenterology',
  'Endocrinology and Reproductive Health',
  'Advanced Biotechnology and Medical Aesthetics',
];

// Rule 1. Three entries are identity mappings — those names survive the
// migration unchanged, which is why 177 rows are untouched by design.
const RENAME = {
  'Coronary and Structural Heart':                'Comprehensive Cardiac Care',
  'Heart Failure and Electrophysiology':          'Comprehensive Cardiac Care',
  'Aortic and Peripheral Vasculature':            'Aortic and Peripheral Vascular Intervention',
  'Robotic Surgery, AI, and Telesurgery':         'Robotics, Life Support, and Clinical AI',
  'Neurovascular and Brain-Computer Interfaces':  'Neuroscience and Neural Interfaces',
  'Orthopedic Joint, Spine, and Trauma':          'Orthopedic Joint, Spine, and Trauma',
  'Urology, Oncology, and Gastroenterology':      'Urology, Oncology, and Gastroenterology',
  'Endocrinology and Reproductive Health':        'Endocrinology and Reproductive Health',
  'Regenerative Medicine and Medical Aesthetics': 'Advanced Biotechnology and Medical Aesthetics',
};

const SPLIT_SOURCE = 'Emergency and Critical Care';

// Rule 2. `category` is populated on all 17 rows of the retired area, so this
// table is total for real data — but mapTherapeuticArea still returns null on a
// miss rather than guessing, so a new uncategorised row fails loudly.
const SPLIT_BY_CATEGORY = {
  'Extracorporeal life support': 'Robotics, Life Support, and Clinical AI',
  'Occluders & closure devices': 'Comprehensive Cardiac Care',
  'Surgical instruments':        'Urology, Oncology, and Gastroenterology',
};

/**
 * Resolve a product's new therapeutic area.
 * @param {string} therapeuticArea current (canonical-10) area
 * @param {string} [category] product category — only consulted for the split area
 * @returns {string|null} one of NEW_THERAPEUTIC_AREAS, or null if unmappable
 */
function mapTherapeuticArea(therapeuticArea, category) {
  const area = (therapeuticArea || '').trim();
  if (Object.prototype.hasOwnProperty.call(RENAME, area)) return RENAME[area];
  if (area === SPLIT_SOURCE) {
    const cat = (category || '').trim();
    return Object.prototype.hasOwnProperty.call(SPLIT_BY_CATEGORY, cat) ? SPLIT_BY_CATEGORY[cat] : null;
  }
  // Already migrated is a no-op, so the migration is idempotent by construction.
  if (NEW_THERAPEUTIC_AREAS.includes(area)) return area;
  return null;
}

// ---------------------------------------------------------------------------
// SQL projection of the rules above.
//
// The Prisma data migration is GENERATED from this table rather than restating
// it, and tests/therapeuticAreaMigration.test.js regenerates it and fails on
// drift. Without that, "single source of truth" is a comment rather than a
// property: the CSV rewriter and the migration could silently disagree, and the
// disagreement would only surface as mis-filed rows in prod.

const MIGRATION_DIR = '20260906230000_therapeutic_areas_10_to_8';

const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;
const update = (to, where) => `UPDATE "products" SET "therapeuticArea" = ${sql(to)} WHERE ${where};`;

/**
 * Render the Release 2 data migration. Deterministic — same rules in, same
 * bytes out — so a test can assert the committed file still matches.
 * @returns {string} the full contents of the migration.sql
 */
function buildMigrationSql() {
  const out = [
    '-- Release 2 of the 10 -> 8 therapeutic-area taxonomy migration: re-file the',
    '-- catalog rows that already exist. Release 1 (the additive contract,',
    '-- microport-contracts 0.21.0) is already live, so both vocabularies validate',
    '-- and there is no window where the database holds values the write path',
    '-- rejects. Design + rationale:',
    '-- docs/superpowers/specs/2026-09-06-productport-therapeutic-area-taxonomy-design.md',
    '--',
    '-- GENERATED from src/lib/therapeuticAreaMigration.js, the same rule table the',
    '-- seed-CSV rewriter uses. Do not hand-edit: tests/therapeuticAreaMigration.test.js',
    '-- regenerates this file and fails if the two drift apart.',
    '--',
    '-- Prisma 7 + adapter-pg migrations are NOT transactional',
    '-- (feedback_prisma7_non_transactional_migrations), so every statement stands',
    '-- alone and is individually idempotent: each WHERE matches only retired',
    '-- values, so a second run touches zero rows.',
    '--',
    '-- The three identity mappings are deliberately absent — those names survive',
    '-- the migration unchanged, which is why 177 of the 417 rows are untouched by',
    '-- design and the post-migration recount must expect that rather than read it',
    '-- as a failure.',
    '--',
    '-- Soft-deleted rows are migrated too (no deletedAt filter): restoring one',
    '-- must not resurrect a retired area.',
    '',
    '-- Rule 1 - RENAME. Destination depends only on the old area.',
  ];

  for (const [from, to] of Object.entries(RENAME)) {
    if (from === to) continue; // identity: nothing to write
    out.push(update(to, `"therapeuticArea" = ${sql(from)}`));
  }

  out.push(
    '',
    `-- Rule 2 - SPLIT. ${SPLIT_SOURCE} retires with no successor and splits on`,
    '-- category. It is the only area needing row-level logic.',
  );
  for (const [category, to] of Object.entries(SPLIT_BY_CATEGORY)) {
    out.push(update(to, `"therapeuticArea" = ${sql(SPLIT_SOURCE)} AND "category" = ${sql(category)}`));
  }

  out.push(
    '',
    '-- Guard. Mirrors mapTherapeuticArea returning null rather than guessing: a row',
    '-- still sitting in the retired area is uncategorised, or carries a category the',
    '-- split table has never seen. Stop the deploy rather than strand it silently.',
    'DO $$',
    'DECLARE',
    '  stranded INTEGER;',
    'BEGIN',
    `  SELECT count(*) INTO stranded FROM "products" WHERE "therapeuticArea" = ${sql(SPLIT_SOURCE)};`,
    '  IF stranded > 0 THEN',
    `    RAISE EXCEPTION 'therapeutic-area migration: % row(s) still hold the retired area ${SPLIT_SOURCE}. Their category is missing, or absent from SPLIT_BY_CATEGORY in src/lib/therapeuticAreaMigration.js.', stranded;`,
    '  END IF;',
    'END $$;',
    '',
  );

  return out.join('\n');
}

module.exports = {
  NEW_THERAPEUTIC_AREAS,
  RENAME,
  SPLIT_SOURCE,
  SPLIT_BY_CATEGORY,
  mapTherapeuticArea,
  MIGRATION_DIR,
  buildMigrationSql,
};
