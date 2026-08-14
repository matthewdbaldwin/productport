// tests/authRefreshMiddleware.test.js
// withFreshAccessToken (mounted in app.js ahead of every requireAuth call)
// opportunistically renews a near-expiry access token. Contract: NEVER
// throws, NEVER responds — every path calls next(). ProductPort's client
// is cookie-only (no Authorization header, no localStorage token), so
// onRefreshed rotates both cookies and mutates req.cookies[COOKIE_NAME]
// directly for same-request visibility — requireAuth reads
// req.cookies[COOKIE_NAME] as its ONLY token source, so a direct mutation
// is sufficient; no header rewrite or extra req field is needed.
//
// Also covers the removal of requireAuth's pre-existing jti/local-session
// lookup: that block 401s SESSION_NOT_FOUND whenever no matching
// db.session row exists, which is ALWAYS true for a hub-issued token
// (ProductPort has no local login and creates no Session rows). Hub's
// short-lived access tokens always carry a jti — so without removing this
// block, refresh would 401-storm the very first request after refresh
// fires. This is the regression guard for that fix.
'use strict';

jest.mock('../src/lib/refreshClient', () => ({
  refreshFromHub: jest.fn(),
  revokeUpstreamRefresh: jest.fn(),
}));
// Requiring src/middleware/auth transitively requires src/lib/db, which in
// turn requires the generated @prisma/client — not generated in this test
// environment (every other suite that imports this module mocks db first,
// e.g. tests/authVerify.test.js). withFreshAccessToken never touches db, so
// an empty stub is enough here; the second describe block below overrides
// this per-test via jest.doMock + jest.resetModules (same pattern already
// used for refreshClient above).
jest.mock('../src/lib/db', () => ({
  user: { findUnique: jest.fn(), upsert: jest.fn() },
  session: { findUnique: jest.fn() },
}));

const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const ISSUER = 'https://sales-dev.microport.com';
process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');
process.env.SALESPORT_JWT_ISSUER = ISSUER;
process.env.SSO_CLAIMS_MODE = 'off'; // exercise the verify wiring, not the claims schema

const jwt = require('jsonwebtoken');
const { withFreshAccessToken } = require('../src/middleware/auth');
const { refreshFromHub } = require('../src/lib/refreshClient');
const { COOKIE_NAME, REFRESH_COOKIE_NAME } = require('../src/lib/cookies');

function token({ expiresInSec, exp, audience = 'productport' } = {}) {
  const payload = { sub: 4242, email: 'jane@microport.com', app_roles: {} };
  const options = { algorithm: 'RS256', issuer: ISSUER, audience };
  if (exp !== undefined) payload.exp = exp;
  else options.expiresIn = expiresInSec !== undefined ? expiresInSec : '8h';
  return jwt.sign(payload, privateKey, options);
}

function makeReq(overrides = {}) {
  return { headers: {}, cookies: {}, log: { warn: jest.fn(), info: jest.fn() }, ...overrides };
}
function makeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

const PAIR = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
};

