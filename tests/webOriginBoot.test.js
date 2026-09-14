'use strict';

// The CORS fail-closed guard in src/app.js: the parsed WEB_ORIGIN list must be
// non-empty when NODE_ENV=production.
//
// An empty list makes the CORS middleware fall through to `origin: true`, which
// reflects the caller's own Origin header back alongside `credentials: true`,
// so ANY site could make credentialed cross-origin calls to this API. A
// misconfiguration like that has to be fatal at boot, not a live hole.
// The guard checks the PARSED list, so a value that is truthy but holds no
// origin (" ", ",") is rejected too; the earlier `!process.env.WEB_ORIGIN`
// guard let those through.
//
// WEB_ORIGIN is blanked with '' rather than `delete`d on purpose. src/app.js
// runs `require('dotenv').config()` at module load; dotenv does not override a
// key already present in process.env but DOES fill in a missing one, so
// deleting the var hands dotenv a clean slate and a developer's local .env
// puts the real value straight back. Same trap, same fix, as documented in
// hubport/tests/jest.setup.env.js.

// A REAL pino instance (silenced). A plain object of jest.fn()s is not enough:
// src/app.js hands this logger to pino-http, which reads pino internals
// (logger.levels.values) at construction and throws on a duck-typed stand-in.
// Slice 5a: src/routes/auth.js reads IDP_API_URL at MODULE LOAD and throws if
// unset, so requiring src/app.js at all needs it present.
process.env.IDP_API_URL = 'https://idp.example.com';

jest.mock('../src/lib/logger', () => jest.requireActual('pino')({ level: 'silent' }));
jest.mock('../src/lib/db', () => ({ user: { findMany: jest.fn() } }));

const ORIGINAL_NODE_ENV  = process.env.NODE_ENV;
const ORIGINAL_WEB_ORIGIN = process.env.WEB_ORIGIN;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_WEB_ORIGIN === undefined) delete process.env.WEB_ORIGIN;
  else process.env.WEB_ORIGIN = ORIGINAL_WEB_ORIGIN;
  jest.resetModules();
});

// A fresh module registry each time: the guard runs once, at require.
const loadApp = () => { jest.isolateModules(() => { require('../src/app'); }); };

const GUARD_MESSAGE = 'WEB_ORIGIN must be set in production';

describe('src/app.js — CORS fail-closed boot guard', () => {
  test.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['separators only', ' , ,'],
  ])('production with a %s WEB_ORIGIN refuses to boot', (_label, value) => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = value;
    expect(loadApp).toThrow(GUARD_MESSAGE);
  });

  test('production with WEB_ORIGIN set boots normally', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://product.microport.com';
    expect(loadApp).not.toThrow();
  });

  test('production with a comma-separated WEB_ORIGIN list boots normally', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://product.microport.com, https://product-dev.microport.com';
    expect(loadApp).not.toThrow();
  });

  test('outside production a missing WEB_ORIGIN is not fatal — local dev is unaffected', () => {
    process.env.NODE_ENV = 'test';
    process.env.WEB_ORIGIN = '';
    expect(loadApp).not.toThrow();
  });
});
