// src/routes/ssoLifecycle.js
// Inbound SSO-lifecycle webhook from salesport, mounted at /api/sso/lifecycle.
// Mirrors opsport's pattern, like the other satellites: HMAC-verified via
// microport-auth's createLifecycleGuard over the raw body, header
// x-salesport-signature, shared secret SALESPORT_LIFECYCLE_SECRET.
// Replaced the scaffold's /api/webhooks/salesport orphan, which was built against
// the legacy webhook naming and never matched salesport's sender (Apple 2026-07-01).
//
// ProductPort is a universal/JIT app, so the local effect of an event is narrow —
// see src/lib/lifecycleAction.js for the policy. Every event is logged to
// UserLifecycleEvent (audit + idempotency), then the account-active flag is
// updated if the policy says so — or, since the fleet create-on-grant decision
// (2026-08-19), the row is CREATED when a grant/reactivate arrives for an email
// with no local row and the event's role maps. Data-level errors return 2xx so salesport's
// outbox stops retrying (feedback_data_level_errors_must_return_2xx); only a
// failed audit-row write 5xx's so the delivery is retried.
'use strict';
const router = require('express').Router();
const { createLifecycleGuard } = require('@matthewdbaldwin/microport-auth');
const { LifecycleEvent, LifecycleStateResponse, mapRole } = require('@matthewdbaldwin/microport-contracts');
const logger = require('../lib/logger');
const { decideUserUpdate, stateResponse, placeholderName } = require('../lib/lifecycleAction');
// db is required lazily inside handlers so this module loads for the pure-logic
// tests without the generated Prisma client present.

const lifecycleGuard = createLifecycleGuard({
  secret: process.env.SALESPORT_LIFECYCLE_SECRET || null,
  signatureHeader: 'x-salesport-signature',
  allowUnsigned: process.env.ALLOW_UNSIGNED_LIFECYCLE === 'true',
  // HubPort is the fleet grant authority (grant-authority G4): accept its
  // x-hubport-signature too, signed with HUBPORT_LIFECYCLE_SECRET. Inert until
  // that secret is provisioned — a blank secret is skipped by the guard, so this
  // ships ahead of HubPort's send-side (consumers-first) with zero behavior change.
  additionalEmitters: [
    { secret: process.env.HUBPORT_LIFECYCLE_SECRET || null, signatureHeader: 'x-hubport-signature' },
  ],
});

