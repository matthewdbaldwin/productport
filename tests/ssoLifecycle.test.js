// SSO-lifecycle receiver boundary + integration: the HMAC gate rejects a bad
// signature (401), a valid `disable` deactivates the local user, a retried
// delivery (same X-Lifecycle-Event-Id) dedups, and /state returns the
// microport-contracts LifecycleStateResponse shape. Mirrors the salesport sender
// (signWebhookBody + x-salesport-signature) so signer↔verifier parity is proven.
'use strict';

const SECRET = 'lifecycle-test-secret';
process.env.SALESPORT_LIFECYCLE_SECRET = SECRET;

// Mock the DB before requiring the router.
const mockStore = {
  events: new Map(), // senderEventId -> row
  user: { id: 7, email: 'gone@test.local', active: true, role: 'product_admin' },
};
jest.mock('../src/lib/db', () => ({
  userLifecycleEvent: {
    findUnique: jest.fn(async ({ where }) => mockStore.events.get(where.senderEventId) || null),
    create: jest.fn(async ({ data }) => {
      const row = { id: `evt_${mockStore.events.size + 1}`, ...data };
      if (data.senderEventId) mockStore.events.set(data.senderEventId, row);
      return row;
    }),
    update: jest.fn(async () => ({})),
  },
  user: {
    findUnique: jest.fn(async () => (mockStore.user ? { id: mockStore.user.id, active: mockStore.user.active, role: mockStore.user.role } : null)),
    update: jest.fn(async ({ data }) => { Object.assign(mockStore.user, data); return mockStore.user; }),
  },
}));

const express = require('express');
const request = require('supertest');
const { signWebhookBody } = require('@matthewdbaldwin/microport-auth');

function makeApp() {
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use('/api/sso/lifecycle', require('../src/routes/ssoLifecycle'));
  return app;
}

// Wire-accurate LifecycleEvent (matches salesport's sender: an `id` UUID + the
// nullable-but-present prev/new/actor fields). The contract requires these keys.
const evt = (o = {}) => ({
  id: 'ev-uuid-1', email: 'gone@test.local', kind: 'disable',
  prevRole: null, newRole: null, actorEmail: 'admin@test.local', actorRole: 'admin', ...o,
});

const post = (app, path, body, { sig, eventId } = {}) => {
  const raw = JSON.stringify(body);
  let r = request(app).post(path).set('Content-Type', 'application/json');
  if (sig !== null) r = r.set('x-salesport-signature', sig ?? signWebhookBody(SECRET, raw));
  if (eventId) r = r.set('X-Lifecycle-Event-Id', eventId);
  return r.send(raw);
};

describe('POST /api/sso/lifecycle/event', () => {
  beforeEach(() => { mockStore.events.clear(); mockStore.user = { id: 7, email: 'gone@test.local', active: true, role: 'product_admin' }; jest.clearAllMocks(); });

  test('bad signature → 401', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event',
      evt(), { sig: 'sha256=deadbeef' });
    expect(res.status).toBe(401);
  });

  test('valid disable → 200 + local user deactivated', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event', evt());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockStore.user.active).toBe(false);
  });

  test('retried delivery (same X-Lifecycle-Event-Id) dedups', async () => {
    const app = makeApp();
    const body = evt();
    await post(app, '/api/sso/lifecycle/event', body, { eventId: 'ob-1' });
    const second = await post(app, '/api/sso/lifecycle/event', body, { eventId: 'ob-1' });
    expect(second.status).toBe(200);
    expect(second.body.deduplicated).toBe(true);
  });

  test('malformed payload → 200 dropped (soft-drop, no outbox retry)', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event', evt({ email: undefined })); // no email → contract reject
    expect(res.status).toBe(200);
    expect(res.body.dropped).toBeDefined();
  });
});

describe('POST /api/sso/lifecycle/state', () => {
  beforeEach(() => { mockStore.user = { id: 7, email: 'gone@test.local', active: true, role: 'product_admin' }; jest.clearAllMocks(); });

  test('existing user → contract-shaped state', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/state', { email: 'gone@test.local' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true, role: 'product_admin', status: 'active', deletedAt: null });
  });
});
