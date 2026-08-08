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
// are exported for shape parity with the other satellites' lib/cookies.js, but
// are NOT called anywhere in this app yet. ProductPort's SSO exchange
// (src/routes/auth.js) never requests the (access, refresh) pair from the IdP
// (no `X-Satellite-Refresh` header, and SHORT_LIVED_SSO_TOKENS is a global IdP
// flag we don't control) — the IdP's handoff/exchange only mints a refresh
// token when a satellite opts in, so there is currently no server-side refresh
// token for this app to carry in a cookie at all. Wiring an actual refresh flow
// (feature flag + a local refreshClient.js + opportunistic-refresh middleware,
// mirroring clinicport's B1 Phase 4a.1) is a separate, larger change — out of
// scope for this remediation. See src/routes/auth.js for the fuller note.
'use strict';
const { createCookieHelpers } = require('@matthewdbaldwin/microport-auth');
const { jwtTtlSec } = require('./jwtTtl');

module.exports = createCookieHelpers({
  cookieName:         'productport_token',   // unchanged value — a rename would log out every live session
  refreshCookieName:  'productport_refresh', // reserved, unused (see file header)
  getSessionMaxAgeMs: () => jwtTtlSec() * 1000,
});
