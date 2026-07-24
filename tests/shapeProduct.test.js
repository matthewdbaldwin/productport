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
    expect(ce).toEqual({
      region: 'CE', status: 'APPROVED', certificateNumbers: null, qualifier: null, notes: 'note',
    });
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

  test('passes the tier enum through (and null when untiered / absent)', () => {
    expect(shapeProduct(row({ tier: 'TIER1' })).tier).toBe('TIER1');
    expect(shapeProduct(row({ tier: null })).tier).toBeNull();
    // A row from before the tier column existed (undefined) → null, not undefined.
    const r = row(); delete r.tier;
    expect(shapeProduct(r).tier).toBeNull();
  });

  test('passes brochure dimensions through (classification/businessSegment/departments/models/devStatus)', () => {
    const shaped = shapeProduct(row({
      classification: 'CORE',
      businessSegment: 'Heart Failure Management & Electrophysiology',
      applicableDepartments: 'Cath Lab|ICU',
      modelNumbers: 'TSL0638|TSL1638',
      developmentStatus: 'Under Development',
    }));
    expect(shaped.classification).toBe('CORE');
    expect(shaped.businessSegment).toBe('Heart Failure Management & Electrophysiology');
    expect(shaped.applicableDepartments).toBe('Cath Lab|ICU');
    expect(shaped.modelNumbers).toBe('TSL0638|TSL1638');
    expect(shaped.developmentStatus).toBe('Under Development');
  });

  test('brochure dimensions default to null when absent (pre-migration rows)', () => {
    const r = row();
    for (const k of ['classification', 'businessSegment', 'applicableDepartments', 'modelNumbers', 'developmentStatus']) delete r[k];
    const shaped = shapeProduct(r);
    expect(shaped.classification).toBeNull();
    expect(shaped.businessSegment).toBeNull();
    expect(shaped.applicableDepartments).toBeNull();
    expect(shaped.modelNumbers).toBeNull();
    expect(shaped.developmentStatus).toBeNull();
  });

  test('exposes disabledAt as an ISO string when set, null otherwise (incl. pre-migration rows)', () => {
    // row() has no disabledAt → the kill-switch is off → null.
    expect(shapeProduct(row()).disabledAt).toBeNull();
    const when = new Date('2026-07-24T12:00:00.000Z');
    expect(shapeProduct(row({ disabledAt: when })).disabledAt).toBe('2026-07-24T12:00:00.000Z');
    // A row from before the disabledAt column existed (undefined) → null, not undefined.
    const r = row(); delete r.disabledAt;
    expect(shapeProduct(r).disabledAt).toBeNull();
  });
});

describe('shapeProduct — clearance cert# + qualifier (WS2)', () => {
  test('carries certificateNumbers + qualifier through the contract', () => {
    const shaped = shapeProduct({
      slug: 'x', name: 'X', subsidiary: 'S', therapeuticArea: 'Emergency and Critical Care',
      clearances: [
        { region: 'CE', status: 'APPROVED', certificateNumbers: 'CE-1', qualifier: 'CMD-only', notes: 'n' },
        { region: 'FDA', status: 'NONE', certificateNumbers: null, qualifier: null, notes: null },
      ],
      trials: [],
    });
    const ce = shaped.clearances.find((c) => c.region === 'CE');
    const fda = shaped.clearances.find((c) => c.region === 'FDA');
    expect(ce.certificateNumbers).toBe('CE-1');
    expect(ce.qualifier).toBe('CMD-only');
    expect(fda.certificateNumbers).toBeNull();
    expect(fda.qualifier).toBeNull();
  });
});
