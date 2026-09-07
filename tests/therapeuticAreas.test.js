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

  test('the retired areas are rejected now the prod migration has run', () => {
    // Was the mirror image of this until contracts 0.22.0: while ProductPort's
    // rows were being re-filed a retired name had to keep validating, or every
    // edit touching an un-migrated row 400d. The migration ran in prod on
    // 2026-09-06, so accepting one would now only let a stale CSV put the old
    // vocabulary back.
    for (const retired of [
      'Coronary and Structural Heart',
      'Heart Failure and Electrophysiology',
      'Emergency and Critical Care',
      'Regenerative Medicine and Medical Aesthetics',
    ]) {
      expect(isTherapeuticArea(retired)).toBe(false);
      expect(THERAPEUTIC_AREAS).not.toContain(retired);
    }
  });
});
