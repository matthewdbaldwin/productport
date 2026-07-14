'use strict';
const { CLEARANCE_QUALIFIERS, isQualifier } = require('../src/lib/clearanceQualifier');

describe('clearanceQualifier', () => {
  test('exposes the v1 vocabulary in order', () => {
    expect(CLEARANCE_QUALIFIERS).toEqual(['CMD-only', 'CE-invalid', 'agent', 'pending', 'recently-approved']);
  });

  test('isQualifier is true only for a canonical token (trimmed)', () => {
    expect(isQualifier('CMD-only')).toBe(true);
    expect(isQualifier('  agent ')).toBe(true);
    expect(isQualifier('recently-approved')).toBe(true);
  });

  test('isQualifier is false for blank / unknown / non-string', () => {
    expect(isQualifier('')).toBe(false);
    expect(isQualifier('CE-valid')).toBe(false);
    expect(isQualifier('CMD only')).toBe(false); // space, not hyphen
    expect(isQualifier(null)).toBe(false);
    expect(isQualifier(undefined)).toBe(false);
    expect(isQualifier(5)).toBe(false);
  });
});
