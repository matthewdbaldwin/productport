// src/lib/countryClearanceWrite.js — CountryClearance write validator/normalizer
// (HubPort forum #22, D6). Mirrors clearanceWrite.js's shape: pure, field-tagged
// errors, no DB/HTTP. Rejects any country RegulatoryClearance already covers (US,
// China, Japan, Australia, every EU/EEA member) so the two models never describe
// the same regulatory fact — see CONTEXT.md and ADR-0001. Tested in
// tests/countryClearanceWrite.test.js.
'use strict';
const { CLEARANCE_STATUSES } = require('./clearanceStatus');

const STATUS_SET = new Set(CLEARANCE_STATUSES);
const MATERIAL_REF_MAX = 100;

// RegulatoryClearance's five jurisdictions, expanded to the ISO 3166-1 alpha-2
// countries they cover. FDA/NMPA/PMDA/TGA are each already a single country; CE
// covers every EU member plus the EEA-only additions (Iceland, Liechtenstein,
// Norway) — not Switzerland, which is EFTA but not EEA.
const EU_MEMBERS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];
const EEA_ONLY = ['IS', 'LI', 'NO'];
const REGULATORY_CLEARANCE_COUNTRIES = new Set(['US', 'CN', 'JP', 'AU', ...EU_MEMBERS, ...EEA_ONLY]);

// Deterministic country → RegulatoryClearance region, so a country-based lookup
// (src/routes/opsport.js) can route to the right table without reconciling
// anything — a country never has data in both, so there's nothing to merge.
const REGION_BY_COUNTRY = {
  US: 'FDA', CN: 'NMPA', JP: 'PMDA', AU: 'TGA',
  ...Object.fromEntries([...EU_MEMBERS, ...EEA_ONLY].map((c) => [c, 'CE'])),
};

// Null when the country isn't one of RegulatoryClearance's jurisdictions —
// i.e. CountryClearance is the table to check instead.
function regionForCountry(country) {
  return REGION_BY_COUNTRY[String(country || '').trim().toUpperCase()] || null;
}

function fieldError(field, message) {
  const e = new Error(message);
  e.field = field;
  return e;
}

function blankToNull(v) {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
}

function validateCountryClearance(input) {
  const raw = (input && input.country != null ? String(input.country) : '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw)) {
    throw fieldError('country', `invalid country "${raw}" (expected an ISO 3166-1 alpha-2 code)`);
  }
  if (REGULATORY_CLEARANCE_COUNTRIES.has(raw)) {
    throw fieldError('country', `"${raw}" is already covered by RegulatoryClearance — use that model instead`);
  }

  let status = (input.status != null ? String(input.status) : '').trim();
  if (status === '') status = 'NONE';
  if (!STATUS_SET.has(status)) {
    throw fieldError('status', `invalid status "${status}" (expected one of: ${CLEARANCE_STATUSES.join(', ')})`);
  }

  const materialRef = blankToNull(input.materialRef);
  if (materialRef && materialRef.length > MATERIAL_REF_MAX) {
    throw fieldError('materialRef', `materialRef too long (max ${MATERIAL_REF_MAX})`);
  }

  return { country: raw, status, materialRef };
}

module.exports = { validateCountryClearance, REGULATORY_CLEARANCE_COUNTRIES, regionForCountry };
