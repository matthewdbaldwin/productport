// Behavior of the seed CSV row → product upsert payload parser/validator.
// This is the warn-and-report import gate: a malformed row must raise a precise
// error (so the seed log names what to fix) without the parser silently
// coercing junk into the catalog. The clearance columns are mapped through the
// shared enum module.
'use strict';
const { parseProductRow, parseTrialRow, blankToNull } = require('../src/lib/productRow');

function csvRow(overrides = {}) {
  return {
    id: 'firehawk',
    name: 'Firehawk',
    subsidiary: 'MicroPort Cardiovascular',
    therapeutic_area: 'Coronary and Structural Heart',
    category: 'Drug-Eluting Stent',
    type: '  ',
    tagline: 'Target-eluting',
    overview: '',
    features: 'a|b',
    indication: '',
    patient_population: '',
    specs: '',
    reg_notes: '',
    image: 'firehawk.jpg',
    fda: 'in progress',
    ce: 'cleared',
    nmpa: 'cleared',
    pmda: '',
    ...overrides,
  };
}

describe('blankToNull', () => {
  test('blank / whitespace / nullish become null; real text is trimmed', () => {
    expect(blankToNull('')).toBeNull();
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull('  hi ')).toBe('hi');
  });
});

describe('parseProductRow — required-field validation', () => {
  test('throws "missing id/slug" when id is blank', () => {
    expect(() => parseProductRow(csvRow({ id: '   ' }))).toThrow(/missing id\/slug/);
  });
  test('throws "missing name" when name is blank', () => {
    expect(() => parseProductRow(csvRow({ name: '' }))).toThrow(/missing name/);
  });
  test('throws "missing subsidiary" when subsidiary is blank', () => {
    expect(() => parseProductRow(csvRow({ subsidiary: '' }))).toThrow(/missing subsidiary/);
  });
  test('throws "missing therapeutic_area" when therapeutic_area is blank', () => {
    expect(() => parseProductRow(csvRow({ therapeutic_area: '' }))).toThrow(/missing therapeutic_area/);
  });
  test('rejects a slug that is not url-safe (spaces/uppercase)', () => {
    expect(() => parseProductRow(csvRow({ id: 'Fire Hawk' }))).toThrow(/slug/i);
    expect(() => parseProductRow(csvRow({ id: 'fire_hawk' }))).toThrow(/slug/i);
  });
  test('rejects a therapeutic_area outside the canonical 10', () => {
    expect(() => parseProductRow(csvRow({ therapeutic_area: 'Coronary' }))).toThrow(/therapeutic_area/i);
  });
  test('rejects an over-long free-text cell (length cap)', () => {
    expect(() => parseProductRow(csvRow({ tagline: 'x'.repeat(600) }))).toThrow(/tagline.*long|too long/i);
  });
});

describe('parseProductRow — payload shape', () => {
  test('trims required fields; omits status when the CSV carries none (preserve-on-reimport)', () => {
    const { data } = parseProductRow(csvRow({ id: ' firehawk ', name: ' Firehawk ' }));
    expect(data.slug).toBe('firehawk');
    expect(data.name).toBe('Firehawk');
    // status is omitted, not forced to ACTIVE — create falls back to the schema
    // default, update leaves an admin-set DISCONTINUED/DRAFT untouched.
    expect('status' in data).toBe(false);
  });

  test('sets status only when the CSV provides it; rejects an invalid value', () => {
    expect(parseProductRow(csvRow({ status: 'discontinued' })).data.status).toBe('DISCONTINUED');
    expect(parseProductRow(csvRow({ status: 'DRAFT' })).data.status).toBe('DRAFT');
    expect(() => parseProductRow(csvRow({ status: 'LIVE' }))).toThrow(/status/i);
  });

  test('blank optional fields become null (not empty string)', () => {
    const { data } = parseProductRow(csvRow());
    expect(data.type).toBeNull();      // was "  "
    expect(data.overview).toBeNull();
    expect(data.specs).toBeNull();
    expect(data.category).toBe('Drug-Eluting Stent');
  });

  test('maps the region columns through the clearance enum (TGA blank → NONE)', () => {
    const { clearances } = parseProductRow(csvRow());
    const byRegion = Object.fromEntries(clearances.map((c) => [c.region, c.status]));
    expect(byRegion).toEqual({ FDA: 'IN_PROGRESS', CE: 'APPROVED', NMPA: 'APPROVED', PMDA: 'NONE', TGA: 'NONE' });
  });

  test('always emits one clearance row per region (5 total: FDA/CE/NMPA/PMDA/TGA)', () => {
    expect(parseProductRow(csvRow()).clearances).toHaveLength(5);
  });
});

