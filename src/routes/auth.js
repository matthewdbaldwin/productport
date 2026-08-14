// Auth routes — SSO start / exchange / logout / me. SalesPort is the hub.
//
// SSO shape matches the fleet (clinicport is the reference):
//   1. GET  /api/auth/sso/start      → 302 to SalesPort /login?sso=productport
//                                       &returnTo=<web>/auth/callback
//   2. SalesPort authenticates, mints a 60s one-time handoff code, redirects
//      back to <web>/auth/callback?code=...
//   3. The web callback page POSTs the code to:
//      POST /api/auth/sso/exchange    → we relay it server-to-server to
//      SalesPort /api/auth/handoff/exchange, set the HttpOnly cookie, return
//      the payload. The raw JWT never appears in a URL.
//
// LOOP GUARD (feedback_sso_callback_loop_trap): the web callback dead-ends the
// UI on a NO_*_ROLE / failed exchange (via ?sso_err) instead of bouncing back
// into /sso/start. NOTE ProductPort is a universal app (every employee gets
// viewer via resolveRole), but SalesPort's /handoff still gates on an explicit
// app grant — see the paired universal-app hub PRD.
'use strict';
const express = require('express');
const logger = require('../lib/logger');
const { requireAuth } = require('../middleware/auth');
const { setSessionCookie, clearSessionCookie, REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie } = require('../lib/cookies');
const { revokeUpstreamRefresh } = require('../lib/refreshClient');
const db = require('../lib/db');

const router = express.Router();
const WEB          = process.env.WEB_ORIGIN || '';
const SALESPORT_WEB = process.env.SALESPORT_WEB_URL || process.env.SALESPORT_API_URL || '';
const SALESPORT_API = process.env.SALESPORT_API_URL || '';
// Login funnels through the hub/portal host (PORTAL_WEB_URL), falling back to
// the CRM host if the split var isn't set yet. The SalesPort-CRM launcher tile
// keeps using SALESPORT_WEB_URL separately.
const PORTAL_WEB = process.env.PORTAL_WEB_URL || SALESPORT_WEB;
// Handoff-code EXCHANGE target — the IdP backend that minted the code. Split out
// from SALESPORT_API_URL (which also feeds CSP connectSrc + the bug-report relay)
// so the SSO exchange can be repointed at HubPort during the Slice-4h IdP flip
// WITHOUT disturbing those other consumers. Defaults to SALESPORT_API_URL while
// SalesPort is still the IdP; at flip time set IDP_API_URL alongside PORTAL_WEB_URL.
const IDP_API = process.env.IDP_API_URL || SALESPORT_API;

// GET /api/auth/sso/start — browser entry point; redirect to SalesPort login.
router.get('/sso/start', (req, res) => {
  if (!PORTAL_WEB) return res.status(503).json({ error: 'SSO not configured on this instance.' });
  const web = WEB || `${req.protocol}://${req.get('host')}`;
  const returnTo = encodeURIComponent(`${web}/auth/callback`);
  res.redirect(`${PORTAL_WEB}/login?sso=productport&returnTo=${returnTo}`);
});

