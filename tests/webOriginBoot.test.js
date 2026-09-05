'use strict';

// The boot guard in src/app.js: WEB_ORIGIN must be set when NODE_ENV=production.
//
// Before the guard, an unset WEB_ORIGIN left corsOrigins empty and the CORS
// middleware fell through to `origin: true`, which reflects the caller's own
// Origin header back alongside `credentials: true` — i.e. ANY site could make
// credentialed cross-origin calls to this API. A missing env var is a silent
// misconfiguration, so it has to be fatal at boot rather than a live hole.
// Mirrors salesport/execport/opsport/clinicport, which run the identical
// production-only guard over their own FRONTEND_ORIGIN.
//
// WEB_ORIGIN is blanked with '' rather than `delete`d on purpose. src/app.js
// runs `require('dotenv').config()` at module load; dotenv does not override a
// key already present in process.env but DOES fill in a missing one, so
// deleting the var hands dotenv a clean slate and a developer's local .env
// puts the real value straight back. Same trap, same fix, as documented in
// hubport/tests/jest.setup.env.js.

// A REAL pino instance with only .error swapped for a spy. A plain object of
// jest.fn()s is not enough: src/app.js hands this same logger to pino-http,
// which reads pino internals (logger.levels.values) at construction and throws
// on a duck-typed stand-in.
// Slice 5a: src/routes/auth.js reads IDP_API_URL at MODULE LOAD and throws if
// unset, so requiring src/app.js at all needs it present.
process.env.IDP_API_URL = 'https://idp.example.com';

const mockLoggerError = jest.fn();
jest.mock('../src/lib/logger', () => {
  const logger = jest.requireActual('pino')({ level: 'silent' });
  logger.error = mockLoggerError;
  return logger;
});
jest.mock('../src/lib/db', () => ({ user: { findMany: jest.fn() } }));

const ORIGINAL_NODE_ENV  = process.env.NODE_ENV;
const ORIGINAL_WEB_ORIGIN = process.env.WEB_ORIGIN;

let exitSpy;

beforeEach(() => {
  mockLoggerError.mockClear();
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_WEB_ORIGIN === undefined) delete process.env.WEB_ORIGIN;
  else process.env.WEB_ORIGIN = ORIGINAL_WEB_ORIGIN;
  jest.resetModules();
});

// A fresh module registry each time — the guard runs once, at require.
const loadApp = () => { jest.isolateModules(() => { require('../src/app'); }); };

describe('src/app.js — WEB_ORIGIN boot guard', () => {
  test('production with no WEB_ORIGIN logs and exits 1 instead of booting with open CORS', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = '';
    loadApp();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('WEB_ORIGIN env var is required in production'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('production with WEB_ORIGIN set boots normally', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://product.microport.com';
    loadApp();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('outside production a missing WEB_ORIGIN is not fatal — local dev is unaffected', () => {
    process.env.NODE_ENV = 'test';
    process.env.WEB_ORIGIN = '';
    loadApp();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
