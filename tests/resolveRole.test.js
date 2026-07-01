// Behavior of ProductPort's role resolution from SSO claims.
// ProductPort is a "universal" app: every authenticated employee gets at least
// `viewer`, so a missing/unknown grant defaults to viewer rather than 403ing.
// An explicit grant (only admins carry one, which is also what surfaces the app
// in the SalesPort app-switcher) elevates. The map function is injected so this
// is a pure unit — the middleware passes the real microport-contracts mapRole.
'use strict';
const { resolveRole } = require('../src/lib/resolveRole');

// Stand-in for microport-contracts mapRole('productport', wireRole): identity
// for known productport roles, user→viewer, null for anything unknown.
const fakeMap = (_app, wire) => {
  const table = { viewer: 'viewer', product: 'product', product_admin: 'product_admin', superuser: 'superuser', user: 'viewer' };
  return table[wire] ?? null;
};

describe('resolveRole — ProductPort universal viewer default', () => {
  test('no app_roles at all → viewer', () => {
    expect(resolveRole(undefined, fakeMap)).toBe('viewer');
    expect(resolveRole({}, fakeMap)).toBe('viewer');
  });

  test('has other app grants but not productport → viewer', () => {
    expect(resolveRole({ salesport: 'admin', opsport: 'viewer' }, fakeMap)).toBe('viewer');
  });

  test('explicit productport grant elevates to the mapped role', () => {
    expect(resolveRole({ productport: 'product_admin' }, fakeMap)).toBe('product_admin');
    expect(resolveRole({ productport: 'superuser' }, fakeMap)).toBe('superuser');
    expect(resolveRole({ productport: 'product' }, fakeMap)).toBe('product');
  });

  test('explicit productport viewer grant stays viewer', () => {
    expect(resolveRole({ productport: 'viewer' }, fakeMap)).toBe('viewer');
  });

  test('legacy "user" wire role maps to viewer', () => {
    expect(resolveRole({ productport: 'user' }, fakeMap)).toBe('viewer');
  });

  test('unknown/garbage productport wire role falls back to viewer, never denies', () => {
    expect(resolveRole({ productport: 'wizard' }, fakeMap)).toBe('viewer');
    expect(resolveRole({ productport: '' }, fakeMap)).toBe('viewer');
  });

  test('never returns null/undefined — an authenticated employee always gets a role', () => {
    for (const roles of [undefined, {}, { productport: 'x' }, { productport: 'viewer' }, { other: 'y' }]) {
      expect(typeof resolveRole(roles, fakeMap)).toBe('string');
    }
  });
});
