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
    // Default to "wins the claim" so every existing test — which never
    // exercises the race itself — keeps passing unmodified. Concurrency
    // tests below override with mockResolvedValueOnce.
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  user: {
    findUnique: jest.fn(async () => (mockStore.user ? { id: mockStore.user.id, active: mockStore.user.active, role: mockStore.user.role } : null)),
    update: jest.fn(async ({ data }) => { Object.assign(mockStore.user, data); return mockStore.user; }),
    create: jest.fn(async ({ data }) => { mockStore.user = { id: 99, active: true, ...data }; return mockStore.user; }),
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

// Fleet decision (HubPort grant authority, 2026-08-19): a grant/reactivate for
// an email with NO local row must CREATE it — mirroring the JIT-create shape in
// middleware/auth.js (email + name + role; the event carries no name, so the
// placeholder is the email local-part — sync-on-login backfills the real name
// at first login). An unmappable role never creates; disable/revoke stay no-ops.
describe('POST /api/sso/lifecycle/event — create-on-grant (no local row)', () => {
  beforeEach(() => { mockStore.events.clear(); mockStore.user = null; jest.clearAllMocks(); });

  test('grant for an unknown email with a mappable role → creates the local row', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event',
      evt({ kind: 'grant', email: 'new.hire@test.local', newRole: 'product_admin' }));

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.created).toBe(true);
    expect(db.user.create).toHaveBeenCalledWith({
      data: { email: 'new.hire@test.local', name: 'new.hire', role: 'product_admin' },
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  test('reactivate for an unknown email with a mappable role → creates too (same fleet path)', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event',
      evt({ kind: 'reactivate', email: 'Back.Again@test.local', newRole: 'viewer' }));

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
    // Email is normalized (lowercased) before both the lookup and the create.
    expect(db.user.create).toHaveBeenCalledWith({
      data: { email: 'back.again@test.local', name: 'back.again', role: 'viewer' },
    });
  });

  test('grant with an unmappable role for an unknown email → 200 noop, never creates', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event',
      evt({ kind: 'grant', email: 'ghost@test.local', newRole: 'not-a-real-role' }));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.created).toBeUndefined();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  test('disable for an unknown email stays a no-op — never creates', async () => {
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event',
      evt({ kind: 'disable', email: 'ghost@test.local' }));

    expect(res.status).toBe(200);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  test('grant on an EXISTING active user does not create a duplicate', async () => {
    mockStore.user = { id: 7, email: 'gone@test.local', active: true, role: 'viewer' };
    const app = makeApp();
    const res = await post(app, '/api/sso/lifecycle/event',
      evt({ kind: 'grant', email: 'gone@test.local', newRole: 'product_admin' }));

    expect(res.status).toBe(200);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/sso/lifecycle/event — concurrent-delivery atomic claim', () => {
  beforeEach(() => { mockStore.events.clear(); mockStore.user = { id: 7, email: 'gone@test.local', active: true, role: 'product_admin' }; jest.clearAllMocks(); });

  // Seeds an existing-but-unprocessed audit row, same shape the dedup lookup
  // (senderEventId → processedAt: null) reuses rather than re-creating.
  const seedUnprocessed = (senderEventId, id) => {
    mockStore.events.set(senderEventId, {
      id, senderEventId, email: 'gone@test.local', kind: 'disable',
      prevRole: null, newRole: null, actorEmail: 'admin@test.local', actorRole: 'admin',
      payload: evt(), processedAt: null, error: null,
    });
  };

  test('the claim is a single updateMany scoped by id AND processedAt: null, in the same statement that sets processedAt', async () => {
    const app = makeApp();
    seedUnprocessed('claim-1', 'evt_claim');

    await post(app, '/api/sso/lifecycle/event', evt(), { eventId: 'claim-1' });

    expect(db.userLifecycleEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'evt_claim', processedAt: null },
      data: { processedAt: expect.any(Date) },
    });
  });

  test('two concurrent deliveries of the same unprocessed row: the User side-effect fires exactly once', async () => {
    const app = makeApp();
    // Both concurrent deliveries must read the row BEFORE either has committed.
    // Queuing two identical processedAt:null snapshots (rather than the live
    // seeded-row lookup) guarantees that, regardless of which request's event
    // loop turn actually finishes first — supertest is real (if loopback) I/O,
    // so that order isn't deterministic — neither dedup pre-check can be
    // retroactively short-circuited by the other's completion. That would test
    // Node scheduling, not the atomic claim below it.
    db.userLifecycleEvent.findUnique
      .mockResolvedValueOnce({ id: 'evt_race', senderEventId: 'race-1', processedAt: null, error: null })
      .mockResolvedValueOnce({ id: 'evt_race', senderEventId: 'race-1', processedAt: null, error: null });
    db.userLifecycleEvent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [r1, r2] = await Promise.all([
      post(app, '/api/sso/lifecycle/event', evt(), { eventId: 'race-1' }),
      post(app, '/api/sso/lifecycle/event', evt(), { eventId: 'race-1' }),
    ]);

    const deduped = [r1.body.deduplicated, r2.body.deduplicated];
    expect(deduped.filter((d) => d === true)).toHaveLength(1);
    expect(deduped.filter((d) => d !== true)).toHaveLength(1);
    expect(db.user.update).toHaveBeenCalledTimes(1);
  });

  test('the loser of the atomic claim never reads or writes the User row', async () => {
    const app = makeApp();
    seedUnprocessed('lose-1', 'evt_lose');
    db.userLifecycleEvent.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await post(app, '/api/sso/lifecycle/event', evt(), { eventId: 'lose-1' });

    expect(res.body.deduplicated).toBe(true);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  test('a processing failure after winning the claim resets processedAt back to null', async () => {
    const app = makeApp();
    seedUnprocessed('fail-1', 'evt_fail');
    db.user.findUnique.mockRejectedValueOnce(new Error('boom'));

    const res = await post(app, '/api/sso/lifecycle/event', evt(), { eventId: 'fail-1' });

    expect(res.status).toBe(500);
    expect(db.userLifecycleEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt_fail' },
        data: expect.objectContaining({ processedAt: null }),
      })
    );
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
