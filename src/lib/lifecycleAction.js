// src/lib/lifecycleAction.js — ProductPort's plugs for microport-auth's shared
// lifecycle receiver (createLifecycleReceiver, hubport#133).
//
// ProductPort is a UNIVERSAL / JIT app (see src/lib/resolveRole.js): every
// authenticated employee is at least a `viewer`, and the effective role is
// re-resolved from the SSO claim on EVERY login. So — unlike opsport/clinicport
// which persist role + soft-delete on grant/revoke — ProductPort persists NO
// role from a lifecycle event on an existing row. The local state an event
// touches is the account-active flag and the HubPort-owned fleetSuperuser flag,
// so an offboarded (disabled) employee loses access before their current access
// token expires instead of waiting it out.
//
//   grant / reactivate — if a local user exists but is disabled, re-enable it.
//                        Role is NOT written — it re-resolves JIT on next login.
//                        If NO local row exists and the event's role maps,
//                        CREATE the row (fleet decision, HubPort grant
//                        authority 2026-08-19): a hub grant used to be a noop
//                        here, leaving the user invisible to the census probe
//                        until first login. An unmappable/absent role never
//                        creates — same conservatism as the fleet's
//                        unknown-role skip (clinicport/opsport/reviewport).
//   revoke             — no-op on the active flag. Losing the productport grant
//                        just drops the employee back to `viewer` on their next
//                        login; they're still an employee, so we don't deactivate.
//   disable            — deactivate the local user (active=false).
//
// decideUserUpdate and placeholderName are pure (tests/lifecycleAction.test.js).
// loadCurrent and applyLifecycle take the Prisma client as their first argument
// so the route can inject it lazily.
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
//
// fleetSuperuser (productport#11, hubport#88): HubPort stamps the user's CURRENT
// flag on every lifecycle event, whatever kind. `ctx.fleetSuperuser` is written
// onto an existing row on EVERY kind when it differs, alongside (never instead
// of) the active-flag policy above. An ABSENT value (an emitter that predates the
// field) means "no change", never false, per the contracts LifecycleEvent note.
function decideUserUpdate(kind, existing, ctx = {}) {
  const flag = typeof ctx.fleetSuperuser === 'boolean' ? ctx.fleetSuperuser : undefined;
  const flagPatch = existing && flag !== undefined && existing.fleetSuperuser !== flag
    ? { fleetSuperuser: flag } : {};
  const withFlag = (active, noop) => {
    const data = { ...active, ...flagPatch };
    return Object.keys(data).length ? { data } : noop;
  };

  switch (kind) {
    case 'disable':
      if (existing && existing.active !== false) return withFlag({ active: false });
      return withFlag({}, { noop: true, reason: existing ? 'already-disabled' : 'no-local-user' });

    case 'grant':
    case 'reactivate': {
      if (existing && existing.active === false) return withFlag({ active: true });
      if (existing) return withFlag({}, { noop: true, reason: 'already-active' });
      // No local row — create it when the granted role maps (fleet decision
      // 2026-08-19). Role IS written here (unlike the update paths above):
      // there is no row for JIT to re-resolve against yet, and sync-on-login
      // overwrites it from the SSO claim at first login anyway.
      const mapped = ctx.newRole && typeof ctx.mapRole === 'function' ? ctx.mapRole(ctx.newRole) : null;
      if (mapped) return { create: { role: mapped, ...(flag !== undefined ? { fleetSuperuser: flag } : {}) } };
      return { noop: true, reason: ctx.newRole ? 'unmapped-role' : 'no-local-user' };
    }

    case 'revoke':
      // Universal app — role drops to viewer JIT on next login; still an employee.
      // The flag is still synced: it is independent of the productport grant.
      return withFlag({}, { noop: true, reason: 'role-jit-on-login' });

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

// Neither Prisma call accepts an AbortSignal, so both plugs check it before
// touching the DB, and every statement is bounded by db.js's statement_timeout
// (30s default), below the receiver's 60s applyTimeoutMs.
function throwIfAborted(signal) {
  if (signal && signal.aborted) throw signal.reason;
}

// loadCurrent(db, email, { signal }) → the local user row the policy reads, or
// null. The receiver hands over the email already lowercased and trimmed.
async function loadCurrent(db, email, { signal } = {}) {
  throwIfAborted(signal);
  return db.user.findUnique({
    where: { email },
    select: { id: true, active: true, fleetSuperuser: true, lifecycleSeq: true },
  });
}

// applyLifecycle(db, { event, current, senderSeq, signal, mapRole }) → receiver Outcome.
//
// The receiver's hard requirements for an apply plug (kevlar round 2):
//  1. Conditional on senderSeq. An update lands only where the row's
//     lifecycleSeq is null or not newer than this event's, and it stamps
//     lifecycleSeq in the same statement. A zero count means a newer event has
//     already been written, so this one must not overwrite it. `lte` rather than
//     `lt` lets a retry of this same event rewrite identical values. A created
//     row is stamped with this event's senderSeq.
//  2. Honours the signal (checked before each write) and the statement timeout.
//  3. Idempotent: it writes the event's absolute state ("active = X"), never a
//     delta. A retry after a successful create finds the row and takes the
//     conditional update, which writes the same values.
//
// An existing row is written even when decideUserUpdate says noop, so the
// watermark still advances: otherwise a late older event could overwrite the
// state a newer no-op event confirmed.
//
// Create-on-grant can race a first login's JIT upsert on the email's unique
// index. That create throws (P2002); the receiver releases the claim and
// answers 500, and HubPort's retry finds the row and updates it instead.
async function applyLifecycle(db, { event, current, senderSeq, signal, mapRole }) {
  throwIfAborted(signal);
  const decision = decideUserUpdate(event.kind, current, {
    newRole: event.newRole,
    mapRole,
    fleetSuperuser: event.fleetSuperuser,
  });
  if (decision.skip) return { kind: 'skip', reason: decision.reason };

  if (!current) {
    if (!decision.create) return { kind: 'noop', reason: decision.reason };
    const { role, fleetSuperuser } = decision.create;
    throwIfAborted(signal);
    await db.user.create({
      data: {
        email: event.email, name: placeholderName(event.email), role,
        ...(fleetSuperuser !== undefined ? { fleetSuperuser } : {}),
        lifecycleSeq: senderSeq,
      },
    });
    return { kind: 'applied', reason: 'created', changes: ['created'] };
  }

  const data = { lifecycleSeq: senderSeq };
  if (event.kind === 'disable') data.active = false;
  if (event.kind === 'grant' || event.kind === 'reactivate') data.active = true;
  if (typeof event.fleetSuperuser === 'boolean') data.fleetSuperuser = event.fleetSuperuser;

  throwIfAborted(signal);
  const result = await db.user.updateMany({
    where: { id: current.id, OR: [{ lifecycleSeq: null }, { lifecycleSeq: { lte: senderSeq } }] },
    data,
  });
  if (result.count === 0) return { kind: 'noop', reason: 'superseded' };
  if (decision.noop) return { kind: 'noop', reason: decision.reason };
  return { kind: 'applied', changes: Object.keys(decision.data) };
}

module.exports = { decideUserUpdate, placeholderName, loadCurrent, applyLifecycle };
