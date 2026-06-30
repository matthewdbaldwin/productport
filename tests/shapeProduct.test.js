// Behavior of the Prisma-row → client-catalog-contract transform.
// The catalog API returns whatever shape() produces; the web Product interface
// is pinned to it. A drift here (a dropped field, an unsorted relation, a null
// leaking through) is silent data loss in the UI — so the contract is locked
// by these tests.
'use strict';
const { shapeProduct } = require('../src/lib/shapeProduct');

// A representative Prisma product row (relations included, mixed null fields).
function row(overrides = {}) {
  return {
    id: 42,
    slug: 'firehawk',
    name: 'Firehawk',
    subsidiary: 'MicroPort Cardiovascular',
    therapeuticArea: 'Coronary',
    category: 'Drug-Eluting Stent',
    type: null,
    tagline: 'Target-eluting',
    overview: null,
    features: 'a|b',
    indication: null,
    patientPopulation: null,
    specs: null,
    regNotes: null,
    image: 'firehawk.jpg',
    status: 'ACTIVE',
    clearances: [
      { region: 'NMPA', status: 'APPROVED', notes: null },
      { region: 'CE', status: 'APPROVED', notes: 'note' },
      { region: 'FDA', status: 'IN_PROGRESS', notes: null },
    ],
    trials: [
      { trial: 'TARGET II', identifier: 'NCT01', n: '2737', design: 'RCT', result: 'non-inferior', displayOrder: 1 },
      { trial: 'TARGET I', identifier: 'NCT00', n: '460', design: 'RCT', result: 'positive', displayOrder: 0 },
    ],
    ...overrides,
  };
}

describe('shapeProduct — Prisma row → catalog contract', () => {
  test('exposes the slug as the routable id, not the numeric PK', () => {
    expect(shapeProduct(row()).id).toBe('firehawk');
  });

  test('maps the core scalar fields through unchanged', () => {
    const out = shapeProduct(row());
    expect(out.name).toBe('Firehawk');
    expect(out.subsidiary).toBe('MicroPort Cardiovascular');
    expect(out.therapeuticArea).toBe('Coronary');
    expect(out.status).toBe('ACTIVE');
  });

  test('coerces null text fields to empty strings (UI reads them as strings)', () => {
    const out = shapeProduct(row());
    expect(out.type).toBe('');
    expect(out.overview).toBe('');
    expect(out.indication).toBe('');
    expect(out.specs).toBe('');
  });

  test('keeps image as null when absent rather than empty string', () => {
    expect(shapeProduct(row({ image: null })).image).toBeNull();
    expect(shapeProduct(row()).image).toBe('firehawk.jpg');
  });

  test('sorts clearances by region name and preserves status + notes', () => {
    const out = shapeProduct(row());
    expect(out.clearances.map((c) => c.region)).toEqual(['CE', 'FDA', 'NMPA']);
    const ce = out.clearances.find((c) => c.region === 'CE');
    expect(ce).toEqual({ region: 'CE', status: 'APPROVED', notes: 'note' });
    const fda = out.clearances.find((c) => c.region === 'FDA');
    expect(fda.notes).toBeNull();
  });

  test('sorts trials by displayOrder and defaults their optional text to empty string', () => {
    const out = shapeProduct(row());
    expect(out.trials.map((t) => t.trial)).toEqual(['TARGET I', 'TARGET II']);
    expect(out.trials[0]).toEqual({
      trial: 'TARGET I', identifier: 'NCT00', n: '460', design: 'RCT', result: 'positive',
    });
  });

  test('tolerates missing relations (undefined clearances/trials → empty arrays)', () => {
    const out = shapeProduct(row({ clearances: undefined, trials: undefined }));
    expect(out.clearances).toEqual([]);
    expect(out.trials).toEqual([]);
  });

  test('does not mutate the input row arrays (sorts a copy)', () => {
    const r = row();
    const before = r.clearances.map((c) => c.region);
    shapeProduct(r);
    expect(r.clearances.map((c) => c.region)).toEqual(before);
  });
});
