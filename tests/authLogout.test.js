'use strict';
// POST /api/auth/logout must revoke the Session row server-side AND must NOT
// silently succeed if the revoke fails. The original handler swallowed the
// error (`.catch(() => {})`), so a "logged out" user could keep a live
// server-side session with zero trace. This mirrors opsport's logout, which
// propagates the failure instead of swallowing it.

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 1, email: 'u@microport.com' }; req.sessionId = 'sess-1'; next(); },
  COOKIE_NAME: 'productport_token',
}));
jest.mock('../src/lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/lib/db', () => ({ session: { update: jest.fn() } }));

const express = require('express');
const request = require('supertest');
const db = require('../src/lib/db');

function makeApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', require('../src/routes/auth'));
  return a;
}
const app = makeApp();

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/logout', () => {
  test('revokes the session row and clears the cookie on success', async () => {
    db.session.update.mockResolvedValue({});
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(db.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
  });

  test('does NOT silently succeed when the session revoke fails (propagates, not swallowed)', async () => {
    db.session.update.mockRejectedValue(new Error('db down'));
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
