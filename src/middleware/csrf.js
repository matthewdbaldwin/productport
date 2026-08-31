// src/middleware/csrf.js
// CSRF guard for cookie-authed mutations. The guard logic — X-Requested-With
// requirement + Origin allowlist + mount-prefix-safe path recomposition — lives
// in microport-auth's createCsrfGuard. Per-app config is the required header
// value, the exact pre-auth bootstrap paths, and the Origin allowlist. The
// platform-standard bootstrap prefixes (/api/webhooks/, /api/sso/lifecycle) are
// the module default, so they can't drift per-repo
// (feedback_csrf_bootstrap_allowlist_drift).
// Origins are pinned to WEB_ORIGIN — the same env this app's CORS reads — NOT
// the module's FRONTEND_ORIGIN default
// (feedback_shared_module_default_replaces_per_app_env).
'use strict';

const { createCsrfGuard } = require('@matthewdbaldwin/microport-auth');

const csrfGuard = createCsrfGuard({
  headerValue: 'productport-web',
  bootstrapPaths: [
    // SSO code exchange — the 60s handoff code IS the credential; the browser
    // POST has no session cookie or CSRF header yet.
    '/api/auth/sso/exchange',
    // HubPort fleet-union census pull — server-to-server, HMAC-only (no cookie
    // auth, no browser Origin/X-Requested-With). Not covered by the module's
    // default bootstrap prefixes (/api/webhooks/, /api/sso/lifecycle), so it
    // must be listed explicitly.
    '/api/internal/user-census',
    // HubPort fleet conformance sweep pull (hubport#84) — server-to-server,
    // HMAC-only (no cookie auth, no browser Origin/X-Requested-With).
    '/api/internal/digest-grants',
  ],
  allowedOrigins: () => {
    const list = (process.env.WEB_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    return list.length ? list : ['http://localhost:3100'];
  },
});

module.exports = { csrfGuard };
