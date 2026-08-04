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
const { requireAuth, COOKIE_NAME } = require('../middleware/auth');
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

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
  });
}

// GET /api/auth/sso/start — browser entry point; redirect to SalesPort login.
router.get('/sso/start', (req, res) => {
  if (!PORTAL_WEB) return res.status(503).json({ error: 'SSO not configured on this instance.' });
  const web = WEB || `${req.protocol}://${req.get('host')}`;
  const returnTo = encodeURIComponent(`${web}/auth/callback`);
  res.redirect(`${PORTAL_WEB}/login?sso=productport&returnTo=${returnTo}`);
});

// POST /api/auth/sso/exchange — relay the one-time code to SalesPort's handoff
// exchange (server-to-server; the code is the credential, so no requireAuth /
// CSRF header). On success set the HttpOnly cookie; forward the payload verbatim
// so the web frontend can stash the token + apply theme during the transition.
router.post('/sso/exchange', async (req, res, next) => {
  try {
    if (!IDP_API) return res.status(503).json({ error: 'SSO not configured on this instance.' });
    const { code } = req.body || {};

    const upstream = await fetch(`${IDP_API.replace(/\/$/, '')}/api/auth/handoff/exchange`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': req.id },
      body:    JSON.stringify({ code }),
      // Bound the IdP call — this is the login critical path; a hung hub must
      // fail the exchange fast (→ error handler), never hang the request.
      signal:  AbortSignal.timeout(10_000),
    });
    const payload = await upstream.json().catch(() => ({}));

    if (upstream.ok && payload.token) setSessionCookie(res, payload.token);
    else logger.warn({ status: upstream.status, code: payload && payload.code }, '[sso] handoff exchange denied');

    return res.status(upstream.status).json(payload);
  } catch (err) { next(err); }
});

// POST /api/auth/logout — clear the cookie + revoke the local Session row.
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    // Revoke the Session row server-side (a cleared cookie alone lets a stolen
    // cookie replay outlive the logout). Do NOT swallow: a failed revoke means
    // the session is still live, so surface it (mirrors opsport's logout).
    if (req.sessionId) {
      await db.session.update({ where: { id: req.sessionId }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/auth/me — current user (from the verified token + JIT-provisioned row).
router.get('/me', requireAuth, (req, res) => res.json(req.user));

// PATCH /api/auth/me/theme — fire-and-forget proxy to the IdP, which OWNS the
// theme. ProductPort deliberately has no local `theme` column: the IdP persists
// the pick and stamps it into the SSO token's `theme` claim, and requireAuth
// reads it back from that claim (middleware/auth.js) — never from our table. A
// local column would be written and never read, so this needs no migration.
// Matches reviewport/opsport/clinicport/execport, with one deliberate difference
// (the token fallback below). Free-form ≤64 chars by design, so each app
// validates against its own ThemeId union; null clears.
// project_productport_theme_persist_missing_route_2026-07-31
router.patch('/me/theme', requireAuth, async (req, res) => {
  const { theme } = req.body || {};
  if (theme !== null && (typeof theme !== 'string' || theme.length === 0 || theme.length > 64)) {
    return res.status(400).json({ error: 'theme must be a non-empty string ≤ 64 chars, or null to clear.' });
  }

  // Read at request time (the fleet convention for this route). IDP_API_URL is
  // the handle that gets repointed at the HubPort flip, so the theme write
  // follows the IdP automatically; SALESPORT_API_URL is only the fallback
  // because it also feeds CSP connectSrc + the bug-report relay and must not be
  // the var that moves.
  const idpApi = process.env.IDP_API_URL || process.env.SALESPORT_API_URL || '';
  if (!idpApi) {
    logger.warn('IDP_API_URL/SALESPORT_API_URL not configured — theme write skipped');
    return res.json({ ok: true });
  }

  // ProductPort is post-Phase-4 COOKIE-ONLY (middleware/auth.js reads only the
  // cookie), and web/lib/theme.ts sends the bearer only when localStorage is
  // readable — Safari with "Block all cookies" throws on access. The other four
  // satellites 401 without a bearer; copying that here would reject exactly
  // those users and re-create the silent no-op this route exists to fix. The
  // request is already authenticated, so the cookie is a first-class fallback.
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ')
    ? header.slice(7)
    : (req.cookies && req.cookies[COOKIE_NAME]) || null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  // Fire-and-forget: a failed upstream write must never surface to the user,
  // whose local cache still wins the session. But it MUST be visible to us —
  // checking only `.catch` is what made the original bug invisible, since fetch
  // resolves (not rejects) on a 4xx. See the FLEET GAP note below: HubPort is
  // the IdP for every satellite and its requireAuth is cookie-only, so a
  // proxied bearer currently comes back 401 and would otherwise vanish.
  fetch(`${idpApi.replace(/\/$/, '')}/api/auth/me/theme`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ theme }),
  })
    .then(r => {
      if (!r.ok) logger.error({ status: r.status, idpApi }, 'IdP theme write rejected');
    })
    .catch(err => logger.error({ err: err.message, idpApi }, 'IdP theme write failed'));

  res.json({ ok: true });
});
// ⚠ FLEET GAP (found 2026-08-04, NOT fixed here — needs an architecture call).
// Every satellite now runs with IDP_API_URL=https://hub.microport.com, so
// HubPort mints the tokens and signs `theme` from ITS OWN User row
// (hub src/lib/identity.js:146 → signer.js:59). But hub's requireAuth reads the
// token ONLY from its own cookie (hub src/middleware/auth.js:63) — there is no
// Authorization: Bearer path — so a server-to-server proxy from any satellite
// gets a 401. Meanwhile reviewport/opsport/clinicport/execport still hardcode
// SALESPORT_API_URL, writing theme to SalesPort's User row, which no longer
// feeds the claim (hub's spUserProjection was a ONE-TIME cutover seed, and no
// sp→hub theme sync exists). Net: theme persistence is a no-op fleet-wide, not
// just here. The three candidate fixes — widen hub's auth to accept a
// satellite bearer, give satellites a service-token channel to hub, or have
// the browser call hub directly — are all security decisions, so this route
// logs the rejection loudly instead of pretending to succeed.

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
