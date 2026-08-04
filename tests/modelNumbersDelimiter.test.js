// `Product.modelNumbers` is a pipe-delimited @db.Text blob, and NOTHING enforced
// the delimiter on write — the only constraint was a 20,000-char cap.
//
// The live consequence (audit backlog 2026-07-31, B5, found by a prod probe):
// row `evermend-asd-occluder` holds a single 287-character value containing 32
// `KW…` codes separated by NEWLINES and zero pipes — 32 codes pasted into the
// textarea over the seed's 27 pipe-separated ones. The seed has 0 embedded
// newlines in this column, so it was introduced through the UI after launch.
//
// Every consumer splits on `|`, so those 32 real part numbers are one opaque
// token: invisible to search, to a human scanning the field, and to any future
// ProductModel.partNumber normalisation — a pipe-only migration would load a
// 287-char string into a part-number column. That is why this is a P1 blocker
// for the part-number work and not cosmetic.
//
// Both writers are covered here, because fixing one leaves the other open:
//   - validateProductWrite  → the admin editor textarea
//   - parseProductRow       → the CSV import route
'use strict';
const { validateProductWrite } = require('../src/lib/productWrite');
const { parseProductRow } = require('../src/lib/productRow');

const good = (o = {}) => ({
  slug: 'firehawk', name: 'Firehawk', subsidiary: 'MicroPort Cardiovascular',
  therapeuticArea: 'Coronary and Structural Heart', ...o,
});

// The shape actually found in prod: newline-separated, no pipes.
const PASTED = 'KW1001\nKW1002\nKW1003';

describe('validateProductWrite — modelNumbers delimiter normalisation', () => {
  test('a newline-pasted list is normalised to pipe-delimited', () => {
    const { data } = validateProductWrite(good({ modelNumbers: PASTED }));
    expect(data.modelNumbers).toBe('KW1001|KW1002|KW1003');
  });

  test('CRLF pastes (Windows / Excel) normalise too', () => {
    const { data } = validateProductWrite(good({ modelNumbers: 'KW1001\r\nKW1002' }));
    expect(data.modelNumbers).toBe('KW1001|KW1002');
  });

  test('an already-correct pipe-delimited value is left alone', () => {
    const { data } = validateProductWrite(good({ modelNumbers: 'KW1001|KW1002' }));
    expect(data.modelNumbers).toBe('KW1001|KW1002');
  });

  test('mixed delimiters collapse to pipes', () => {
    const { data } = validateProductWrite(good({ modelNumbers: 'KW1001|KW1002\nKW1003' }));
    expect(data.modelNumbers).toBe('KW1001|KW1002|KW1003');
  });

  test('whitespace around each code is trimmed', () => {
    const { data } = validateProductWrite(good({ modelNumbers: ' KW1001 | KW1002 \n KW1003 ' }));
    expect(data.modelNumbers).toBe('KW1001|KW1002|KW1003');
  });

  test('empty segments are dropped, not preserved as blanks', () => {
    // Trailing newline and doubled pipes are what a real paste produces.
    const { data } = validateProductWrite(good({ modelNumbers: 'KW1001||KW1002\n\n' }));
    expect(data.modelNumbers).toBe('KW1001|KW1002');
  });

  test('a value that is only delimiters becomes null, not an empty string', () => {
    const { data } = validateProductWrite(good({ modelNumbers: '|\n|' }));
    expect(data.modelNumbers).toBeNull();
  });

  test('blank and absent still behave as before', () => {
    expect(validateProductWrite(good({ modelNumbers: '' })).data.modelNumbers).toBeNull();
    expect(validateProductWrite(good({ modelNumbers: null })).data.modelNumbers).toBeNull();
  });

  test('a single code with no delimiter is unchanged', () => {
    expect(validateProductWrite(good({ modelNumbers: 'KW1001' })).data.modelNumbers).toBe('KW1001');
  });

  test('partial update: an omitted modelNumbers is still left untouched', () => {
    const { data } = validateProductWrite({ name: 'x' }, { partial: true });
    expect('modelNumbers' in data).toBe(false);
  });

  test('the length cap is enforced AFTER normalisation', () => {
    // Normalising can only shrink or hold length (separators stay 1 char), so a
    // value that fits must not be rejected because of its original whitespace.
    const codes = Array.from({ length: 500 }, (_, i) => `KW${i}`);
    const spacious = codes.join(' \n ');          // ~3 chars of separator each
    expect(spacious.length).toBeGreaterThan(codes.join('|').length);
    const { data } = validateProductWrite(good({ modelNumbers: spacious }));
    expect(data.modelNumbers).toBe(codes.join('|'));
  });

  test('the prod-shaped regression: 32 newline-separated codes in one value', () => {
    const codes = Array.from({ length: 32 }, (_, i) => `KW${String(i).padStart(4, '0')}`);
    const { data } = validateProductWrite(good({ modelNumbers: codes.join('\n') }));
    expect(data.modelNumbers.split('|')).toHaveLength(32);
    expect(data.modelNumbers).not.toMatch(/[\r\n]/);
  });
});

describe('parseProductRow — the CSV import path normalises the same way', () => {
  // NB the CSV contract keys the slug as `id`, not `slug` (productRow.js:34).
  const row = (o = {}) => ({
    id: 'firehawk', name: 'Firehawk', subsidiary: 'MicroPort Cardiovascular',
    therapeutic_area: 'Coronary and Structural Heart', ...o,
  });

  test('a newline-separated CSV cell is normalised to pipes', () => {
    const { data } = parseProductRow(row({ model_numbers: PASTED }));
    expect(data.modelNumbers).toBe('KW1001|KW1002|KW1003');
  });

  test('an already-correct value is left alone', () => {
    const { data } = parseProductRow(row({ model_numbers: 'KW1001|KW1002' }));
    expect(data.modelNumbers).toBe('KW1001|KW1002');
  });

  test('blank still becomes null', () => {
    expect(parseProductRow(row({ model_numbers: '' })).data.modelNumbers).toBeNull();
  });
});
