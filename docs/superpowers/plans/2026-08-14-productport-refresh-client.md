# ProductPort Refresh Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ProductPort the consumer-side refresh client it lacks, so its IdP can move ProductPort sessions from the legacy 8h stateless token to the short-access (15 min) + rotating-refresh (90 d) pair — the posture execport/reviewport/opsport/clinicport already run.

**Architecture:** Four additive changes plus one required deletion, all in `productport` (server-side only — no web task, since `web/lib/api.ts` is pure cookie-credentialed and picks up a renewed cookie automatically on the next request). A new `refreshClient.js` wraps the shared `@matthewdbaldwin/microport-auth` refresh caller with single-flight dedup; `middleware/auth.js` gains a `withFreshAccessToken` peek middleware wired to it AND loses a pre-existing dead-but-hazardous session-lookup block that would 401-storm the moment refreshed (jti-bearing) tokens start arriving; `app.js` mounts the peek middleware globally on `/api`; `routes/auth.js` opts the exchange into the refresh-pair shape and revokes upstream on logout.

**Tech Stack:** Node/Express, `@matthewdbaldwin/microport-auth` (already vendored, v0.15.0), Jest + supertest (existing conventions).

## Global Constraints

- Zero IdP/HubPort code changes of any kind.
- Never re-sign the IdP's token — the refreshed access token is cookied and used exactly as received.
- The peek middleware must never throw and must never send an HTTP response itself — every path calls `next()`. This is a contract already enforced by the shared library's `createWithFreshAccessToken` itself (its whole body is one outer try/catch that always calls `next()`); nothing in this plan's own code needs to re-implement that guarantee, just not fight it.
- Raw refresh token must never appear in a JS-readable response body, log, comment, or commit — HttpOnly cookie or server-to-server header only.
- `IDP_REFRESH_SHARED_SECRET`'s value and any Secrets Manager ARN must never be echoed into logs, comments, or commits — reference by variable name only.
- Both rollout gates (`PRODUCTPORT_REFRESH_ENABLED`, `IDP_REFRESH_SHARED_SECRET` provisioning) default OFF/absent — every task in this plan ships inert with zero env changes. Env/rollout work is explicitly OUT OF SCOPE for this plan; prod env changes need Matt's explicit go and are a separate follow-on activity.
- Task 2's `requireAuth` change is a **deletion**, not an addition — the one exception to "purely additive" in this plan. It is REQUIRED for the feature to work at all (see Task 2, Step 2b), not optional hardening or scope creep — do not skip it and do not treat it as out of scope.

---

## Task 1: `src/lib/refreshClient.js` — hub caller + single-flight

**Files:**
- Create: `src/lib/refreshClient.js`
- Test: `tests/refreshClient.test.js`

**Interfaces:**
- Produces: `refreshFromHub(rawRefreshToken, logger) => Promise<{accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt} | null>`, `revokeUpstreamRefresh(rawRefreshToken, logger, correlationId) => Promise<void>` — both consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/refreshClient.test.js`:

```js
// tests/refreshClient.test.js
// ProductPort refresh client — thin adapter over microport-auth's
// createRefreshClient, IDP_*-first with a SALESPORT_* fallback (matching
// this app's own existing /sso/exchange resolver convention — unlike
// salesport, which has no self-pointer and omits the fallback), plus a
// single-flight wrapper so concurrent callers holding the SAME refresh
// cookie share one upstream call instead of each independently consuming
// it (the IdP's refresh tokens are single-use; a second consumer of an
// already-consumed token trips replay detection and gets the whole
// family revoked, logging every sibling out).
'use strict';

