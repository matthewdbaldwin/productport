// The canonical 10 therapeutic areas + membership check. This is the controlled
// vocabulary productWrite validates against and the web edit form renders.
'use strict';
const { THERAPEUTIC_AREAS, isTherapeuticArea } = require('../src/lib/therapeuticAreas');

describe('therapeuticAreas', () => {
  test('there are exactly 10, all unique', () => {
    expect(THERAPEUTIC_AREAS).toHaveLength(10);
    expect(new Set(THERAPEUTIC_AREAS).size).toBe(10);
  });

  test('isTherapeuticArea accepts canonical values (trimmed) and rejects others', () => {
    expect(isTherapeuticArea('Coronary and Structural Heart')).toBe(true);
    expect(isTherapeuticArea('  Orthopedic Joint, Spine, and Trauma  ')).toBe(true);
    expect(isTherapeuticArea('Coronary')).toBe(false);
    expect(isTherapeuticArea('')).toBe(false);
    expect(isTherapeuticArea(null)).toBe(false);
  });
});
