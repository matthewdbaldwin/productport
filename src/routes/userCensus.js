// src/routes/userCensus.js
// HubPort fleet-union census endpoint (canonical shape — copied to the other 5
// satellites; only the SELECT + toDTO block below differs per app).
//
// Read-only. Returns productport's local users as the normalized census DTO so
// HubPort's People & Access reconcile can see who lives here WITHOUT direct DB
// access. No credential material ever leaves productport: password is read only
// to derive the boolean `isLocalCapable`, and the satellite-local `id` is never
// emitted — `email` (lowercased) is the sole join key.
//
// POST (not GET) so the HMAC binds the pagination body { cursor, take }. Guarded
// by a DEDICATED census guard verifying HubPort's x-hubport-signature over the
// raw body with the shared HUBPORT_CENSUS_SECRET (NOT the lifecycle secret). A
// blank/unset secret makes the guard fail CLOSED (createLifecycleGuard returns
// 503 with no emitter unless ALLOW_UNSIGNED_LIFECYCLE=true) — secure-by-default.
//
// NOTE: ProductPort's express.json captures req.rawBody for EVERY path
// unconditionally (see app.js), so there is no per-path rawBody list to add —
// only the csrf.js bootstrap bypass is required for this signed server-to-server
// route to reach the guard in production.

const express = require('express');
const { createLifecycleGuard } = require('@matthewdbaldwin/microport-auth');
const logger = require('../lib/logger');
const prisma = require('../lib/db');

const router = express.Router();

// HubPort is the caller/emitter of the census pull; verify its signature over
// the body. Dedicated secret + header (do NOT reuse the lifecycle secret).
const censusGuard = createLifecycleGuard({
  secret: process.env.HUBPORT_CENSUS_SECRET || null,
  signatureHeader: 'x-hubport-signature',
  allowUnsigned: process.env.ALLOW_UNSIGNED_LIFECYCLE === 'true', // dev only
  logger,
});

const MAX_TAKE = 500;

// ── per-app block ── (SELECT + toDTO differ per the mapper table) ── productport ──
// ProductPort's User has NO soft-delete (deletedAt) and NO last-login (lastLogin):
// so WHERE is empty (all rows), lastLoginAt is always null, and neither column is
// selected. Single `name`; nullable `password` (null for SSO-only users, no sentinel).
const SELECT = {
  email: true,
  name: true,
  active: true,
  password: true,
  role: true,
  createdAt: true,
};
function toDTO(u) {
  return {
    email: u.email.toLowerCase(),
    name: (u.name || '').trim() || null,
    active: u.active,
    localRole: u.role,
    isLocalCapable: !!(u.password && u.password.startsWith('$2')),
    lastLoginAt: null, // ProductPort does not track last-login
    createdAt: u.createdAt.toISOString(),
  };
}
const WHERE = {}; // ProductPort has no soft-delete — census returns all users
// ── end per-app block ──

// POST so the HMAC binds the pagination body. Read-only.
router.post('/', censusGuard, async (req, res, next) => {
  try {
    const take = Math.min(MAX_TAKE, Math.max(1, Number(req.body?.take) || MAX_TAKE));
    const cursor = req.body?.cursor ? { email: String(req.body.cursor) } : undefined;
    const rows = await prisma.user.findMany({
      where: WHERE,
      select: SELECT,
      orderBy: { email: 'asc' },
      take: take + 1,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    res.json({
      users: page.map(toDTO),
      nextCursor: hasMore ? page[page.length - 1].email : null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
