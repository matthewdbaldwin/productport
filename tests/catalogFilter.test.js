// Behavior of the in-memory catalog filter/facet logic (the Viewer surface).
// The whole catalog loads once and all search/filter happens client-side, so
// this is the only thing standing between a user's query and what they see.
// Subtle rules under test: the market filter counts APPROVED/IN_PROGRESS/
// SUBMITTED as "present" but NOT NOT_APPROVED/NONE; search spans 6 fields;
// therapeutic areas render in a curated order then alpha for the rest.
'use strict';
const { statusOf, orderedAreas, filterProducts } = require('../web/lib/catalogFilter');

function product(over = {}) {
  return {
    id: over.id || 'p',
    name: 'Firehawk',
    subsidiary: 'MicroPort Cardiovascular',
    therapeuticArea: 'Coronary',
    category: 'Drug-Eluting Stent',
    type: 'Stent',
    tagline: 'Target-eluting',
    indication: 'CAD',
    clearances: [],
    trials: [],
    ...over,
  };
}

describe('statusOf', () => {
  test('returns the clearance status for a region', () => {
    const p = product({ clearances: [{ region: 'FDA', status: 'APPROVED', notes: null }] });
    expect(statusOf(p, 'FDA')).toBe('APPROVED');
  });
  test('returns NONE when the region has no clearance row', () => {
    expect(statusOf(product(), 'FDA')).toBe('NONE');
  });
});

describe('orderedAreas', () => {
  test('lists curated areas in catalog order, then unknown areas alphabetically', () => {
    const products = [
      product({ id: '1', therapeuticArea: 'Orthopedics' }),
      product({ id: '2', therapeuticArea: 'Coronary' }),
      product({ id: '3', therapeuticArea: 'Zebrafish Cardiology' }), // not in curated list
      product({ id: '4', therapeuticArea: 'Neurovascular' }),
    ];
    expect(orderedAreas(products)).toEqual([
      'Coronary', 'Neurovascular', 'Orthopedics', 'Zebrafish Cardiology',
    ]);
  });
  test('de-duplicates and returns [] for no products', () => {
    expect(orderedAreas([])).toEqual([]);
    const dups = [product({ id: '1' }), product({ id: '2' })]; // both Coronary
    expect(orderedAreas(dups)).toEqual(['Coronary']);
  });
});

describe('filterProducts', () => {
  const catalog = [
    product({ id: 'fire', name: 'Firehawk', therapeuticArea: 'Coronary', subsidiary: 'MicroPort Cardiovascular', category: 'Stent', clearances: [{ region: 'FDA', status: 'APPROVED' }] }),
    product({ id: 'cross', name: 'CrossBoss', therapeuticArea: 'Coronary', subsidiary: 'MicroPort Cardiovascular', category: 'Catheter', clearances: [{ region: 'FDA', status: 'IN_PROGRESS' }] }),
    product({ id: 'evo', name: 'Evolut', therapeuticArea: 'Structural Heart', subsidiary: 'Wright Medical', category: 'Valve', indication: 'aortic stenosis', clearances: [{ region: 'FDA', status: 'NOT_APPROVED' }] }),
  ];

  test('no filters returns the whole catalog', () => {
    expect(filterProducts(catalog, {}).map((p) => p.id)).toEqual(['fire', 'cross', 'evo']);
  });

  test('filters by therapeutic area', () => {
    expect(filterProducts(catalog, { area: 'Coronary' }).map((p) => p.id)).toEqual(['fire', 'cross']);
  });

  test('filters by subsidiary and by category independently', () => {
    expect(filterProducts(catalog, { subsidiary: 'Wright Medical' }).map((p) => p.id)).toEqual(['evo']);
    expect(filterProducts(catalog, { category: 'Catheter' }).map((p) => p.id)).toEqual(['cross']);
  });

  test('market filter keeps APPROVED/IN_PROGRESS/SUBMITTED, drops NOT_APPROVED/NONE', () => {
    expect(filterProducts(catalog, { market: 'FDA' }).map((p) => p.id)).toEqual(['fire', 'cross']);
  });

  test('search matches across name, indication, category, type, subsidiary, tagline (case-insensitive)', () => {
    expect(filterProducts(catalog, { query: 'firehawk' }).map((p) => p.id)).toEqual(['fire']);
    expect(filterProducts(catalog, { query: 'aortic' }).map((p) => p.id)).toEqual(['evo']); // indication
    expect(filterProducts(catalog, { query: 'WRIGHT' }).map((p) => p.id)).toEqual(['evo']); // subsidiary
    expect(filterProducts(catalog, { query: 'valve' }).map((p) => p.id)).toEqual(['evo']);  // category
  });

  test('whitespace-only query is treated as no query', () => {
    expect(filterProducts(catalog, { query: '   ' })).toHaveLength(3);
  });

  test('combines filters (AND semantics)', () => {
    expect(filterProducts(catalog, { area: 'Coronary', market: 'FDA', query: 'cross' }).map((p) => p.id)).toEqual(['cross']);
    expect(filterProducts(catalog, { area: 'Coronary', subsidiary: 'Wright Medical' })).toEqual([]);
  });
});
