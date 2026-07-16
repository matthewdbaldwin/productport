// POST /api/products/import — the format gate + dry-run preview (2026-07-16).
// The import is a full upsert + clearance-matrix replace, so an old export whose
// header lacks the new columns would silently null that data. The endpoint must:
//   1. REJECT (400) a header missing any canonical column, writing nothing;
//   2. import cleanly when the header is current;
//   3. offer ?dryRun=1 that validates + tallies WITHOUT writing.
// Auth + db are mocked at the wiring level (like bugReports.test.js).
'use strict';

jest.mock('../src/middleware/auth', () => ({
  requireProductAdmin: (req, _res, next) => { req.user = { id: 1, email: 'admin@microport.com' }; next(); },
  requireAuth: (req, _res, next) => { req.user = { id: 1, email: 'admin@microport.com' }; next(); },
}));
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../src/lib/db', () => ({
  product: { findFirst: jest.fn(), upsert: jest.fn() },
  regulatoryClearance: { deleteMany: jest.fn(), createMany: jest.fn() },
  productAudit: { create: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const db = require('../src/lib/db');
const { EXPORT_COLUMNS } = require('../src/lib/serializeProductRow');

function makeApp() {
  const a = express();
  a.use('/api/products', require('../src/routes/products'));
  return a;
}
const app = makeApp();

// Build a CSV with the given header columns and one data row (values keyed by column).
function csv(columns, values = {}) {
  const header = columns.join(',');
  const row = columns.map((c) => (values[c] ?? '')).join(',');
  return `${header}\n${row}`;
}
const VALID = { id: 'firehawk', name: 'Firehawk', subsidiary: 'MicroPort CV', therapeutic_area: 'Coronary and Structural Heart' };
const OLD_HEADER = ['id', 'name', 'subsidiary', 'therapeutic_area', 'category', 'type', 'tagline', 'overview',
  'features', 'indication', 'patient_population', 'specs', 'fda', 'ce', 'nmpa', 'pmda', 'reg_notes', 'image'];

const post = (body, query = '') => request(app).post(`/api/products/import${query}`).set('Content-Type', 'text/csv').send(body);

beforeEach(() => {
  jest.clearAllMocks();
  db.product.findFirst.mockResolvedValue(null);      // slug not seen → 'created'
  db.product.upsert.mockResolvedValue({ id: 42 });
  db.regulatoryClearance.deleteMany.mockResolvedValue({});
  db.regulatoryClearance.createMany.mockResolvedValue({});
  db.productAudit.create.mockResolvedValue({});
});

describe('import format gate', () => {
  test('an old-format header is rejected 400 and writes nothing', async () => {
    const res = await post(csv(OLD_HEADER, VALID));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/model_numbers/);   // names a missing column
    expect(res.body.missing).toEqual(expect.arrayContaining(['model_numbers', 'tga', 'fda_cert']));
    expect(db.product.upsert).not.toHaveBeenCalled();   // the clobber never happened
    expect(db.regulatoryClearance.deleteMany).not.toHaveBeenCalled();
  });

  test('a current-format header imports and writes', async () => {
    const res = await post(csv(EXPORT_COLUMNS, VALID));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, created: 1, updated: 0 });
    expect(res.body.errors).toHaveLength(0);
    expect(db.product.upsert).toHaveBeenCalledTimes(1);
    expect(db.productAudit.create).toHaveBeenCalled(); // 'import' audited
  });

  test('a whitespace-padded but canonical header still parses its column VALUES (gate leniency is truthful)', async () => {
    // The gate trims header cells; the row parse must trim keys too, or a padded
    // header clears the gate yet reads undefined → silent clobber. Prove the
    // padded `nmpa_cert` value actually reaches the clearance write.
    const paddedHeader = EXPORT_COLUMNS.map((c) => (c === 'nmpa_cert' ? ' nmpa_cert ' : c));
    const res = await post(csv(paddedHeader, { ...VALID, nmpa: 'cleared', ' nmpa_cert ': '20233031211.' }));
    expect(res.status).toBe(200);
    expect(db.product.upsert).toHaveBeenCalledTimes(1);
    const clearanceData = db.regulatoryClearance.createMany.mock.calls[0][0].data;
    const nmpa = clearanceData.find((c) => c.region === 'NMPA');
    expect(nmpa.certificateNumbers).toBe('20233031211.'); // value read despite the padded header
  });

  test('unknown extra columns import but are surfaced as a warning', async () => {
    const res = await post(csv([...EXPORT_COLUMNS, 'legacy_sku'], { ...VALID, legacy_sku: 'X' }));
    expect(res.status).toBe(200);
    expect(res.body.unknownColumns).toEqual(['legacy_sku']);
    expect(db.product.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('dry-run preview', () => {
  test('?dryRun=1 validates + tallies but writes NOTHING', async () => {
    const res = await post(csv(EXPORT_COLUMNS, VALID), '?dryRun=1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, total: 1, created: 1 });
    expect(db.product.upsert).not.toHaveBeenCalled();
    expect(db.regulatoryClearance.deleteMany).not.toHaveBeenCalled();
    expect(db.productAudit.create).not.toHaveBeenCalled(); // a preview isn't an edit
  });

  test('dry-run reports would-update for an existing slug and collects bad rows', async () => {
    db.product.findFirst.mockResolvedValue({ id: 7, deletedAt: null }); // slug exists
    const twoRows = `${csv(EXPORT_COLUMNS, VALID)}\n${EXPORT_COLUMNS.map((c) => (c === 'id' ? '' : '')).join(',')}`;
    const res = await post(twoRows, '?dryRun=1');
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.updated).toBe(1);          // the valid row would update
    expect(res.body.errors).toHaveLength(1);    // the blank-id row is a parse error
    expect(db.product.upsert).not.toHaveBeenCalled();
  });

  test('dry-run still rejects an old-format header (gate runs first)', async () => {
    const res = await post(csv(OLD_HEADER, VALID), '?dryRun=1');
    expect(res.status).toBe(400);
    expect(db.product.findFirst).not.toHaveBeenCalled();
  });
});
