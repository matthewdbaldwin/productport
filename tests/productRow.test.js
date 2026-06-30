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
    therapeutic_area: 'Coronary',
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
});

describe('parseProductRow — payload shape', () => {
  test('trims required fields and sets status ACTIVE', () => {
    const { data } = parseProductRow(csvRow({ id: ' firehawk ', name: ' Firehawk ' }));
    expect(data.slug).toBe('firehawk');
    expect(data.name).toBe('Firehawk');
    expect(data.status).toBe('ACTIVE');
  });

  test('blank optional fields become null (not empty string)', () => {
    const { data } = parseProductRow(csvRow());
    expect(data.type).toBeNull();      // was "  "
    expect(data.overview).toBeNull();
    expect(data.specs).toBeNull();
    expect(data.category).toBe('Drug-Eluting Stent');
  });

  test('maps the four region columns through the clearance enum', () => {
    const { clearances } = parseProductRow(csvRow());
    const byRegion = Object.fromEntries(clearances.map((c) => [c.region, c.status]));
    expect(byRegion).toEqual({ FDA: 'IN_PROGRESS', CE: 'APPROVED', NMPA: 'APPROVED', PMDA: 'NONE' });
  });

  test('always emits one clearance row per region (4 total)', () => {
    expect(parseProductRow(csvRow()).clearances).toHaveLength(4);
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