describe('withFreshAccessToken', () => {
  const ORIGINAL_FLAG = process.env.PRODUCTPORT_REFRESH_ENABLED;
  beforeEach(() => {
    refreshFromHub.mockReset();
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'true';
  });
  afterEach(() => { process.env.PRODUCTPORT_REFRESH_ENABLED = ORIGINAL_FLAG; });

  test('flag off → no-op, no upstream call', async () => {
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'false';
    const req = makeReq({
      cookies: { [REFRESH_COOKIE_NAME]: 'raw-refresh', [COOKIE_NAME]: token({ expiresInSec: 30 }) },
    });
    const res = makeRes();
    const next = jest.fn();

    await withFreshAccessToken(req, res, next);

    expect(refreshFromHub).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  test('no refresh cookie → no-op (pre-rollout session)', async () => {
    const req = makeReq({ cookies: { [COOKIE_NAME]: token({ expiresInSec: 30 }) } });
    const res = makeRes();
    const next = jest.fn();

    await withFreshAccessToken(req, res, next);

    expect(refreshFromHub).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('token has plenty of life left (>2min) → no upstream call', async () => {
    const req = makeReq({
      cookies: { [REFRESH_COOKIE_NAME]: 'raw-refresh', [COOKIE_NAME]: token({ expiresInSec: 600 }) },
    });
    const res = makeRes();
    const next = jest.fn();

    await withFreshAccessToken(req, res, next);

    expect(refreshFromHub).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('near-expiry (<=2min) → refreshes, rotates both cookies, mutates req.cookies for same-request visibility', async () => {
    refreshFromHub.mockResolvedValue(PAIR);
    const req = makeReq({
      cookies: { [REFRESH_COOKIE_NAME]: 'raw-refresh', [COOKIE_NAME]: token({ expiresInSec: 60 }) },
    });
    const res = makeRes();
    const next = jest.fn();

    await withFreshAccessToken(req, res, next);

    expect(refreshFromHub).toHaveBeenCalledWith('raw-refresh', req.log);
    expect(res.cookie).toHaveBeenCalledTimes(2); // session + refresh
    const sessionCall = res.cookie.mock.calls.find(c => c[1] === PAIR.accessToken);
    expect(sessionCall).toBeTruthy();
    const refreshCall = res.cookie.mock.calls.find(c => c[1] === PAIR.refreshToken);
    expect(refreshCall).toBeTruthy();
    // Session cookie Max-Age tracks the REFRESH window, not the 15-min access
    // token. setSessionCookie (src/lib/cookies.js, via microport-auth's
    // createCookieHelpers) calls res.cookie(name, value, optionsObject) —
    // the mocked third arg is the options object, so read .maxAge off it
    // rather than comparing the object itself to a number.
    const expectedRefreshMs = Date.parse(PAIR.refreshTokenExpiresAt) - Date.now();
    expect(sessionCall[2].maxAge).toBeGreaterThan(expectedRefreshMs - 5000);
    expect(sessionCall[2].maxAge).toBeLessThanOrEqual(expectedRefreshMs + 5000);
    expect(req.cookies[COOKIE_NAME]).toBe(PAIR.accessToken); // same-request visibility
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('already-expired-but-signature-valid token still refreshes (ignoreExpiration)', async () => {
    refreshFromHub.mockResolvedValue(PAIR);
    const req = makeReq({
      cookies: { [REFRESH_COOKIE_NAME]: 'raw-refresh', [COOKIE_NAME]: token({ exp: Math.floor(Date.now() / 1000) - 30 }) },
    });
    const res = makeRes();
    const next = jest.fn();

    await withFreshAccessToken(req, res, next);

    expect(refreshFromHub).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('forged/tampered access token → verify fails → no refresh attempted', async () => {
    const stranger = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const bogus = jwt.sign({ sub: 1, email: 'x@microport.com' }, stranger.privateKey,
      { algorithm: 'RS256', issuer: ISSUER, audience: 'productport', expiresIn: '60s' });
    const req = makeReq({ cookies: { [REFRESH_COOKIE_NAME]: 'raw-refresh', [COOKIE_NAME]: bogus } });
    const res = makeRes();
    const next = jest.fn();

    await withFreshAccessToken(req, res, next);

    expect(refreshFromHub).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('wrong-audience token → no refresh', async () => {
    const req = makeReq({
      cookies: { [REFRESH_COOKIE_NAME]: 'raw-refresh', [COOKIE_NAME]: token({ expiresInSec: 60, audience: 'some-other-app' }) },
    });
    const res = makeRes();
    const next = jest.fn();

    await withFreshAccessToken(req, res, next);

    expect(refreshFromHub).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('refresh returns null → refresh cookie cleared, next() still called (never a 401 from here)', async () => {
    refreshFromHub.mockResolvedValue(null);
    const req = makeReq({
      cookies: { [REFRESH_COOKIE_NAME]: 'raw-refresh', [COOKIE_NAME]: token({ expiresInSec: 60 }) },
    });
    const res = makeRes();
    const next = jest.fn();

    await withFreshAccessToken(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, expect.any(Object));
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('requireAuth — jti/local-session lookup removed', () => {
  test('a jti-bearing token with NO matching db.session row still authenticates by email (the regression this removal guards)', async () => {
    jest.resetModules();
    const mockFindUnique = jest.fn().mockResolvedValue(null); // no existing local user
    const mockUpsert = jest.fn().mockResolvedValue({ id: 9, email: 'jane@microport.com', name: null, role: 'viewer', active: true });
    const mockSessionFindUnique = jest.fn(); // must NEVER be called — that's the point
    jest.doMock('../src/lib/db', () => ({
      user: { findUnique: mockFindUnique, upsert: mockUpsert },
      session: { findUnique: mockSessionFindUnique },
    }));
    process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');
    process.env.SALESPORT_JWT_ISSUER = ISSUER;
    process.env.SSO_CLAIMS_MODE = 'off';
    const { requireAuth } = require('../src/middleware/auth');

    // Simulates a hub-refreshed access token — carries a jti, exactly like
    // signAccessToken mints on the IdP side, with no local Session row ever
    // created for it (ProductPort has no code path that creates one).
    const jtiToken = jwt.sign(
      { sub: 4242, email: 'jane@microport.com', app_roles: {}, jti: 'a-hub-minted-jti' },
      privateKey,
      { algorithm: 'RS256', issuer: ISSUER, audience: 'productport', expiresIn: '15m' },
    );

    const req = { cookies: { [COOKIE_NAME]: jtiToken } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.email).toBe('jane@microport.com');
    expect(mockSessionFindUnique).not.toHaveBeenCalled(); // the block is gone, not just made lenient
    expect(req.sessionId).toBeUndefined();
  });

  test('same-request pickup: onRefreshed mutates req.cookies, and a subsequent requireAuth call in the SAME request authenticates as the fresh token', async () => {
    jest.resetModules();
    const mockUpsert = jest.fn().mockResolvedValue({ id: 9, email: 'jane@microport.com', name: null, role: 'viewer', active: true });
    jest.doMock('../src/lib/db', () => ({
      user: { findUnique: jest.fn().mockResolvedValue(null), upsert: mockUpsert },
      session: { findUnique: jest.fn() },
    }));
    process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');
    process.env.SALESPORT_JWT_ISSUER = ISSUER;
    process.env.SSO_CLAIMS_MODE = 'off';
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'true';
    jest.doMock('../src/lib/refreshClient', () => ({
      refreshFromHub: jest.fn().mockResolvedValue({
        accessToken: jwt.sign(
          { sub: 4242, email: 'jane@microport.com', app_roles: {}, jti: 'fresh-jti' },
          privateKey,
          { algorithm: 'RS256', issuer: ISSUER, audience: 'productport', expiresIn: '15m' },
        ),
        refreshToken: 'new-refresh',
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      revokeUpstreamRefresh: jest.fn(),
    }));
    const { withFreshAccessToken, requireAuth } = require('../src/middleware/auth');

    const nearExpiry = jwt.sign(
      { sub: 4242, email: 'jane@microport.com', app_roles: {} },
      privateKey,
      { algorithm: 'RS256', issuer: ISSUER, audience: 'productport', expiresIn: '60s' },
    );
    const req = { headers: {}, cookies: { productport_refresh: 'raw-refresh', [COOKIE_NAME]: nearExpiry }, log: { warn: jest.fn(), info: jest.fn() } };
    const res = { cookie: jest.fn(), clearCookie: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const peekNext = jest.fn();

    await withFreshAccessToken(req, res, peekNext);
    expect(peekNext).toHaveBeenCalledTimes(1);
    expect(req.cookies[COOKIE_NAME]).not.toBe(nearExpiry); // mutated to the fresh token

    const authNext = jest.fn();
    await requireAuth(req, res, authNext);

    expect(res.status).not.toHaveBeenCalled();
    expect(authNext).toHaveBeenCalledTimes(1);
    expect(req.user.email).toBe('jane@microport.com');

    delete process.env.PRODUCTPORT_REFRESH_ENABLED;
  });
});
