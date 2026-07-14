// src/lib/serializeProductRow.js — catalog product → seed-CSV row (export).
//
// The inverse of parseProductRow: a Prisma product (+ its clearance rows) becomes
// a flat row object keyed by the seed_products.csv columns, plus the new
// dimension columns (tier, classification, business_segment, applicable_departments,
// model_numbers, development_status) and all 5 regulatory word columns. The
// round-trip parseProductRow(serializeProductRow(x)) == x is the contract that
// keeps export -> edit -> re-import lossless. Tested in tests/serializeProductRow.test.js.
'use strict';

// Enum → the CSV word parseProductRow's clearanceStatus() maps back to the enum.
const WORD_FROM_STATUS = {
  APPROVED: 'cleared',
  IN_PROGRESS: 'in progress',
  SUBMITTED: 'submitted',
  NOT_APPROVED: 'not cleared',
  NONE: '',
};

// Stable header order — seed columns first (so a diff against the builder's
// seed_products.csv is clean), then the new dimensions, then regulatory words.
const EXPORT_COLUMNS = [
  'id', 'name', 'subsidiary', 'therapeutic_area', 'category', 'type', 'tagline', 'overview',
  'features', 'indication', 'patient_population', 'specs', 'reg_notes', 'image',
  'tier', 'classification', 'business_segment', 'applicable_departments', 'model_numbers', 'development_status',
  'status',
  'fda', 'fda_cert', 'fda_qualifier',
  'ce', 'ce_cert', 'ce_qualifier',
  'nmpa', 'nmpa_cert', 'nmpa_qualifier',
  'pmda', 'pmda_cert', 'pmda_qualifier',
  'tga', 'tga_cert', 'tga_qualifier',
];

const blank = (v) => (v == null ? '' : String(v));

function serializeProductRow(p, clearances = []) {
  const word = {}, cert = {}, qual = {};
  for (const c of clearances) {
    word[c.region] = WORD_FROM_STATUS[c.status] ?? '';
    cert[c.region] = blank(c.certificateNumbers);
    qual[c.region] = blank(c.qualifier);
  }

  return {
    id: blank(p.slug),
    name: blank(p.name),
    subsidiary: blank(p.subsidiary),
    therapeutic_area: blank(p.therapeuticArea),
    category: blank(p.category),
    type: blank(p.type),
    tagline: blank(p.tagline),
    overview: blank(p.overview),
    features: blank(p.features),
    indication: blank(p.indication),
    patient_population: blank(p.patientPopulation),
    specs: blank(p.specs),
    reg_notes: blank(p.regNotes),
    image: blank(p.image),
    tier: blank(p.tier),                       // 'TIER1' — tierFromWord round-trips it
    classification: blank(p.classification),   // 'CORE'  — classificationFromWord lowercases
    business_segment: blank(p.businessSegment),
    applicable_departments: blank(p.applicableDepartments),
    model_numbers: blank(p.modelNumbers),
    development_status: blank(p.developmentStatus),
    status: blank(p.status),                   // ACTIVE/DISCONTINUED/DRAFT — round-trips so re-import preserves it
    fda: word.FDA ?? '', fda_cert: cert.FDA ?? '', fda_qualifier: qual.FDA ?? '',
    ce: word.CE ?? '', ce_cert: cert.CE ?? '', ce_qualifier: qual.CE ?? '',
    nmpa: word.NMPA ?? '', nmpa_cert: cert.NMPA ?? '', nmpa_qualifier: qual.NMPA ?? '',
    pmda: word.PMDA ?? '', pmda_cert: cert.PMDA ?? '', pmda_qualifier: qual.PMDA ?? '',
    tga: word.TGA ?? '', tga_cert: cert.TGA ?? '', tga_qualifier: qual.TGA ?? '',
  };
}

module.exports = { serializeProductRow, EXPORT_COLUMNS, WORD_FROM_STATUS };
