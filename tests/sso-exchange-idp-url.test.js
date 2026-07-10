// Slice 4h — the SSO handoff-code EXCHANGE must target IDP_API_URL (the IdP that
// minted the code), split from SALESPORT_API_URL (which also feeds CSP + the
// bug-report relay). This lets ProductPort be flipped onto HubPort as its IdP
// without disturbing those other consumers. Default (IDP_API_URL unset) keeps
// targeting SALESPORT_API_URL — SalesPort is still the IdP until the flip.
'use strict';

jest.mock('../src/lib/db', () => ({ session: { update: jest.fn() } }));

const crypto = require('crypto');
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

// middleware/auth loads at require time and needs these.
process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
process.env.SALESPORT_JWT_ISSUER = 'https://sales-dev.microport.com';
process.env.SSO_CLAIMS_MODE = 'off';

// The two URLs whose split is under test.
process.env.SALESPORT_API_URL = 'https://sales-dev.microport.com';
process.env.IDP_API_URL       = 'https://hubport-dev.microport.com';

const express = require('express');
const request = require('supertest');
const authRouter = require('../src/routes/auth');

function makeApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRouter);
  return a;
}

describe('SSO exchange target (Slice 4h IdP split)', () => {
  afterEach(() => { delete global.fetch; });

  test('relays the code to IDP_API_URL — NOT SALESPORT_API_URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ token: 'tok', role: 'viewer' }),
    });

    const res = await request(makeApp())
      .post('/api/auth/sso/exchange')
      .send({ code: 'x'.repeat(40) });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toBe('https://hubport-dev.microport.com/api/auth/handoff/exchange');
    expect(url).not.toContain('sales-dev'); // did not leak the CRM host
  });
});
