// src/lib/clearanceStatus.js — clearance word → ClearanceStatus enum.
//
// The standalone ProductPort Builder emitted regulatory state as free-text
// words ("cleared", "in progress", …) in the seed CSV's per-region columns.
// This module is the single mapping from those words to the Prisma
// `ClearanceStatus` enum, so the live catalog's market badges match the offline
// HTML exactly. Pure + deep: one tiny interface, the whole word-normalization
// vocabulary behind it. Tested in tests/clearanceStatus.test.js.
'use strict';

// The Prisma ClearanceStatus enum, mirrored here so the mapping's output set is
// self-describing (and assertable in tests). Keep in sync with prisma/schema.prisma.
const CLEARANCE_STATUSES = ['APPROVED', 'IN_PROGRESS', 'SUBMITTED', 'NOT_APPROVED', 'NONE'];

// Builder CSV word → enum. Mirrors the Builder's MK_FROM_WORD map.
const STATUS_FROM_WORD = {
  cleared: 'APPROVED',
  approved: 'APPROVED',
  'in progress': 'IN_PROGRESS',
  in_progress: 'IN_PROGRESS',
  submitted: 'SUBMITTED',
  'not cleared': 'NOT_APPROVED',
  not_approved: 'NOT_APPROVED',
  '': 'NONE',
  none: 'NONE',
};

// Normalize a raw clearance word to the enum. Unknown / blank / nullish → NONE
// (a device is "not stated" rather than crashing the import).
function clearanceStatus(word) {
  return STATUS_FROM_WORD[(word || '').trim().toLowerCase()] ?? 'NONE';
}

module.exports = { clearanceStatus, CLEARANCE_STATUSES, STATUS_FROM_WORD };