describe('refreshClient — IDP_*-first with SALESPORT_* fallback', () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
    delete global.fetch;
  });

  test('falls back to SALESPORT_* vars when IDP_* is unset', async () => {
    delete process.env.IDP_API_URL;
    delete process.env.IDP_REFRESH_SHARED_SECRET;
    process.env.SALESPORT_API_URL = 'https://sales-dev.microport.com';
    process.env.SALESPORT_REFRESH_SHARED_SECRET = 'legacy-secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'a', refreshToken: 'b',
        accessTokenExpiresAt: '2026-08-14T12:15:00.000Z',
        refreshTokenExpiresAt: '2026-11-12T12:00:00.000Z',
      }),
    });

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');
    await refreshFromHub('raw-token', { warn: jest.fn() });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://sales-dev.microport.com/api/auth/refresh');
    expect(opts.headers['X-Satellite-Token']).toBe('legacy-secret');
  });

  test('prefers IDP_* vars over SALESPORT_* when both are set — the flip switch', async () => {
    process.env.SALESPORT_API_URL = 'https://sales-dev.microport.com';
    process.env.SALESPORT_REFRESH_SHARED_SECRET = 'legacy-secret';
    process.env.IDP_API_URL = 'https://hub-dev.microport.com';
    process.env.IDP_REFRESH_SHARED_SECRET = 'hub-secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'a', refreshToken: 'b',
        accessTokenExpiresAt: '2026-08-14T12:15:00.000Z',
        refreshTokenExpiresAt: '2026-11-12T12:00:00.000Z',
      }),
    });

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');
    await refreshFromHub('raw-token', { warn: jest.fn() });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://hub-dev.microport.com/api/auth/refresh');
    expect(opts.headers['X-Satellite-Id']).toBe('productport');
    expect(opts.headers['X-Satellite-Token']).toBe('hub-secret');
  });

  test('with neither IDP_* nor SALESPORT_* set, returns null and never calls fetch', async () => {
    delete process.env.IDP_API_URL;
    delete process.env.IDP_REFRESH_SHARED_SECRET;
    delete process.env.SALESPORT_API_URL;
    delete process.env.SALESPORT_REFRESH_SHARED_SECRET;
    global.fetch = jest.fn();

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');
    const result = await refreshFromHub('raw-token', { warn: jest.fn() });

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('refreshClient — single-flight', () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    process.env.IDP_API_URL = 'https://hub-dev.microport.com';
    process.env.IDP_REFRESH_SHARED_SECRET = 'hub-secret';
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
    delete global.fetch;
  });

  test('two concurrent calls with the SAME token share one upstream fetch', async () => {
    let resolveFetch;
    global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');

    const p1 = refreshFromHub('same-raw-token', { warn: jest.fn() });
    const p2 = refreshFromHub('same-raw-token', { warn: jest.fn() });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({
        accessToken: 'a', refreshToken: 'b',
        accessTokenExpiresAt: '2026-08-14T12:15:00.000Z',
        refreshTokenExpiresAt: '2026-11-12T12:00:00.000Z',
      }),
    });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual(r2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('the in-flight entry is cleared after settling, so a LATER call re-fetches', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'a', refreshToken: 'b',
        accessTokenExpiresAt: '2026-08-14T12:15:00.000Z',
        refreshTokenExpiresAt: '2026-11-12T12:00:00.000Z',
      }),
    });

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');
    await refreshFromHub('same-raw-token', { warn: jest.fn() });
    await refreshFromHub('same-raw-token', { warn: jest.fn() });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('the in-flight entry is cleared on FAILURE too (not stuck rejecting forever)', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ code: 'REFRESH_INVALID' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'a', refreshToken: 'b',
          accessTokenExpiresAt: '2026-08-14T12:15:00.000Z',
          refreshTokenExpiresAt: '2026-11-12T12:00:00.000Z',
        }),
      });

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');
    const first = await refreshFromHub('same-raw-token', { warn: jest.fn(), info: jest.fn() });
    expect(first).toBeNull();
    const second = await refreshFromHub('same-raw-token', { warn: jest.fn(), info: jest.fn() });
    expect(second).not.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('two DIFFERENT tokens never share a call', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'a', refreshToken: 'b',
        accessTokenExpiresAt: '2026-08-14T12:15:00.000Z',
        refreshTokenExpiresAt: '2026-11-12T12:00:00.000Z',
      }),
    });

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');
    await Promise.all([
      refreshFromHub('token-a', { warn: jest.fn() }),
      refreshFromHub('token-b', { warn: jest.fn() }),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('refreshClient — revokeUpstreamRefresh', () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
    delete global.fetch;
  });

  test('posts to /api/auth/refresh/revoke with the satellite id', async () => {
    process.env.IDP_API_URL = 'https://hub-dev.microport.com';
    process.env.IDP_REFRESH_SHARED_SECRET = 'hub-secret';
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    jest.resetModules();
    const { revokeUpstreamRefresh } = require('../src/lib/refreshClient');
    await revokeUpstreamRefresh('raw-refresh', { warn: jest.fn() }, 'corr-1');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://hub-dev.microport.com/api/auth/refresh/revoke');
    expect(opts.headers['X-Satellite-Id']).toBe('productport');
    expect(opts.headers['X-Correlation-Id']).toBe('corr-1');
  });

  test('never throws when no URL is configured', async () => {
    delete process.env.IDP_API_URL;
    delete process.env.SALESPORT_API_URL;
    global.fetch = jest.fn();

    jest.resetModules();
    const { revokeUpstreamRefresh } = require('../src/lib/refreshClient');
    await expect(revokeUpstreamRefresh('raw', { warn: jest.fn() })).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/refreshClient.test.js`
Expected: FAIL — `Cannot find module '../src/lib/refreshClient'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/refreshClient.js`:

```js
// src/lib/refreshClient.js
// ProductPort refresh client. Thin adapter over microport-auth's
// createRefreshClient, which owns the wire protocol (Bearer refresh +
// X-Satellite-Token + X-Satellite-Id), the null-on-any-failure contract,
// and the revoke path.
//
// IDP_*-first WITH a SALESPORT_* fallback — matches this app's own
// existing /sso/exchange resolver (`IDP_API_URL || SALESPORT_API_URL`).
// Both unset = no refresh client target; refreshFromHub simply returns
// null (the shared lib's own contract when apiUrl()/sharedSecret() are
// falsy) and next() proceeds with no upstream call.
const { createRefreshClient } = require('@matthewdbaldwin/microport-auth');

const client = createRefreshClient({
  apiUrl:       () => process.env.IDP_API_URL || process.env.SALESPORT_API_URL,
  sharedSecret: () => process.env.IDP_REFRESH_SHARED_SECRET || process.env.SALESPORT_REFRESH_SHARED_SECRET,
  satelliteId:  'productport',
});

// Single-flight: concurrent requests presenting the SAME raw refresh token
// (e.g. two browser tabs racing a near-expiry cookie) share ONE upstream
// call instead of each independently consuming it. The IdP's refresh
// tokens are single-use — a second consumer of an already-consumed token
// trips replay detection and gets the WHOLE FAMILY revoked, logging every
// sibling out. Keyed on the raw token string itself, since that's the
// only thing two concurrent callers sharing the same cookie have in
// common.
const inFlight = new Map();

function refreshFromHub(rawRefreshToken, logger) {
  if (inFlight.has(rawRefreshToken)) return inFlight.get(rawRefreshToken);
  // client.refreshFromSalesport never throws (null-on-any-failure
  // contract), so .finally always fires and this can't leak a stuck map
  // entry.
  const promise = client.refreshFromSalesport(rawRefreshToken, logger)
    .finally(() => inFlight.delete(rawRefreshToken));
  inFlight.set(rawRefreshToken, promise);
  return promise;
}

module.exports = {
  refreshFromHub,
  revokeUpstreamRefresh: client.revokeOnSalesport,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/refreshClient.test.js`
Expected: PASS (11/11)

- [ ] **Step 5: Commit**

```bash
git add src/lib/refreshClient.js tests/refreshClient.test.js
git commit -m "feat(auth): add IdP refresh client with single-flight dedup"
```

---

## Task 2: `src/middleware/auth.js` — peek middleware + jti-block removal

**Files:**
- Modify: `src/middleware/auth.js:38-49` (add `withFreshAccessToken`, export it), `src/middleware/auth.js:66-75` (delete the jti-session-lookup block)
- Test: `tests/authRefreshMiddleware.test.js`

**Interfaces:**
- Consumes: `refreshFromHub(rawRefreshToken, logger)`, `revokeUpstreamRefresh` (Task 1, only `refreshFromHub` used here); `REFRESH_COOKIE_NAME`, `setSessionCookie(res, token, maxAgeMs)`, `setRefreshCookie(res, token)`, `clearRefreshCookie(res)` (all already exported from `src/lib/cookies.js`, unmodified by this plan).
- Produces: `withFreshAccessToken` (Express middleware, exported from this module) — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/authRefreshMiddleware.test.js`:

```js
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

const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const ISSUER = 'https://sales-dev.microport.com';
process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
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
  return jwt.sign(payload, privateKey.export({ type: 'pkcs8', format: 'pem' }), options);
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
    // Session cookie Max-Age tracks the REFRESH window, not the 15-min access token.
    const expectedRefreshMs = Date.parse(PAIR.refreshTokenExpiresAt) - Date.now();
    expect(sessionCall[2]).toBeGreaterThan(expectedRefreshMs - 5000);
    expect(sessionCall[2]).toBeLessThanOrEqual(expectedRefreshMs + 5000);
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
    process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
    process.env.SALESPORT_JWT_ISSUER = ISSUER;
    process.env.SSO_CLAIMS_MODE = 'off';
    const { requireAuth } = require('../src/middleware/auth');

    // Simulates a hub-refreshed access token — carries a jti, exactly like
    // signAccessToken mints on the IdP side, with no local Session row ever
    // created for it (ProductPort has no code path that creates one).
    const jtiToken = jwt.sign(
      { sub: 4242, email: 'jane@microport.com', app_roles: {}, jti: 'a-hub-minted-jti' },
      privateKey.export({ type: 'pkcs8', format: 'pem' }),
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
    process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
    process.env.SALESPORT_JWT_ISSUER = ISSUER;
    process.env.SSO_CLAIMS_MODE = 'off';
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'true';
    jest.doMock('../src/lib/refreshClient', () => ({
      refreshFromHub: jest.fn().mockResolvedValue({
        accessToken: jwt.sign(
          { sub: 4242, email: 'jane@microport.com', app_roles: {}, jti: 'fresh-jti' },
          privateKey.export({ type: 'pkcs8', format: 'pem' }),
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
      privateKey.export({ type: 'pkcs8', format: 'pem' }),
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/authRefreshMiddleware.test.js`
Expected: FAIL — `withFreshAccessToken` is `undefined` (not yet exported), and the jti-regression test fails with a 401 `SESSION_NOT_FOUND` (the block is still present).

- [ ] **Step 3: Write the implementation**

In `src/middleware/auth.js`, add the import at the top alongside the existing `createVerifier` import (line 11):

```js
const { createVerifier, createWithFreshAccessToken } = require('@matthewdbaldwin/microport-auth');
```

Add the import for `REFRESH_COOKIE_NAME`, `setSessionCookie`, `setRefreshCookie`, `clearRefreshCookie` alongside the existing `COOKIE_NAME` import (line 18):

```js
const { COOKIE_NAME, REFRESH_COOKIE_NAME, setSessionCookie, setRefreshCookie, clearRefreshCookie } = require('../lib/cookies');
```

Add the import for `refreshFromHub` (new, alongside the other requires near the top of the file):

```js
const { refreshFromHub } = require('../lib/refreshClient');
```

After the existing `verify` definition (currently ending at line 49, right before `async function requireAuth`), add:

```js
// Opportunistic near-expiry refresh, mounted ahead of every requireAuth
// call (app.js). ProductPort's existing `verify` already has the exact
// call shape createWithFreshAccessToken needs — verify(token, {audience,
// ignoreExpiration}) — so it passes straight through, no adapter needed.
const withFreshAccessToken = createWithFreshAccessToken({
  verify,
  audience:     AUDIENCE,
  isEnabled:    () => process.env.PRODUCTPORT_REFRESH_ENABLED === 'true',
  thresholdSec: 120,
  getRefreshToken: (req) => req.cookies?.[REFRESH_COOKIE_NAME] || null,
  getAccessToken:  (req) => req.cookies?.[COOKIE_NAME] || null, // cookie-only; no Bearer path
  refresh: (rawRefresh, req) => refreshFromHub(rawRefresh, req.log),
  onRefreshed: (req, res, pair) => {
    const refreshRemainMs = Date.parse(pair.refreshTokenExpiresAt) - Date.now();
    setSessionCookie(res, pair.accessToken,
      Number.isFinite(refreshRemainMs) && refreshRemainMs > 0 ? refreshRemainMs : undefined);
    setRefreshCookie(res, pair.refreshToken);
    // Same-request visibility: requireAuth reads req.cookies[COOKIE_NAME] as
    // its ONLY token source (no candidate list, unlike salesport), so a
    // direct mutation is sufficient — no extra req field or header rewrite
    // needed. A Set-Cookie response header can't retroactively change what
    // THIS request's own req.cookies object holds.
    req.cookies[COOKIE_NAME] = pair.accessToken;
  },
  onRefreshFailed: (_req, res) => clearRefreshCookie(res),
});
```

Now delete the jti-session-lookup block. Find this in `requireAuth` (currently lines 64-76):

```js
  try {
    // jti-bearing tokens get a server-side session check (revocation).
    if (payload.jti) {
      const session = await db.session.findUnique({
        where: { jti: payload.jti },
        select: { id: true, revokedAt: true, expiresAt: true },
      });
      if (!session)             return res.status(401).json({ error: 'Session no longer valid. Please log in again.', code: 'SESSION_NOT_FOUND' });
      if (session.revokedAt)    return res.status(401).json({ error: 'Session has been revoked. Please log in again.', code: 'SESSION_REVOKED' });
      if (session.expiresAt < new Date()) return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
      req.sessionId = session.id;
    }

    // ProductPort is a UNIVERSAL app — every authenticated employee gets at
```

Replace it with (removing the `if (payload.jti) {...}` block entirely — the `try {` stays, and the role-resolution code that follows becomes the first thing inside it):

```js
  try {
    // ProductPort is a UNIVERSAL app — every authenticated employee gets at
```

*(This is a deletion — remove lines 65-75 of the original file, which is the comment line, the `if (payload.jti) { ... }` block, and its closing brace plus the blank line after it. The `try {` on line 64 and everything from the "ProductPort is a UNIVERSAL app" comment onward — currently starting at line 77 — are unchanged and now sit directly adjacent.)*

**Note for the implementer:** `req.sessionId` is never set anywhere else in this file after this deletion — it will simply always be `undefined`, which is what it already evaluated to for every request that reached this far before the deletion too (the block always either 401'd or never ran, since no token has ever carried a `jti` in this app until now). `src/routes/auth.js`'s `/logout` route already guards on `if (req.sessionId)` before touching `db.session` — confirmed via grep that `/logout` is the ONLY other reader of `req.sessionId` in this codebase — so it continues to safely no-op and needs no change.

Finally, update the module exports (currently the last line of the file) to add `withFreshAccessToken`:

```js
module.exports = { requireAuth, requireRole, requireProductAdmin, isProductAdmin, COOKIE_NAME, AUDIENCE, withFreshAccessToken };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/authRefreshMiddleware.test.js`
Expected: PASS (10/10)

- [ ] **Step 5: Run the existing auth test suite to confirm no regression**

Run: `npx jest tests/authVerify.test.js tests/authLoginCookie.test.js tests/authLogout.test.js tests/authThemeProxy.test.js tests/resolveRole.test.js`
Expected: PASS, same counts as before this task (the jti-block removal must not change behavior for any token that never carried a `jti`, which is every test fixture in these files).

- [ ] **Step 6: Commit**

```bash
git add src/middleware/auth.js tests/authRefreshMiddleware.test.js
git commit -m "feat(auth): wire opportunistic refresh + remove dead jti-session hazard"
```

---

## Task 3: `src/app.js` — mount the peek middleware

**Files:**
- Modify: `src/app.js:74` (add mount after this line)
- Test: `tests/appRefreshMount.test.js`

**Interfaces:**
- Consumes: `withFreshAccessToken` (Task 2's export from `./middleware/auth`).

- [ ] **Step 1: Write the failing test**

Create `tests/appRefreshMount.test.js`:

```js
// tests/appRefreshMount.test.js
// Structural check on the withFreshAccessToken mount in app.js. Deliberately
// does NOT boot the full app (booting app.js pulls in every router's own
// dependencies, including ones needing a live DB) — asserts the mount line
// is present and sits between csrfGuard and the /api/auth router mount,
// which is what makes it run ahead of every current and future
// requireAuth-gated router.
'use strict';

const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

test('withFreshAccessToken is mounted on /api', () => {
  expect(appSrc).toMatch(/app\.use\(\s*['"]\/api['"]\s*,\s*withFreshAccessToken\s*\)/);
});

test('the mount sits after csrfGuard and before the /api/auth router', () => {
  const csrfIdx  = appSrc.indexOf("app.use('/api', csrfGuard)");
  const mountIdx = appSrc.search(/app\.use\(\s*['"]\/api['"]\s*,\s*withFreshAccessToken\s*\)/);
  const authIdx  = appSrc.indexOf("app.use('/api/auth', require('./routes/auth'))");

  expect(csrfIdx).toBeGreaterThan(-1);
  expect(mountIdx).toBeGreaterThan(-1);
  expect(authIdx).toBeGreaterThan(-1);
  expect(mountIdx).toBeGreaterThan(csrfIdx);
  expect(mountIdx).toBeLessThan(authIdx);
});

test('withFreshAccessToken is imported from ./middleware/auth', () => {
  expect(appSrc).toMatch(/require\(['"]\.\/middleware\/auth['"]\)/);
  expect(appSrc).toMatch(/withFreshAccessToken/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/appRefreshMount.test.js`
Expected: FAIL — first two assertions fail (mount not present yet).

- [ ] **Step 3: Write the implementation**

In `src/app.js`, change line 12 from:

```js
const { requireAuth } = require('./middleware/auth');
```

to:

```js
const { requireAuth, withFreshAccessToken } = require('./middleware/auth');
```

Then add the mount immediately after line 74 (`app.use('/api', csrfGuard);`):

```js
app.use('/api', csrfGuard);
app.use('/api', withFreshAccessToken);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/appRefreshMount.test.js`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/appRefreshMount.test.js
git commit -m "feat(auth): mount withFreshAccessToken ahead of every requireAuth router"
```

---

## Task 4: `src/routes/auth.js` — exchange opt-in + logout revoke

**Files:**
- Modify: `src/routes/auth.js:19-22` (imports), `src/routes/auth.js:62-82` (`/sso/exchange`), `src/routes/auth.js:85-96` (`/logout`)
- Test: `tests/authSsoExchangeRefresh.test.js` (new), extend `tests/authLogout.test.js`

**Interfaces:**
- Consumes: `revokeUpstreamRefresh` (Task 1), `REFRESH_COOKIE_NAME`/`setRefreshCookie`/`clearRefreshCookie` (existing exports from `../lib/cookies`, unused until now).

- [ ] **Step 1: Write the failing test**

Create `tests/authSsoExchangeRefresh.test.js`:

```js
// tests/authSsoExchangeRefresh.test.js
// POST /sso/exchange gains the refresh-pair opt-in: when
// PRODUCTPORT_REFRESH_ENABLED is true, it sends X-Satellite-Refresh: 1 to
// the IdP; if the IdP responds with a refresh pair, both cookies are set
// and the raw refresh token/expiry are stripped from the forwarded JSON
// body (a stricter stance than clinicport's own current code, which
// forwards it verbatim — the raw refresh token must never be JS-readable).
// When the flag is off, or the IdP doesn't return a pair anyway, behavior
// must be byte-identical to today.
'use strict';

jest.mock('../src/lib/db', () => ({ session: { update: jest.fn() } }));

const crypto = require('crypto');
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
process.env.SALESPORT_JWT_ISSUER = 'https://sales-dev.microport.com';
process.env.SSO_CLAIMS_MODE = 'off';
process.env.IDP_API_URL = 'https://hub-dev.microport.com';

const express = require('express');
const request = require('supertest');
const authRouter = require('../src/routes/auth');

function makeApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRouter);
  return a;
}

describe('POST /api/auth/sso/exchange — refresh-pair opt-in', () => {
  const ORIGINAL_FLAG = process.env.PRODUCTPORT_REFRESH_ENABLED;
  afterEach(() => {
    delete global.fetch;
    process.env.PRODUCTPORT_REFRESH_ENABLED = ORIGINAL_FLAG;
  });

  test('flag on + IdP returns a pair → sends the opt-in header, sets both cookies, strips the refresh token from the response body', async () => {
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        token: 'access-tok',
        role: 'viewer',
        refreshToken: 'raw-refresh-xyz',
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    const res = await request(makeApp())
      .post('/api/auth/sso/exchange')
      .send({ code: 'x'.repeat(40) });

    expect(res.status).toBe(200);
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['X-Satellite-Refresh']).toBe('1');
    const setCookies = res.headers['set-cookie'] || [];
    expect(setCookies.some(c => c.startsWith('productport_token='))).toBe(true);
    expect(setCookies.some(c => c.startsWith('productport_refresh=raw-refresh-xyz'))).toBe(true);
    expect(res.body.token).toBe('access-tok');
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.refreshTokenExpiresAt).toBeUndefined();
  });

  test('flag off → the opt-in header is never sent, byte-identical to today (regression)', async () => {
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'false';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ token: 'access-tok', role: 'viewer' }),
    });

    const res = await request(makeApp())
      .post('/api/auth/sso/exchange')
      .send({ code: 'x'.repeat(40) });

    expect(res.status).toBe(200);
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['X-Satellite-Refresh']).toBeUndefined();
    const setCookies = res.headers['set-cookie'] || [];
    expect(setCookies.some(c => c.startsWith('productport_refresh='))).toBe(false);
    expect(res.body).toEqual({ token: 'access-tok', role: 'viewer' });
  });

  test('flag on but the IdP returns no pair anyway → byte-identical to today', async () => {
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ token: 'access-tok', role: 'viewer' }),
    });

    const res = await request(makeApp())
      .post('/api/auth/sso/exchange')
      .send({ code: 'x'.repeat(40) });

    expect(res.status).toBe(200);
    const setCookies = res.headers['set-cookie'] || [];
    expect(setCookies.some(c => c.startsWith('productport_refresh='))).toBe(false);
    expect(res.body).toEqual({ token: 'access-tok', role: 'viewer' });
  });
});
```

Extend `tests/authLogout.test.js` — add `revokeUpstreamRefresh` to the existing `jest.mock('../src/middleware/auth', ...)` factory's sibling mock and two new tests. Full replacement content for the file:

```js
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
    expect(revokeUpstreamRefresh).toHaveBeenCalledWith('raw-refresh-abc', expect.anything(), expect.anything());
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/authSsoExchangeRefresh.test.js tests/authLogout.test.js`
Expected: FAIL — the exchange tests fail (no opt-in header sent, no refresh cookie set, `refreshToken` field still present in the response body); the 3 new logout tests fail (`revokeUpstreamRefresh` never called, `../src/lib/refreshClient` doesn't exist as a mockable module path yet from this file's perspective — actually it does exist after Task 1, so this specific failure is "not called" rather than "module not found").

- [ ] **Step 3: Write the implementation**

In `src/routes/auth.js`, change the imports (lines 19-23) from:

```js
const express = require('express');
const logger = require('../lib/logger');
const { requireAuth } = require('../middleware/auth');
const { setSessionCookie, clearSessionCookie } = require('../lib/cookies');
const db = require('../lib/db');
```

to:

```js
const express = require('express');
const logger = require('../lib/logger');
const { requireAuth } = require('../middleware/auth');
const { setSessionCookie, clearSessionCookie, REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie } = require('../lib/cookies');
const { revokeUpstreamRefresh } = require('../lib/refreshClient');
const db = require('../lib/db');
```

Replace the `POST /sso/exchange` handler (lines 48-82, including its leading comment block) with:

```js
// POST /api/auth/sso/exchange — relay the one-time code to SalesPort's handoff
// exchange (server-to-server; the code is the credential, so no requireAuth /
// CSRF header). On success set the HttpOnly cookie (via lib/cookies.js — Max-Age
// = jwtTtlSec(), so this is no longer a browser-session-only cookie); forward
// the payload verbatim so the web frontend can stash the token + apply theme
// during the transition.
//
// REFRESH OPT-IN: when PRODUCTPORT_REFRESH_ENABLED is true, sends
// X-Satellite-Refresh: 1 so the IdP mints an (access, refresh) pair instead
// of the legacy single 8h token (mirrors clinicport's B1 Phase 4a.1 opt-in).
// When a pair comes back, the refresh cookie is set and the raw refresh
// token/expiry are stripped from the forwarded JSON body before it reaches
// the browser — the cookie is its only carrier; it has no business in JS.
router.post('/sso/exchange', async (req, res, next) => {
  try {
    if (!IDP_API) return res.status(503).json({ error: 'SSO not configured on this instance.' });
    const { code } = req.body || {};

    const refreshEnabled = process.env.PRODUCTPORT_REFRESH_ENABLED === 'true';
    const upstreamHeaders = { 'Content-Type': 'application/json', 'X-Correlation-Id': req.id };
    if (refreshEnabled) upstreamHeaders['X-Satellite-Refresh'] = '1';

    const upstream = await fetch(`${IDP_API.replace(/\/$/, '')}/api/auth/handoff/exchange`, {
      method:  'POST',
      headers: upstreamHeaders,
      body:    JSON.stringify({ code }),
      // Bound the IdP call — this is the login critical path; a hung hub must
      // fail the exchange fast (→ error handler), never hang the request.
      signal:  AbortSignal.timeout(10_000),
    });
    const payload = await upstream.json().catch(() => ({}));

    if (upstream.ok && payload.token) {
      if (payload.refreshToken) {
        const refreshRemainMs = Date.parse(payload.refreshTokenExpiresAt) - Date.now();
        setSessionCookie(res, payload.token,
          Number.isFinite(refreshRemainMs) && refreshRemainMs > 0 ? refreshRemainMs : undefined);
        setRefreshCookie(res, payload.refreshToken);
        delete payload.refreshToken;
        delete payload.refreshTokenExpiresAt;
      } else {
        setSessionCookie(res, payload.token);
      }
    } else {
      logger.warn({ status: upstream.status, code: payload && payload.code }, '[sso] handoff exchange denied');
    }

    return res.status(upstream.status).json(payload);
  } catch (err) { next(err); }
});
```

Replace the `POST /logout` handler (lines 84-96) with:

```js
// POST /api/auth/logout — clear the cookie + revoke the local Session row +
// best-effort revoke the upstream refresh token (if any).
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    // Revoke the Session row server-side (a cleared cookie alone lets a stolen
    // cookie replay outlive the logout). Do NOT swallow: a failed revoke means
    // the session is still live, so surface it (mirrors opsport's logout).
    if (req.sessionId) {
      await db.session.update({ where: { id: req.sessionId }, data: { revokedAt: new Date() } });
    }
    // Upstream refresh-token revoke is fire-and-forget: a captured refresh
    // token must not outlive logout, but an IdP outage must not block it.
    const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawRefresh) revokeUpstreamRefresh(rawRefresh, req.log, req.id).catch(() => {});
    clearSessionCookie(res);
    clearRefreshCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/authSsoExchangeRefresh.test.js tests/authLogout.test.js`
Expected: PASS (3/3 + 5/5)

- [ ] **Step 5: Run the full existing suite touching this file to confirm no regression**

Run: `npx jest tests/sso-exchange-idp-url.test.js tests/authLoginCookie.test.js tests/csrfGuard.test.js`
Expected: PASS, same counts as before this task — the no-pair exchange path and login-cookie behavior must be byte-identical to today.

- [ ] **Step 6: Run the full project test suite**

Run: `npx jest`
Expected: PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add src/routes/auth.js tests/authSsoExchangeRefresh.test.js tests/authLogout.test.js
git commit -m "feat(auth): opt in to the refresh pair on exchange, revoke upstream on logout"
```

