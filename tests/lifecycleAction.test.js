// ProductPort's lifecycle policy plugs for microport-auth's shared receiver
// (hubport#133). ProductPort is a universal/JIT app: role re-resolves from the
// SSO claim on every login, so grant/revoke persist NO role on an existing row —
// only the account-active flag flips (disable/reactivate) and the HubPort-owned
// fleetSuperuser flag syncs. A grant for an unknown email creates the row when
// its role maps. The pipeline itself (guard, dedup, claim, ordering) is tested
// in microport-auth; these cases cover what ProductPort owns.
'use strict';
const { decideUserUpdate, placeholderName, loadCurrent, applyLifecycle } = require('../src/lib/lifecycleAction');

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
  test('grant on a disabled user → re-enable', () => {
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
// an email with NO local row CREATES the row when the event's role maps.
// Unknown/absent role never creates.
describe('decideUserUpdate — create-on-grant (no local row)', () => {
  // mapRole-shaped test double: mirrors mapRole('productport', wire).
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

function makeDb({ count = 1, row = null } = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count }),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 99, ...data })),
    },
  };
}
const liveSignal = () => new AbortController().signal;
function abortedSignal() {
  const c = new AbortController();
  const reason = new Error('timed out'); reason.name = 'TimeoutError';
  c.abort(reason);
  return c.signal;
}
const mapRole = (wire) => (['viewer', 'product', 'product_admin'].includes(wire) ? wire : null);

