// src/lib/lifecycleAction.js — pure policy for the SSO-lifecycle receiver.
//
// ProductPort is a UNIVERSAL / JIT app (see src/lib/resolveRole.js): every
// authenticated employee is at least a `viewer`, and the effective role is
// re-resolved from the SSO claim on EVERY login. So — unlike opsport/clinicport
// which persist role + soft-delete on grant/revoke — ProductPort persists NO
// role from a lifecycle event. The only local state a lifecycle event touches
// is the account-active flag, so an offboarded (disabled) employee loses access
// before their current access token expires instead of waiting it out.
//
//   grant / reactivate — if a local user exists but is disabled, re-enable it
//                        (this is also the reconciler's backfill path for
//                        "disabled locally but active on salesport" drift).
//                        Role is NOT written — it re-resolves JIT on next login.
//                        If NO local row exists and the event's role maps,
//                        CREATE the row (fleet decision, HubPort grant
//                        authority 2026-08-19): a hub grant used to be a noop
//                        here, leaving the user invisible to the census/state
//                        probes until first login. An unmappable/absent role
//                        never creates — same conservatism as the fleet's
//                        unknown-role skip (clinicport/opsport/reviewport).
//   revoke             — no-op. Losing the productport grant just drops the
//                        employee back to `viewer` on their next login; they're
//                        still an employee, so we don't deactivate.
//   disable            — deactivate the local user (active=false).
//
// Kept pure (no prisma/express) so the policy is unit-tested in isolation
// (tests/lifecycleAction.test.js); the route wires it to db.user.updateMany.
'use strict';

// decideUserUpdate(kind, existing, ctx) → one of:
//   { data: {...} }            — apply this partial update to the local User
//   { create: { role } }       — no local row: create one with this mapped role
//   { noop: true, reason }     — nothing to do (valid, expected)
//   { skip: true, reason }     — unrecognized event kind (audit row still logged)
// `existing` is { active } for the matched local user, or null if none.
// `ctx` (optional) carries { newRole, mapRole } — the event's wire role and a
// mapRole-shaped (wire) => enum | null mapper, injected so this stays pure
// (same pattern as resolveRole). Without ctx the no-row grant stays a noop.
function decideUserUpdate(kind, existing, ctx = {}) {
  switch (kind) {
    case 'disable':
      if (existing && existing.active !== false) return { data: { active: false } };
      return { noop: true, reason: existing ? 'already-disabled' : 'no-local-user' };

    case 'grant':
    case 'reactivate': {
      if (existing && existing.active === false) return { data: { active: true } };
      if (existing) return { noop: true, reason: 'already-active' };
      // No local row — create it when the granted role maps (fleet decision
      // 2026-08-19). Role IS written here (unlike the update paths above):
      // there is no row for JIT to re-resolve against yet, and sync-on-login
      // overwrites it from the SSO claim at first login anyway.
      const mapped = ctx.newRole && typeof ctx.mapRole === 'function' ? ctx.mapRole(ctx.newRole) : null;
      if (mapped) return { create: { role: mapped } };
      return { noop: true, reason: ctx.newRole ? 'unmapped-role' : 'no-local-user' };
    }

    case 'revoke':
      // Universal app — role drops to viewer JIT on next login; still an employee.
      return { noop: true, reason: 'role-jit-on-login' };

    default:
      return { skip: true, reason: 'unknown_kind' };
  }
}

// placeholderName(email) → the email local-part, or null. Lifecycle events
// carry NO name (email/kind/roles/actor only), so a row created on grant gets
// this placeholder; the JIT sync-on-login upsert (middleware/auth.js) writes
// `name: payload.name || undefined` on every request, backfilling the real
// name from the SSO claim at first login.
function placeholderName(email) {
  const local = String(email || '').split('@')[0].trim();
  return local || null;
}

// stateResponse(user) → the microport-contracts LifecycleStateResponse shape the
// salesport reconciler diffs. PP has no soft-delete column, so deletedAt is
// always null; `active` maps to the status string the reconciler compares.
function stateResponse(user) {
  if (!user) return { exists: false };
  return {
    exists: true,
    role: user.role,
    status: user.active ? 'active' : 'disabled',
    deletedAt: null,
  };
}

module.exports = { decideUserUpdate, stateResponse, placeholderName };