// POST /api/auth/sso/exchange — relay the one-time code to SalesPort's handoff
// exchange (server-to-server; the code is the credential, so no requireAuth /
// CSRF header). On success set the HttpOnly cookie (via lib/cookies.js — Max-Age
// = jwtTtlSec(), so this is no longer a browser-session-only cookie); forward
// the payload verbatim so the web frontend can stash the token + apply theme
// during the transition.
//
// REFRESH OPT-IN: when PRODUCTPORT_REFRESH_ENABLED is true, sends
// X-Satellite-Refresh: 1 so the IdP mints an (access, refresh) pair instead
// of the legacy single 8h token (mirrors clinicport's B1 Phase 4a.1 opt-in).
// When a pair comes back, the refresh cookie is set and the raw refresh
// token/expiry are stripped from the forwarded JSON body before it reaches
// the browser — the cookie is its only carrier; it has no business in JS.
router.post('/sso/exchange', async (req, res, next) => {
  try {
    if (!IDP_API) return res.status(503).json({ error: 'SSO not configured on this instance.' });
    const { code } = req.body || {};

    const refreshEnabled = process.env.PRODUCTPORT_REFRESH_ENABLED === 'true';
    const upstreamHeaders = { 'Content-Type': 'application/json', 'X-Correlation-Id': req.id };
    if (refreshEnabled) upstreamHeaders['X-Satellite-Refresh'] = '1';

    const upstream = await fetch(`${IDP_API.replace(/\/$/, '')}/api/auth/handoff/exchange`, {
      method:  'POST',
      headers: upstreamHeaders,
      body:    JSON.stringify({ code }),
      // Bound the IdP call — this is the login critical path; a hung hub must
      // fail the exchange fast (→ error handler), never hang the request.
      signal:  AbortSignal.timeout(10_000),
    });
    const payload = await upstream.json().catch(() => ({}));

    if (upstream.ok && payload.token) {
      if (refreshEnabled && payload.refreshToken) {
        const refreshRemainMs = Date.parse(payload.refreshTokenExpiresAt) - Date.now();
        setSessionCookie(res, payload.token,
          Number.isFinite(refreshRemainMs) && refreshRemainMs > 0 ? refreshRemainMs : undefined);
        setRefreshCookie(res, payload.refreshToken);
      } else {
        setSessionCookie(res, payload.token);
      }
    } else {
      logger.warn({ status: upstream.status, code: payload && payload.code }, '[sso] handoff exchange denied');
    }

    // Strip unconditionally — regardless of which branch above ran — so a
    // malformed/edge IdP response (refreshToken present alongside a missing
    // token or a non-2xx status) can never ship the raw refresh token to the
    // browser. The refresh cookie (set above, only when a pair was minted)
    // is its only legitimate carrier.
    delete payload.refreshToken;
    delete payload.refreshTokenExpiresAt;

    return res.status(upstream.status).json(payload);
  } catch (err) { next(err); }
});

// POST /api/auth/logout — clear the cookie + revoke the local Session row +
// best-effort revoke the upstream refresh token (if any).
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    // Revoke the Session row server-side (a cleared cookie alone lets a stolen
    // cookie replay outlive the logout). Do NOT swallow: a failed revoke means
    // the session is still live, so surface it (mirrors opsport's logout).
    if (req.sessionId) {
      await db.session.update({ where: { id: req.sessionId }, data: { revokedAt: new Date() } });
    }
    // Upstream refresh-token revoke is fire-and-forget: a captured refresh
    // token must not outlive logout, but an IdP outage must not block it.
    const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawRefresh) revokeUpstreamRefresh(rawRefresh, req.log, req.id).catch(() => {});
    clearSessionCookie(res);
    clearRefreshCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/auth/me — current user (from the verified token + JIT-provisioned row).
router.get('/me', requireAuth, (req, res) => res.json(req.user));

// PATCH /api/auth/me/theme — fire-and-forget relay to the IdP, which OWNS the
// theme. ProductPort deliberately has no local `theme` column: the IdP persists
// the pick and stamps it into the SSO token's `theme` claim, and requireAuth
// reads it back from that claim (middleware/auth.js) — never from our table. A
// local column would be written and never read, so this needs no migration.
// Free-form ≤64 chars by design, so each app validates against its own ThemeId
// union; null clears.
//
// 2026-08-04: the FLEET GAP this route used to document is FIXED — hub's
// requireAuth stays cookie-only, and satellites relay over the /api/service
// channel instead (hub cd7f0a1, per-satellite THEME_SERVICE_KEY, constant-time
// compare, fail-closed). The old bearer/cookie token forwarding is gone: the
// key authenticates THIS APP, and the already-authenticated user's email names
// the row — which also removes the Safari block-all-cookies 401 this route
// previously worked around. Matches rp/op/cp/ep. Inert (skip + warn) until
// IDP_API_URL + THEME_SERVICE_KEY are provisioned.
// project_productport_theme_persist_missing_route_2026-07-31
router.patch('/me/theme', requireAuth, async (req, res) => {
  const { theme } = req.body || {};
  if (theme !== null && (typeof theme !== 'string' || theme.length === 0 || theme.length > 64)) {
    return res.status(400).json({ error: 'theme must be a non-empty string ≤ 64 chars, or null to clear.' });
  }

  // Read at request time (the fleet convention for this route). Deliberately NO
  // SALESPORT_API_URL fallback any more: sp's row no longer feeds the claim, so
  // a fallback write there is exactly the dead write this rewrite removes.
  const idpApi     = process.env.IDP_API_URL || '';
  const serviceKey = process.env.THEME_SERVICE_KEY || '';
  if (!idpApi || !serviceKey) {
    logger.warn('IDP_API_URL/THEME_SERVICE_KEY not configured — theme write skipped');
    return res.json({ ok: true });
  }

  // Fire-and-forget: a failed upstream write must never surface to the user,
  // whose local cache still wins the session. But it MUST be visible to us —
  // checking only `.catch` is what made the original bug invisible, since fetch
  // resolves (not rejects) on a 4xx.
  fetch(`${idpApi.replace(/\/$/, '')}/api/service/users/theme`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Theme-Service-Key': serviceKey },
    body:    JSON.stringify({ email: req.user.email, theme: theme ?? null }),
  })
    .then(r => {
      if (!r.ok) logger.error({ status: r.status, idpApi }, 'IdP theme write rejected');
    })
    .catch(err => logger.error({ err: err.message, idpApi }, 'IdP theme write failed'));

  res.json({ ok: true });
});

