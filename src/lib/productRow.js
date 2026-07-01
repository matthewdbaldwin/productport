// src/lib/productRow.js — seed CSV row → product/trial upsert payloads.
//
// The catalog seed (prisma/seed.js) is warn-and-report: a malformed row is
// collected and reported, never aborts the batch. This module is the pure parse
// + validation gate it leans on — required-field checks that raise a precise
// error (so the seed log names the fix), blank→null normalization, and the
// per-region clearance mapping through the shared enum. Tested in
// tests/productRow.test.js.
'use strict';
const { clearanceStatus } = require('./clearanceStatus');
const { tierFromWord } = require('./tierPalette');

const REGIONS = ['FDA', 'CE', 'NMPA', 'PMDA'];

// Blank / whitespace / nullish → null; otherwise the trimmed string.
function blankToNull(v) {
  const s = (v == null ? '' : String(v)).trim();
  return s === '' ? null : s;
}

// Parse one seed_products.csv row into an upsert payload + its region clearance
// rows. Throws a precise Error on a missing required field (id/name/subsidiary/
// therapeutic_area) — the seed loop catches it and records the row number.
function parseProductRow(r) {
  const slug = (r.id || '').trim();
  if (!slug) throw new Error('missing id/slug');
  if (!r.name || !r.name.trim()) throw new Error('missing name');
  if (!r.subsidiary || !r.subsidiary.trim()) throw new Error('missing subsidiary');
  if (!r.therapeutic_area || !r.therapeutic_area.trim()) throw new Error('missing therapeutic_area');

  const data = {
    slug,
    name: r.name.trim(),
    subsidiary: r.subsidiary.trim(),
    therapeuticArea: r.therapeutic_area.trim(),
    category: blankToNull(r.category),
    type: blankToNull(r.type),
    tagline: blankToNull(r.tagline),
    overview: blankToNull(r.overview),
    features: blankToNull(r.features),
    indication: blankToNull(r.indication),
    patientPopulation: blankToNull(r.patient_population),
    specs: blankToNull(r.specs),
    regNotes: blankToNull(r.reg_notes),
    image: blankToNull(r.image),
    // Optional strategic tier (Tier 1/2/3). Absent/blank/unknown → null (untiered).
    tier: tierFromWord(r.tier),
    status: 'ACTIVE',
  };

  // One clearance row per region (always 4), mapped through the enum.
  const clearances = REGIONS.map((region) => ({
    region,
    status: clearanceStatus(r[region.toLowerCase()]),
    notes: null,
  }));

  return { slug, data, clearances };
}

// Parse one seed_trials.csv row into a trial payload (caller attaches productId).
function parseTrialRow(t, displayOrder) {
  return {
    trial: (t.trial || '').trim() || '(unnamed trial)',
    identifier: blankToNull(t.identifier),
    n: blankToNull(t.n),
    design: blankToNull(t.design),
    result: blankToNull(t.result),
    displayOrder,
  };
}

module.exports = { parseProductRow, parseTrialRow, blankToNull, REGIONS };
