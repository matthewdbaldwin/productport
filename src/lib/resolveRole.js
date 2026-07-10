// src/lib/resolveRole.js — ProductPort role resolution from SSO claims.
//
// ProductPort is a "universal" app: it is the single source of truth for all
// product information, so EVERY authenticated employee gets at least `viewer`.
// An explicit grant in the SSO claims (`app_roles.productport`) elevates to
// product / product_admin / superuser — and carrying that explicit grant is
// also what surfaces ProductPort in the SalesPort app-switcher, so only admins
// (who have the grant) see the tile, while everyone else still gets read access.
//
// Contrast the other satellites, which 403 when the grant is absent. Here a
// missing OR unrecognized grant defaults to viewer and NEVER denies — the token
// is still fully verified (sig/issuer/audience/session) upstream, so this only
// ever widens access to already-authenticated employees.
//
// Pure: the contracts mapRole is injected so it's testable in isolation
// (tests/resolveRole.test.js). The middleware passes the real mapRole.
'use strict';

const DEFAULT_ROLE = 'viewer';

// appRoles: the SSO claims' `app_roles` object (may be undefined/empty).
// mapFn:    mapRole-shaped (satellite, wireRole) => enum | null.
function resolveRole(appRoles, mapFn) {
  const wire = appRoles && appRoles.productport;
  if (wire) {
    const mapped = mapFn('productport', wire);
    if (mapped) return mapped;
  }
  return DEFAULT_ROLE;
}

// superuser is a LOCAL elevation (in the Role enum, deliberately absent from
// ssoGrantable in microport-contracts — "local-elevated, not SSO-granted").
// SSO claims never carry it, so the per-request JIT sync must never write the
// resolved role over an existing superuser — doing so silently demotes a
// deliberately-promoted user on their very next API call. Same guard as
// ReviewPort's syncReviewportUser (fixed 2026-07-06).
function preserveLocalElevation(existingRole, resolvedRole) {
  return existingRole === 'superuser' ? 'superuser' : resolvedRole;
}

module.exports = { resolveRole, preserveLocalElevation, DEFAULT_ROLE };
