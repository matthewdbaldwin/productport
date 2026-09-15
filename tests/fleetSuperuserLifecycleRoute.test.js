// productport#11 — the lifecycle receiver persists the fleetSuperuser flag that
// HubPort stamps on every event (hubport src/lib/lifecycle.js, contracts
// LifecycleEvent.fleetSuperuser). Route-level through microport-auth's shared
// receiver (hubport#133): proves the validated payload value reaches the apply
// plug and lands on the User row, including the set-fleet-superuser script's
// 'reactivate' fan-out to an already-active user.
'use strict';

const SECRET = 'lifecycle-test-secret-fs';
process.env.HUBPORT_LIFECYCLE_SECRET = SECRET;
delete process.env.ALLOW_UNSIGNED_LIFECYCLE;

const mockStore = { user: null };
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => {
  const { createLifecycleEventsFake } = require('@matthewdbaldwin/microport-auth');
  return {
    userLifecycleEvent: createLifecycleEventsFake(),
    user: {
      findUnique: jest.fn(async ({ select }) => {
        if (!mockStore.user) return null;
        // honour `select` so a plug that forgets to read the flag is caught
        return Object.fromEntries(Object.keys(select).map((k) => [k, mockStore.user[k]]));
      }),
      updateMany: jest.fn(async ({ data }) => { Object.assign(mockStore.user, data); return { count: 1 }; }),
      create: jest.fn(async ({ data }) => { mockStore.user = { id: 99, active: true, fleetSuperuser: false, ...data }; return mockStore.user; }),
    },
  };
});

const express = require('express');
const request = require('supertest');
const { signLifecycleBody } = require('@matthewdbaldwin/microport-auth');
const db = require('../src/lib/db');

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use('/api/sso/lifecycle', require('../src/routes/ssoLifecycle'));

const evt = (o = {}) => ({
  id: 'ev-fs-1', email: 'matt@test.local', kind: 'reactivate',
  prevRole: 'product_admin', newRole: 'product_admin', actorEmail: 'system:set-fleet-superuser-script', actorRole: 'system', ...o,
});
let nextSeq = 100;
const post = (body) => {
  const raw = JSON.stringify(body);
  const eventId = String(++nextSeq);
  return request(app).post('/api/sso/lifecycle/event')
    .set('Content-Type', 'application/json')
    .set('X-Lifecycle-Event-Id', eventId)
    .set('x-hubport-signature', signLifecycleBody(SECRET, eventId, raw))
    .send(raw);
};
const written = () => db.user.updateMany.mock.calls.map(([args]) => args.data);

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.user = { id: 7, email: 'matt@test.local', active: true, role: 'viewer', fleetSuperuser: false, lifecycleSeq: null };
});

test('reactivate with fleetSuperuser:true on an active user writes the flag', async () => {
  const res = await post(evt({ fleetSuperuser: true }));
  expect(res.status).toBe(200);
  expect(res.body.outcome).toMatchObject({ kind: 'applied', changes: ['fleetSuperuser'] });
  expect(written()).toEqual([expect.objectContaining({ fleetSuperuser: true })]);
  expect(mockStore.user.fleetSuperuser).toBe(true);
});

test('revoke fan-out (fleetSuperuser:false) clears the flag', async () => {
  mockStore.user.fleetSuperuser = true;
  const res = await post(evt({ fleetSuperuser: false }));
  expect(res.status).toBe(200);
  expect(mockStore.user.fleetSuperuser).toBe(false);
});

test('a revoke event carrying the flag syncs it without touching the active flag', async () => {
  const res = await post(evt({ kind: 'revoke', fleetSuperuser: true }));
  expect(res.body.outcome).toMatchObject({ kind: 'applied', changes: ['fleetSuperuser'] });
  expect(written()[0]).not.toHaveProperty('active');
  expect(mockStore.user).toMatchObject({ active: true, fleetSuperuser: true });
});

test('an event without the field leaves the stored flag alone', async () => {
  mockStore.user.fleetSuperuser = true;
  const res = await post(evt({ kind: 'grant' }));
  expect(res.status).toBe(200);
  expect(res.body.outcome.kind).toBe('noop');
  expect(written()).toHaveLength(1);
  expect(written()[0]).not.toHaveProperty('fleetSuperuser');
  expect(mockStore.user.fleetSuperuser).toBe(true);
});

test('create-on-grant stamps the flag onto the new row', async () => {
  mockStore.user = null;
  const res = await post(evt({ kind: 'grant', email: 'new@test.local', fleetSuperuser: true }));
  expect(res.status).toBe(200);
  expect(db.user.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ email: 'new@test.local', name: 'new', role: 'product_admin', fleetSuperuser: true }),
  });
});

test('a flag-only event for an unknown email with no role never creates a user', async () => {
  mockStore.user = null;
  const res = await post(evt({ kind: 'reactivate', email: 'stranger@test.local', prevRole: null, newRole: null, fleetSuperuser: true }));
  expect(res.status).toBe(200);
  expect(db.user.create).not.toHaveBeenCalled();
  expect(db.user.updateMany).not.toHaveBeenCalled();
});
