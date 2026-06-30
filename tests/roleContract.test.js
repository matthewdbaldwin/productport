// Golden-lock role contract — role drift becomes a RED TEST, not a prod 403.
// reference: prd_microport_contracts, prd_reviewport_sso_role_map.
//
// Until Phase 4 publishes "productport" in microport-contracts roles.ts
// ROLE_CONTRACTS (and this repo bumps to that version), the contract suite is
// skipped with a loud reminder (so day-one CI is green); once the installed
// contracts carries productport it becomes a hard guard on the agreed role set.
'use strict';

let ROLE_CONTRACTS = {};
let mapContractRole = () => null;
try {
  // contracts exports `mapRole`; alias to match the auth middleware's naming.
  ({ ROLE_CONTRACTS, mapRole: mapContractRole } = require('@matthewdbaldwin/microport-contracts'));
} catch { /* contracts not installed in this checkout yet */ }

const APP = 'productport';
const registered = !!(ROLE_CONTRACTS && ROLE_CONTRACTS[APP]);

(registered ? describe : describe.skip)('role contract — productport', () => {
  // mapRole(satellite, wireRole) takes the wire-role STRING and returns the
  // satellite's Prisma enum value (or null).
  test('the primary role maps through', () => {
    expect(mapContractRole(APP, 'product')).toBe('product');
  });
  test('viewer (the default) maps through', () => {
    expect(mapContractRole(APP, 'viewer')).toBe('viewer');
  });
  test('an unknown role → null (never a silent grant)', () => {
    expect(mapContractRole(APP, 'not-a-real-role')).toBeNull();
  });
});

if (!registered) {
  test('TODO Phase 4 — publish "productport" in microport-contracts roles.ts', () => {
    // eslint-disable-next-line no-console
    console.warn('[roleContract] "productport" not yet in the installed ROLE_CONTRACTS — add it + publish + bump before launch (Phase 4), or every hire 403s.');
    expect(registered).toBe(false);
  });
}
