// src/routes/bugReports.js — bug-report fanout (spoke side).
//
// POST /api/bug-reports — any authed user files a bug; this route forwards it
// SYNCHRONOUSLY to the central queue (POST /api/bug-reports/cross-app) so triage
// stays in one place. Signed with the pp→sp channel secret
// (WEBHOOK_SECRET_PRODUCTPORT_SALESPORT; HMAC-SHA256 over the payload string,
// header x-bugreport-signature). Matches clinicport/opsport/etc.
// bug-report-fanout. (Replaced the scaffold's /api/cross-app outbox route, which
// enqueued to a never-drained outbox — reports never left the box.)
//
// Screenshot parity (2026-07-11): the report now carries an OPTIONAL screenshot.
// multer parses a single image (≤2 MB, mime allowlist), and the forward leg goes
// MULTIPART when a file is attached AND the target is multipart-capable (the hub,
// signalled by BUGREPORT_FORWARD_URL). Pointed at SalesPort's JSON-only receiver
// (the pre-cutover default), a file is dropped (warn) and the text leg is sent.
'use strict';
const express = require('express');
const crypto  = require('crypto');
const multer  = require('multer');
const logger  = require('../lib/logger');
const { signWebhookBody, makeLimiters } = require('@matthewdbaldwin/microport-auth');
const { BugReportCrossApp } = require('@matthewdbaldwin/microport-contracts');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Filing rate limit (skip only when CI=true — baked into makeLimiters; the
// internet-reachable dev mesh stays throttled. feedback_rate_limiter_dev_skip).
// Keyed per user: the route sits behind requireAuth, so req.user is always set
// (anonymous requests 401 before ever reaching the limiter).
const { file: fileLimiter } = makeLimiters({
  file: {
    windowMs: 60 * 1000,
    max:      5,
    keyGenerator: (req) => `user:${req.user?.id ?? 'anon'}`,
    message:  { error: 'Too many bug reports. Please wait a minute and try again.', code: 'RATE_LIMITED' },
  },
});

// Screenshot intake: 2 MB ceiling + an image mime allowlist — the modal's
// accept="image/*" is client-side only, so the server rejects non-images itself.
// SVG is deliberately excluded (scriptable). memoryStorage is fine: the buffer is
// forwarded to the central queue inside the handler, not kept in process. This
// mirrors the hub receiver's multer exactly (signer/receiver parity).
const ALLOWED_SCREENSHOT_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_SCREENSHOT_MIMES.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Screenshot must be a PNG, JPEG, WebP, or GIF image.'), { code: 'UNSUPPORTED_SCREENSHOT_TYPE' }));
  },
});
function uploadScreenshot(req, res, next) {
  upload.single('screenshot')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Screenshot must be 2 MB or smaller.' });
      if (err.code === 'UNSUPPORTED_SCREENSHOT_TYPE') return res.status(400).json({ error: err.message });
      return next(err);
    }
    next();
  });
}

