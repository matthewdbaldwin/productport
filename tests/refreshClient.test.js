// tests/refreshClient.test.js
// ProductPort refresh client — thin adapter over microport-auth's
// createRefreshClient, plus a single-flight wrapper so concurrent callers
// holding the SAME refresh cookie share one upstream call instead of each
// independently consuming it (the IdP's refresh tokens are single-use; a
// second consumer of an already-consumed token trips replay detection and
// gets the whole family revoked, logging every sibling out).
//
// Slice 5a (2026-08-31): SalesPort's IdP endpoints are deleted, so apiUrl()
// is now IDP_API_URL-only and fail-fast — the SALESPORT_* fallback described
// above is retired. sharedSecret stays IDP_*-first with the SALESPORT_*
// fallback, unaffected by this slice.
'use strict';

describe('refreshClient — apiUrl requires IDP_API_URL (slice 5a)', () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
    delete global.fetch;
  });

  test('rejects when IDP_API_URL is unset, even with SALESPORT_* set — SalesPort IdP fallback retired', async () => {
    delete process.env.IDP_API_URL;
    delete process.env.IDP_REFRESH_SHARED_SECRET;
    process.env.SALESPORT_API_URL = 'https://sales-dev.microport.com';
    process.env.SALESPORT_REFRESH_SHARED_SECRET = 'legacy-secret';
    global.fetch = jest.fn();

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');
    await expect(refreshFromHub('raw-token', { warn: jest.fn() })).rejects.toThrow(/IDP_API_URL/);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('resolves to IDP_API_URL when set — the flip switch', async () => {
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

  test('with neither IDP_* nor SALESPORT_* set, rejects on IDP_API_URL — no more graceful null', async () => {
    delete process.env.IDP_API_URL;
    delete process.env.IDP_REFRESH_SHARED_SECRET;
    delete process.env.SALESPORT_API_URL;
    delete process.env.SALESPORT_REFRESH_SHARED_SECRET;
    global.fetch = jest.fn();

    jest.resetModules();
    const { refreshFromHub } = require('../src/lib/refreshClient');
    await expect(refreshFromHub('raw-token', { warn: jest.fn() })).rejects.toThrow(/IDP_API_URL/);

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

  // Slice 5a (2026-08-31): apiUrl()'s new throw sits outside microport-auth's
  // own try/catch (it runs before revokeOnSalesport's try block), so an unset
  // IDP_API_URL now REJECTS here instead of silently no-op'ing. Every actual
  // call site (routes/auth.js logout) already wraps this call with
  // `.catch(() => {})`, so production logout is unaffected — but this
  // characterizes the real, changed contract at the module boundary.
  test('rejects when IDP_API_URL is unset — no more silent no-op', async () => {
    delete process.env.IDP_API_URL;
    delete process.env.SALESPORT_API_URL;
    global.fetch = jest.fn();

    jest.resetModules();
    const { revokeUpstreamRefresh } = require('../src/lib/refreshClient');
    await expect(revokeUpstreamRefresh('raw', { warn: jest.fn() })).rejects.toThrow(/IDP_API_URL/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
