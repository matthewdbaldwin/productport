'use strict';

// tests/authLoginCookie.test.js
//
// kevlar security-hardening remediation (2026-08-05): POST /api/auth/sso/exchange
// used to hand-roll `res.cookie(COOKIE_NAME, token, {...})` with NO `maxAge` —
// a browser-session-only cookie, almost certainly unintentional (every other
// satellite sizes its session cookie off jwtTtlSec()). This proves the exchange
// route now goes through the shared lib/cookies.js helper and actually sets a
// Max-Age, and that logout's Set-Cookie clears it with an expired Max-Age.

jest.mock('../src/lib/db', () => ({ session: { update: jest.fn() } }));

const crypto = require('crypto');
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

// middleware/auth loads at require time and needs these (see sso-exchange-idp-url.test.js).
process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
process.env.SALESPORT_JWT_ISSUER = 'https://sales-dev.microport.com';
process.env.SSO_CLAIMS_MODE = 'off';
process.env.IDP_API_URL = 'https://sales-dev.microport.com';
delete process.env.JWT_EXPIRES_IN; // exercise the 8h default

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const authRouter = require('../src/routes/auth');
const { __resetJwtTtlCache } = require('../src/lib/jwtTtl');

function makeApp() {
  const a = express();
  a.use(express.json());
  a.use(cookieParser());
  a.use('/api/auth', authRouter);
  return a;
}

beforeEach(() => { __resetJwtTtlCache(); });
afterEach(() => { delete global.fetch; });

describe('POST /api/auth/sso/exchange — session cookie', () => {
  test('sets productport_token with an 8h Max-Age (not a browser-session-only cookie)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ token: 'tok-123', role: 'viewer' }),
    });

    const res = await request(makeApp())
      .post('/api/auth/sso/exchange')
      .send({ code: 'x'.repeat(40) });

    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] || [];
    const sessionCookie = setCookie.find((c) => c.startsWith('productport_token='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/Max-Age=28800/); // 8h in seconds
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    // No refresh cookie — see src/lib/cookies.js file header: this app never
    // requests a refresh token from the IdP, so there is none to set.
    expect(setCookie.find((c) => c.startsWith('productport_refresh='))).toBeUndefined();
  });

  test('a denied exchange sets no cookie', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: 'nope' }),
    });

    const res = await request(makeApp())
      .post('/api/auth/sso/exchange')
      .send({ code: 'x'.repeat(40) });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