// ANY authenticated user can file (anyone files; the superuser triages centrally).
// ProductPort is universal, so every employee reaches this. Middleware order:
// requireAuth (sets req.user) → fileLimiter (keys on the user; a throttled client
// never costs an upload parse) → uploadScreenshot (populates req.body from the
// multipart text fields + req.file BEFORE the handler reads them; a JSON request
// passes straight through multer untouched).
router.post('/', requireAuth, fileLimiter, uploadScreenshot, async (req, res) => {
  // Env-indirected for a clean sp->hub cutover flip: both default to the
  // SalesPort channel so prod/dev are UNCHANGED until the flip sets
  // BUGREPORT_FORWARD_URL=<hub> + BUGREPORT_FORWARD_SECRET=WEBHOOK_SECRET_PRODUCTPORT_HUBPORT.
  const base   = process.env.BUGREPORT_FORWARD_URL || process.env.SALESPORT_API_URL;
  const secret = process.env.BUGREPORT_FORWARD_SECRET || process.env.WEBHOOK_SECRET_PRODUCTPORT_SALESPORT;
  if (!base) return res.status(503).json({ error: 'SalesPort integration not configured.' });

  const title = str(req.body?.title);
  if (!title) return res.status(422).json({ error: 'Title is required.' });
  // Description optional in ProductPort's UI (title-only is allowed) — fall back
  // to the title so the contract's required `description` is always populated.
  const description = str(req.body?.description) || title;
  const pageUrl     = str(req.body?.pageUrl);

  const payload = {
    sourceApp:     'productport',
    reporterEmail: req.user.email,
    title:         title.slice(0, 200),
    description:   description.slice(0, 10000),
    pageUrl:       (pageUrl || 'https://product-dev.microport.com/').slice(0, 2000),
    browserAgent:  str(req.body?.browserAgent).slice(0, 500) || undefined,
    viewportSize:  str(req.body?.viewportSize).slice(0, 32)  || undefined,
    appVersion:    str(req.body?.appVersion).slice(0, 32)    || undefined,
    priority:      ['low', 'normal', 'high', 'critical'].includes(req.body?.priority) ? req.body.priority : 'normal',
    // Idempotency key — pass the client key through so the receiver dedups a
    // replayed forward; fall back to a fresh UUID so a keyless submit is retry-safe.
    eventId:       str(req.body?.eventId).slice(0, 64) || crypto.randomUUID(),
  };

  // Validate-on-send against the shared contract (warn-don't-block; the receiver
  // is the hard gate). BugReportCrossApp's sourceApp enum includes 'productport'
  // as of contracts 0.5.6, so a well-formed payload parses clean; the warn path
  // only fires on a genuine shape defect.
  const chk = BugReportCrossApp.safeParse(payload);
  if (!chk.success) {
    logger.warn({ issues: chk.error.issues }, '[bug-reports] payload not (yet) in BugReportCrossApp — sending anyway');
  }

  // The HMAC is over the payload STRING in BOTH legs — matches the receiver's
  // verify exactly (signWebhookBody is target- and wire-format-agnostic).
  const payloadStr    = JSON.stringify(payload);
  const correlationId = req.id || crypto.randomUUID();

  // Forward multipart only to a multipart-capable target (the hub, signalled by
  // BUGREPORT_FORWARD_URL). A file present but the URL unset means we're still
  // pointed at SalesPort's JSON-only /cross-app — drop the image (warn) and send
  // the text leg, so the report still lands.
  const forwardMultipart = !!req.file && !!process.env.BUGREPORT_FORWARD_URL;

  let body;
  let headers;
  if (forwardMultipart) {
    const form = new FormData();
    form.append('payload', payloadStr);
    form.append('screenshot', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'screenshot.png');
    body    = form;
    // NO Content-Type — the global fetch sets the multipart boundary from the FormData.
    headers = { 'X-Correlation-Id': correlationId };
    if (secret) headers['x-bugreport-signature'] = signWebhookBody(secret, payloadStr);
  } else {
    if (req.file) {
      logger.warn({ eventId: payload.eventId }, '[bug-reports] screenshot dropped — forward target is JSON-only');
    }
    body    = payloadStr;
    headers = { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId };
    if (secret) headers['x-bugreport-signature'] = signWebhookBody(secret, payloadStr);
  }

  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 10_000);
    let upstream;
    try {
      upstream = await fetch(`${base.replace(/\/$/, '')}/api/bug-reports/cross-app`, {
        method: 'POST', headers, body, signal: ctrl.signal,
      });
    } finally {
      clearTimeout(tid);
    }
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      logger.warn({ status: upstream.status, data }, '[bug-reports] cross-app forward rejected');
      return res.status(502).json({ error: data?.error || 'SalesPort rejected the report.' });
    }
    logger.info({ bugReportId: data?.id, by: req.user.id, multipart: forwardMultipart }, '[bug-reports] forwarded to central queue');
    return res.status(201).json(data);
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'SalesPort is taking too long to respond.' });
    }
    logger.error({ err: err.message }, '[bug-reports] cross-app forward failed');
    return res.status(502).json({ error: 'Could not reach SalesPort.' });
  }
});

module.exports = router;
