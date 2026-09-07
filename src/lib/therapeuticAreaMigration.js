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

module.exports = {
  NEW_THERAPEUTIC_AREAS,
  RENAME,
  SPLIT_SOURCE,
  SPLIT_BY_CATEGORY,
  mapTherapeuticArea,
};
