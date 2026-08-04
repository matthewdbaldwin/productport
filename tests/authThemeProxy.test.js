'use strict';
// PATCH /api/auth/me/theme — ProductPort's theme write path.
//
// History, because this route earned it twice:
// 1. ProductPort shipped the CLIENT half of the fleet theme feature and never
//    the server half — web/lib/theme.ts PATCHed a route that did not exist,
//    and the failure was invisible (fetch resolves on a 404; the call site
//    ended .catch(() => {}) without checking res.ok).
//    project_productport_theme_persist_missing_route_2026-07-31
// 2. The first server half (0.5.5) forwarded the user's own token to the IdP —
//    and hub's requireAuth is deliberately cookie-only, so every forwarded
//    bearer 401'd (the FLEET GAP note that used to live on this route). Fixed
//    2026-08-04 by hub's /api/service channel (hub cd7f0a1): the relay
//    authenticates with THIS APP's THEME_SERVICE_KEY and asserts the
//    authenticated user's email. No user token crosses the seam — which also
//    removes the Safari block-all-cookies 401 the 0.5.5 version worked around
//    with a cookie fallback.
//
// ProductPort still has no local `theme` column — the IdP owns the persisted
// pick and stamps it into the SSO `theme` claim; requireAuth reads it back
// from the claim, never from our table.
//
// These specs assert what is handed to fetch, not just the status — the
// status was green the whole time both bugs lived.

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 1, email: 'u@microport.com', role: 'viewer' };
    next();
  },
  COOKIE_NAME: 'productport_token',
}));
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => ({ user: { update: jest.fn() }, session: { update: jest.fn() } }));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const db = require('../src/lib/db');
const logger = require('../src/lib/logger');

function makeApp() {
  const a = express();
  a.use(cookieParser());
  a.use(express.json());
  a.use('/api/auth', require('../src/routes/auth'));
  return a;
}
const app = makeApp();

const OLD_ENV = process.env;
beforeEach(() => {
  // Fresh fns each test — leftover once-queues survive clearAllMocks
  // (feedback_clearAllMocks_does_not_drain_once_queues).
  process.env = { ...OLD_ENV, IDP_API_URL: 'https://idp.example.com', THEME_SERVICE_KEY: 'svc-key-123' };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  logger.warn.mockReset();
  logger.error.mockReset();
  db.user.update.mockReset();
});
afterAll(() => { process.env = OLD_ENV; });

describe('PATCH /api/auth/me/theme — relay shape', () => {
  test('relays {email, theme} to the IdP service channel with the service key', async () => {
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: 'midnight' });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://idp.example.com/api/service/users/theme');
    expect(init.method).toBe('PATCH');
    expect(init.headers['X-Theme-Service-Key']).toBe('svc-key-123');
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ email: 'u@microport.com', theme: 'midnight' });
  });

  test('no user token involved — works with neither bearer nor cookie present', async () => {
    // The Safari block-all-cookies case the 0.5.5 version special-cased, and
    // the case the other four satellites used to 401: the service-key relay
    // does not touch the user token at all, so it cannot 401.
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: 'midnight' });
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('a stray Authorization header is NOT forwarded to the IdP', async () => {
    await request(app)
      .patch('/api/auth/me/theme')
      .set('Authorization', 'Bearer user-token-must-not-cross-the-seam')
      .send({ theme: 'midnight' });
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test('accepts null to clear the theme — the body carries an explicit null', async () => {
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: null });
    expect(res.status).toBe(200);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ email: 'u@microport.com', theme: null });
  });

  test('trailing slash on IDP_API_URL does not double the slash', async () => {
    process.env.IDP_API_URL = 'https://idp.example.com/';
    await request(app).patch('/api/auth/me/theme').send({ theme: 'midnight' });
    expect(global.fetch.mock.calls[0][0]).toBe('https://idp.example.com/api/service/users/theme');
  });

  test('never writes a local User.theme row — the IdP owns it', async () => {
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: 'midnight' });
    // Assert the relay HAPPENED first. Without this the negative assertion
    // below passes vacuously while the route is still a 404 — a guard test
    // cannot be the first test. feedback_guard_test_cannot_be_the_first_test
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe('inert until provisioned — and NO SalesPort fallback', () => {
  test('skips (200, warn, no fetch) when IDP_API_URL is unset — even with SALESPORT_API_URL set', async () => {
    // The 0.5.5 version fell back to SALESPORT_API_URL. That row no longer
    // feeds the signed claim, so the fallback IS the dead write — assert it
    // never fires.
    delete process.env.IDP_API_URL;
    process.env.SALESPORT_API_URL = 'https://sp.example.com';
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: 'midnight' });
    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  test('skips (200, warn, no fetch) when THEME_SERVICE_KEY is unset', async () => {
    delete process.env.THEME_SERVICE_KEY;
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: 'midnight' });
    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('PATCH /api/auth/me/theme — validation', () => {
  test.each([
    ['a non-string', 42],
    ['an object', { id: 'midnight' }],
    ['an over-long string', 'x'.repeat(65)],
    // '' is NOT how the client clears a theme — it sends null. An empty string
    // reaching the IdP would persist a theme no ThemeId union can resolve.
    ['an empty string', ''],
  ])('rejects %s with 400 and relays nothing', async (_label, theme) => {
    const res = await request(app).patch('/api/auth/me/theme').send({ theme });
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('accepts a 64-char theme (the boundary is inclusive)', async () => {
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: 'x'.repeat(64) });
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('degradation never surfaces to the user — but is never invisible to us', () => {
  test('an upstream network failure is swallowed for the client, logged for us', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('idp down'));
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: 'midnight' });
    expect(res.status).toBe(200);
    await new Promise(setImmediate); // let the fire-and-forget settle
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'idp down' }),
      expect.stringContaining('theme write'),
    );
  });

  test('a REJECTED write is logged, not swallowed — the whole point of this bug', async () => {
    // The original defect was invisibility: a 4xx is a RESOLVED promise, so a
    // bare .catch never sees it. Server-side we MUST notice.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const res = await request(app).patch('/api/auth/me/theme').send({ theme: 'midnight' });
    expect(res.status).toBe(200); // still never surfaces to the user
    await new Promise(setImmediate);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      expect.stringContaining('theme write'),
    );
  });
});
