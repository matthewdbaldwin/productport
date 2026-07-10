// Golden-lock product hierarchy master — BU/category drift becomes a RED TEST,
// not a silently-wrong catalog filter. reference: prd_microport_contracts,
// ops_finance_data_drop_2026-07-09 (contracts v0.6.0 productHierarchy module).
//
// ProductPort is the catalog satellite, so it pins the canonical 12-BU
// vocabulary here. The catalog's own classifications (therapeuticAreas,
// classification.js CORE/HIPO/FLAGSHIP, tier) are DIFFERENT, deliberately
// separate taxonomies — this contract is the org's BU tree, adopted additively
// (strangler): nothing reads it in prod paths yet; the test locks the vocabulary
// the deeper catalog wiring will build on.
//
// If the installed contracts predates the module (<0.6.0), skip loudly so a
// stale checkout stays green — same convention as roleContract.test.js.
'use strict';

let contracts = {};
try {
  contracts = require('@matthewdbaldwin/microport-contracts');
} catch { /* contracts not installed in this checkout yet */ }

const {
  BUSINESS_UNITS,
  PRODUCT_HIERARCHY,
  BU_CODES,
  productHierarchyErrors,
  resolveBusinessUnit,
  productsInBu,
} = contracts;

const available = Array.isArray(BUSINESS_UNITS) && typeof productHierarchyErrors === 'function';

(available ? describe : describe.skip)('product hierarchy contract — productport', () => {
  test('the shipped master is coherent (contract guard)', () => {
    expect(productHierarchyErrors(BUSINESS_UNITS, PRODUCT_HIERARCHY)).toEqual([]);
  });

  test('the canonical 12 business units', () => {
    expect(BU_CODES).toHaveLength(12);
    expect(BUSINESS_UNITS).toHaveLength(12);
    // The BUs the catalog's 417 products span (spot-checks, not the full set).
    for (const bu of ['Robot', 'Coronory', 'EndoVastec', 'EverPace', 'Orthopedics', 'Surgical']) {
      expect(BU_CODES).toContain(bu);
    }
  });

  test('resolveBusinessUnit tolerates display-name lookups', () => {
    expect(resolveBusinessUnit('Robot')?.bu).toBe('Robot');
    expect(resolveBusinessUnit('nonexistent-bu')).toBeNull();
  });

  test('leaf products exist for the updated BUs', () => {
    // The source workbook carries leaf productName only for the 4 BUs updated
    // in the 2026-07 refresh; the rest stop at category/productLine by design.
    expect(productsInBu('Robot').length).toBeGreaterThan(0);
  });
});

if (!available) {
  // eslint-disable-next-line no-console
  console.warn('[productHierarchyContract.test] installed microport-contracts lacks the product hierarchy master (<0.6.0) — contract suite SKIPPED. Bump the dep.');
}
