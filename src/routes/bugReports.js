// src/routes/bugReports.js — bug-report fanout (spoke side).
//
// POST /api/bug-reports — any authed user files a bug; this route forwards it
// SYNCHRONOUSLY to SalesPort's central queue (POST /api/bug-reports/cross-app)
// so triage stays in one place. Signed with the pp→sp channel secret
// (WEBHOOK_SECRET_PRODUCTPORT_SALESPORT; HMAC-SHA256 over the JSON body, header
// x-bugreport-signature). Matches clinicport/opsport/etc. Text-only by design.
// bug-report-fanout. (Replaced the scaffold's /api/cross-app outbox route, which
// enqueued to a never-drained outbox — reports never left the box.)
'use strict';
const express = require('express');
const crypto  = require('crypto');
const logger  = require('../lib/logger');
const { signWebhookBody } = require('@matthewdbaldwin/microport-auth');
const { BugReportCrossApp } = require('@matthewdbaldwin/microport-contracts');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ANY authenticated user can file (anyone files; the superuser triages centrally
// on SalesPort). ProductPort is universal, so every employee reaches this.
router.post('/', requireAuth, async (req, res) => {
  const base   = process.env.SALESPORT_API_URL;
  const secret = process.env.WEBHOOK_SECRET_PRODUCTPORT_SALESPORT;
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
    // Idempotency key — pass the client key through so SalesPort dedups a
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

  const bodyStr = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json', 'X-Correlation-Id': req.id || crypto.randomUUID() };
  if (secret) headers['x-bugreport-signature'] = signWebhookBody(secret, bodyStr);

  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 10_000);
    let upstream;
    try {
      upstream = await fetch(`${base.replace(/\/$/, '')}/api/bug-reports/cross-app`, {
        method: 'POST', headers, body: bodyStr, signal: ctrl.signal,
      });
    } finally {
      clearTimeout(tid);
    }
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      logger.warn({ status: upstream.status, data }, '[bug-reports] cross-app forward rejected');
      return res.status(502).json({ error: data?.error || 'SalesPort rejected the report.' });
    }
    logger.info({ bugReportId: data?.id, by: req.user.id }, '[bug-reports] forwarded to SalesPort');
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
