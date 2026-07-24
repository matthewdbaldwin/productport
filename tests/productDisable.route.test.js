// Disable/enable — the reversible admin kill-switch (2026-07-24).
// "Disable" hides a product from the viewer catalog (list + public detail) without
// deleting it; admins still see it (badged) and can re-enable. Distinct from the
// existing soft-delete (deletedAt = trash) and from DISCONTINUED (a commercial
// state that STAYS visible). Backed by a nullable `disabledAt` column.
//
// Auth is NOT mocked here — we inject req.user (as requireAuth does in app.js) so
// the real requireProductAdmin gate + the real isProductAdmin visibility check run.
// db is mocked at the wiring level (like productImport.route.test.js).
'use strict';

jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => ({
  product: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  productAudit: { create: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const db = require('../src/lib/db');

// Mount the router behind an injector that sets req.user, mirroring the real
// `app.use('/api/products', requireAuth, router)` wiring.
function makeApp(user) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = user; next(); });
  a.use('/api/products', require('../src/routes/products'));
  return a;
}
const ADMIN = { id: 1, email: 'admin@microport.com', role: 'product_admin' };
const VIEWER = { id: 2, email: 'viewer@microport.com', role: 'viewer' };
const SUPER = { id: 3, email: 'su@microport.com', role: 'viewer', isSuperuser: true };

// Minimal product row that shapeProduct() (real, not mocked) can serialize.
const prod = (over = {}) => ({
  id: 7, slug: 'latent-perit', name: 'Latent Perit', subsidiary: 'MicroPort Surgical',
  therapeuticArea: 'Emergency and Critical Care', status: 'ACTIVE', disabledAt: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.product.findMany.mockResolvedValue([]);
  db.productAudit.create.mockResolvedValue({});
  db.product.update.mockImplementation(({ data }) => Promise.resolve(prod(data)));
});

describe('GET /api/products — disabled products are hidden from viewers, shown to admins', () => {
  test('a viewer only sees enabled products (where includes disabledAt: null)', async () => {
    await request(makeApp(VIEWER)).get('/api/products');
    const { where } = db.product.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ deletedAt: null, disabledAt: null });
    expect(where.status).toEqual({ not: 'DRAFT' });
  });

  test('an admin sees disabled products too (where does NOT constrain disabledAt)', async () => {
    await request(makeApp(ADMIN)).get('/api/products');
    const { where } = db.product.findMany.mock.calls[0][0];
    expect(where.deletedAt).toBeNull();
    expect(where.disabledAt).toBeUndefined();
  });

  test('a platform superuser (isSuperuser flag, role=viewer) also sees disabled products', async () => {
    await request(makeApp(SUPER)).get('/api/products');
    const { where } = db.product.findMany.mock.calls[0][0];
    expect(where.disabledAt).toBeUndefined();
  });
});

describe('GET /api/products/:slug — a disabled product is a 404 for viewers', () => {
  test('viewer requesting a DISABLED product gets 404 (not deep-linkable)', async () => {
    db.product.findFirst.mockResolvedValue(prod({ disabledAt: new Date() }));
    const res = await request(makeApp(VIEWER)).get('/api/products/latent-perit');
    expect(res.status).toBe(404);
  });

  test('admin requesting the same DISABLED product gets 200 with the product', async () => {
    db.product.findFirst.mockResolvedValue(prod({ disabledAt: new Date() }));
    const res = await request(makeApp(ADMIN)).get('/api/products/latent-perit');
    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe('latent-perit');
  });

  test('viewer requesting an ENABLED product still gets 200', async () => {
    db.product.findFirst.mockResolvedValue(prod({ disabledAt: null }));
    const res = await request(makeApp(VIEWER)).get('/api/products/latent-perit');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/products/:slug/disable', () => {
  test('sets disabledAt, audits "disabled", returns the updated product', async () => {
    db.product.findFirst.mockResolvedValue(prod({ disabledAt: null }));
    const res = await request(makeApp(ADMIN)).post('/api/products/latent-perit/disable');
    expect(res.status).toBe(200);
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { disabledAt: expect.any(Date) } }),
    );
    expect(db.productAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'disabled', productId: 7 }) }),
    );
    expect(res.body.product.disabledAt).not.toBeNull();
  });

  test('disabling an already-disabled product is an idempotent no-op (no update, no audit)', async () => {
    db.product.findFirst.mockResolvedValue(prod({ disabledAt: new Date() }));
    const res = await request(makeApp(ADMIN)).post('/api/products/latent-perit/disable');
    expect(res.status).toBe(200);
    expect(db.product.update).not.toHaveBeenCalled();
    expect(db.productAudit.create).not.toHaveBeenCalled();
  });

  test('unknown slug → 404', async () => {
    db.product.findFirst.mockResolvedValue(null);
    const res = await request(makeApp(ADMIN)).post('/api/products/nope/disable');
    expect(res.status).toBe(404);
    expect(db.product.update).not.toHaveBeenCalled();
  });

  test('a non-admin viewer is forbidden (403) and nothing is read or written', async () => {
    const res = await request(makeApp(VIEWER)).post('/api/products/latent-perit/disable');
    expect(res.status).toBe(403);
    expect(db.product.findFirst).not.toHaveBeenCalled();
    expect(db.product.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/products/:slug/enable', () => {
  test('clears disabledAt, audits "enabled", returns the updated product', async () => {
    db.product.findFirst.mockResolvedValue(prod({ disabledAt: new Date() }));
    const res = await request(makeApp(ADMIN)).post('/api/products/latent-perit/enable');
    expect(res.status).toBe(200);
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { disabledAt: null } }),
    );
    expect(db.productAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'enabled', productId: 7 }) }),
    );
    expect(res.body.product.disabledAt).toBeNull();
  });

  test('enabling an already-enabled product is an idempotent no-op (no update, no audit)', async () => {
    db.product.findFirst.mockResolvedValue(prod({ disabledAt: null }));
    const res = await request(makeApp(ADMIN)).post('/api/products/latent-perit/enable');
    expect(res.status).toBe(200);
    expect(db.product.update).not.toHaveBeenCalled();
    expect(db.productAudit.create).not.toHaveBeenCalled();
  });

  test('a non-admin viewer is forbidden (403)', async () => {
    const res = await request(makeApp(VIEWER)).post('/api/products/latent-perit/enable');
    expect(res.status).toBe(403);
  });
});
