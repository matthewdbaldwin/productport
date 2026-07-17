// Controlled-vocabulary contract coherence — ProductPort is the canonical
// catalog, so it pins the shared vocabulary here (contracts v0.10.0 vocabulary
// module, Phase 2 of prd_product_master_data). Two guarantees:
//
//   1. CLEARANCE_STATUSES deep-equals the `ClearanceStatus` enum declared in
//      prisma/schema.prisma — the STRONG check. The contract declares a mirror
//      of PP's enum; this proves that mirror can never silently drift from the
//      schema the DB actually enforces. (This assertion can only run here — the
//      contracts package can't read PP's schema.) We parse the schema SOURCE
//      rather than require('@prisma/client'): PP's suite never imports the
//      generated client, which exists only after `prisma generate` and so
//      throws "Cannot find module '.prisma/client/default'" in CI's fresh
//      install (the Prisma-7 bare-client trap, feedback_prisma7_bare_client_trap).
//      The schema is the source of truth the client is generated FROM, so
//      parsing it gives the same guarantee, CI-safe.
//   2. THERAPEUTIC_AREAS is golden-pinned to the exact canonical 10, so a
//      contract-side edit that drifts the catalog's areas becomes a RED TEST
//      here, not a silently-changed filter.
//
// Skip-if-stale convention (matches productHierarchyContract.test.js): if the
// installed contract predates the vocabulary module (<0.10.0), skip loudly so a
// stale checkout stays green rather than erroring.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { THERAPEUTIC_AREAS: LOCAL_AREAS } = require('../src/lib/therapeuticAreas');

// Read an enum's members, in declared order, from the Prisma schema SOURCE.
function prismaEnumMembers(enumName) {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const block = new RegExp(`enum\\s+${enumName}\\s*\\{([^}]*)\\}`).exec(schema);
  if (!block) throw new Error(`enum ${enumName} not found in prisma/schema.prisma`);
  return block[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim()) // drop trailing // comments
    .filter(Boolean);
}

const SCHEMA_CLEARANCE_STATUSES = prismaEnumMembers('ClearanceStatus');

let contracts = {};
try {
  contracts = require('@matthewdbaldwin/microport-contracts');
} catch { /* contracts not installed in this checkout yet */ }

const {
  THERAPEUTIC_AREAS,
  CLEARANCE_STATUSES,
  CLEARANCE_REGIONS,
  isClearanceStatus,
  vocabularyErrors,
} = contracts;

const available = Array.isArray(THERAPEUTIC_AREAS) && Array.isArray(CLEARANCE_STATUSES);

const CANONICAL_10 = [
  'Coronary and Structural Heart',
  'Heart Failure and Electrophysiology',
  'Aortic and Peripheral Vasculature',
  'Robotic Surgery, AI, and Telesurgery',
  'Neurovascular and Brain-Computer Interfaces',
  'Orthopedic Joint, Spine, and Trauma',
  'Urology, Oncology, and Gastroenterology',
  'Emergency and Critical Care',
  'Endocrinology and Reproductive Health',
  'Regenerative Medicine and Medical Aesthetics',
];

(available ? describe : describe.skip)('vocabulary contract — productport', () => {
  test('CLEARANCE_STATUSES deep-equals the schema-declared ClearanceStatus enum', () => {
    // The strong drift guard: contract mirror ⇔ schema-enforced enum, order included.
    expect(CLEARANCE_STATUSES).toEqual(SCHEMA_CLEARANCE_STATUSES);
  });

  test('every schema-declared enum value is accepted by isClearanceStatus', () => {
    for (const status of SCHEMA_CLEARANCE_STATUSES) {
      expect(isClearanceStatus(status)).toBe(true);
    }
  });

  test('THERAPEUTIC_AREAS is the golden canonical 10 (order included)', () => {
    expect(THERAPEUTIC_AREAS).toEqual(CANONICAL_10);
  });

  test('the local therapeuticAreas module re-exports the contract (one definition)', () => {
    // Phase 2: src/lib/therapeuticAreas.js sources its list from the contract,
    // so the two are literally the same array — no fleet-wide drift surface.
    expect(LOCAL_AREAS).toEqual(THERAPEUTIC_AREAS);
  });

  test('CLEARANCE_REGIONS matches the regions the import/serialize path uses', () => {
    expect(CLEARANCE_REGIONS).toEqual(['FDA', 'CE', 'NMPA', 'PMDA', 'TGA']);
  });

  test('the catalog therapeutic areas are a clean subset of the contract', () => {
    // vocabularyErrors is the adopter subset assertion; PP defines the canon, so
    // its own list must trivially be a subset (zero drift).
    expect(vocabularyErrors(LOCAL_AREAS, THERAPEUTIC_AREAS)).toEqual([]);
  });
});

if (!available) {
  // eslint-disable-next-line no-console
  console.warn('[vocabularyContract.test] installed microport-contracts lacks the vocabulary module (<0.10.0) — contract suite SKIPPED. Bump the dep.');
}
