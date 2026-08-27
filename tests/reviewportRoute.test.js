// tests/reviewportRoute.test.js — src/routes/reviewport.js, the inbound
// ReviewPort integration (ReviewPort#58 / productport#10). Read-only product
// search + detail behind a static Bearer key (REVIEWPORT_API_KEY) shared with
// the OpsPort seam's guard. db is mocked at the wiring level, matching
// tests/opsportRoute.test.js.
'use strict';

jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => ({
  product: { findMany: jest.fn(), findFirst: jest.fn() },
  productAudit: { create: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const db = require('../src/lib/db');

function makeApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/reviewport', require('../src/routes/reviewport'));
  return a;
}

const KEY = 'rp-secret-key-abc123';
const auth = (req) => req.set('Authorization', `Bearer ${KEY}`);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.REVIEWPORT_API_KEY;
  db.product.findMany.mockResolvedValue([]);
  db.product.findFirst.mockResolvedValue(null);
  db.productAudit.create.mockResolvedValue({});
});

describe('REVIEWPORT_API_KEY guard', () => {
  test('503s and never queries the DB when the key is unset', async () => {
    const res = await request(makeApp()).get('/api/reviewport/products?q=x');
    expect(res.status).toBe(503);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  test('401s on a missing Authorization header', async () => {
    process.env.REVIEWPORT_API_KEY = KEY;
    const res = await request(makeApp()).get('/api/reviewport/products?q=x');
    expect(res.status).toBe(401);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  test('401s on a wrong bearer key, and the OpsPort key does not open this seam', async () => {
    process.env.REVIEWPORT_API_KEY = KEY;
    process.env.OPSPORT_API_KEY = 'op-other-key';
    const r1 = await request(makeApp()).get('/api/reviewport/products?q=x').set('Authorization', 'Bearer wrong');
    expect(r1.status).toBe(401);
    const r2 = await request(makeApp()).get('/api/reviewport/products?q=x').set('Authorization', 'Bearer op-other-key');
    expect(r2.status).toBe(401);
    delete process.env.OPSPORT_API_KEY;
  });

  test('200s on the correct bearer key', async () => {
    process.env.REVIEWPORT_API_KEY = KEY;
    const res = await auth(request(makeApp()).get('/api/reviewport/products?q=x'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/reviewport/products — search', () => {
  beforeEach(() => { process.env.REVIEWPORT_API_KEY = KEY; });

  test('400s without a query — no bulk listing through this seam', async () => {
    const res = await auth(request(makeApp()).get('/api/reviewport/products'));
    expect(res.status).toBe(400);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/reviewport/products — search results', () => {
  beforeEach(() => { process.env.REVIEWPORT_API_KEY = KEY; });

  const rows = [
    { slug: 'toumai-pro', name: 'Toumai® Pro', subsidiary: 'MedBot', therapeuticArea: 'Surgical Robotics', category: 'Surgical robot', status: 'ACTIVE', developmentStatus: null, deletedAt: null, disabledAt: null },
    { slug: 'toumai-draft', name: 'Toumai® Draft', subsidiary: 'MedBot', therapeuticArea: 'Surgical Robotics', category: 'Surgical robot', status: 'DRAFT', developmentStatus: null, deletedAt: null, disabledAt: null },
    { slug: 'toumai-off', name: 'Toumai® Off', subsidiary: 'MedBot', therapeuticArea: 'Surgical Robotics', category: 'Surgical robot', status: 'ACTIVE', developmentStatus: null, deletedAt: null, disabledAt: new Date('2026-01-01') },
    { slug: 'toumai-gone', name: 'Toumai® Gone', subsidiary: 'MedBot', therapeuticArea: 'Surgical Robotics', category: 'Surgical robot', status: 'ACTIVE', developmentStatus: null, deletedAt: new Date('2026-01-01'), disabledAt: null },
  ];
  // Apply the where clause the way Prisma would, so the exclusion rules are
  // asserted by their effect on the rows, not by the shape of the query.
  function prismaLike({ where, select, take }) {
    const contains = (v, f) => String(v || '').toLowerCase().includes(f.contains.toLowerCase());
    const matches = rows.filter((r) =>
      (where.deletedAt === undefined || r.deletedAt === where.deletedAt) &&
      (where.disabledAt === undefined || r.disabledAt === where.disabledAt) &&
      (!where.status || r.status !== where.status.not) &&
      (!where.OR || where.OR.some((c) => Object.entries(c).some(([k, f]) => contains(r[k], f)))));
    return Promise.resolve(matches.slice(0, take).map((r) => {
      const shaped = {};
      for (const k of Object.keys(select)) shaped[k] = r[k];
      return shaped;
    }));
  }

  test('returns the picker shape and excludes DRAFT, disabled and soft-deleted products', async () => {
    db.product.findMany.mockImplementation(prismaLike);
    const res = await auth(request(makeApp()).get('/api/reviewport/products?q=toumai'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: [{
      slug: 'toumai-pro', name: 'Toumai® Pro', subsidiary: 'MedBot', therapeuticArea: 'Surgical Robotics',
      category: 'Surgical robot', status: 'ACTIVE', developmentStatus: null,
    }] });
  });

  test('matches on subsidiary and category, not only name and slug', async () => {
    db.product.findMany.mockImplementation(prismaLike);
    const bySub = await auth(request(makeApp()).get('/api/reviewport/products?q=medbot'));
    expect(bySub.body.products.map((p) => p.slug)).toEqual(['toumai-pro']);
    const byCat = await auth(request(makeApp()).get('/api/reviewport/products?q=surgical%20robot'));
    expect(byCat.body.products.map((p) => p.slug)).toEqual(['toumai-pro']);
    const miss = await auth(request(makeApp()).get('/api/reviewport/products?q=firehawk'));
    expect(miss.body.products).toEqual([]);
  });

  test('caps at 20 rows ordered by name', async () => {
    db.product.findMany.mockResolvedValue([]);
    await auth(request(makeApp()).get('/api/reviewport/products?q=t'));
    const arg = db.product.findMany.mock.calls[0][0];
    expect(arg.take).toBe(20);
    expect(arg.orderBy).toEqual({ name: 'asc' });
  });

  test('writes a reviewport.read audit row carrying the query', async () => {
    db.product.findMany.mockResolvedValue([]);
    await auth(request(makeApp()).get('/api/reviewport/products?q=toumai'));
    expect(db.productAudit.create).toHaveBeenCalledTimes(1);
    const { data } = db.productAudit.create.mock.calls[0][0];
    expect(data.action).toBe('reviewport.read');
    expect(data.userEmail).toBe('reviewport');
    expect(data.productId).toBeNull();
    expect(JSON.parse(data.newValue)).toEqual({ kind: 'search', q: 'toumai' });
  });

  test('a failed audit write does not fail the read', async () => {
    db.product.findMany.mockResolvedValue([]);
    db.productAudit.create.mockRejectedValue(new Error('db down'));
    const res = await auth(request(makeApp()).get('/api/reviewport/products?q=toumai'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/reviewport/products/:slug — detail', () => {
  beforeEach(() => { process.env.REVIEWPORT_API_KEY = KEY; });

  const full = {
    id: 'p1', slug: 'toumai-pro', name: 'Toumai® Pro', subsidiary: 'MedBot', therapeuticArea: 'Surgical Robotics',
    category: 'Surgical robot', status: 'ACTIVE', developmentStatus: 'Under Development — est. cert Feb 2026',
    modelNumbers: 'TESNO8541|TESNO8542', deletedAt: null, disabledAt: null,
    clearances: [{ region: 'CE', status: 'APPROVED' }, { region: 'FDA', status: 'IN_PROGRESS' }],
    countryClearances: [{ country: 'GB', status: 'APPROVED' }, { country: 'BR', status: 'NONE' }],
  };
  const rows = [
    full,
    { ...full, id: 'p2', slug: 'toumai-draft', status: 'DRAFT' },
    { ...full, id: 'p3', slug: 'toumai-off', disabledAt: new Date('2026-01-01') },
    { ...full, id: 'p4', slug: 'toumai-gone', deletedAt: new Date('2026-01-01') },
  ];
  function prismaLike({ where }) {
    const r = rows.find((x) =>
      x.slug === where.slug &&
      (where.deletedAt === undefined || x.deletedAt === where.deletedAt) &&
      (where.disabledAt === undefined || x.disabledAt === where.disabledAt) &&
      (!where.status || x.status !== where.status.not));
    return Promise.resolve(r || null);
  }

  test('returns picker fields plus modelNumbers, every clearance and the GB country-clearance status', async () => {
    db.product.findFirst.mockImplementation(prismaLike);
    const res = await auth(request(makeApp()).get('/api/reviewport/products/toumai-pro'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      slug: 'toumai-pro', name: 'Toumai® Pro', subsidiary: 'MedBot', therapeuticArea: 'Surgical Robotics',
      category: 'Surgical robot', status: 'ACTIVE', developmentStatus: 'Under Development — est. cert Feb 2026',
      modelNumbers: ['TESNO8541', 'TESNO8542'],
      clearances: [{ region: 'CE', status: 'APPROVED' }, { region: 'FDA', status: 'IN_PROGRESS' }],
      gbClearanceStatus: 'APPROVED',
    });
  });

  test('gbClearanceStatus is null when no GB country-clearance row exists', async () => {
    db.product.findFirst.mockResolvedValue({ ...full, countryClearances: [{ country: 'BR', status: 'NONE' }], modelNumbers: null });
    const res = await auth(request(makeApp()).get('/api/reviewport/products/toumai-pro'));
    expect(res.body.gbClearanceStatus).toBeNull();
    expect(res.body.modelNumbers).toEqual([]);
  });

  test.each(['nope', 'toumai-draft', 'toumai-off', 'toumai-gone'])('404s for %s', async (slug) => {
    db.product.findFirst.mockImplementation(prismaLike);
    const res = await auth(request(makeApp()).get(`/api/reviewport/products/${slug}`));
    expect(res.status).toBe(404);
  });

  test('writes a reviewport.read audit row against the product', async () => {
    db.product.findFirst.mockImplementation(prismaLike);
    await auth(request(makeApp()).get('/api/reviewport/products/toumai-pro'));
    const { data } = db.productAudit.create.mock.calls[0][0];
    expect(data.action).toBe('reviewport.read');
    expect(data.productId).toBe('p1');
    expect(JSON.parse(data.newValue)).toEqual({ kind: 'detail', slug: 'toumai-pro' });
  });

  test('a 404 is not audited', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await auth(request(makeApp()).get('/api/reviewport/products/nope'));
    expect(db.productAudit.create).not.toHaveBeenCalled();
  });
});
