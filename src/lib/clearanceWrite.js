// src/lib/clearanceWrite.js — admin clearance-matrix write validator/normalizer.
//
// The PUT /:slug/clearances route stays thin over this: it turns the editor's
// per-region matrix payload into clean RegulatoryClearance rows, or throws a
// field-tagged Error the route maps to 400 { error, details }. Mirrors
// productWrite.js. status → ClearanceStatus (blank defaults to NONE); qualifier →
// the clearanceQualifier vocabulary (or null); certificateNumbers/notes trimmed +
// length-capped. Only the 5 canonical regions, each at most once. The whole
// matrix is replaced by the caller (delete + recreate), so an omitted region
// means "no row for that region". Pure; tested in tests/clearanceWrite.test.js.
'use strict';
const { REGIONS, blankToNull } = require('./productRow');
const { CLEARANCE_STATUSES } = require('./clearanceStatus');
const { isQualifier, CLEARANCE_QUALIFIERS } = require('./clearanceQualifier');

const CERT_MAX = 1000;
const NOTES_MAX = 2000;
const REGION_SET = new Set(REGIONS);
const STATUS_SET = new Set(CLEARANCE_STATUSES);

function fieldError(field, message) {
  const e = new Error(message);
  e.field = field;
  return e;
}

function validateClearanceMatrix(input) {
  const list = input && Array.isArray(input.clearances) ? input.clearances : null;
  if (!list) throw new Error('missing clearances array');

  const seen = new Set();
  const rows = list.map((c, i) => {
    const at = `clearances[${i}]`;
    const region = (c && c.region != null ? String(c.region) : '').trim();
    if (!REGION_SET.has(region)) {
      throw fieldError(`${at}.region`, `invalid region "${region}" (expected one of: ${REGIONS.join(', ')})`);
    }
    if (seen.has(region)) throw fieldError(`${at}.region`, `duplicate region "${region}"`);
    seen.add(region);

    let status = (c.status != null ? String(c.status) : '').trim();
    if (status === '') status = 'NONE';
    if (!STATUS_SET.has(status)) {
      throw fieldError(`${at}.status`, `invalid status "${status}" (expected one of: ${CLEARANCE_STATUSES.join(', ')})`);
    }

    const qualifier = blankToNull(c.qualifier);
    if (qualifier && !isQualifier(qualifier)) {
      throw fieldError(`${at}.qualifier`, `invalid qualifier "${qualifier}" (expected one of: ${CLEARANCE_QUALIFIERS.join(', ')})`);
    }
    const certificateNumbers = blankToNull(c.certificateNumbers);
    if (certificateNumbers && certificateNumbers.length > CERT_MAX) {
      throw fieldError(`${at}.certificateNumbers`, `certificateNumbers too long (max ${CERT_MAX})`);
    }
    const notes = blankToNull(c.notes);
    if (notes && notes.length > NOTES_MAX) {
      throw fieldError(`${at}.notes`, `notes too long (max ${NOTES_MAX})`);
    }

    return { region, status, certificateNumbers, qualifier, notes };
  });

  return { rows };
}

module.exports = { validateClearanceMatrix, CERT_MAX, NOTES_MAX };
