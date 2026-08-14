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
