// Pins the local capture harness's token mint (web/e2e/helpers/mint-session.cjs)
// against the API's own verify pipeline: real RS256, the same middleware
// tests/authVerify.test.js and tests/authRefreshMiddleware.test.js mount. The
// mint hand-rolls the JWT with node:crypto (web/ does not depend on
// jsonwebtoken), so the things worth proving are that the library the API
// verifies with (jsonwebtoken, a root dependency) accepts the encoding, that
// the claim set passes SsoClaims in enforce mode, and that the literals the
// mint duplicates (cookie name, audience) still equal the API's exports.
'use strict';

jest.mock('../src/lib/db', () => ({
  session: { findUnique: jest.fn() },
  user:    { findUnique: jest.fn(), upsert: jest.fn() },
}));
jest.mock('../src/lib/logger', () => ({
  fatal: jest.fn(), error: jest.fn(), warn: jest.fn(),
  info: jest.fn(), debug: jest.fn(), trace: jest.fn(),
  child: jest.fn(function child() { return this; }),
}));

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { SsoClaims } = require('@matthewdbaldwin/microport-contracts');

const pair = () => crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const { publicKey, privateKey } = pair();
const ISSUER = 'https://sales-dev.microport.com';
process.env.SALESPORT_JWT_ISSUER     = ISSUER;
process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');
process.env.E2E_JWT_PRIVATE_KEY      = Buffer.from(privateKey).toString('base64');
process.env.SSO_CLAIMS_MODE          = 'enforce'; // exercise the real claims schema, not just the sig

const { requireAuth, COOKIE_NAME, AUDIENCE } = require('../src/middleware/auth');
const db = require('../src/lib/db');
const mint = require('../web/e2e/helpers/mint-session.cjs');

const ACTIVE_USER = { id: 7, email: 'admin@microport.com', name: 'Admin User', role: 'product_admin', active: true };

function app() {
  const a = express();
  a.use(cookieParser());
  a.get('/me', requireAuth, (req, res) => res.json(req.user));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('web/e2e/helpers/mint-session.cjs', () => {
  test('duplicated literals still equal the API exports (cookie name, audience)', () => {
    expect(mint.COOKIE_NAME).toBe(COOKIE_NAME);
    expect(mint.AUDIENCE).toEqual(AUDIENCE);
  });

  test('the hand-rolled JWT verifies with jsonwebtoken, carries no jti, and passes SsoClaims', () => {
    const { token, claims, expiresAt } = mint.mintSession();
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: ISSUER, audience: 'productport' });
    expect(decoded).toEqual(claims);
    expect(decoded.exp).toBe(expiresAt);
    expect(decoded.jti).toBeUndefined();
    expect(() => SsoClaims.parse(decoded)).not.toThrow();
  });

  test('the cookie authenticates through requireAuth on the stateless path and JIT-upserts the user', async () => {
    db.user.findUnique.mockResolvedValueOnce(null); // no existing local row → create path
    db.user.upsert.mockResolvedValueOnce(ACTIVE_USER);
    const { token } = mint.mintSession({ email: ACTIVE_USER.email, role: 'product_admin', name: ACTIVE_USER.name });
    const res = await request(app()).get('/me').set('Cookie', `${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: ACTIVE_USER.email, role: 'product_admin' });
    expect(db.session.findUnique).not.toHaveBeenCalled();
    expect(db.user.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { email: ACTIVE_USER.email } }));
  });

  test('a private key that does not match the API public key is caught by the self-check', () => {
    const other = pair();
    const saved = process.env.E2E_JWT_PRIVATE_KEY;
    process.env.E2E_JWT_PRIVATE_KEY = Buffer.from(other.privateKey).toString('base64');
    try {
      expect(() => mint.mintSession()).toThrow(/does not match SALESPORT_JWT_PUBLIC_KEY/);
    } finally {
      process.env.E2E_JWT_PRIVATE_KEY = saved;
    }
  });

  test('refuses to mint without the private key or the issuer, naming the variable', () => {
    const saved = { key: process.env.E2E_JWT_PRIVATE_KEY, issuer: process.env.SALESPORT_JWT_ISSUER };
    try {
      delete process.env.E2E_JWT_PRIVATE_KEY;
      expect(() => mint.mintSession()).toThrow(/E2E_JWT_PRIVATE_KEY/);
      process.env.E2E_JWT_PRIVATE_KEY = saved.key;
      delete process.env.SALESPORT_JWT_ISSUER;
      expect(() => mint.mintSession()).toThrow(/SALESPORT_JWT_ISSUER/);
    } finally {
      process.env.E2E_JWT_PRIVATE_KEY = saved.key;
      process.env.SALESPORT_JWT_ISSUER = saved.issuer;
    }
  });
});
