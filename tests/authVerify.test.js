// Regression: the SSO token verifier wiring must actually accept a
// salesport-minted token. The original middleware mis-called microport-auth's
// createVerifier (passed `publicKeyBase64` + config-time `audience`, then called
// verify(token) with no audience), so the verifier threw "audience is required"
// on EVERY request → 401 → login loop. This proves a valid token now passes
// requireAuth (as the universal viewer default) and a wrong-audience token 401s.
'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Mock the DB before requiring the middleware — requireAuth JIT-upserts a user.
jest.mock('../src/lib/db', () => ({
  user: { upsert: jest.fn().mockResolvedValue({ id: 1, email: 'admin@test.local', name: null, role: 'viewer', active: true }) },
  session: { findUnique: jest.fn() },
}));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ISSUER = 'https://dev.salesport.site';

process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
process.env.SALESPORT_JWT_ISSUER = ISSUER;
process.env.SSO_CLAIMS_MODE = 'off'; // exercise the JWT-verify wiring, not the claims schema

const { requireAuth } = require('../src/middleware/auth');

function sign(claims, audience) {
  return jwt.sign(claims, privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { algorithm: 'RS256', issuer: ISSUER, audience, expiresIn: '1h' });
}
function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
async function run(token) {
  const req = { cookies: token ? { productport_token: token } : {} };
  const res = mockRes();
  let nexted = false;
  await requireAuth(req, res, () => { nexted = true; });
  return { req, res, nexted };
}

describe('requireAuth — SSO verifier wiring', () => {
  test('a valid salesport token (aud=productport, no productport grant) passes as viewer', async () => {
    const token = sign({ sub: 1, email: 'admin@test.local', app_roles: { salesport: 'admin' } }, 'productport');
    const { req, res, nexted } = await run(token);
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(req.user.role).toBe('viewer');       // universal default
    expect(req.user.email).toBe('admin@test.local');
  });

  test('the microport-apps audience is also accepted', async () => {
    const token = sign({ sub: 1, email: 'admin@test.local', app_roles: {} }, 'microport-apps');
    expect((await run(token)).nexted).toBe(true);
  });

  test('an explicit productport grant elevates', async () => {
    const db = require('../src/lib/db');
    db.user.upsert.mockResolvedValueOnce({ id: 2, email: 'pm@test.local', name: null, role: 'product_admin', active: true });
    const token = sign({ sub: 2, email: 'pm@test.local', app_roles: { productport: 'product_admin' } }, 'productport');
    const { req } = await run(token);
    expect(req.user.role).toBe('product_admin');
  });

  test('a token for a different audience is rejected 401 (audience IS enforced)', async () => {
    const token = sign({ sub: 1, email: 'x@test.local', app_roles: {} }, 'some-other-app');
    const { res, nexted } = await run(token);
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  test('no cookie → 401', async () => {
    const { res, nexted } = await run(null);
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
