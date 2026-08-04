'use strict';
// PATCH /api/auth/me/theme — ProductPort's theme write path.
//
// ProductPort shipped the CLIENT half of the fleet theme feature and never the
// server half: `web/lib/theme.ts` PATCHes this route on every theme pick, and
// the route did not exist. It failed completely silently, because `fetch` only
// rejects on a network error (a 404 is a RESOLVED promise) and the call site
// ends `.catch(() => {})` without checking `res.ok`. Typecheck, lint, tests and
// CI were all green. A user's theme survived only in that browser's
// localStorage. project_productport_theme_persist_missing_route_2026-07-31.
//
// ProductPort does NOT get a local `theme` column, despite what the original
// finding prescribed. Theme is owned by the IdP, which stamps it into the SSO
// token as the `theme` claim; ProductPort READS it from that claim
// (src/middleware/auth.js:104) and never from its own table. A local column
// would be written and never read — dead storage plus a pointless migration.
// So this is a proxy, matching reviewport/opsport/clinicport/execport.
//
// The one place ProductPort must NOT copy the fleet verbatim: those four
// require an `Authorization: Bearer` header and 401 without it. ProductPort is
// post-Phase-4 COOKIE-ONLY (src/middleware/auth.js:51 reads only the cookie),
// and its client explicitly tolerates a missing localStorage token — Safari
// with "Block all cookies" throws on localStorage access. Requiring a bearer
// here would 401 exactly those users and re-create the silent failure this
// route exists to fix, so the cookie is a first-class fallback.

const COOKIE_NAME = 'productport_token';

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
  // mockReset, not clearAllMocks — a leftover `mockResolvedValueOnce` queue
  // survives clearAllMocks and leaks into the next test, so only the first
  // failure in the file would be real. feedback_clearAllMocks_does_not_drain_once_queues
  jest.resetModules();
  process.env = { ...OLD_ENV, IDP_API_URL: 'https://idp.example.com', SALESPORT_API_URL: 'https://sp.example.com' };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  db.user.update.mockReset();
});

afterAll(() => { process.env = OLD_ENV; });

describe('PATCH /api/auth/me/theme — the route exists and forwards to the IdP', () => {
  test('forwards the theme to the IdP using the caller\'s bearer token', async () => {
    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Authorization', 'Bearer tok-abc')
      .send({ theme: 'midnight' });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://idp.example.com/api/auth/me/theme');
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer tok-abc');
    expect(JSON.parse(init.body)).toEqual({ theme: 'midnight' });
  });

  test('falls back to the session COOKIE when no Authorization header is sent', async () => {
    // The ProductPort case the fleet route gets wrong. requireAuth already
    // authenticated this request off the cookie, so a missing bearer is normal,
    // not unauthorized.
    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme: 'midnight' });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer cookie-tok');
  });

  test('targets IDP_API_URL, so the write follows the HubPort IdP flip', async () => {
    // IDP_API_URL is the repointable handle ProductPort already uses for the
    // handoff exchange; SALESPORT_API_URL also feeds CSP + the bug-report relay
    // and must not be the thing that moves at flip time.
    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme: 'midnight' });

    expect(res.status).toBe(200);
    expect(global.fetch.mock.calls[0][0]).toBe('https://idp.example.com/api/auth/me/theme');
  });

  test('accepts null to clear the theme', async () => {
    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme: null });

    expect(res.status).toBe(200);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ theme: null });
  });

  test('never writes a local User.theme row — the IdP owns it', async () => {
    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme: 'midnight' });

    // Assert the forward HAPPENED first. Without this the negative assertion
    // below passes vacuously while the route is still a 404 — a guard test
    // cannot be the first test. feedback_guard_test_cannot_be_the_first_test
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(db.user.update).not.toHaveBeenCalled();
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
  ])('rejects %s with 400 and forwards nothing', async (_label, theme) => {
    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme });

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('accepts a 64-char theme (the boundary is inclusive)', async () => {
    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme: 'x'.repeat(64) });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /api/auth/me/theme — degradation never surfaces to the user', () => {
  test('returns ok without forwarding when no IdP is configured', async () => {
    delete process.env.IDP_API_URL;
    delete process.env.SALESPORT_API_URL;

    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme: 'midnight' });

    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('an upstream failure is swallowed — the client still gets 200', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('idp down'));

    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme: 'midnight' });

    expect(res.status).toBe(200);
  });

  test('a REJECTED write is logged, not swallowed — the whole point of this bug', async () => {
    // The original defect was invisibility, not the missing route as such: the
    // client `.catch(() => {})`s and never checks res.ok, so a 404 looked
    // identical to success. Repeating that here would hide a real failure mode —
    // HubPort is the IdP for every satellite and its requireAuth is cookie-only,
    // so a proxied bearer gets a 401 that `.catch` never sees (a 401 is a
    // RESOLVED promise). Server-side we MUST notice.
    logger.error.mockClear();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

    const res = await request(app)
      .patch('/api/auth/me/theme')
      .set('Cookie', [`${COOKIE_NAME}=cookie-tok`])
      .send({ theme: 'midnight' });

    expect(res.status).toBe(200);          // still never surfaces to the user
    await new Promise(setImmediate);       // let the fire-and-forget settle
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      expect.stringContaining('theme write'),
    );
  });

  test('401s only when there is no token at all to forward', async () => {
    const res = await request(app)
      .patch('/api/auth/me/theme')
      .send({ theme: 'midnight' });

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
