// tests/ssoLifecycleLogRedaction.test.js
// The old SSO-lifecycle receiver logged the subject's email address on its
// audit-write, unknown-kind, processing and /state failure paths (hubport#107
// punch list: PII in CloudWatch, shipped to Sentry). microport-auth's shared
// receiver now owns those log lines (hubport#133) and scrubs every email-shaped
// substring from them. This pins that ProductPort's failure paths go through it:
// a DB error whose message carries the address must not reach the logger or the
// stored error with the address in it.
'use strict';

process.env.HUBPORT_LIFECYCLE_SECRET = 'pp-test-lifecycle-secret';
delete process.env.ALLOW_UNSIGNED_LIFECYCLE;

jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => {
  const { createLifecycleEventsFake } = require('@matthewdbaldwin/microport-auth');
  return {
    userLifecycleEvent: createLifecycleEventsFake(),
    user: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  };
});

const express = require('express');
const request = require('supertest');
const { signLifecycleBody } = require('@matthewdbaldwin/microport-auth');
const logger = require('../src/lib/logger');
const db = require('../src/lib/db');

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use('/api/sso/lifecycle', require('../src/routes/ssoLifecycle'));

const EMAIL = 'Jane.Doe@microport.com';
const event = (o = {}) => ({
  id: 'evt-1', email: EMAIL, kind: 'disable', prevRole: null, newRole: null,
  actorEmail: 'admin@microport.com', actorRole: 'admin', ...o,
});

function post(eventId, body = event()) {
  const str = JSON.stringify(body);
  return request(app).post('/api/sso/lifecycle/event')
    .set('Content-Type', 'application/json')
    .set('X-Lifecycle-Event-Id', eventId)
    .set('x-hubport-signature', signLifecycleBody('pp-test-lifecycle-secret', eventId, str))
    .send(str);
}

function expectNoEmailLogged() {
  const calls = [...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls];
  for (const [fields, msg] of calls) {
    expect(JSON.stringify(fields ?? {}).toLowerCase()).not.toContain('jane.doe');
    expect(String(msg ?? '').toLowerCase()).not.toContain('jane.doe');
  }
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/sso/lifecycle/event — failure logs carry no email address', () => {
  test('a loadCurrent failure whose message holds the email is logged and stored scrubbed', async () => {
    db.user.findUnique.mockRejectedValue(new Error(`lookup failed for ${EMAIL.toLowerCase()}`));

    const res = await post('77');

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
    expectNoEmailLogged();
    const row = db.userLifecycleEvent.$rows().find((r) => r.senderEventId === '77');
    expect(row.error).not.toContain('jane.doe');
    expect(row.claimedAt).toBeNull(); // claim released so HubPort's retry can reclaim it
  });

  test('an apply write failure is logged without the email', async () => {
    db.user.findUnique.mockResolvedValue({ id: 5, active: true, fleetSuperuser: false, lifecycleSeq: null });
    db.user.updateMany.mockRejectedValue(new Error(`write failed: ${EMAIL}`));

    const res = await post('78');

    expect(res.status).toBe(500);
    expectNoEmailLogged();
  });

  test('a create-on-grant failure is logged without the email', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(new Error(`Unique constraint failed on email ${EMAIL}`));

    const res = await post('79', event({ kind: 'grant', newRole: 'viewer' }));

    expect(res.status).toBe(500);
    expectNoEmailLogged();
  });
});
