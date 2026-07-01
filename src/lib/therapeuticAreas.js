// src/lib/therapeuticAreas.js — the catalog's canonical 10 therapeutic areas.
//
// ProductPort classifies every product into exactly one of these 10 areas
// (set 2026-07-01). This is the single source of truth: productWrite validates
// against it, and the web edit form + catalog filter render from a mirror of it
// (web/lib/products.ts THERAPEUTIC_AREAS — keep the two in sync). Ordered for
// display. Tested in tests/therapeuticAreas.test.js.
'use strict';

const THERAPEUTIC_AREAS = [
  'Coronary and Structural Heart',
  'Heart Failure and Electrophysiology',
  'Aortic and Peripheral Vasculature',
  'Robotic Surgery, AI, and Telesurgery',
  'Neurovascular and Brain-Computer Interfaces',
  'Orthopedic Joint, Spine, and Trauma',
  'Urology, Oncology, and Gastroenterology',
  'Emergency and Critical Care',
  'Endocrinology and Reproductive Health',
  'Regenerative Medicine and Medical Aesthetics',
];

const THERAPEUTIC_AREA_SET = new Set(THERAPEUTIC_AREAS);

function isTherapeuticArea(v) {
  return THERAPEUTIC_AREA_SET.has((v || '').trim());
}

module.exports = { THERAPEUTIC_AREAS, isTherapeuticArea };
