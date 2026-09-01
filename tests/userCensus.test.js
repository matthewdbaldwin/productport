// tests/userCensus.test.js
//
// Route-level tests for the HubPort fleet-union census endpoint
// (POST /api/internal/user-census). Prisma is MOCKED; the HMAC signature is
// REAL (signed with the same HUBPORT_CENSUS_SECRET the guard verifies), mirroring
// the established fleet HMAC-route pattern (tests/ssoLifecycle.test.js).
//
// Two layers:
//   1. Router-level (minimal express app, rawBody captured the same way app.js
//      does) — DTO shape, no-credential-leak, isLocalCapable derivation,
//      cursor pagination, 401 on missing/bad signature. ProductPort has NO
//      soft-delete (no deletedAt column), so there is no exclusion case to test
//      here — the WHERE clause is `{}` (all rows) and every fixture is visible.
//   2. Full-app wiring (real src/app) — proves the census path is CSRF-bootstrap
//      bypassed, so a signed server-to-server POST reaches the guard (200)
//      rather than being 403'd by the browser-CSRF guard.

// ── Env must be set BEFORE any require ────────────────────────────────────────
process.env.NODE_ENV = 'test';
const SECRET = 'census-shared-secret-test';
process.env.HUBPORT_CENSUS_SECRET = SECRET;
// Slice 5a: routes/auth.js (pulled in transitively via src/app) now reads
// IDP_API_URL at MODULE LOAD (throws if unset).
process.env.IDP_API_URL = 'https://idp.example.com';

// ── Mock Prisma — a smart user.findMany over a fixed seed that honours the
// orderBy(email)/cursor/skip/take shape the route emits. ProductPort has no
// deletedAt column, so there is no where(deletedAt) filtering to replicate. ────
jest.mock('../src/lib/db', () => {
  const rows = [
    // live, local-capable bcrypt hash, mixed-case email (proves lowercasing)
    { email: 'Alice@microport.com', name: 'Alice Anders', password: '$2b$10$abcdefghijklmnopqrstuv', role: 'product_admin', active: true, createdAt: new Date('2026-01-02T03:04:05.000Z') },
    // live, SSO-only — password is null (ProductPort's real convention, NOT a sentinel) → isLocalCapable false
    { email: 'bob@microport.com', name: null, password: null, role: 'viewer', active: true, createdAt: new Date('2026-01-03T00:00:00.000Z') },
    // disabled → active false, bcrypt $2a → isLocalCapable true (disabled locals ARE included in the census)
    { email: 'carol@microport.com', name: 'Carol Chen', password: '$2a$10$abcdefghijklmnopqrstuv', role: 'product', active: false, createdAt: new Date('2026-01-04T00:00:00.000Z') },
  ];
  const findMany = jest.fn(async (args = {}) => {
    let data = rows.slice();
    data.sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));
    if (args.cursor && args.cursor.email != null) {
      const idx = data.findIndex((r) => r.email === args.cursor.email);
      if (idx >= 0) data = data.slice(idx + (typeof args.skip === 'number' ? args.skip : 0));
    }
    if (typeof args.take === 'number') data = data.slice(0, Math.max(0, args.take));
    return data;
  });
  return { user: { findMany } };
});

// Full app boots pino-http + a logger + the auth middleware module; mock all
// three so no real logger/transport/JWT-verifier construction runs.
//
// PATTERN (seen twice, not just once): the brief's auth mock was { requireAuth, COOKIE_NAME }
// only. BUT src/routes/products.js (mounted by app.js at module-load time, alongside
// the census route) ALSO destructures `requireProductAdmin` from '../middleware/auth'
// and registers it as Express route middleware (`router.post('/', requireProductAdmin, ...)`
// etc.) — Express validates that every argument to router.post/get/etc. is a function
// AT REGISTRATION TIME, so an undefined requireProductAdmin throws synchronously the moment
// app.js requires routes/products.js, before any test runs. Adding a pass-through
// requireProductAdmin to the mock (the same shape as requireAuth) fixes this.
//
// SECOND INSTANCE: app.js (line 75) ALSO calls `app.use('/api', withFreshAccessToken);`
// at module-load time. An undefined withFreshAccessToken triggers the same synchronous
// Router.use() error. Adding withFreshAccessToken to the mock (same pass-through shape)
// fixes this. The census route itself never touches requireProductAdmin or withFreshAccessToken;
// they are added to the mock purely to satisfy Express's registration-time validation.
jest.mock('pino-http', () => () => (_req, _res, next) => next());
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn().mockReturnThis() }));
jest.mock('../src/middleware/auth', () => ({
  requireAuth: (_req, _res, next) => next(),
  requireProductAdmin: (_req, _res, next) => next(),
  withFreshAccessToken: (_req, _res, next) => next(),
  COOKIE_NAME: 'pp_session',
}));

