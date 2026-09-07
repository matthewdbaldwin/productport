// The 8 therapeutic areas + membership check. This is the controlled
// vocabulary productWrite validates against and the web edit form renders.
'use strict';
const { THERAPEUTIC_AREAS, isTherapeuticArea } = require('../src/lib/therapeuticAreas');

describe('therapeuticAreas', () => {
  test('there are exactly 8, all unique', () => {
    expect(THERAPEUTIC_AREAS).toHaveLength(8);
    expect(new Set(THERAPEUTIC_AREAS).size).toBe(8);
  });

  test('isTherapeuticArea accepts current values (trimmed) and rejects others', () => {
    expect(isTherapeuticArea('Comprehensive Cardiac Care')).toBe(true);
    expect(isTherapeuticArea('  Orthopedic Joint, Spine, and Trauma  ')).toBe(true);
    expect(isTherapeuticArea('Coronary')).toBe(false);
    expect(isTherapeuticArea('')).toBe(false);
    expect(isTherapeuticArea(null)).toBe(false);
  });

  test('TRANSITIONAL: a retired area still validates, so un-migrated rows keep working', () => {
    // Remove this test together with RETIRED_THERAPEUTIC_AREAS, once the prod
    // data migration has run. Until then, dropping it would hide the very
    // window it exists to protect.
    expect(isTherapeuticArea('Coronary and Structural Heart')).toBe(true);
    expect(THERAPEUTIC_AREAS).not.toContain('Coronary and Structural Heart');
  });
});