router.post('/event', lifecycleGuard, async (req, res) => {
  const correlationId = req.get('X-Correlation-Id') || req.id || null;
  const payload = req.body || {};

  // Validate against the shared contract. Soft-drop + alert: a malformed payload
  // can never succeed on retry, so we log an error (surfaces in Sentry) and 2xx
  // to drop it — a 4xx would make salesport's outbox retry it forever.
  const parsed = LifecycleEvent.safeParse(payload);
  if (!parsed.success) {
    logger.error({ correlationId, kind: payload.kind, issues: parsed.error.issues },
      '[sso-lifecycle] event does not match microport-contracts LifecycleEvent — dropped (soft-drop + alert)');
    return res.json({ ok: true, dropped: 'schema' });
  }
  const { email, kind, prevRole, newRole, actorEmail, actorRole } = parsed.data;
  if (!email || !kind) {
    logger.warn({ correlationId, kind }, '[sso-lifecycle] missing email/kind — dropped');
    return res.json({ ok: true, dropped: 'incomplete' });
  }

  const db = require('../lib/db');
  const normEmail = email.toLowerCase().trim();

  // Idempotency: salesport's outbox retries carry X-Lifecycle-Event-Id (its
  // LifecycleOutbox.id). A repeat delivery collides on senderEventId → short-circuit
  // ONLY if that prior delivery actually finished (processedAt set). A row whose
  // processing died mid-way (processedAt: null — see the catch block below) must
  // be reused and re-processed, not treated as done, or the event is silently
  // dropped forever.
  const senderEventId = req.get('X-Lifecycle-Event-Id') || null;
  let eventRow;
  if (senderEventId) {
    const dup = await db.userLifecycleEvent
      .findUnique({ where: { senderEventId }, select: { id: true, processedAt: true, error: true } })
      .catch(() => null);
    if (dup) {
      if (dup.processedAt) return res.json({ ok: true, eventId: dup.id, deduplicated: true });
      eventRow = dup;
    }
  }

  // Log first — the audit row must exist even if the local user doesn't. A
  // failed write is the one case we 5xx (transient) so the event is redelivered.
  // Skipped when reusing an existing unprocessed row (senderEventId is @unique —
  // a second create() for the same id would throw a unique-constraint error).
  if (!eventRow) {
    try {
      eventRow = await db.userLifecycleEvent.create({
        data: {
          senderEventId, email: normEmail, kind,
          prevRole: prevRole ?? null, newRole: newRole ?? null,
          actorEmail: actorEmail ?? null, actorRole: actorRole ?? null,
          payload,
        },
      });
    } catch (err) {
      logger.error({ err: err.message, correlationId, email: normEmail, kind },
        '[sso-lifecycle] audit write failed — 5xx to allow salesport retry');
      return res.status(500).json({ error: 'Event log write failed.' });
    }
  }

  try {
    // Atomic claim: the dedup check above (and the reuse of an existing
    // unprocessed row) only protects against SEQUENTIAL retries — two
    // concurrent deliveries of the same event can both read processedAt: null
    // before either commits, and both fall through into the side effects
    // below. This conditional UPDATE is a single indivisible statement:
    // Postgres evaluates the WHERE and performs the write together under the
    // row's lock, so of two callers racing on the same row at most one can
    // see count === 1. The loser deduplicates without touching the User row.
    const claim = await db.userLifecycleEvent.updateMany({
      where: { id: eventRow.id, processedAt: null },
      data: { processedAt: new Date() },
    });
    if (claim.count === 0) {
      return res.json({ ok: true, eventId: eventRow.id, deduplicated: true });
    }

    const existing = await db.user.findUnique({
      where: { email: normEmail },
      select: { id: true, active: true },
    });
    const decision = decideUserUpdate(kind, existing, {
      newRole,
      mapRole: (wire) => mapRole('productport', wire),
    });
    if (decision.data) {
      await db.user.update({ where: { id: existing.id }, data: decision.data });
    } else if (decision.create) {
      // Create-on-grant (fleet decision 2026-08-19): mirror the JIT-create
      // shape in middleware/auth.js (email + name + role; active defaults
      // true, locale keeps the schema default). The event carries no name —
      // placeholder from the email local-part; sync-on-login backfills the
      // real name + re-resolves the role from the SSO claim at first login.
      await db.user.create({
        data: { email: normEmail, name: placeholderName(normEmail), role: decision.create.role },
      });
    } else if (decision.skip) {
      logger.warn({ correlationId, kind, email: normEmail }, '[sso-lifecycle] unknown event kind — audit row stashed');
    }
    await db.userLifecycleEvent.update({
      where: { id: eventRow.id },
      data: { processedAt: new Date(), error: decision.skip ? 'unknown_kind' : null },
    });
    return res.json({
      ok: true, eventId: eventRow.id,
      ...(decision.data || decision.create ? { applied: true } : {}),
      ...(decision.create ? { created: true } : {}),
    });
  } catch (err) {
    // Reset processedAt back to null: the claim above already marked this row
    // processed, but processing itself failed, so a genuine retry must be able
    // to reclaim it — otherwise the claim leaves the row permanently looking
    // "done" and the event is silently dropped forever.
    await db.userLifecycleEvent
      .update({ where: { id: eventRow.id }, data: { error: String(err.message).slice(0, 500), processedAt: null } })
      .catch(() => { /* secondary failure — swallow */ });
    logger.error({ err: err.message, correlationId, email: normEmail, kind, eventId: eventRow.id },
      '[sso-lifecycle] processing failed');
    return res.status(500).json({ error: 'Processing failed.', eventId: eventRow.id });
  }
});

// Reconciliation state query — salesport's hourly reconciler POSTs here to diff
// its own appRoles/status view against the local user. HMAC-verified the same
// way as /event. Reply shape = microport-contracts LifecycleStateResponse.
router.post('/state', lifecycleGuard, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required.' });
  const db = require('../lib/db');
  try {
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { role: true, active: true },
    });
    const body = stateResponse(user);
    // Belt-and-suspenders: never emit a reply the reconciler will reject.
    LifecycleStateResponse.parse(body);
    return res.json(body);
  } catch (err) {
    logger.error({ err: err.message, email }, '[sso-lifecycle] state query failed');
    return res.status(500).json({ error: 'State query failed.' });
  }
});

module.exports = router;
