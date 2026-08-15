'use strict';

// tests/appLauncherWiring.test.js
//
// Characterization test for GET /api/auth/app-launcher after the 2026-08-14
// swap to the shared microport-contracts buildAppLauncherApps(). The route
// used to hand-copy a {id, label, tagline, envVar} array locally (which had
// drifted to be missing 4 entries in prod) — this pins the observable
// behavior (host excluded, missing envVar dropped, portalUrl derived)
// against the shared implementation so a future contracts bump can't
// silently change productport's launcher shape.
//
// Run: CI=true npx jest tests/appLauncherWiring.test.js --runInBand

jest.mock('../src/lib/db', () => ({ session: { update: jest.fn() } }));

const crypto = require('crypto');
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

// middleware/auth loads at require time and needs these (see
// authLoginCookie.test.js / sso-exchange-idp-url.test.js).
process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
process.env.SALESPORT_JWT_ISSUER = 'https://sales-dev.microport.com';
process.env.SSO_CLAIMS_MODE = 'off';

const express = require('express');
const request = require('supertest');

const router = require('../src/routes/auth');
const app = express();
app.use(express.json());
app.use('/api/auth', router);

const WEB_URL_KEYS = [
  'SALESPORT_WEB_URL', 'OPSPORT_WEB_URL', 'REVIEWPORT_WEB_URL', 'CLINICPORT_WEB_URL',
  'EXECPORT_WEB_URL', 'PRODUCTPORT_WEB_URL', 'ENGAGEPORT_WEB_URL', 'PORTAL_WEB_URL',
];

describe('GET /api/auth/app-launcher — productport', () => {
  beforeEach(() => { for (const k of WEB_URL_KEYS) delete process.env[k]; });

  it('excludes productport itself and drops siblings with no *_WEB_URL set', async () => {
    process.env.SALESPORT_WEB_URL = 'https://sales.microport.com';

    const res = await request(app).get('/api/auth/app-launcher');
    expect(res.status).toBe(200);
    const ids = res.body.apps.map((a) => a.id);
    expect(ids).not.toContain('productport');
    expect(ids).toContain('salesport');
  });

  it('returns every sibling when every *_WEB_URL is set', async () => {
    process.env.SALESPORT_WEB_URL = 'https://sales.microport.com';
    process.env.OPSPORT_WEB_URL = 'https://ops.microport.com';
    process.env.REVIEWPORT_WEB_URL = 'https://review.microport.com';
    process.env.CLINICPORT_WEB_URL = 'https://clinic.microport.com';
    process.env.EXECPORT_WEB_URL = 'https://exec.microport.com';
    process.env.PRODUCTPORT_WEB_URL = 'https://product.microport.com';
    process.env.ENGAGEPORT_WEB_URL = 'https://engage.microport.com';

    const res = await request(app).get('/api/auth/app-launcher');
    const expected = ['salesport', 'opsport', 'reviewport', 'clinicport', 'execport', 'productport', 'engageport']
      .filter((id) => id !== 'productport');
    expect(res.body.apps.map((a) => a.id).sort()).toEqual(expected.sort());
  });

  it('derives portalUrl from PORTAL_WEB_URL, first origin only', async () => {
    process.env.PORTAL_WEB_URL = 'https://hub.microport.com,https://old-hub.microport.com';
    const res = await request(app).get('/api/auth/app-launcher');
    expect(res.body.portalUrl).toBe('https://hub.microport.com');
  });

  it('portalUrl is null when PORTAL_WEB_URL is unset', async () => {
    const res = await request(app).get('/api/auth/app-launcher');
    expect(res.body.portalUrl).toBeNull();
  });
});
