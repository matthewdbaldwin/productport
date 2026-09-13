// productport#11 — the lifecycle receiver persists the fleetSuperuser flag that
// HubPort stamps on every event (hubport src/lib/lifecycle.js, contracts
// LifecycleEvent.fleetSuperuser). Route-level: proves the validated payload
// value reaches decideUserUpdate and lands on the User row, including the
// set-fleet-superuser script's 'reactivate' fan-out to an already-active user.
'use strict';

const SECRET = 'lifecycle-test-secret-fs';
process.env.SALESPORT_LIFECYCLE_SECRET = SECRET;

const mockStore = { user: null };
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => ({
  userLifecycleEvent: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async ({ data }) => ({ id: 'evt_fs', ...data })),
    update: jest.fn(async () => ({})),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  user: {
    findUnique: jest.fn(async ({ select }) => {
      if (!mockStore.user) return null;
      // honour `select` so a route that forgets to read the flag is caught
      return Object.fromEntries(Object.keys(select).map((k) => [k, mockStore.user[k]]));
    }),
    update: jest.fn(async ({ data }) => Object.assign(mockStore.user, data)),
    create: jest.fn(async ({ data }) => { mockStore.user = { id: 99, active: true, fleetSuperuser: false, ...data }; return mockStore.user; }),
  },
}));

const express = require('express');
const request = require('supertest');
const { signWebhookBody } = require('@matthewdbaldwin/microport-auth');
const db = require('../src/lib/db');

function makeApp() {
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use('/api/sso/lifecycle', require('../src/routes/ssoLifecycle'));
  return app;
}
const evt = (o = {}) => ({
  id: 'ev-fs-1', email: 'matt@test.local', kind: 'reactivate',
  prevRole: 'product_admin', newRole: 'product_admin', actorEmail: 'system:set-fleet-superuser-script', actorRole: 'system', ...o,
});
const post = (body) => {
  const raw = JSON.stringify(body);
  return request(makeApp()).post('/api/sso/lifecycle/event')
    .set('Content-Type', 'application/json')
    .set('x-salesport-signature', signWebhookBody(SECRET, raw))
    .send(raw);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.user = { id: 7, email: 'matt@test.local', active: true, role: 'viewer', fleetSuperuser: false };
});

test('reactivate with fleetSuperuser:true on an active user writes the flag', async () => {
  const res = await post(evt({ fleetSuperuser: true }));
  expect(res.status).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { fleetSuperuser: true } });
  expect(mockStore.user.fleetSuperuser).toBe(true);
});

test('revoke fan-out (fleetSuperuser:false) clears the flag', async () => {
  mockStore.user.fleetSuperuser = true;
  const res = await post(evt({ fleetSuperuser: false }));
  expect(res.status).toBe(200);
  expect(mockStore.user.fleetSuperuser).toBe(false);
});

test('an event without the field leaves the stored flag alone', async () => {
  mockStore.user.fleetSuperuser = true;
  const res = await post(evt({ kind: 'grant' }));
  expect(res.status).toBe(200);
  expect(db.user.update).not.toHaveBeenCalled();
  expect(mockStore.user.fleetSuperuser).toBe(true);
});

test('create-on-grant stamps the flag onto the new row', async () => {
  mockStore.user = null;
  const res = await post(evt({ kind: 'grant', email: 'new@test.local', fleetSuperuser: true }));
  expect(res.status).toBe(200);
  expect(db.user.create).toHaveBeenCalledWith({
    data: { email: 'new@test.local', name: 'new', role: 'product_admin', fleetSuperuser: true },
  });
});

test('a flag-only event for an unknown email with no role never creates a user', async () => {
  mockStore.user = null;
  const res = await post(evt({ kind: 'reactivate', email: 'stranger@test.local', prevRole: null, newRole: null, fleetSuperuser: true }));
  expect(res.status).toBe(200);
  expect(db.user.create).not.toHaveBeenCalled();
  expect(db.user.update).not.toHaveBeenCalled();
});
