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

  test('flag on + IdP denies the exchange but still includes a refreshToken → the raw refresh token is stripped from the (non-2xx) response body', async () => {
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({
        code: 'INVALID_CODE',
        refreshToken: 'raw-refresh-should-never-leak',
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    const res = await request(makeApp())
      .post('/api/auth/sso/exchange')
      .send({ code: 'x'.repeat(40) });

    expect(res.status).toBe(401);
    const setCookies = res.headers['set-cookie'] || [];
    expect(setCookies.some(c => c.startsWith('productport_refresh='))).toBe(false);
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.refreshTokenExpiresAt).toBeUndefined();
  });
});
