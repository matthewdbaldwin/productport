// src/lib/cookies.js
// Thin adapter over microport-auth's createCookieHelpers. The shared module owns
// the HttpOnly cookie security envelope ({ httpOnly, secure: isProd, sameSite:
// 'lax', path: '/' }) so the flag tuple can't drift per repo, plus the clear-
// path attribute mirroring. This file injects the per-app cookie name(s) + the
// session Max-Age (jwtTtlSec) and re-exports the same names every call site
// imports, matching op/rp/cp/sp's src/lib/cookies.js.
//
// kevlar security-hardening remediation (2026-08-05): productport's login flow
// previously hand-rolled `res.cookie(COOKIE_NAME, token, {...})` in
// src/routes/auth.js with no `maxAge` at all — a browser-session-only cookie,
// almost certainly unintentional given every other satellite sizes it off
// jwtTtlSec(). Fixed by routing through this shared adapter instead.
//
// REFRESH COOKIE — REFRESH_COOKIE_NAME / setRefreshCookie / clearRefreshCookie
// ARE now wired, gated behind PRODUCTPORT_REFRESH_ENABLED (mirroring clinicport's
// B1 Phase 4a.1 opt-in): src/routes/auth.js sets the refresh cookie on
// POST /sso/exchange (when the flag is on and the IdP returns an (access,
// refresh) pair) and clears it on POST /logout; src/middleware/auth.js's
// withFreshAccessToken reads it back and rotates the pair opportunistically.
// When the flag is false, none of that runs and behavior is unchanged from
// before this flow existed — see src/routes/auth.js for the fuller note.
'use strict';
const { createCookieHelpers } = require('@matthewdbaldwin/microport-auth');
const { jwtTtlSec } = require('./jwtTtl');

module.exports = createCookieHelpers({
  cookieName:         'productport_token',   // unchanged value — a rename would log out every live session
  refreshCookieName:  'productport_refresh', // reserved, unused (see file header)
  getSessionMaxAgeMs: () => jwtTtlSec() * 1000,
});
