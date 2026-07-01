// Behavior of the product-tier module: the CSV word → ProductTier enum
// normalizer (import) and the enum → display palette (gold/silver/bronze badge).
// A wrong tier mapping mislabels a product's strategic tier; a missing palette
// entry drops the badge. Both get first-class coverage (TDD, Slice 1).
'use strict';
const { tierFromWord, tierMeta, PRODUCT_TIERS } = require('../src/lib/tierPalette');

describe('tierFromWord — CSV word → ProductTier enum (null = untiered)', () => {
  test('accepts the enum spelling, "tier1", "t1", "Tier 1" and bare "1" as TIER1', () => {
    for (const w of ['TIER1', 'tier1', 't1', 'Tier 1', 'tier 1', '1']) {
      expect(tierFromWord(w)).toBe('TIER1');
    }
  });

  test('maps 2 and 3 forms to TIER2 / TIER3', () => {
    expect(tierFromWord('2')).toBe('TIER2');
    expect(tierFromWord('Tier 2')).toBe('TIER2');
    expect(tierFromWord('t3')).toBe('TIER3');
    expect(tierFromWord('TIER3')).toBe('TIER3');
  });

  test('blank / null / undefined / unknown → null (untiered, never a crash)', () => {
    expect(tierFromWord('')).toBeNull();
    expect(tierFromWord('   ')).toBeNull();
    expect(tierFromWord(null)).toBeNull();
    expect(tierFromWord(undefined)).toBeNull();
    expect(tierFromWord('tier4')).toBeNull();
    expect(tierFromWord('platinum')).toBeNull();
  });
});

describe('tierMeta — enum → display palette (gold / silver / bronze)', () => {
  test('labels each tier "Tier 1/2/3"', () => {
    expect(tierMeta('TIER1').label).toBe('Tier 1');
    expect(tierMeta('TIER2').label).toBe('Tier 2');
    expect(tierMeta('TIER3').label).toBe('Tier 3');
  });

  test('every tier carries a non-empty bg + fg color', () => {
    for (const t of PRODUCT_TIERS) {
      const m = tierMeta(t);
      expect(typeof m.bg).toBe('string');
      expect(m.bg.length).toBeGreaterThan(0);
      expect(typeof m.fg).toBe('string');
      expect(m.fg.length).toBeGreaterThan(0);
    }
  });

  test('the three tiers are visually distinct (different bg colors)', () => {
    const bgs = PRODUCT_TIERS.map((t) => tierMeta(t).bg);
    expect(new Set(bgs).size).toBe(3);
  });

  test('null / undefined / unknown tier → null (no badge)', () => {
    expect(tierMeta(null)).toBeNull();
    expect(tierMeta(undefined)).toBeNull();
    expect(tierMeta('TIER9')).toBeNull();
  });
});
