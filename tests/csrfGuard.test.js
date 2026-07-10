// Behavior of the CSRF guard (microport-auth createCsrfGuard + this app's
// config), focused on the bootstrap bypass + mount-prefix path computation
// (feedback_express_mount_prefix_path_check) and the Origin allowlist. The SSO
// exchange must bypass (the one-time code is the credential); ordinary mutating
// /api calls must still require the X-Requested-With header and an allowed
// Origin. WEB_ORIGIN is unset under jest, so the allowlist falls back to
// http://localhost:3100.
'use strict';
const { csrfGuard } = require('../src/middleware/csrf');

// Minimal Express-ish req/res doubles. baseUrl is the router mount prefix.
// The shared guard reads req.headers (lowercase keys), not req.get().
function mkReq({ method = 'POST', baseUrl = '/api', path = '/', xrw, origin } = {}) {
  const headers = {};
  if (xrw) headers['x-requested-with'] = xrw;
  if (origin) headers.origin = origin;
  return { method, baseUrl, path, headers };
}
function mkRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
function run(req) {
  const res = mkRes();
  let nexted = false;
  csrfGuard(req, res, () => { nexted = true; });
  return { res, nexted };
}

describe('csrfGuard', () => {
  test('safe methods pass without a header', () => {
    expect(run(mkReq({ method: 'GET', baseUrl: '/api/products', path: '/' })).nexted).toBe(true);
  });

  test('SSO exchange bypasses CSRF at its mounted path (/api/auth + /sso/exchange)', () => {
    const { nexted, res } = run(mkReq({ method: 'POST', baseUrl: '/api/auth', path: '/sso/exchange' }));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  test('SSO lifecycle ingress bypasses (verifies its own HMAC)', () => {
    expect(run(mkReq({ method: 'POST', baseUrl: '/api/sso/lifecycle', path: '/event' })).nexted).toBe(true);
    expect(run(mkReq({ method: 'POST', baseUrl: '/api/sso/lifecycle', path: '/state' })).nexted).toBe(true);
  });

  test('an ordinary mutating /api call without the header is rejected 403', () => {
    const { nexted, res } = run(mkReq({ method: 'POST', baseUrl: '/api/products', path: '/' }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CSRF_HEADER_MISSING');
  });

  test('an ordinary mutating /api call WITH the correct header passes', () => {
    expect(run(mkReq({ method: 'POST', baseUrl: '/api/products', path: '/', xrw: 'productport-web' })).nexted).toBe(true);
  });

  test('a non-exchange sso path is NOT blanket-bypassed (guards against an over-broad match)', () => {
    const { nexted, res } = run(mkReq({ method: 'POST', baseUrl: '/api/auth', path: '/sso/start-evil' }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('an allowed Origin passes alongside the header', () => {
    expect(run(mkReq({
      method: 'POST', baseUrl: '/api/products', path: '/',
      xrw: 'productport-web', origin: 'http://localhost:3100',
    })).nexted).toBe(true);
  });

  test('a cross-site Origin is rejected even with the header present', () => {
    const { nexted, res } = run(mkReq({
      method: 'POST', baseUrl: '/api/products', path: '/',
      xrw: 'productport-web', origin: 'https://evil.example',
    }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CSRF_ORIGIN_REJECTED');
  });
});
