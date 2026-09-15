// src/routes/ssoLifecycle.js
// Inbound SSO-lifecycle events from HubPort, mounted at /api/sso/lifecycle.
//
// The pipeline is microport-auth's shared receiver (createLifecycleReceiver,
// hubport#131, adopted here per the hubport#133 checklist). It owns the HMAC
// guard (x-hubport-signature over `${X-Lifecycle-Event-Id}.${rawBody}`, the id
// header mandatory), contract validation, the audit row, dedup, the atomic
// claim, ordering, settle, email-scrubbed logging and the reclaim sweep.
// ProductPort supplies only the policy plugs in src/lib/lifecycleAction.js,
// including create-on-grant (fleet decision 2026-08-19).
//
// Gone with the adoption: the SalesPort acceptor (x-salesport-signature,
// SALESPORT_LIFECYCLE_SECRET) and POST /state, which nothing calls.
//
// The receiver is built on first use, not at require time: it takes the Prisma
// delegate, and db is loaded lazily so tests that mock db without
// userLifecycleEvent can still require the app. server.js builds it at boot
// (startReclaim), so a misconfiguration still fails the deploy, not a delivery.
'use strict';
const express = require('express');
const { createLifecycleReceiver } = require('@matthewdbaldwin/microport-auth');
const { mapRole } = require('@matthewdbaldwin/microport-contracts');
const logger = require('../lib/logger');
const { loadCurrent, applyLifecycle } = require('../lib/lifecycleAction');

const mapProductportRole = (wire) => mapRole('productport', wire);

let receiver = null;
let receiverRoutes = null;

function getReceiver() {
  if (!receiver) {
    const db = require('../lib/db');
    receiver = createLifecycleReceiver({
      events: db.userLifecycleEvent,
      secret: process.env.HUBPORT_LIFECYCLE_SECRET || null,
      // Dev only. The receiver throws at construction when this is true under
      // NODE_ENV=production, which fails the boot loudly rather than silently
      // ignoring a dangerous setting.
      allowUnsigned: process.env.ALLOW_UNSIGNED_LIFECYCLE === 'true',
      logger,
      loadCurrent: (email, opts) => loadCurrent(db, email, opts),
      apply: (args) => applyLifecycle(db, { ...args, mapRole: mapProductportRole }),
    });
    receiverRoutes = receiver.routes();
  }
  return receiver;
}

const router = express.Router();
router.use((req, res, next) => {
  getReceiver();
  return receiverRoutes(req, res, next);
});

// Called once from server.js: builds the receiver and starts the reclaim sweep
// (releases claims older than 5 minutes that never settled).
function startReclaim() {
  getReceiver().start();
}

module.exports = router;
module.exports.startReclaim = startReclaim;