const express = require('express');
const request = require('supertest');
const { signWebhookBody } = require('@matthewdbaldwin/microport-auth');
const prisma = require('../src/lib/db');

// Minimal harness: rawBody captured exactly as app.js does, census router mounted.
const routerApp = express();
routerApp.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
routerApp.use('/api/internal/user-census', require('../src/routes/userCensus'));

function signedPost(app, bodyObj) {
  const body = JSON.stringify(bodyObj);
  return request(app)
    .post('/api/internal/user-census')
    .set('Content-Type', 'application/json')
    .set('x-hubport-signature', signWebhookBody(SECRET, body))
    .send(body);
}

describe('census route — DTO shape + credential safety', () => {
  it('returns the canonical DTO for all users (no soft-delete to exclude)', async () => {
    const res = await signedPost(routerApp, { take: 100 });
    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();

    expect(res.body.users.map((u) => u.email)).toEqual([
      'alice@microport.com', 'bob@microport.com', 'carol@microport.com',
    ]);

    // the route must request all rows (no soft-delete WHERE) sorted by email
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { email: 'asc' } }),
    );

    // exact DTO for the first user (email lowercased, name, ISO dates,
    // lastLoginAt always null — ProductPort does not track last-login)
    expect(res.body.users[0]).toEqual({
      email: 'alice@microport.com',
      name: 'Alice Anders',
      active: true,
      localRole: 'product_admin',
      isLocalCapable: true,
      lastLoginAt: null,
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('never emits password anywhere in the body', async () => {
    const res = await signedPost(routerApp, { take: 100 });
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/passwordHash|password|\$2[aby]\$/);
    // and no satellite-local id leaks either (email is the sole join key)
    for (const u of res.body.users) expect(u).not.toHaveProperty('id');
  });

  it('derives isLocalCapable from the bcrypt prefix', async () => {
    const res = await signedPost(routerApp, { take: 100 });
    const byEmail = Object.fromEntries(res.body.users.map((u) => [u.email, u]));
    expect(byEmail['alice@microport.com'].isLocalCapable).toBe(true);  // $2b$ hash
    expect(byEmail['bob@microport.com'].isLocalCapable).toBe(false);   // password: null (SSO-only)
    expect(byEmail['carol@microport.com'].isLocalCapable).toBe(true);  // $2a$ hash
    expect(byEmail['bob@microport.com'].lastLoginAt).toBeNull();
    expect(byEmail['carol@microport.com'].active).toBe(false);         // disabled local, still included
  });
});

describe('census route — cursor pagination', () => {
  it('paginates over the POST body { cursor, take } and terminates cleanly', async () => {
    const p1 = await signedPost(routerApp, { take: 2 });
    expect(p1.status).toBe(200);
    expect(p1.body.users.map((u) => u.email)).toEqual(['alice@microport.com', 'bob@microport.com']);
    expect(p1.body.nextCursor).toBe('bob@microport.com');

    const p2 = await signedPost(routerApp, { cursor: p1.body.nextCursor, take: 2 });
    expect(p2.status).toBe(200);
    expect(p2.body.users.map((u) => u.email)).toEqual(['carol@microport.com']);
    expect(p2.body.nextCursor).toBeNull();
  });
});

describe('census route — signature enforcement', () => {
  it('401s when the signature header is missing', async () => {
    const res = await request(routerApp)
      .post('/api/internal/user-census')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ take: 100 }));
    expect(res.status).toBe(401);
  });

  it('401s when the signature is computed with the wrong secret', async () => {
    const body = JSON.stringify({ take: 100 });
    const res = await request(routerApp)
      .post('/api/internal/user-census')
      .set('Content-Type', 'application/json')
      .set('x-hubport-signature', signWebhookBody('the-wrong-secret', body))
      .send(body);
    expect(res.status).toBe(401);
  });
});

describe('census route — wiring through the real app (CSRF bypass + rawBody capture)', () => {
  const app = require('../src/app');

  it('a signed server-to-server POST is not CSRF-blocked and returns 200', async () => {
    const res = await signedPost(app, { take: 100 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('an unsigned POST is rejected by the census guard (401), not the CSRF guard (403)', async () => {
    const res = await request(app)
      .post('/api/internal/user-census')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ take: 100 }));
    expect(res.status).toBe(401);
  });

  it('the wrong method (GET, no handler registered) 404s — GET is CSRF-exempt so this exercises the router, not the guard', async () => {
    const res = await request(app).get('/api/internal/user-census');
    expect(res.status).toBe(404);
  });
});
