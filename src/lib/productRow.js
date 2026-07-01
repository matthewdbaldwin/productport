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
const { classificationFromWord } = require('./classification');
const { isTherapeuticArea, THERAPEUTIC_AREAS } = require('./therapeuticAreas');
const { SLUG_RE, STATUSES, FIELD_MAX } = require('./productWrite');

// TGA (Australia) added as a 5th region 2026-07-01 — the brochure carries it on
// most products. RegulatoryClearance is region-generic, so this needs no schema
// change: every product now gets 5 clearance rows.
const REGIONS = ['FDA', 'CE', 'NMPA', 'PMDA', 'TGA'];

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
  // Same slug-format contract as the manual editor (productWrite.SLUG_RE) — a CSV
  // id becomes the row's URL key, so it can't carry spaces/slashes/uppercase.
  if (!SLUG_RE.test(slug)) throw new Error(`invalid id/slug "${slug}" (lowercase letters, digits, hyphens only)`);
  if (!r.name || !r.name.trim()) throw new Error('missing name');
  if (!r.subsidiary || !r.subsidiary.trim()) throw new Error('missing subsidiary');
  const therapeuticArea = (r.therapeutic_area || '').trim();
  if (!therapeuticArea) throw new Error('missing therapeutic_area');
  // Controlled vocabulary — the canonical 10, same gate the editor enforces.
  if (!isTherapeuticArea(therapeuticArea)) {
    throw new Error(`invalid therapeutic_area "${therapeuticArea}" (expected one of: ${THERAPEUTIC_AREAS.join('; ')})`);
  }

  const data = {
    slug,
    name: r.name.trim(),
    subsidiary: r.subsidiary.trim(),
    therapeuticArea,
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
    businessSegment: blankToNull(r.business_segment),
    applicableDepartments: blankToNull(r.applicable_departments),
    modelNumbers: blankToNull(r.model_numbers),
    developmentStatus: blankToNull(r.development_status),
  };

  // tier / classification / status: admin-managed fields. Include them ONLY when
  // the CSV actually carries a value, so a blank cell on re-import PRESERVES what
  // an admin set (create falls back to the schema default / null) instead of
  // reverting it — the status-clobber + tier-null-on-blank traps (2026-07-01).
  const tier = tierFromWord(r.tier);
  if (tier) data.tier = tier;
  const classification = classificationFromWord(r.classification);
  if (classification) data.classification = classification;
  const status = (r.status || '').trim().toUpperCase();
  if (status) {
    if (!STATUSES.includes(status)) throw new Error(`invalid status "${status}" (expected one of: ${STATUSES.join(', ')})`);
    data.status = status;
  }

  // Length caps — mirror the editor validator so the bulk path can't write an
  // over-long free-text cell that bloats a @db.Text column.
  for (const [key, max] of Object.entries(FIELD_MAX)) {
    if (data[key] != null && String(data[key]).length > max) throw new Error(`${key} too long (max ${max})`);
  }

  // One clearance row per region (all 5: FDA/CE/NMPA/PMDA/TGA), mapped through the enum.
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
