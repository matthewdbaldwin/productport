// src/lib/clearanceQualifier.js — the validity-qualifier vocabulary for a
// regulatory clearance. A device can be "cleared" yet carry a caveat the
// ClearanceStatus enum can't express ("CE invalid", "CMD-only not CE MDR",
// "agent product", "not approved yet", "recently approved"). Rather than rebuild
// the Postgres enum (feedback_postgres_enum_rebuild), the qualifier is an
// app-validated free-string — same pattern as therapeuticAreas.js — stored in
// RegulatoryClearance.qualifier; null = no caveat. WS3 may extend this list; a
// new value is one array entry (no migration). Tested in tests/clearanceQualifier.test.js.
'use strict';

// v1 vocabulary (Endovastec POC review, 2026-07-14). Canonical tokens — the CSV
// (<region>_qualifier) and the admin dropdown use these exact strings.
const CLEARANCE_QUALIFIERS = ['CMD-only', 'CE-invalid', 'agent', 'pending', 'recently-approved'];

const QUALIFIER_SET = new Set(CLEARANCE_QUALIFIERS);

// True only for a canonical token (trimmed); false for blank / unknown / non-string.
function isQualifier(v) {
  return QUALIFIER_SET.has((v == null ? '' : String(v)).trim());
}

module.exports = { CLEARANCE_QUALIFIERS, isQualifier };
