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
const { resolveRole, preserveLocalElevation } = require('../lib/resolveRole');

const COOKIE_NAME = 'productport_token';
const AUDIENCE    = ['productport', 'microport-apps'];

// microport-auth's createVerifier takes `publicKey` (a decoded PEM), pins RS256
// + issuer at config time, and requires `audience` to be passed AT THE VERIFY
// CALL (not config). SALESPORT_JWT_PUBLIC_KEY is a base64-encoded PEM, so decode
// it. (Matches clinicport; the earlier `publicKeyBase64`/config-audience wiring
// threw "audience is required" on every request → 401 loop.)
const SALESPORT_PUBLIC_KEY = process.env.SALESPORT_JWT_PUBLIC_KEY
  ? Buffer.from(process.env.SALESPORT_JWT_PUBLIC_KEY, 'base64').toString('utf8')
  : undefined;
// Dual-key (HubPort extraction Slice 1): an OPTIONAL second verification key.
// Unset today → byte-identical single-key behavior (the lib filters blank keys).
// Fills with the HubPort public key at Slice 3 so this app accepts HubPort-signed
// tokens during the issuer flip, without a synchronized all-fleet redeploy.
const SALESPORT_PUBLIC_KEY_B = process.env.SALESPORT_JWT_PUBLIC_KEY_B
  ? Buffer.from(process.env.SALESPORT_JWT_PUBLIC_KEY_B, 'base64').toString('utf8')
  : '';

const verify = createVerifier({
  publicKey:    SALESPORT_PUBLIC_KEY,
  issuer:       process.env.SALESPORT_JWT_ISSUER,
  additionalKeys: [{ publicKey: SALESPORT_PUBLIC_KEY_B }], // HubPort Slice 1 — empty until Slice 3
  claimsSchema: SsoClaims,
  // bake clean, then 'enforce'. Break-glass: SSO_CLAIMS_MODE=warn (or off).
  claimsMode:   process.env.SSO_CLAIMS_MODE || 'enforce',
});

async function requireAuth(req, res, next) {
  // Post-Phase-4: cookie is the source. Never `if (!token) return` short-circuit
  // that skips the cookie. feedback_phase4_cookie_vs_bearer_drift.
  const token = (req.cookies && req.cookies[COOKIE_NAME]) || null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let payload;
  try {
    payload = verify(token, { audience: AUDIENCE }); // throws on bad sig/issuer/audience; claims per claimsMode
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

    // JIT-provision against this platform's own User table. locale rides the
    // SSO claim (sp is source of truth); absent → leave the stored value alone
    // (apple 2026-07-03 — locale was never persisted at all before this).
    // Pre-read the existing role: superuser is a LOCAL elevation SSO never
    // carries, and this sync runs on EVERY request — without the guard a
    // promoted superuser is demoted back to viewer on their next call.
    const existing = await db.user.findUnique({
      where:  { email: payload.email },
      select: { role: true },
    });
    const nextRole = preserveLocalElevation(existing?.role, role);
    const user = await db.user.upsert({
      where:  { email: payload.email },
      update: { name: payload.name || undefined, role: nextRole, locale: payload.locale || undefined },
      create: { email: payload.email, name: payload.name || null, role, locale: payload.locale || undefined },
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

// Catalog-write gate: product_admin / superuser role OR the platform is_superuser
// flag (a platform superuser without an explicit productport grant resolves to
// role=viewer, so role alone would wrongly block them). Used by the editor +
// CSV import/export routes.
function requireProductAdmin(req, res, next) {
  const u = req.user;
  if (u && (u.role === 'product_admin' || u.role === 'superuser' || u.isSuperuser)) {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden — ProductPort admin only' });
}

module.exports = { requireAuth, requireRole, requireProductAdmin, COOKIE_NAME, AUDIENCE };
