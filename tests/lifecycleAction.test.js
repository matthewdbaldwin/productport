// Pure decision logic for the SSO-lifecycle receiver. ProductPort is a
// universal/JIT app: role re-resolves from the SSO claim on every login, so
// grant/revoke persist NO role locally — only the account-active flag flips
// (disable/reactivate), so an offboarded user loses access before their access
// token expires. These functions encode exactly that policy, in isolation.
'use strict';
const { decideUserUpdate, stateResponse, placeholderName } = require('../src/lib/lifecycleAction');

describe('decideUserUpdate', () => {
  test('disable on an active user → deactivate', () => {
    expect(decideUserUpdate('disable', { active: true })).toEqual({ data: { active: false } });
  });
  test('disable on an already-disabled user → noop', () => {
    expect(decideUserUpdate('disable', { active: false }).noop).toBe(true);
  });
  test('disable with no local user → noop (nothing to disable)', () => {
    expect(decideUserUpdate('disable', null).noop).toBe(true);
  });

  test('reactivate on a disabled user → re-enable', () => {
    expect(decideUserUpdate('reactivate', { active: false })).toEqual({ data: { active: true } });
  });
  test('grant on a disabled user → re-enable (reconciler backfill path)', () => {
    // salesport emits `grant` to correct disabled-but-should-be-active drift.
    expect(decideUserUpdate('grant', { active: false })).toEqual({ data: { active: true } });
  });
  test('grant on an active user → noop (role handled JIT on next login)', () => {
    expect(decideUserUpdate('grant', { active: true }).noop).toBe(true);
  });
  test('grant with no local user and no role context → noop (legacy call shape)', () => {
    expect(decideUserUpdate('grant', null).noop).toBe(true);
  });

  test('revoke → noop (universal app: user drops to viewer JIT, stays an employee)', () => {
    expect(decideUserUpdate('revoke', { active: true }).noop).toBe(true);
  });

  test('unknown kind → skip', () => {
    expect(decideUserUpdate('explode', { active: true }).skip).toBe(true);
  });
});

// Fleet decision (HubPort grant authority, 2026-08-19): a grant/reactivate for
// an email with NO local row CREATES the row when the event's role maps —
// previously a noop, which left HubPort-granted users invisible to the census/
// state probes until their first login. Unknown/absent role never creates.
describe('decideUserUpdate — create-on-grant (no local row)', () => {
  // mapRole-shaped test double: mirrors mapContractRole('productport', wire).
  const map = (wire) => (['viewer', 'product', 'product_admin'].includes(wire) ? wire : null);

  test('grant with no local user and a mappable newRole → create with the mapped role', () => {
    expect(decideUserUpdate('grant', null, { newRole: 'product_admin', mapRole: map }))
      .toEqual({ create: { role: 'product_admin' } });
  });
  test('reactivate with no local user and a mappable newRole → create (same fleet path)', () => {
    expect(decideUserUpdate('reactivate', null, { newRole: 'viewer', mapRole: map }))
      .toEqual({ create: { role: 'viewer' } });
  });
  test('grant with no local user and an unmappable newRole → noop, never create', () => {
    const d = decideUserUpdate('grant', null, { newRole: 'not-a-real-role', mapRole: map });
    expect(d.noop).toBe(true);
    expect(d.create).toBeUndefined();
  });
  test('grant with no local user and no newRole at all → noop', () => {
    const d = decideUserUpdate('grant', null, { newRole: null, mapRole: map });
    expect(d.noop).toBe(true);
    expect(d.create).toBeUndefined();
  });
  test('grant on an EXISTING active user stays a noop even with a mappable role (role is JIT)', () => {
    const d = decideUserUpdate('grant', { active: true }, { newRole: 'product_admin', mapRole: map });
    expect(d.noop).toBe(true);
    expect(d.create).toBeUndefined();
  });
  test('grant on an EXISTING disabled user still re-enables, never re-creates', () => {
    expect(decideUserUpdate('grant', { active: false }, { newRole: 'product_admin', mapRole: map }))
      .toEqual({ data: { active: true } });
  });
});

describe('placeholderName', () => {
  test('derives the email local-part (lifecycle events carry no name)', () => {
    expect(placeholderName('new.hire@microport.com')).toBe('new.hire');
  });
  test('null for a nameless local-part', () => {
    expect(placeholderName('@microport.com')).toBeNull();
  });
});

describe('stateResponse', () => {
  test('no user → exists:false', () => {
    expect(stateResponse(null)).toEqual({ exists: false });
  });
  test('active user → exists + role + status active + deletedAt null', () => {
    // Shape must satisfy microport-contracts LifecycleStateResponse so the
    // salesport reconciler can diff it. PP has no soft-delete, so deletedAt is
    // always null; active maps to the status string the reconciler compares.
    expect(stateResponse({ role: 'product_admin', active: true }))
      .toEqual({ exists: true, role: 'product_admin', status: 'active', deletedAt: null });
  });
  test('disabled user → status disabled', () => {
    expect(stateResponse({ role: 'viewer', active: false }))
      .toEqual({ exists: true, role: 'viewer', status: 'disabled', deletedAt: null });
  });
});
