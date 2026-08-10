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
    update: jest.fn(async ({ where, data }) => {
      for (const row of mockStore.events.values()) {
        if (row.id === where.id) {
          Object.assign(row, data);
          return row;
        }
      }
      return {};
    }),
  },
  user: {
    findUnique: jest.fn(async () => (mockStore.user ? { id: mockStore.user.id, active: mockStore.user.active, role: mockStore.user.role } : null)),
    update: jest.fn(async ({ data }) => { Object.assign(mockStore.user, data); return mockStore.user; }),
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

  test('retried delivery whose prior attempt never finished (processedAt: null) re-processes instead of deduping', async () => {
    const app = makeApp();
    // Simulate a prior delivery that logged the audit row but died mid-processing
    // (e.g. a transient db.user.update failure) — the catch block sets `error`
    // but leaves `processedAt: null` and 5xx's so the sender retries.
    mockStore.events.set('ob-2', {
      id: 'evt_prior', senderEventId: 'ob-2', email: 'gone@test.local', kind: 'disable',
      prevRole: null, newRole: null, actorEmail: 'admin@test.local', actorRole: 'admin',
      payload: evt(), processedAt: null, error: 'transient failure',
    });

    const res = await post(app, '/api/sso/lifecycle/event', evt(), { eventId: 'ob-2' });

    expect(res.status).toBe(200);
    expect(res.body.deduplicated).toBeUndefined();
    // Processing actually re-ran: the disable side-effect landed this time.
    expect(mockStore.user.active).toBe(false);
    expect(db.user.update).toHaveBeenCalled();
    // The existing row was reused, not re-created (senderEventId is @unique —
    // a second create() for the same id would throw a unique-constraint error).
    expect(db.userLifecycleEvent.create).not.toHaveBeenCalled();
  });

  test('malformed payload → 200 dropped (soft-drop, no outbox retry)', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event', evt({ email: undefined })); // no email → contract reject
    expect(res.status).toBe(200);
    expect(res.body.dropped).toBeDefined();
  });

  test('well-formed event for an unknown user → 200 noop (no local row to touch)', async () => {
    mockStore.user = null; // db.user.findUnique returns null
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event', evt({ email: 'ghost@test.local' }));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
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

  test('/state without email → 400', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/state', {});
    expect(res.status).toBe(400);
  });
});
