'use strict';

// tests/cookies.test.js
//
// Characterization tests for src/lib/cookies.js — the productport adapter over
// microport-auth's createCookieHelpers (kevlar security-hardening remediation,
// 2026-08-05). Locks in:
//   - the cookie name ('productport_token', unchanged from the old hand-rolled
//     res.cookie call — a rename would log out every live session)
//   - the security envelope { httpOnly, secure: isProd(), sameSite:'lax', path:'/' }
//   - session Max-Age = jwtTtlSec() * 1000 — the actual fix: the old hand-rolled
//     cookie in src/routes/auth.js set NO maxAge at all (browser-session-only)
//   - clear helpers mirror the set attributes (minus maxAge)
//
// The helpers call res.cookie / res.clearCookie; we drive a fake `res` (jest.fn
// spies) and inspect the exact args. jwtTtl's cache is reset between cases so
// the Max-Age assertions are deterministic.

const { __resetJwtTtlCache } = require('../src/lib/jwtTtl');
const cookies = require('../src/lib/cookies');

function makeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

const DAY = 24 * 60 * 60;

beforeEach(() => {
  process.env.NODE_ENV = 'test'; // isProd() === false
  delete process.env.JWT_EXPIRES_IN; // default TTL is 8h
  __resetJwtTtlCache();
});

describe('cookies — exported names', () => {
  it('re-exports the productport-specific cookie names', () => {
    expect(cookies.COOKIE_NAME).toBe('productport_token');
    expect(cookies.REFRESH_COOKIE_NAME).toBe('productport_refresh');
    expect(cookies.REFRESH_TTL_SEC).toBe(90 * DAY); // 7776000
  });
});

describe('cookies — setSessionCookie', () => {
  it('sets the session cookie with the full security envelope and the 8h default Max-Age', () => {
    const res = makeRes();
    cookies.setSessionCookie(res, 'the-token');

    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith('productport_token', 'the-token', {
      httpOnly: true,
      secure: false, // NODE_ENV !== 'production'
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000, // 8h → 28800000ms (jwtTtl default) — the P0 gap this fixes
    });
  });

  it('Max-Age tracks jwtTtlSec — JWT_EXPIRES_IN=2h yields a 2h Max-Age (not a hardcoded 8h)', () => {
    process.env.JWT_EXPIRES_IN = '2h';
    __resetJwtTtlCache();
    const res = makeRes();
    cookies.setSessionCookie(res, 't');
    expect(res.cookie.mock.calls[0][2].maxAge).toBe(2 * 60 * 60 * 1000); // 7200000
  });

  it('sets Secure when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    cookies.setSessionCookie(res, 't');
    expect(res.cookie.mock.calls[0][2].secure).toBe(true);
  });
});

describe('cookies — clearSessionCookie', () => {
  it('mirrors the set attributes and drops maxAge', () => {
    const res = makeRes();
    cookies.clearSessionCookie(res);
    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    const [name, opts] = res.clearCookie.mock.calls[0];
    expect(name).toBe('productport_token');
    expect(opts).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
    expect(opts.maxAge).toBeUndefined();
  });
});

// Refresh helpers are exported for fleet shape-parity only — ProductPort's SSO
// exchange never requests a refresh token from the IdP (see src/lib/cookies.js
// and src/routes/auth.js file headers), so nothing calls these today. Still
// characterized here so a future wire-up inherits a proven-correct helper.
describe('cookies — refresh helpers (unused today, exported for parity)', () => {
  it('sets the refresh cookie with a 90-day Max-Age', () => {
    const res = makeRes();
    cookies.setRefreshCookie(res, 'refresh-token');
    expect(res.cookie).toHaveBeenCalledWith('productport_refresh', 'refresh-token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 90 * DAY * 1000,
    });
  });

  it('clearRefreshCookie mirrors the set attributes and drops maxAge', () => {
    const res = makeRes();
    cookies.clearRefreshCookie(res);
    const [name, opts] = res.clearCookie.mock.calls[0];
    expect(name).toBe('productport_refresh');
    expect(opts).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
    expect(opts.maxAge).toBeUndefined();
  });
});
