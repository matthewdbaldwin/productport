'use strict';
const { validateCountryClearance } = require('../src/lib/countryClearanceWrite');

describe('validateCountryClearance', () => {
  test('normalizes a full row (blank status defaults to NONE)', () => {
    expect(validateCountryClearance({ country: 'br', status: 'APPROVED', materialRef: 'REF-123' }))
      .toEqual({ country: 'BR', status: 'APPROVED', materialRef: 'REF-123' });
    expect(validateCountryClearance({ country: 'MX' }))
      .toEqual({ country: 'MX', status: 'NONE', materialRef: null });
  });

  test('trims and uppercases the country code', () => {
    expect(validateCountryClearance({ country: '  gb  ' }).country).toBe('GB');
  });

  test('blank materialRef becomes null', () => {
    expect(validateCountryClearance({ country: 'BR', materialRef: '   ' }).materialRef).toBe(null);
  });

  test('throws (field-tagged) on missing country', () => {
    expect.assertions(2);
    try { validateCountryClearance({}); }
    catch (e) { expect(e.field).toBe('country'); expect(e.message).toMatch(/country/i); }
  });

  test('throws on a malformed (non-2-letter) country code', () => {
    expect(() => validateCountryClearance({ country: 'BRA' })).toThrow(/invalid country/i);
    expect(() => validateCountryClearance({ country: '1' })).toThrow(/invalid country/i);
  });

  test('throws (field-tagged) on an invalid status', () => {
    expect.assertions(2);
    try { validateCountryClearance({ country: 'BR', status: 'MAYBE' }); }
    catch (e) { expect(e.field).toBe('status'); expect(e.message).toMatch(/invalid status/i); }
  });

  test('throws on over-long materialRef', () => {
    expect(() => validateCountryClearance({ country: 'BR', materialRef: 'x'.repeat(101) })).toThrow(/too long/i);
  });

  describe('jurisdiction exclusion — rejects countries RegulatoryClearance already covers', () => {
    test.each([
      ['US', 'FDA'],
      ['CN', 'NMPA'],
      ['JP', 'PMDA'],
      ['AU', 'TGA'],
      ['DE', 'CE'],
      ['FR', 'CE'],
      ['IS', 'CE'], // EEA, non-EU
    ])('rejects %s (covered by %s)', (country) => {
      expect.assertions(2);
      try { validateCountryClearance({ country }); }
      catch (e) { expect(e.field).toBe('country'); expect(e.message).toMatch(/already covered by RegulatoryClearance/i); }
    });

    test.each(['BR', 'MX', 'IN', 'GB', 'CA'])('accepts %s (not a RegulatoryClearance jurisdiction)', (country) => {
      expect(validateCountryClearance({ country }).country).toBe(country);
    });
  });
});
