// productport#11 — fleet superuser flag (hubport#88 satellite slice, plan Task 8).
//
// `fleetSuperuser` is a PERSISTED column synced from HubPort over the lifecycle
// channel — never a token claim ("authorization is 100% DB-row-keyed"). These
// tests pin three things:
//   1. the isProductAdmin OR-arm, and the stop-gap audit log when it is the
//      arm that actually admitted the request (ProductPort has no AuditLog);
//   2. requireAuth sources the flag from the DB row, and ignores a claim;
//   3. decideUserUpdate writes the incoming value on every kind, while treating
//      an ABSENT field as "no change", never as false (contracts lifecycle.ts).
'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/lib/db', () => ({
  user: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
  session: { findUnique: jest.fn() },
  productAudit: { create: jest.fn().mockResolvedValue({}) },
}));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ISSUER = 'https://hub-dev.microport.com';
process.env.SALESPORT_JWT_PUBLIC_KEY = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
process.env.SALESPORT_JWT_ISSUER = ISSUER;
process.env.SSO_CLAIMS_MODE = 'off';

const logger = require('../src/lib/logger');
const db = require('../src/lib/db');
const { isProductAdmin, requireProductAdmin, requireAuth } = require('../src/middleware/auth');
const { decideUserUpdate } = require('../src/lib/lifecycleAction');

const mockRes = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });

beforeEach(() => jest.clearAllMocks());

describe('isProductAdmin — fleetSuperuser OR-arm', () => {
  test('true for a fleetSuperuser row regardless of role', () => {
    expect(isProductAdmin({ role: 'viewer', isSuperuser: false, fleetSuperuser: true })).toBe(true);
  });
  test('still false for a plain viewer', () => {
    expect(isProductAdmin({ role: 'viewer', isSuperuser: false, fleetSuperuser: false })).toBe(false);
    expect(isProductAdmin({ role: 'viewer' })).toBe(false);
  });
  test('a truthy non-boolean does not count (row value is a strict boolean)', () => {
    expect(isProductAdmin({ role: 'viewer', fleetSuperuser: 'true' })).toBe(false);
  });
});

describe('requireProductAdmin — bypass is durably audited, awaited, fail closed (productport#27)', () => {
  const run = async (user) => {
    const req = { user, originalUrl: '/api/products/x', method: 'PATCH' };
    const res = mockRes();
    const next = jest.fn();
    await requireProductAdmin(req, res, next);
    return { res, next };
  };

  test('a viewer admitted only by fleetSuperuser writes a ProductAudit row BEFORE next()', async () => {
    const order = [];
    db.productAudit.create.mockImplementationOnce(async () => { order.push('audit'); return {}; });
    const req = { user: { id: 9, email: 'fs@test.local', role: 'viewer', fleetSuperuser: true }, originalUrl: '/api/products/x', method: 'PATCH' };
    const res = mockRes();
    await requireProductAdmin(req, res, () => order.push('next'));
    expect(order).toEqual(['audit', 'next']);
    const { data } = db.productAudit.create.mock.calls[0][0];
    expect(data).toMatchObject({ productId: null, userId: 9, userEmail: 'fs@test.local', action: 'FLEET_SUPERUSER_BYPASS' });
    expect(JSON.parse(data.newValue)).toEqual({ method: 'PATCH', path: '/api/products/x' });
  });

  test('the audit write failing refuses the request with 500 (fail closed)', async () => {
    db.productAudit.create.mockRejectedValueOnce(new Error('db down'));
    const { res, next } = await run({ id: 9, role: 'viewer', fleetSuperuser: true });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Authorization audit failed.' });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toMatchObject({ event: 'FLEET_SUPERUSER_BYPASS', userId: 9 });
  });

  test('a real product_admin who also holds the flag is NOT audited as a bypass', async () => {
    const { next } = await run({ id: 1, role: 'product_admin', fleetSuperuser: true });
    expect(next).toHaveBeenCalled();
    expect(db.productAudit.create).not.toHaveBeenCalled();
  });

  test('a viewer without the flag is still 403 and writes nothing', async () => {
    const { res, next } = await run({ id: 2, role: 'viewer', fleetSuperuser: false });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(db.productAudit.create).not.toHaveBeenCalled();
  });
});

