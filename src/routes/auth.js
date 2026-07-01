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
  if (!SALESPORT_WEB) return res.status(503).json({ error: 'SSO not configured on this instance.' });
  const web = WEB || `${req.protocol}://${req.get('host')}`;
  const returnTo = encodeURIComponent(`${web}/auth/callback`);
  res.redirect(`${SALESPORT_WEB}/login?sso=productport&returnTo=${returnTo}`);
});

// POST /api/auth/sso/exchange — relay the one-time code to SalesPort's handoff
// exchange (server-to-server; the code is the credential, so no requireAuth /
// CSRF header). On success set the HttpOnly cookie; forward the payload verbatim
// so the web frontend can stash the token + apply theme during the transition.
router.post('/sso/exchange', async (req, res, next) => {
  try {
    if (!SALESPORT_API) return res.status(503).json({ error: 'SSO not configured on this instance.' });
    const { code } = req.body || {};

    const upstream = await fetch(`${SALESPORT_API.replace(/\/$/, '')}/api/auth/handoff/exchange`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code }),
    });
    const payload = await upstream.json().catch(() => ({}));

    if (upstream.ok && payload.token) setSessionCookie(res, payload.token);
    else logger.warn({ status: upstream.status, code: payload && payload.code }, '[sso] handoff exchange denied');

    return res.status(upstream.status).json(payload);
  } catch (err) { next(err); }
});

// POST /api/auth/logout — clear the cookie + revoke the local Session row.
router.post('/logout', requireAuth, async (req, res) => {
  if (req.sessionId) {
    await db.session.update({ where: { id: req.sessionId }, data: { revokedAt: new Date() } }).catch(() => {});
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// GET /api/auth/me — current user (from the verified token + JIT-provisioned row).
router.get('/me', requireAuth, (req, res) => res.json(req.user));

module.exports = router;
