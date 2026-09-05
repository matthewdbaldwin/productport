// tests/help.test.js — POST /api/help (HelpSearchMiss write path).
// Identity is server-derived: role/userId come from req.user, and any
// client-sent role/userId in the body is ignored.
'use strict';

jest.mock('../src/lib/db', () => ({
  helpSearchMiss: { create: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const db = require('../src/lib/db');

function makeApp(user) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = user; next(); });
  a.use('/api/help', require('../src/routes/help'));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.helpSearchMiss.create.mockImplementation(async ({ data }) => ({ id: 1, createdAt: new Date(), ...data }));
});

describe('POST /api/help', () => {
  test('records a search miss with server-derived role + userId, ignoring any client-sent role/userId', async () => {
    const app = makeApp({ id: 9, role: 'viewer', email: 'v@microport.com' });
    const res = await request(app)
      .post('/api/help')
      .send({ query: 'clearance export', wasFuzzyRescued: false, locale: 'en-US', role: 'superuser', userId: 999 });
    expect(res.status).toBe(201);
    expect(db.helpSearchMiss.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ query: 'clearance export', role: 'viewer', userId: 9, wasFuzzyRescued: false }),
    }));
  });

  test('defaults wasFuzzyRescued to false when the client omits it', async () => {
    const app = makeApp({ id: 3, role: 'product_admin' });
    await request(app).post('/api/help').send({ query: 'gallery' });
    expect(db.helpSearchMiss.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ wasFuzzyRescued: false }),
    }));
  });

  test('422s an empty or whitespace-only query without touching the database', async () => {
    const app = makeApp({ id: 3, role: 'product_admin' });
    const res = await request(app).post('/api/help').send({ query: '   ' });
    expect(res.status).toBe(422);
    expect(db.helpSearchMiss.create).not.toHaveBeenCalled();
  });
});