// GET /api/auth/role-catalog — public catalog of this satellite's roles.
// SalesPort's People & Access aggregator pulls this to build the role picker.
// viewer is the universal default (every employee has it); the others are the
// explicit grants an admin assigns.
router.get('/role-catalog', (_req, res) => {
  res.json({
    satellite: 'productport',
    roles: [
      { key: 'viewer',        label: 'Viewer',        description: 'Read-only product catalog. Every employee has this by default — no grant needed.' },
      // 'product' (mid-tier editor) is intentionally NOT advertised: no route guard
      // enforces it yet, so granting it today is a no-op (viewer-equivalent). Re-add
      // when the two-tier editor (requireProductEditor) ships. See the Role enum.
      { key: 'product_admin', label: 'Product Admin', description: 'Full ProductPort administrator. Manages the catalog + access; surfaces the tile in the app-switcher.' },
    ],
  });
});

// GET /api/auth/app-launcher — public list of sibling apps this deployment can
// link to (only those whose *_WEB_URL env is set). Surfaced in the AppSwitcher.
router.get('/app-launcher', (_req, res) => {
  const HOST_APP = 'productport';
  const defs = [
    { id: 'salesport',  label: 'SalesPort',  tagline: 'CRM & sales',                  envVar: 'SALESPORT_WEB_URL'  },
    { id: 'opsport',    label: 'OpsPort',    tagline: 'Operations & inventory',       envVar: 'OPSPORT_WEB_URL'    },
    { id: 'reviewport', label: 'ReviewPort', tagline: 'Medical / legal / regulatory', envVar: 'REVIEWPORT_WEB_URL' },
    { id: 'clinicport', label: 'ClinicPort', tagline: 'Clinical contacts',            envVar: 'CLINICPORT_WEB_URL' },
    { id: 'execport',   label: 'ExecPort',   tagline: 'Exec analytics',               envVar: 'EXECPORT_WEB_URL'   },
    { id: 'productport', label: 'ProductPort', tagline: 'Product catalog',            envVar: 'PRODUCTPORT_WEB_URL' },
    { id: 'engageport', label: 'EngagePort', tagline: 'Physician engagement',         envVar: 'ENGAGEPORT_WEB_URL' },
  ];
  const apps = defs
    .filter((d) => d.id !== HOST_APP)
    .map((d) => ({ id: d.id, label: d.label, tagline: d.tagline, url: process.env[d.envVar] || null }))
    .filter((a) => a.url);
  // The "Company portal" target in the app switcher lives on the hub host, not
  // the SalesPort CRM host. Echo PORTAL_WEB_URL so the switcher stops deriving
  // it from the SalesPort tile (→ CRM/portal). Null when unset → the switcher
  // keeps its legacy CRM-derived fallback.
  const portalUrl = (process.env.PORTAL_WEB_URL || '').split(',')[0].trim() || null;
  res.json({ apps, portalUrl });
});

module.exports = router;