describe('loadCurrent', () => {
  test('reads the columns the policy and the seq condition need, by the normalised email', async () => {
    const row = { id: 7, active: true, fleetSuperuser: false, lifecycleSeq: 3 };
    const db = makeDb({ row });
    await expect(loadCurrent(db, 'jane@microport.com', { signal: liveSignal() })).resolves.toBe(row);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'jane@microport.com' },
      select: { id: true, active: true, fleetSuperuser: true, lifecycleSeq: true },
    });
  });
  test('an aborted signal stops it before any query', async () => {
    const db = makeDb();
    await expect(loadCurrent(db, 'jane@microport.com', { signal: abortedSignal() }))
      .rejects.toMatchObject({ name: 'TimeoutError' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('applyLifecycle — existing user', () => {
  const active = { id: 7, active: true, fleetSuperuser: false, lifecycleSeq: null };
  const disable = { kind: 'disable', email: 'jane@microport.com' };

  test('a disable is written conditionally on senderSeq and stamps lifecycleSeq in the same statement', async () => {
    const db = makeDb();
    const out = await applyLifecycle(db, { event: disable, current: active, senderSeq: 42, signal: liveSignal(), mapRole });
    expect(out).toEqual({ kind: 'applied', changes: ['active'] });
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7, OR: [{ lifecycleSeq: null }, { lifecycleSeq: { lte: 42 } }] },
      data: { active: false, lifecycleSeq: 42 },
    });
  });

  test('a newer event already written (zero rows matched) → noop superseded, nothing overwritten', async () => {
    const db = makeDb({ count: 0 });
    const out = await applyLifecycle(db, { event: disable, current: { ...active, lifecycleSeq: 50 }, senderSeq: 42, signal: liveSignal(), mapRole });
    expect(out).toEqual({ kind: 'noop', reason: 'superseded' });
  });

  test('a noop decision still advances the watermark, so a late older event cannot undo it', async () => {
    const db = makeDb();
    const out = await applyLifecycle(db, {
      event: { kind: 'grant', email: 'jane@microport.com', newRole: 'product_admin' }, current: active, senderSeq: 9, signal: liveSignal(), mapRole,
    });
    expect(out).toEqual({ kind: 'noop', reason: 'already-active' });
    expect(db.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { active: true, lifecycleSeq: 9 } }));
    expect(db.user.create).not.toHaveBeenCalled();
  });

  test('a revoke never writes the active flag (universal app), only the watermark', async () => {
    const db = makeDb();
    const out = await applyLifecycle(db, { event: { kind: 'revoke', email: 'jane@microport.com' }, current: active, senderSeq: 11, signal: liveSignal(), mapRole });
    expect(out).toEqual({ kind: 'noop', reason: 'role-jit-on-login' });
    expect(db.user.updateMany.mock.calls[0][0].data).toEqual({ lifecycleSeq: 11 });
  });

  test('is idempotent: it writes absolute state, so a second run issues the identical statement', async () => {
    const db = makeDb();
    const args = { event: { ...disable, fleetSuperuser: true }, current: active, senderSeq: 42, signal: liveSignal(), mapRole };
    await applyLifecycle(db, args);
    await applyLifecycle(db, args);
    expect(db.user.updateMany.mock.calls[0]).toEqual(db.user.updateMany.mock.calls[1]);
    expect(db.user.updateMany.mock.calls[0][0].data).toEqual({ active: false, fleetSuperuser: true, lifecycleSeq: 42 });
  });

  test('an absent fleetSuperuser is never written (absent = no change)', async () => {
    const db = makeDb();
    await applyLifecycle(db, { event: disable, current: { ...active, fleetSuperuser: true }, senderSeq: 1, signal: liveSignal(), mapRole });
    expect(db.user.updateMany.mock.calls[0][0].data).not.toHaveProperty('fleetSuperuser');
  });

  test('unknown kind → skip, no write', async () => {
    const db = makeDb();
    const out = await applyLifecycle(db, { event: { kind: 'explode' }, current: active, senderSeq: 5, signal: liveSignal(), mapRole });
    expect(out).toEqual({ kind: 'skip', reason: 'unknown_kind' });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  test('an aborted signal stops it before the write', async () => {
    const db = makeDb();
    await expect(applyLifecycle(db, { event: disable, current: active, senderSeq: 42, signal: abortedSignal(), mapRole }))
      .rejects.toMatchObject({ name: 'TimeoutError' });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('applyLifecycle — no local user', () => {
  test('a grant with a mappable role creates the row, stamped with senderSeq and the flag', async () => {
    const db = makeDb();
    const out = await applyLifecycle(db, {
      event: { kind: 'grant', email: 'new.hire@microport.com', newRole: 'product_admin', fleetSuperuser: true },
      current: null, senderSeq: 5, signal: liveSignal(), mapRole,
    });
    expect(out).toEqual({ kind: 'applied', reason: 'created', changes: ['created'] });
    expect(db.user.create).toHaveBeenCalledWith({
      data: { email: 'new.hire@microport.com', name: 'new.hire', role: 'product_admin', fleetSuperuser: true, lifecycleSeq: 5 },
    });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  test('an unmappable role → noop, no write', async () => {
    const db = makeDb();
    const out = await applyLifecycle(db, {
      event: { kind: 'grant', email: 'x@microport.com', newRole: 'nope' }, current: null, senderSeq: 5, signal: liveSignal(), mapRole,
    });
    expect(out).toEqual({ kind: 'noop', reason: 'unmapped-role' });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  test('a disable → noop no-local-user, never creates', async () => {
    const db = makeDb();
    const out = await applyLifecycle(db, {
      event: { kind: 'disable', email: 'x@microport.com', newRole: 'viewer' }, current: null, senderSeq: 5, signal: liveSignal(), mapRole,
    });
    expect(out).toEqual({ kind: 'noop', reason: 'no-local-user' });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  test('a create that hits the unique index propagates, so the receiver releases the claim and HubPort retries', async () => {
    const db = makeDb();
    db.user.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    await expect(applyLifecycle(db, {
      event: { kind: 'grant', email: 'racer@microport.com', newRole: 'viewer' }, current: null, senderSeq: 5, signal: liveSignal(), mapRole,
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  test('an aborted signal stops it before the create', async () => {
    const db = makeDb();
    await expect(applyLifecycle(db, {
      event: { kind: 'grant', email: 'x@microport.com', newRole: 'viewer' }, current: null, senderSeq: 5, signal: abortedSignal(), mapRole,
    })).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
