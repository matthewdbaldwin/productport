'use strict';
const { validateClearanceMatrix } = require('../src/lib/clearanceWrite');

const ok = (over = []) => ({ clearances: over });

describe('validateClearanceMatrix', () => {
  test('normalizes a full row (blank status defaults to NONE)', () => {
    const { rows } = validateClearanceMatrix(ok([
      { region: 'CE', status: 'APPROVED', certificateNumbers: 'CE-1|CE-2', qualifier: 'CMD-only', notes: 'ok' },
      { region: 'FDA' },
    ]));
    expect(rows).toEqual([
      { region: 'CE', status: 'APPROVED', certificateNumbers: 'CE-1|CE-2', qualifier: 'CMD-only', notes: 'ok' },
      { region: 'FDA', status: 'NONE', certificateNumbers: null, qualifier: null, notes: null },
    ]);
  });

  test('blank cert/qualifier/notes become null', () => {
    const { rows } = validateClearanceMatrix(ok([{ region: 'TGA', status: 'NONE', certificateNumbers: '  ', qualifier: '', notes: '   ' }]));
    expect(rows[0]).toEqual({ region: 'TGA', status: 'NONE', certificateNumbers: null, qualifier: null, notes: null });
  });

  test('throws (field-tagged) on an unknown region', () => {
    expect.assertions(2);
    try { validateClearanceMatrix(ok([{ region: 'EU' }])); }
    catch (e) { expect(e.field).toBe('clearances[0].region'); expect(e.message).toMatch(/invalid region/i); }
  });

  test('throws on a duplicate region', () => {
    expect(() => validateClearanceMatrix(ok([{ region: 'CE' }, { region: 'CE' }]))).toThrow(/duplicate region/i);
  });

  test('throws on an invalid status', () => {
    expect(() => validateClearanceMatrix(ok([{ region: 'CE', status: 'MAYBE' }]))).toThrow(/invalid status/i);
  });

  test('throws on an unknown qualifier', () => {
    expect(() => validateClearanceMatrix(ok([{ region: 'CE', qualifier: 'nope' }]))).toThrow(/invalid qualifier/i);
  });

  test('throws on over-long cert numbers', () => {
    expect(() => validateClearanceMatrix(ok([{ region: 'CE', certificateNumbers: 'x'.repeat(1001) }]))).toThrow(/too long/i);
  });

  test('throws when clearances is missing / not an array', () => {
    expect(() => validateClearanceMatrix({})).toThrow(/missing clearances/i);
    expect(() => validateClearanceMatrix({ clearances: 'x' })).toThrow(/missing clearances/i);
  });

  test('accepts an empty matrix (clears all rows)', () => {
    expect(validateClearanceMatrix(ok([])).rows).toEqual([]);
  });
});
