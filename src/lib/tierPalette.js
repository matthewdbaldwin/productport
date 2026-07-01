// src/lib/tierPalette.js — product strategic tier: CSV word → enum + display palette.
//
// Products carry a single strategic tier (Tier 1/2/3, or untiered = null). Two
// concerns, both pure + deep like clearanceStatus:
//   tierFromWord(word) — normalize a seed/CSV cell ("Tier 1", "t1", "1", …) to
//                        the Prisma `ProductTier` enum, or null when untiered.
//   tierMeta(tier)     — the enum → { label, bg, fg } badge palette. Gold /
//                        Silver / Bronze — a fixed, intentional medal scheme
//                        (NOT a theme-token status map, so explicit hex is
//                        correct here; it must read the same in every theme).
// Tested in tests/tierPalette.test.js.
'use strict';

// The Prisma ProductTier enum, mirrored so the output set is self-describing.
// Keep in sync with prisma/schema.prisma.
const PRODUCT_TIERS = ['TIER1', 'TIER2', 'TIER3'];

// Word → enum. Accepts the enum spelling, "tierN", "tN", "tier N" and bare "N".
const TIER_FROM_WORD = {
  '1': 'TIER1', t1: 'TIER1', tier1: 'TIER1', 'tier 1': 'TIER1',
  '2': 'TIER2', t2: 'TIER2', tier2: 'TIER2', 'tier 2': 'TIER2',
  '3': 'TIER3', t3: 'TIER3', tier3: 'TIER3', 'tier 3': 'TIER3',
};

// Normalize a raw tier cell to the enum. Unknown / blank / nullish → null
// (untiered), never a throw — a stray value must not abort a CSV import.
function tierFromWord(word) {
  return TIER_FROM_WORD[(word || '').trim().toLowerCase()] ?? null;
}

// Gold / Silver / Bronze. Each pair is contrast-checked for a small badge
// (dark ink on a warm/cool metal fill).
const TIER_META = {
  TIER1: { label: 'Tier 1', bg: '#E8B923', fg: '#3D2E00' }, // gold
  TIER2: { label: 'Tier 2', bg: '#B8BEC7', fg: '#26292E' }, // silver
  TIER3: { label: 'Tier 3', bg: '#C77B3B', fg: '#2E1600' }, // bronze
};

// enum → display palette. null/unknown → null (render no badge).
function tierMeta(tier) {
  return TIER_META[tier] ?? null;
}

module.exports = { tierFromWord, tierMeta, PRODUCT_TIERS, TIER_META, TIER_FROM_WORD };
