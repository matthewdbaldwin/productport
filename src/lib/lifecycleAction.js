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
//   revoke             — no-op. Losing the productport grant just drops the
//                        employee back to `viewer` on their next login; they're
//                        still an employee, so we don't deactivate.
//   disable            — deactivate the local user (active=false).
//
// Kept pure (no prisma/express) so the policy is unit-tested in isolation
// (tests/lifecycleAction.test.js); the route wires it to db.user.updateMany.
'use strict';

// decideUserUpdate(kind, existing) → one of:
//   { data: {...} }            — apply this partial update to the local User
//   { noop: true, reason }     — nothing to do (valid, expected)
//   { skip: true, reason }     — unrecognized event kind (audit row still logged)
// `existing` is { active } for the matched local user, or null if none.
function decideUserUpdate(kind, existing) {
  switch (kind) {
    case 'disable':
      if (existing && existing.active !== false) return { data: { active: false } };
      return { noop: true, reason: existing ? 'already-disabled' : 'no-local-user' };

    case 'grant':
    case 'reactivate':
      if (existing && existing.active === false) return { data: { active: true } };
      return { noop: true, reason: existing ? 'already-active' : 'no-local-user' };

    case 'revoke':
      // Universal app — role drops to viewer JIT on next login; still an employee.
      return { noop: true, reason: 'role-jit-on-login' };

    default:
      return { skip: true, reason: 'unknown_kind' };
  }
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

module.exports = { decideUserUpdate, stateResponse };
