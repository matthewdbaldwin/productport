// src/lib/productWrite.js — admin-editor write validator/normalizer.
//
// The create/update routes stay thin over this: it turns an editor form payload
// into a clean Prisma-writable `data` object, or throws a precise Error (the
// route maps that to a 400). Distinct from parseProductRow (which takes CSV rows
// and word-normalizes enums): here enums arrive as their canonical values
// (a dropdown emits 'TIER1'/'CORE'/'DRAFT'), so we validate membership.
//
// partial=false (create): slug/name/subsidiary/therapeuticArea required.
// partial=true  (update): only the provided fields are validated + returned, so
//   an omitted field is left untouched and an explicit null clears the value.
// Pure; tested in tests/productWrite.test.js.
'use strict';

const { PRODUCT_TIERS } = require('./tierPalette');
const { PRODUCT_CLASSIFICATIONS } = require('./classification');
const { THERAPEUTIC_AREAS, isTherapeuticArea } = require('./therapeuticAreas');

const STATUSES = ['ACTIVE', 'DISCONTINUED', 'DRAFT'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Text fields: [key, maxLen]. Required ones are checked separately.
const TEXT_FIELDS = {
  slug: 200, name: 255, subsidiary: 200, therapeuticArea: 160, category: 160, type: 200,
  tagline: 500, overview: 20000, features: 20000, indication: 20000, patientPopulation: 20000,
  specs: 20000, regNotes: 20000, image: 300, businessSegment: 200,
  applicableDepartments: 4000, modelNumbers: 20000, developmentStatus: 500,
};
const REQUIRED = ['slug', 'name', 'subsidiary', 'therapeuticArea'];

function trimOrNull(v) {
  const s = (v == null ? '' : String(v)).trim();
  return s === '' ? null : s;
}

function checkEnum(field, value, allowed) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (v === '') return null;
  if (!allowed.includes(v)) throw new Error(`invalid ${field} "${v}" (expected one of: ${allowed.join(', ')})`);
  return v;
}

// input: editor payload (camelCase). opts.partial: update mode.
function validateProductWrite(input, opts = {}) {
  const partial = !!opts.partial;
  if (!input || typeof input !== 'object') throw new Error('missing product payload');
  const data = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);

  // Text fields
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    const required = REQUIRED.includes(key);
    if (partial && !has(key)) continue;              // untouched on update
    if (!partial && !has(key) && !required) { data[key] = null; continue; }
    const val = trimOrNull(input[key]);
    if (required && !val) throw new Error(`missing ${key}`);
    if (val && val.length > max) throw new Error(`${key} too long (max ${max})`);
    if (key === 'slug' && val && !SLUG_RE.test(val)) {
      throw new Error(`invalid slug "${val}" (lowercase letters, digits, hyphens only)`);
    }
    data[key] = val;
  }

  // Therapeutic area is a controlled vocabulary (the canonical 10). Validated
  // when present (always on create; only if provided on partial update).
  if (data.therapeuticArea && !isTherapeuticArea(data.therapeuticArea)) {
    throw new Error(`invalid therapeuticArea "${data.therapeuticArea}" (expected one of: ${THERAPEUTIC_AREAS.join('; ')})`);
  }

  // Enums
  if (has('tier') || !partial) data.tier = checkEnum('tier', input.tier, PRODUCT_TIERS);
  if (has('classification') || !partial) data.classification = checkEnum('classification', input.classification, PRODUCT_CLASSIFICATIONS);
  if (has('status')) {
    data.status = checkEnum('status', input.status, STATUSES) || 'ACTIVE';
  } else if (!partial) {
    data.status = 'ACTIVE';
  }

  return { data };
}

module.exports = { validateProductWrite, STATUSES, SLUG_RE, FIELD_MAX: TEXT_FIELDS };
