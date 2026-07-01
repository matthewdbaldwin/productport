// Behavior of the CSV import runner: upsert-on-slug, per-row error isolation
// (one bad row never aborts the batch), and a created/updated/errors summary.
// Pure over an injected upsertRow fn (parseProductRow does the parsing), so it
// is tested without a DB. Mirrors how prisma/seed.js reconciles the catalog.
'use strict';
const { importProducts } = require('../src/lib/importProducts');

// Minimal valid CSV row (matches parseProductRow's required fields).
const row = (o = {}) => ({ id: 'firehawk', name: 'Firehawk', subsidiary: 'MicroPort CV', therapeutic_area: 'Coronary and Structural Heart', ...o });

describe('importProducts', () => {
  test('creates new rows and updates existing ones (upsert on slug)', async () => {
    const existing = new Set(['firehawk']);
    const upsertRow = jest.fn(async ({ slug }) => (existing.has(slug) ? 'updated' : 'created'));
    const res = await importProducts([row({ id: 'firehawk' }), row({ id: 'newprod', name: 'New' })], upsertRow);
    expect(res.created).toBe(1);
    expect(res.updated).toBe(1);
    expect(res.errors).toHaveLength(0);
    expect(res.total).toBe(2);
    expect(upsertRow).toHaveBeenCalledTimes(2);
  });

  test('one bad row is collected and the batch continues (with the CSV row number)', async () => {
    const upsertRow = jest.fn(async () => 'created');
    const res = await importProducts([
      row({ id: 'ok1' }),
      row({ id: '', name: 'no slug' }),   // parseProductRow throws "missing id/slug"
      row({ id: 'ok2' }),
    ], upsertRow);
    expect(res.created).toBe(2);
    expect(res.errors).toHaveLength(1);
    // header is CSV line 1, so the 2nd data row is line 3
    expect(res.errors[0].row).toBe(3);
    expect(res.errors[0].error).toMatch(/slug/i);
    expect(upsertRow).toHaveBeenCalledTimes(2); // the bad row never reached the DB
  });

  test('an error thrown by upsertRow itself is captured per-row, not fatal', async () => {
    const upsertRow = jest.fn(async ({ slug }) => { if (slug === 'boom') throw new Error('DB write failed'); return 'created'; });
    const res = await importProducts([row({ id: 'ok' }), row({ id: 'boom' })], upsertRow);
    expect(res.created).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].error).toMatch(/DB write failed/);
  });

  test('passes the tier + brochure columns straight through parseProductRow', async () => {
    let captured;
    await importProducts([row({ tier: 'Tier 2', classification: 'Core', business_segment: 'EP' })], async (p) => { captured = p; return 'created'; });
    expect(captured.data.tier).toBe('TIER2');
    expect(captured.data.classification).toBe('CORE');
    expect(captured.data.businessSegment).toBe('EP');
  });
});
