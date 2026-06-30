// Behavior of the clearance word → ClearanceStatus enum mapping.
// This is the logic that decides what regulatory badge each product shows in
// every market; a wrong mapping silently mislabels a device's clearance state,
// so it gets first-class coverage (it shipped untested in P1 — the bug class
// feedback_substantial_builds_default_to_tdd was written for).
'use strict';
const { clearanceStatus, CLEARANCE_STATUSES } = require('../src/lib/clearanceStatus');

describe('clearanceStatus — Builder CSV word → enum', () => {
  test('"cleared" and "approved" both map to APPROVED', () => {
    expect(clearanceStatus('cleared')).toBe('APPROVED');
    expect(clearanceStatus('approved')).toBe('APPROVED');
  });

  test('"in progress" (spaced) and "in_progress" (underscored) map to IN_PROGRESS', () => {
    expect(clearanceStatus('in progress')).toBe('IN_PROGRESS');
    expect(clearanceStatus('in_progress')).toBe('IN_PROGRESS');
  });

  test('"submitted" maps to SUBMITTED', () => {
    expect(clearanceStatus('submitted')).toBe('SUBMITTED');
  });

  test('"not cleared" / "not_approved" map to NOT_APPROVED', () => {
    expect(clearanceStatus('not cleared')).toBe('NOT_APPROVED');
    expect(clearanceStatus('not_approved')).toBe('NOT_APPROVED');
  });

  test('blank, "none", null and undefined all map to NONE', () => {
    expect(clearanceStatus('')).toBe('NONE');
    expect(clearanceStatus('none')).toBe('NONE');
    expect(clearanceStatus(null)).toBe('NONE');
    expect(clearanceStatus(undefined)).toBe('NONE');
  });

  test('is case-insensitive and trims surrounding whitespace', () => {
    expect(clearanceStatus('  Cleared  ')).toBe('APPROVED');
    expect(clearanceStatus('IN PROGRESS')).toBe('IN_PROGRESS');
  });

  test('an unrecognized word falls back to NONE rather than throwing', () => {
    expect(clearanceStatus('pending-review')).toBe('NONE');
    expect(clearanceStatus('🤷')).toBe('NONE');
  });

  test('every produced value is a member of the published enum set', () => {
    for (const word of ['cleared', 'in progress', 'submitted', 'not cleared', '', 'garbage']) {
      expect(CLEARANCE_STATUSES).toContain(clearanceStatus(word));
    }
  });
});
