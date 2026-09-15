// tests/ssoLifecycle.test.js
//
// POST /api/sso/lifecycle/event — ProductPort's wiring of microport-auth's
// shared lifecycle receiver (hubport#133). The pipeline's own behaviour (dedup,
// the atomic claim, ordering, reclaim) is tested in microport-auth; this file
// proves the mount is wired to it: the id-bound HubPort signature, the removed
// legacy surfaces, and ProductPort's plugs (including create-on-grant) reached
// through the real module.
//
// The event table is microport-auth's in-memory stand-in (a real
// compare-and-swap, hubport#129); the User table stays mocked. HMAC is real.
'use strict';

process.env.HUBPORT_LIFECYCLE_SECRET = 'pp-test-lifecycle-secret';
delete process.env.ALLOW_UNSIGNED_LIFECYCLE;

jest.mock('../src/lib/db', () => {
  const { createLifecycleEventsFake } = require('@matthewdbaldwin/microport-auth');
  return {
    user: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    userLifecycleEvent: createLifecycleEventsFake(),
  };
});
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { signLifecycleBody, signWebhookBody } = require('@matthewdbaldwin/microport-auth');
const db = require('../src/lib/db');

const SECRET = 'pp-test-lifecycle-secret';
const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use('/api/sso/lifecycle', require('../src/routes/ssoLifecycle'));

// Wire-accurate LifecycleEvent: the contract requires the nullable-but-present
// prev/new/actor fields.
const evt = (o = {}) => ({
  id: 'ev-uuid-1', email: 'Gone@Test.local', kind: 'disable',
  prevRole: null, newRole: null, actorEmail: 'admin@test.local', actorRole: 'admin', ...o,
});

let nextSeq = 1000;
function postSigned(bodyObj, { eventId = String(++nextSeq), sign = 'id-bound', header = 'x-hubport-signature' } = {}) {
  const str = JSON.stringify(bodyObj);
  const signature = sign === 'id-bound' ? signLifecycleBody(SECRET, eventId, str) : signWebhookBody(SECRET, str);
  return request(app).post('/api/sso/lifecycle/event')
    .set('Content-Type', 'application/json')
    .set('X-Lifecycle-Event-Id', eventId)
    .set(header, signature)
    .send(str);
}

const activeUser = { id: 7, active: true, fleetSuperuser: false, lifecycleSeq: null };

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue(null);
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.create.mockImplementation(async ({ data }) => ({ id: 99, active: true, ...data }));
});

describe('POST /event — wired to the shared receiver', () => {
  it('a signed disable on an active user deactivates it, conditional on senderSeq, and settles one audit row', async () => {
    db.user.findUnique.mockResolvedValue(activeUser);

    const res = await postSigned(evt(), { eventId: '501' });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toEqual({ kind: 'applied', reason: null, changes: ['active'] });
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'gone@test.local' } }));
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7, OR: [{ lifecycleSeq: null }, { lifecycleSeq: { lte: 501 } }] },
      data: { active: false, lifecycleSeq: 501 },
    });
    const rows = db.userLifecycleEvent.$rows().filter((r) => r.senderEventId === '501');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'gone@test.local', kind: 'disable', senderSeq: 501, error: null });
    expect(rows[0].processedAt).toBeInstanceOf(Date);
  });

  it('a redelivery of a settled event is a duplicate and never re-applies', async () => {
    db.user.findUnique.mockResolvedValue(activeUser);
    await postSigned(evt(), { eventId: '502' });
    db.user.updateMany.mockClear();

    const res = await postSigned(evt(), { eventId: '502' });

    expect(res.status).toBe(200);
    expect(res.body.outcome.kind).toBe('duplicate');
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('a malformed payload is dropped with 200 (a retry cannot fix it)', async () => {
    const res = await postSigned(evt({ email: undefined }));
    expect(res.status).toBe(200);
    expect(res.body.dropped).toBe('schema');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('a disable for an unknown local user settles as noop without writing', async () => {
    const res = await postSigned(evt({ email: 'nobody@test.local' }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toMatchObject({ kind: 'noop', reason: 'no-local-user' });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('a revoke is a noop on the active flag but still advances the watermark', async () => {
    db.user.findUnique.mockResolvedValue(activeUser);
    const res = await postSigned(evt({ kind: 'revoke', prevRole: 'product_admin' }), { eventId: '503' });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toMatchObject({ kind: 'noop', reason: 'role-jit-on-login' });
    expect(db.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { lifecycleSeq: 503 } }));
  });
});

// Fleet decision (HubPort grant authority, 2026-08-19): a grant/reactivate for
// an email with NO local row CREATES it when the event's role maps.
describe('POST /event — create-on-grant through the shared receiver', () => {
  it('a grant for an unknown email with a mappable role creates the row, stamped with senderSeq', async () => {
    const res = await postSigned(evt({ kind: 'grant', email: 'New.Hire@test.local', newRole: 'product_admin' }), { eventId: '601' });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toEqual({ kind: 'applied', reason: 'created', changes: ['created'] });
    expect(db.user.create).toHaveBeenCalledWith({
      data: { email: 'new.hire@test.local', name: 'new.hire', role: 'product_admin', lifecycleSeq: 601 },
    });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('a reactivate for an unknown email with a mappable role creates too', async () => {
    const res = await postSigned(evt({ kind: 'reactivate', email: 'back@test.local', newRole: 'viewer' }));
    expect(res.body.outcome.reason).toBe('created');
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'back@test.local', role: 'viewer' }),
    });
  });

  it('an unmappable role never creates', async () => {
    const res = await postSigned(evt({ kind: 'grant', email: 'ghost@test.local', newRole: 'not-a-real-role' }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toMatchObject({ kind: 'noop', reason: 'unmapped-role' });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('a grant on an existing active user does not create a duplicate', async () => {
    db.user.findUnique.mockResolvedValue(activeUser);
    const res = await postSigned(evt({ kind: 'grant', newRole: 'product_admin' }));
    expect(res.body.outcome).toMatchObject({ kind: 'noop', reason: 'already-active' });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('a create that loses a race with a first login (unique violation) answers 500 so HubPort retries', async () => {
    db.user.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const res = await postSigned(evt({ kind: 'grant', email: 'racer@test.local', newRole: 'viewer' }), { eventId: '602' });
    expect(res.status).toBe(500);
    const row = db.userLifecycleEvent.$rows().find((r) => r.senderEventId === '602');
    expect(row.processedAt).toBeNull();
    expect(row.claimedAt).toBeNull();
  });
});

describe('POST /event — signature', () => {
  it('rejects a body-only signature (the pre-0.17 HubPort sender) with 401', async () => {
    const res = await postSigned(evt(), { sign: 'body-only' });
    expect(res.status).toBe(401);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects the retired SalesPort header with 401', async () => {
    const res = await postSigned(evt(), { header: 'x-salesport-signature' });
    expect(res.status).toBe(401);
  });

  it('rejects a delivery without X-Lifecycle-Event-Id with 401', async () => {
    const str = JSON.stringify(evt());
    const res = await request(app).post('/api/sso/lifecycle/event')
      .set('Content-Type', 'application/json')
      .set('x-hubport-signature', signWebhookBody(SECRET, str))
      .send(str);
    expect(res.status).toBe(401);
  });
});

describe('removed surfaces', () => {
  it('POST /state no longer exists', async () => {
    const res = await request(app).post('/api/sso/lifecycle/state').send({ email: 'gone@test.local' });
    expect(res.status).toBe(404);
  });
});
