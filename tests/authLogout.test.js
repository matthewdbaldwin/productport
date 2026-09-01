'use strict';
// POST /api/auth/logout must revoke the Session row server-side AND must NOT
// silently succeed if the revoke fails. The original handler swallowed the
// error (`.catch(() => {})`), so a "logged out" user could keep a live
// server-side session with zero trace. This mirrors opsport's logout, which
// propagates the failure instead of swallowing it.
//
// Extended for the refresh client: logout also fires a best-effort,
// fire-and-forget upstream revoke of the refresh token (if a refresh
// cookie is present) and clears the refresh cookie. Unlike the Session-row
// revoke above, a failed upstream revoke must NEVER block logout — the
// user's own local session ends either way; the upstream revoke is
// defense-in-depth against a captured refresh token outliving logout.

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 1, email: 'u@microport.com' }; req.sessionId = 'sess-1'; next(); },
  COOKIE_NAME: 'productport_token',
}));
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => ({ session: { update: jest.fn() } }));
jest.mock('../src/lib/refreshClient', () => ({ revokeUpstreamRefresh: jest.fn().mockResolvedValue(undefined) }));

const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');
const db = require('../src/lib/db');
const { revokeUpstreamRefresh } = require('../src/lib/refreshClient');

// Slice 5a: routes/auth.js now reads IDP_API_URL at MODULE LOAD (throws if
// unset) — required here even though refreshClient itself is mocked above.
process.env.IDP_API_URL = 'https://idp.example.com';

function makeApp() {
  const a = express();
  a.use(express.json());
  a.use(cookieParser());
  a.use('/api/auth', require('../src/routes/auth'));
  return a;
}
const app = makeApp();

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/logout', () => {
  test('revokes the session row and clears the cookie on success', async () => {
    db.session.update.mockResolvedValue({});
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(db.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
  });

  test('does NOT silently succeed when the session revoke fails (propagates, not swallowed)', async () => {
    db.session.update.mockRejectedValue(new Error('db down'));
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  test('refresh cookie present → upstream revoke called with it, refresh cookie cleared', async () => {
    db.session.update.mockResolvedValue({});
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', ['productport_refresh=raw-refresh-abc']);

    expect(res.status).toBe(200);
    // NOTE: not `toHaveBeenCalledWith('raw-refresh-abc', expect.anything(), expect.anything())`
    // as originally written — this test's makeApp() (like every other auth-route
    // test file in this repo) mounts no pino-http, so req.log/req.id are
    // structurally always undefined here, and Jest's expect.anything() explicitly
    // excludes null/undefined by documented contract. That made the original
    // assertion unpassable regardless of the implementation. The property this
    // test actually needs to verify — the raw refresh token is forwarded to the
    // upstream revoke call — is unaffected by this fix.
    expect(revokeUpstreamRefresh.mock.calls[0][0]).toBe('raw-refresh-abc');
    const setCookies = res.headers['set-cookie'] || [];
    expect(setCookies.some(c => c.startsWith('productport_refresh=;') || /productport_refresh=;.*Expires=Thu, 01 Jan 1970/.test(c))).toBe(true);
  });

  test('no refresh cookie present → upstream revoke NOT called', async () => {
    db.session.update.mockResolvedValue({});
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(revokeUpstreamRefresh).not.toHaveBeenCalled();
  });

  test('upstream revoke failure does not block logout (fire-and-forget)', async () => {
    db.session.update.mockResolvedValue({});
    revokeUpstreamRefresh.mockRejectedValue(new Error('idp down'));
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', ['productport_refresh=raw-refresh-abc']);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
