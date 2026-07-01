// Behavior of the CSRF guard, focused on the bootstrap bypass + mount-prefix
// path computation (feedback_express_mount_prefix_path_check). The SSO exchange
// must bypass (the one-time code is the credential); ordinary mutating /api
// calls must still require the X-Requested-With header.
'use strict';
const { csrfGuard } = require('../src/middleware/csrf');

// Minimal Express-ish req/res doubles. baseUrl is the router mount prefix.
function mkReq({ method = 'POST', baseUrl = '/api', path = '/', xrw } = {}) {
  return { method, baseUrl, path, get: (h) => (h === 'X-Requested-With' ? xrw : undefined) };
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

  test('webhooks ingress still bypasses', () => {
    expect(run(mkReq({ method: 'POST', baseUrl: '/api/webhooks', path: '/salesport' })).nexted).toBe(true);
  });

  test('an ordinary mutating /api call without the header is rejected 403', () => {
    const { nexted, res } = run(mkReq({ method: 'POST', baseUrl: '/api/products', path: '/' }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('an ordinary mutating /api call WITH the correct header passes', () => {
    expect(run(mkReq({ method: 'POST', baseUrl: '/api/products', path: '/', xrw: 'productport-web' })).nexted).toBe(true);
  });

  test('a non-exchange sso path is NOT blanket-bypassed (guards against an over-broad regex)', () => {
    const { nexted, res } = run(mkReq({ method: 'POST', baseUrl: '/api/auth', path: '/sso/start-evil' }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
