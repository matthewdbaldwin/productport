// src/lib/therapeuticAreas.js — the catalog's canonical 10 therapeutic areas.
//
// ProductPort classifies every product into exactly one of these 10 areas
// (set 2026-07-01). As of Phase 2 of the product master-data PRD (2026-07-16)
// the list is RE-EXPORTED from the shared vocabulary contract
// (@matthewdbaldwin/microport-contracts >= 0.10.0) so there is exactly ONE
// definition across the fleet — satellites validate against the same source
// instead of drifting private copies. productWrite validates against this, and
// the web edit form + catalog filter render from a mirror of it
// (web/lib/products.ts THERAPEUTIC_AREAS — keep the two in sync).
// tests/vocabularyContract.test.js golden-pins the 10 values, so a contract-side
// drift becomes a RED TEST here rather than a silently-changed catalog.
'use strict';

const { THERAPEUTIC_AREAS, isTherapeuticArea } = require('@matthewdbaldwin/microport-contracts');

module.exports = { THERAPEUTIC_AREAS, isTherapeuticArea };