---

## Post-plan notes (not tasks — do not execute as checkboxed steps)

**Rollout runbook** (env/AWS work, explicitly out of scope for this plan's tasks — captured here for the follow-on activity, gated on Matt's explicit go per Global Constraints):

1. Code ships inert to `develop` → `main` with zero env changes (both gates default off).
2. Dev enablement: productport-dev task-def gets `PRODUCTPORT_REFRESH_ENABLED=true` + `IDP_REFRESH_SHARED_SECRET` (secret reference to the same hub-dev ARN the other satellites use). Verify: sign-in works; after >13 min a request triggers exactly one refresh (log line), no `SESSION_NOT_FOUND`/401 storm (the exact regression this plan's Task 2 exists to prevent); logout revokes upstream.
3. ⛔ Prod satellite env (Matt's go): productport prod task-def gets the flag + secret reference.
4. ⛔ IdP-side config (Matt's go, separately) — confirm the exact gate mechanism the IdP uses to accept `X-Satellite-Refresh: 1` from productport during implementation (productport's exchange target is the legacy handoff endpoint, not necessarily the same `SSO_REFRESH_SATELLITES` allowlist path salesport used). Then a 30-min CloudWatch sweep on productport + IdP prod log groups for `SESSION_NOT_FOUND`/`REFRESH_`/pino `$.level >= 40`.
5. Rollback: `PRODUCTPORT_REFRESH_ENABLED=false` → peek off + exchange stops requesting pairs; existing pair sessions die at access-token exp and re-SSO. Env-only, no redeploy. This is a genuine satellite-side kill switch: with the whole-branch-review fix to `/sso/exchange`'s pair-consuming condition, ProductPort ignores a refresh pair even if the upstream IdP is separately configured to send one. It is only a satellite-side switch, though — it does not stop HubPort from *offering* a pair in the first place. Whether HubPort offers one at all is gated separately, server-side, by HubPort's own `SSO_REFRESH_SATELLITES` allowlist config (not by the `X-Satellite-Refresh` header alone), so a full end-to-end rollout also requires a corresponding HubPort-side allowlist change — out of scope for this plan/repo.

**Fleet-wide follow-up, NOT part of this plan:** clinicport's and execport's `requireAuth` carry the same jti/local-session-lookup hazard this plan removes from productport — see the spec's Background section and the memory checkpoint (`project_satellite_refresh_clients_rollout_2026-08-14.md`, Open thread #5) for the full write-up. Needs its own separate investigation into whether either satellite's refresh flag is live anywhere real; not attempted here.
