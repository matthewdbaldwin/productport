// ProductPort auth — an SSO spoke off the SalesPort hub.
//
// Hot path uses the shared, audited microport-auth verifier (RS256 + issuer +
// audience pinned, jti session lookup/revocation, SsoClaims contract check).
// Role resolution comes from the single microport-contracts map. The risky bits
// (token verify, session revocation, claims schema) are NOT reimplemented here.
// prd_canonical_auth_guard_lib, prd_microport_contracts, b1_phase4_satellite_cookie_migration.
'use strict';
const db = require('../lib/db');
const logger = require('../lib/logger');
const { createVerifier } = require('@matthewdbaldwin/microport-auth');
// contracts exports `mapRole`; alias to mapContractRole to match the fleet.
const { SsoClaims, mapRole: mapContractRole } = require('@matthewdbaldwin/microport-contracts');
const { resolveRole } = require('../lib/resolveRole');

const COOKIE_NAME = 'productport_token';
const AUDIENCE    = ['productport', 'microport-apps'];

const verify = createVerifier({
  publicKeyBase64: process.env.SALESPORT_JWT_PUBLIC_KEY,
  issuer:          process.env.SALESPORT_JWT_ISSUER,
  audience:        AUDIENCE,
  claimsSchema:    SsoClaims,
  // bake clean, then 'enforce'. Break-glass: SSO_CLAIMS_MODE=warn (or off).
  claimsMode:      process.env.SSO_CLAIMS_MODE || 'enforce',
});

async function requireAuth(req, res, next) {
  // Post-Phase-4: cookie is the source. Never `if (!token) return` short-circuit
  // that skips the cookie. feedback_phase4_cookie_vs_bearer_drift.
  const token = (req.cookies && req.cookies[COOKIE_NAME]) || null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let payload;
  try {
    payload = verify(token); // throws on bad sig/issuer/audience; claims per claimsMode
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }

  try {
    // jti-bearing tokens get a server-side session check (revocation).
    if (payload.jti) {
      const session = await db.session.findUnique({
        where: { jti: payload.jti },
        select: { id: true, revokedAt: true, expiresAt: true },
      });
      if (!session)             return res.status(401).json({ error: 'Session no longer valid. Please log in again.', code: 'SESSION_NOT_FOUND' });
      if (session.revokedAt)    return res.status(401).json({ error: 'Session has been revoked. Please log in again.', code: 'SESSION_REVOKED' });
      if (session.expiresAt < new Date()) return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
      req.sessionId = session.id;
    }

    // ProductPort is a UNIVERSAL app — every authenticated employee gets at
    // least `viewer` (it's the platform's source of truth for product info).
    // An explicit `app_roles.productport` grant elevates (and is what surfaces
    // ProductPort in the app-switcher, so only admins see the tile). A missing
    // or unknown grant defaults to viewer, never 403. The wire-role → enum map
    // is the ONE platform contract (mapRole takes the wire-role STRING).
    // feedback: resolveRole; NOTE the SalesPort handoff still gates on the grant
    // (universal-app hub change is the paired PRD item).
    const role = resolveRole(payload.app_roles, mapContractRole);

    // JIT-provision against this platform's own User table.
    const user = await db.user.upsert({
      where:  { email: payload.email },
      update: { name: payload.name || undefined, role },
      create: { email: payload.email, name: payload.name || null, role },
    });
    if (!user.active) return res.status(401).json({ error: 'Account not found or disabled' });

    req.user = {
      id: user.id, email: user.email, name: user.name, role: user.role,
      theme: payload.theme || null,
      locale: payload.locale || user.locale || null,
      appRoles: payload.app_roles || {},
      isSuperuser: !!payload.is_superuser,
    };
    return next();
  } catch (err) {
    logger.error({ err }, '[auth] provisioning failed');
    return res.status(500).json({ error: 'Login failed' });
  }
}

// Role gate helper.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, COOKIE_NAME, AUDIENCE };
