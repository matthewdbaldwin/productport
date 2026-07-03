// src/lib/classification.js — product classification word → ProductClassification enum.
//
// The GloMatrix brochure defines three business classifications:
//   Core     — ">80% of group sales, stable cash flow over 3 years"
//   Hi-po    — "high growth / high gross profit, cornerstone within 5 years"
//   Flagship — the "1" in the 1+10+5 model
// The brochure tags no individual product with these (they're defined only in
// front-matter), so classification is assigned manually via the admin editor /
// CSV, NOT auto-derived. This is the single word→enum mapping; unknown/blank →
// null (unclassified), never a throw, so a stray CSV cell can't abort an import.
// Separate from `tier` (a generic 1/2/3 ranking). Tested in tests/classification.test.js.
'use strict';

// The Prisma ProductClassification enum, mirrored so the output set is
// self-describing. Keep in sync with prisma/schema.prisma.
const PRODUCT_CLASSIFICATIONS = ['CORE', 'HIPO', 'FLAGSHIP'];

const FROM_WORD = {
  core: 'CORE',
  'core product': 'CORE',
  'core products': 'CORE',
  hipo: 'HIPO',
  'hi-po': 'HIPO',
  'hi po': 'HIPO',
  'hi-po products': 'HIPO',
  'high potential': 'HIPO',
  flagship: 'FLAGSHIP',
};

// Normalize a raw classification cell to the enum. Unknown/blank/nullish → null.
function classificationFromWord(word) {
  return FROM_WORD[(word || '').trim().toLowerCase()] ?? null;
}

module.exports = { classificationFromWord, PRODUCT_CLASSIFICATIONS, FROM_WORD };
