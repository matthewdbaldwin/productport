// Behavior of the product-classification word → ProductClassification enum map.
// The brochure defines Core / Hi-po / Flagship abstractly and (today) tags no
// product, so this is applied via CSV/edit, not auto-derived. Blank/unknown →
// null so a stray cell never aborts an import. Mirrors clearanceStatus.
'use strict';
const { classificationFromWord, PRODUCT_CLASSIFICATIONS } = require('../src/lib/classification');

describe('classificationFromWord — word → ProductClassification enum (null = unclassified)', () => {
  test('core → CORE', () => {
    for (const w of ['core', 'Core', 'CORE', 'core product', 'Core Products']) {
      expect(classificationFromWord(w)).toBe('CORE');
    }
  });

  test('hi-po variants → HIPO', () => {
    for (const w of ['hipo', 'hi-po', 'Hi-Po', 'hi po', 'high potential', 'Hi-po Products']) {
      expect(classificationFromWord(w)).toBe('HIPO');
    }
  });

  test('flagship → FLAGSHIP', () => {
    expect(classificationFromWord('flagship')).toBe('FLAGSHIP');
    expect(classificationFromWord('Flagship')).toBe('FLAGSHIP');
  });

  test('blank / null / undefined / unknown → null', () => {
    expect(classificationFromWord('')).toBeNull();
    expect(classificationFromWord('   ')).toBeNull();
    expect(classificationFromWord(null)).toBeNull();
    expect(classificationFromWord(undefined)).toBeNull();
    expect(classificationFromWord('platinum')).toBeNull();
  });

  test('the enum set is exactly CORE / HIPO / FLAGSHIP', () => {
    expect(new Set(PRODUCT_CLASSIFICATIONS)).toEqual(new Set(['CORE', 'HIPO', 'FLAGSHIP']));
  });
});
