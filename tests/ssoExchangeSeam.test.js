// ProductPort's part of hubport#21 (mirrors OpsPort#28, opsport f589a2b).
//
// POST /api/auth/sso/exchange used to cookie the IdP's response wholesale: no
// signature check, no audience check. `HandoffCode.targetApp` is enforced ONLY
// at the IdP, which signs `aud` with the target app, so the one thing the
// redeeming side must establish is that the token was minted for productport.
//
// The seam pins 'productport' ALONE, deliberately narrower than requireAuth's
// AUDIENCE (['productport', 'microport-apps']). 'microport-apps' is a proxy
// audience: it may authenticate a request, never seat a session. A pin against
// the broad list would look like a fix and close nothing; a test below reds
// if the seam is widened to it.
'use strict';

jest.mock('../src/lib/db', () => ({ session: { update: jest.fn() } }));
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const crypto = require('crypto');
const kp = () => crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const idp      = kp(); // the accepted signer (HubPort)
const stranger = kp(); // not an accepted signer

const ISSUER = 'https://hub-dev.microport.com';
process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(idp.publicKey).toString('base64');
process.env.SALESPORT_JWT_ISSUER     = ISSUER;
process.env.SSO_CLAIMS_MODE          = 'off';
process.env.IDP_API_URL              = 'https://hub-dev.microport.com';

const express = require('express');
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const authRouter = require('../src/routes/auth');
const { AUDIENCE } = require('../src/middleware/auth');

function makeApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRouter);
  return a;
}

// Shaped like the IdP's handoff token: aud = the target app.
function token({ audience = 'productport', key = idp.privateKey, claims = {}, expiresIn = '8h' } = {}) {
  return jwt.sign(
    { sub: 42, email: 'pm@microport.com', role: 'viewer', app_roles: { productport: 'product_admin' }, ...claims },
    key,
    { algorithm: 'RS256', issuer: ISSUER, audience, expiresIn },
  );
}

const idpOk = (tok, extra = {}) => ({
  ok: true, status: 200,
  json: async () => ({ token: tok, role: 'product_admin', ...extra }),
});
const post = () => request(makeApp()).post('/api/auth/sso/exchange').send({ code: 'x'.repeat(40) });
const cookies = (res) => String(res.headers['set-cookie'] || '');

const ORIGINAL_FLAG = process.env.PRODUCTPORT_REFRESH_ENABLED;
afterEach(() => {
  delete global.fetch;
  process.env.PRODUCTPORT_REFRESH_ENABLED = ORIGINAL_FLAG;
});

describe('ProductPort SSO consumer seam — verify + audience pin (hubport#21)', () => {
  test('a productport-audience token is accepted and cookied', async () => {
    const tok = token();
    global.fetch = jest.fn().mockResolvedValue(idpOk(tok));
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.token).toBe(tok);
    expect(cookies(res)).toMatch(/productport_token=/);
  });

  test('a token minted for ANOTHER app is refused 403 and never cookied', async () => {
    global.fetch = jest.fn().mockResolvedValue(idpOk(token({ audience: 'reviewport' })));
    const res = await post();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SSO_AUDIENCE_MISMATCH');
    expect(res.body.token).toBeUndefined();
    expect(cookies(res)).not.toMatch(/productport_token=/);
  });

  test('the PROXY audience requireAuth accepts cannot seat a session', async () => {
    // Guards the mutation "pin the seam to AUDIENCE": microport-apps IS in the
    // requireAuth list, so this reds the moment the seam is widened to it.
    expect(AUDIENCE).toContain('microport-apps');
    global.fetch = jest.fn().mockResolvedValue(idpOk(token({ audience: 'microport-apps' })));
    const res = await post();
    expect(res.status).toBe(403);
    expect(cookies(res)).not.toMatch(/productport_token=/);
  });

  test('a multi-audience token that INCLUDES productport is accepted', async () => {
    global.fetch = jest.fn().mockResolvedValue(idpOk(token({ audience: ['microport-apps', 'productport'] })));
    const res = await post();
    expect(res.status).toBe(200);
    expect(cookies(res)).toMatch(/productport_token=/);
  });

  test('a token signed by an unknown key is refused as UNVERIFIABLE (502), not a mismatch', async () => {
    global.fetch = jest.fn().mockResolvedValue(idpOk(token({ key: stranger.privateKey, audience: 'reviewport' })));
    const res = await post();
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('SSO_TOKEN_UNVERIFIABLE');
    expect(cookies(res)).not.toMatch(/productport_token=/);
  });

  test('a forged token CLAIMING the productport audience is refused 502', async () => {
    global.fetch = jest.fn().mockResolvedValue(idpOk(token({ key: stranger.privateKey })));
    const res = await post();
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('SSO_TOKEN_UNVERIFIABLE');
    expect(cookies(res)).not.toMatch(/productport_token=/);
  });

  test('an unsigned placeholder string is refused, not cookied', async () => {
    global.fetch = jest.fn().mockResolvedValue(idpOk('tok'));
    const res = await post();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(cookies(res)).not.toMatch(/productport_token=/);
  });

  test('an expired token is refused, not cookied', async () => {
    global.fetch = jest.fn().mockResolvedValue(idpOk(token({ expiresIn: '-1s' })));
    const res = await post();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(cookies(res)).not.toMatch(/productport_token=/);
  });

  test('refresh-pair path: a misaddressed access token sets NEITHER cookie and leaks no refresh token', async () => {
    process.env.PRODUCTPORT_REFRESH_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue(idpOk(token({ audience: 'reviewport' }), {
      refreshToken: 'raw-refresh-xyz',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    }));
    const res = await post();
    expect(res.status).toBe(403);
    expect(cookies(res)).not.toMatch(/productport_token=|productport_refresh=/);
    expect(JSON.stringify(res.body)).not.toContain('raw-refresh-xyz');
  });

  test('an upstream failure still passes through untouched', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: 'bad', code: 'HANDOFF_INVALID' }),
    });
    const res = await post();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('HANDOFF_INVALID');
    expect(cookies(res)).not.toMatch(/productport_token=/);
  });
});