describe('requireAuth — fleetSuperuser comes from the DB row, never the token', () => {
  const sign = (claims) => jwt.sign(claims, privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { algorithm: 'RS256', issuer: ISSUER, audience: 'productport', expiresIn: '1h' });
  const run = async (token) => {
    const req = { cookies: { productport_token: token } };
    await requireAuth(req, mockRes(), () => {});
    return req;
  };

  test('row flag true → req.user.fleetSuperuser true', async () => {
    db.user.upsert.mockResolvedValueOnce({ id: 5, email: 'matt@test.local', role: 'viewer', active: true, fleetSuperuser: true });
    const req = await run(sign({ sub: 5, email: 'matt@test.local', app_roles: {} }));
    expect(req.user.fleetSuperuser).toBe(true);
  });

  test('a fleetSuperuser CLAIM on the token is ignored when the row says false', async () => {
    db.user.upsert.mockResolvedValueOnce({ id: 6, email: 'eve@test.local', role: 'viewer', active: true, fleetSuperuser: false });
    const req = await run(sign({ sub: 6, email: 'eve@test.local', app_roles: {}, fleetSuperuser: true, fleet_superuser: true }));
    expect(req.user.fleetSuperuser).toBe(false);
    const arg = db.user.upsert.mock.calls.at(-1)[0];
    expect(arg.update.fleetSuperuser).toBeUndefined();
    expect(arg.create.fleetSuperuser).toBeUndefined();
  });
});

describe('decideUserUpdate — fleetSuperuser sync on every kind', () => {
  const map = (wire) => (['viewer', 'product_admin'].includes(wire) ? wire : null);

  test('grant on a disabled user re-enables AND writes the flag', () => {
    expect(decideUserUpdate('grant', { active: false, fleetSuperuser: false }, { fleetSuperuser: true }))
      .toEqual({ data: { active: true, fleetSuperuser: true } });
  });
  test('reactivate on an active user whose flag differs → writes just the flag (the grant/revoke script path)', () => {
    expect(decideUserUpdate('reactivate', { active: true, fleetSuperuser: false }, { fleetSuperuser: true }))
      .toEqual({ data: { fleetSuperuser: true } });
    expect(decideUserUpdate('reactivate', { active: true, fleetSuperuser: true }, { fleetSuperuser: false }))
      .toEqual({ data: { fleetSuperuser: false } });
  });
  test('disable deactivates AND writes the flag', () => {
    expect(decideUserUpdate('disable', { active: true, fleetSuperuser: true }, { fleetSuperuser: false }))
      .toEqual({ data: { active: false, fleetSuperuser: false } });
  });
  test('revoke keeps the universal-app policy (stays active) but still writes the flag', () => {
    expect(decideUserUpdate('revoke', { active: true, fleetSuperuser: true }, { fleetSuperuser: false }))
      .toEqual({ data: { fleetSuperuser: false } });
  });
  test('create-on-grant carries the flag onto the new row', () => {
    expect(decideUserUpdate('grant', null, { newRole: 'viewer', mapRole: map, fleetSuperuser: true }))
      .toEqual({ create: { role: 'viewer', fleetSuperuser: true } });
  });
  test('flag already matches → unchanged noop', () => {
    expect(decideUserUpdate('grant', { active: true, fleetSuperuser: true }, { fleetSuperuser: true }).noop).toBe(true);
  });
  test('ABSENT flag (unpatched emitter) is no change — never an implicit false', () => {
    expect(decideUserUpdate('grant', { active: true, fleetSuperuser: true }, {}).noop).toBe(true);
    expect(decideUserUpdate('disable', { active: true, fleetSuperuser: true }, {}))
      .toEqual({ data: { active: false } });
    expect(decideUserUpdate('grant', null, { newRole: 'viewer', mapRole: map }))
      .toEqual({ create: { role: 'viewer' } });
  });
  test('the flag alone never creates a row or grants access (no mappable role → noop)', () => {
    expect(decideUserUpdate('reactivate', null, { newRole: null, mapRole: map, fleetSuperuser: true }))
      .toEqual({ noop: true, reason: 'no-local-user' });
    expect(decideUserUpdate('grant', null, { newRole: 'not-a-role', mapRole: map, fleetSuperuser: true }))
      .toEqual({ noop: true, reason: 'unmapped-role' });
  });
  test('revoke/disable with no local row never creates', () => {
    expect(decideUserUpdate('revoke', null, { fleetSuperuser: true }).noop).toBe(true);
    expect(decideUserUpdate('disable', null, { fleetSuperuser: true }).noop).toBe(true);
  });
});
