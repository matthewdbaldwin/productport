// Behavior of the export serializer — the inverse of parseProductRow. The
// headline guarantee is a ROUND-TRIP: parseProductRow(serializeProductRow(x))
// reproduces x's data + clearances, so export -> edit in Excel -> re-import is
// lossless and the builder's seed_products.csv format stays interchangeable.
'use strict';
const { serializeProductRow, EXPORT_COLUMNS } = require('../src/lib/serializeProductRow');
const { parseProductRow } = require('../src/lib/productRow');

const product = {
  slug: 'firehawk', name: 'Firehawk', subsidiary: 'MicroPort CV', therapeuticArea: 'Coronary and Structural Heart',
  category: 'DES', type: 'Stent', tagline: 'Target-eluting', overview: 'o', features: 'a|b',
  indication: 'ind', patientPopulation: 'pp', specs: 'len: 3', regNotes: 'rn', image: 'firehawk.jpg',
  tier: 'TIER1', classification: 'CORE', businessSegment: 'Cardio', applicableDepartments: 'Cath Lab|ICU',
  modelNumbers: 'M1|M2', developmentStatus: 'Under Development', status: 'DISCONTINUED',
};
const clearances = [
  { region: 'FDA', status: 'IN_PROGRESS', certificateNumbers: null, qualifier: null },
  { region: 'CE', status: 'APPROVED', certificateNumbers: 'CE-100|CE-200', qualifier: 'CMD-only' },
  { region: 'NMPA', status: 'APPROVED', certificateNumbers: 'NMPA-9', qualifier: null },
  { region: 'PMDA', status: 'NONE', certificateNumbers: null, qualifier: null },
  { region: 'TGA', status: 'APPROVED', certificateNumbers: null, qualifier: 'agent' },
];

describe('serializeProductRow', () => {
  test('emits the seed CSV columns (id from slug) + the new dimension columns', () => {
    const row = serializeProductRow(product, clearances);
    expect(row.id).toBe('firehawk');
    expect(row.therapeutic_area).toBe('Coronary and Structural Heart');
    expect(row.tier).toBe('TIER1');
    expect(row.classification).toBe('CORE');
    expect(row.business_segment).toBe('Cardio');
    expect(row.applicable_departments).toBe('Cath Lab|ICU');
    expect(row.model_numbers).toBe('M1|M2');
    expect(row.development_status).toBe('Under Development');
  });

  test('maps clearance enums back to their CSV words (incl. tga)', () => {
    const row = serializeProductRow(product, clearances);
    expect(row.fda).toBe('in progress');
    expect(row.ce).toBe('cleared');
    expect(row.pmda).toBe(''); // NONE -> blank
    expect(row.tga).toBe('cleared');
  });

  test('null fields serialize to empty string (not "null")', () => {
    const row = serializeProductRow({ slug: 'x', name: 'X', subsidiary: 'S', therapeuticArea: 'T' }, []);
    expect(row.category).toBe('');
    expect(row.tier).toBe('');
    expect(row.classification).toBe('');
  });

  test('ROUND-TRIP: parseProductRow(serialize(x)) reproduces the data + clearances', () => {
    const back = parseProductRow(serializeProductRow(product, clearances));
    expect(back.data.name).toBe('Firehawk');
    expect(back.data.tier).toBe('TIER1');
    expect(back.data.classification).toBe('CORE');
    expect(back.data.businessSegment).toBe('Cardio');
    expect(back.data.modelNumbers).toBe('M1|M2');
    expect(back.data.status).toBe('DISCONTINUED'); // status now round-trips (preserve-on-reimport)
    const byRegion = Object.fromEntries(back.clearances.map((c) => [c.region, c.status]));
    expect(byRegion).toEqual({ FDA: 'IN_PROGRESS', CE: 'APPROVED', NMPA: 'APPROVED', PMDA: 'NONE', TGA: 'APPROVED' });
  });

  test('EXPORT_COLUMNS is the stable header order', () => {
    expect(EXPORT_COLUMNS[0]).toBe('id');
    expect(EXPORT_COLUMNS).toContain('tier');
    expect(EXPORT_COLUMNS).toContain('tga');
  });

  test('emits per-region cert + qualifier columns', () => {
    const row = serializeProductRow(product, clearances);
    expect(row.ce_cert).toBe('CE-100|CE-200');
    expect(row.ce_qualifier).toBe('CMD-only');
    expect(row.tga_qualifier).toBe('agent');
    expect(row.fda_cert).toBe('');       // null → blank
    expect(row.nmpa_qualifier).toBe(''); // null → blank
    expect(EXPORT_COLUMNS).toContain('ce_cert');
    expect(EXPORT_COLUMNS).toContain('tga_qualifier');
  });

  test('ROUND-TRIP preserves cert numbers + qualifier', () => {
    const back = parseProductRow(serializeProductRow(product, clearances));
    const byRegion = Object.fromEntries(back.clearances.map((c) => [c.region, c]));
    expect(byRegion.CE.certificateNumbers).toBe('CE-100|CE-200');
    expect(byRegion.CE.qualifier).toBe('CMD-only');
    expect(byRegion.TGA.qualifier).toBe('agent');
    expect(byRegion.FDA.certificateNumbers).toBeNull();
    expect(byRegion.PMDA.qualifier).toBeNull();
  });
});