describe('parseProductRow — tier column', () => {
  test('maps a "tier" cell through tierFromWord (Tier 1 → TIER1)', () => {
    expect(parseProductRow(csvRow({ tier: 'Tier 1' })).data.tier).toBe('TIER1');
    expect(parseProductRow(csvRow({ tier: '2' })).data.tier).toBe('TIER2');
    expect(parseProductRow(csvRow({ tier: 'TIER3' })).data.tier).toBe('TIER3');
  });

  test('a blank / missing / unknown tier is omitted (preserved on re-import), never a throw', () => {
    expect('tier' in parseProductRow(csvRow({ tier: '' })).data).toBe(false);
    expect('tier' in parseProductRow(csvRow({ tier: 'platinum' })).data).toBe(false);
    // The column is optional — a CSV without it at all still parses.
    const noTierRow = csvRow(); delete noTierRow.tier;
    expect('tier' in parseProductRow(noTierRow).data).toBe(false);
  });
});

describe('parseProductRow — brochure dimensions (Slice 1.5)', () => {
  test('maps business_segment, applicable_departments, model_numbers, development_status', () => {
    const d = parseProductRow(csvRow({
      business_segment: 'Heart Failure Management & Electrophysiology',
      applicable_departments: 'Cath Lab|ICU',
      model_numbers: 'TSL0638|TSL1638',
      development_status: 'Under Development — est. cert Feb 2026',
    })).data;
    expect(d.businessSegment).toBe('Heart Failure Management & Electrophysiology');
    expect(d.applicableDepartments).toBe('Cath Lab|ICU');
    expect(d.modelNumbers).toBe('TSL0638|TSL1638');
    expect(d.developmentStatus).toBe('Under Development — est. cert Feb 2026');
  });

  test('blank/missing brochure columns become null (all optional)', () => {
    const d = parseProductRow(csvRow()).data; // csvRow has none of the new cols
    expect(d.businessSegment).toBeNull();
    expect(d.applicableDepartments).toBeNull();
    expect(d.modelNumbers).toBeNull();
    expect(d.developmentStatus).toBeNull();
    expect('classification' in d).toBe(false);  // omitted when blank (preserve on re-import)
  });

  test('classification maps through classificationFromWord (Core → CORE); blank/unknown omitted', () => {
    expect(parseProductRow(csvRow({ classification: 'Core' })).data.classification).toBe('CORE');
    expect(parseProductRow(csvRow({ classification: 'hi-po' })).data.classification).toBe('HIPO');
    expect('classification' in parseProductRow(csvRow({ classification: 'platinum' })).data).toBe(false);
  });

  test('emits a TGA clearance row (5 regions total: FDA/CE/NMPA/PMDA/TGA)', () => {
    const { clearances } = parseProductRow(csvRow({ tga: 'cleared' }));
    const regions = clearances.map((c) => c.region).sort();
    expect(regions).toEqual(['CE', 'FDA', 'NMPA', 'PMDA', 'TGA']);
    expect(clearances.find((c) => c.region === 'TGA').status).toBe('APPROVED');
  });
});

describe('parseTrialRow', () => {
  test('defaults a blank trial name to a placeholder and nulls blank optionals', () => {
    const t = parseTrialRow({ trial: '', identifier: 'NCT9', n: '', design: 'RCT', result: '' }, 3);
    expect(t.trial).toBe('(unnamed trial)');
    expect(t.identifier).toBe('NCT9');
    expect(t.n).toBeNull();
    expect(t.design).toBe('RCT');
    expect(t.displayOrder).toBe(3);
  });
});
