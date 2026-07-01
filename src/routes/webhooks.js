// Inbound webhook receiver.
//
// Rules (feedback_data_level_errors_must_return_2xx, reference_webhook_topology):
//  - VERIFY the HMAC over the raw bytes BEFORE acting (timing-safe). Bad sig → 401.
//  - Data-level errors (bad shape, unknown entity) → 2xx so the sender's outbox
//    stops retrying. Only TRANSIENT failures (DB down) → 5xx.
//  - Validate the payload against the microport-contracts schema (warn → enforce).
'use strict';
const express = require('express');
const crypto = require('node:crypto');
const { LifecycleEvent } = require('@matthewdbaldwin/microport-contracts');
const logger = require('../lib/logger');
// db is lazy-required inside the handler so this module (and the signature
// boundary test) loads without the generated Prisma client present.

const router = express.Router();

function verifyHmac(secret, rawBody, header) {
  if (!secret || !rawBody || !header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// POST /api/webhooks/salesport — SSO lifecycle events FROM SalesPort.
//
// ProductPort is an SSO/JIT app: on every login middleware/auth re-resolves the
// user's role from the SSO claim, so role grant/revoke need no state written
// here (they take effect on next login). The one thing this receiver MUST act on
// is the account enable/disable flag, so an offboarded user loses access before
// their current access token expires.
router.post('/salesport', async (req, res) => {
  const secret = process.env.WEBHOOK_SECRET_SALESPORT_productport;
  if (!secret) return res.status(503).json({ error: 'Webhook verification not configured.' });
  if (!verifyHmac(secret, req.rawBody, req.get('X-Signature-256'))) {
    return res.status(401).json({ error: 'Invalid signature.' });
  }
  const correlationId = req.get('X-Correlation-Id');
  const payload = req.body || {};
  try {
    // Validate against the platform contract. Soft-drop: a malformed event is a
    // DATA error → log + 2xx so the sender's outbox stops retrying (never 5xx).
    const parsed = LifecycleEvent.safeParse(payload);
    if (!parsed.success) {
      logger.warn({ correlationId, kind: payload.kind, issues: parsed.error.issues },
        '[webhooks] lifecycle event failed microport-contracts validation — dropped');
      return res.json({ ok: true, dropped: 'schema' });
    }
    const { email, kind } = parsed.data;
    if (!email || !kind) {
      logger.warn({ correlationId, kind }, '[webhooks] lifecycle missing email/kind — dropped');
      return res.json({ ok: true, dropped: 'incomplete' });
    }

    const db = require('../lib/db');
    const where = { email: email.toLowerCase().trim() };
    if (kind === 'disable') {
      const r = await db.user.updateMany({ where, data: { active: false } });
      logger.info({ correlationId, email: where.email, matched: r.count }, '[webhooks] lifecycle disable → account deactivated');
    } else if (kind === 'reactivate') {
      const r = await db.user.updateMany({ where, data: { active: true } });
      logger.info({ correlationId, email: where.email, matched: r.count }, '[webhooks] lifecycle reactivate → account re-enabled');
    } else {
      // grant / revoke — role is JIT-resolved from the SSO claim on next login
      // (middleware/auth resolveRole); nothing to persist here.
      logger.info({ correlationId, email: where.email, kind }, '[webhooks] lifecycle grant/revoke — role handled JIT on next login');
    }
    return res.json({ ok: true });
  } catch (err) {
    // Only transient infra failures should 5xx (so the outbox retries).
    logger.error({ err, correlationId }, '[webhooks] transient failure');
    return res.status(503).json({ error: 'Temporarily unavailable.' });
  }
});

module.exports = router;
module.exports.verifyHmac = verifyHmac; // exported for the signature boundary test
