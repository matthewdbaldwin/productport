// Behavior of the admin-editor write validator/normalizer. This is the gate the
// create/update routes lean on: required fields on create, enum membership for
// tier/classification/status, length caps, blank→null. A bad payload becomes a
// precise Error (surfaced as a 400), not a silent bad row. Pure; the routes stay
// thin over it. Unlike parseProductRow (CSV words → enums), this takes the form
// payload where enums arrive as their canonical values.
'use strict';
const { validateProductWrite } = require('../src/lib/productWrite');

const good = (o = {}) => ({ slug: 'firehawk', name: 'Firehawk', subsidiary: 'MicroPort Cardiovascular', therapeuticArea: 'Coronary', ...o });

describe('validateProductWrite — create (partial=false)', () => {
  test('accepts a minimal valid product and defaults status to ACTIVE', () => {
    const { data } = validateProductWrite(good());
    expect(data.slug).toBe('firehawk');
    expect(data.name).toBe('Firehawk');
    expect(data.status).toBe('ACTIVE');
  });

  test('throws on missing required fields', () => {
    expect(() => validateProductWrite(good({ slug: '' }))).toThrow(/slug/i);
    expect(() => validateProductWrite(good({ name: '  ' }))).toThrow(/name/i);
    expect(() => validateProductWrite(good({ subsidiary: '' }))).toThrow(/subsidiary/i);
    expect(() => validateProductWrite(good({ therapeuticArea: '' }))).toThrow(/therapeutic/i);
  });

  test('rejects a slug that is not url-safe', () => {
    expect(() => validateProductWrite(good({ slug: 'Fire Hawk!' }))).toThrow(/slug/i);
  });

  test('trims strings and coerces blank optionals to null', () => {
    const { data } = validateProductWrite(good({ name: '  Firehawk  ', tagline: '   ', category: ' DES ' }));
    expect(data.name).toBe('Firehawk');
    expect(data.tagline).toBeNull();
    expect(data.category).toBe('DES');
  });
});

describe('validateProductWrite — enums', () => {
  test('accepts valid tier / classification / status; passes null through', () => {
    const { data } = validateProductWrite(good({ tier: 'TIER1', classification: 'CORE', status: 'DRAFT' }));
    expect(data.tier).toBe('TIER1');
    expect(data.classification).toBe('CORE');
    expect(data.status).toBe('DRAFT');
    expect(validateProductWrite(good({ tier: null })).data.tier).toBeNull();
  });

  test('rejects out-of-enum tier / classification / status', () => {
    expect(() => validateProductWrite(good({ tier: 'TIER9' }))).toThrow(/tier/i);
    expect(() => validateProductWrite(good({ classification: 'PLATINUM' }))).toThrow(/classification/i);
    expect(() => validateProductWrite(good({ status: 'LIVE' }))).toThrow(/status/i);
  });
});

describe('validateProductWrite — update (partial=true)', () => {
  test('validates only provided fields; does not require slug/name', () => {
    const { data } = validateProductWrite({ tagline: 'New tagline' }, { partial: true });
    expect(data).toEqual({ tagline: 'New tagline' });
    expect('slug' in data).toBe(false);
  });

  test('still rejects an invalid enum on a partial update', () => {
    expect(() => validateProductWrite({ tier: 'nope' }, { partial: true })).toThrow(/tier/i);
  });

  test('an explicitly-null field is kept (clears the value), a missing field is omitted', () => {
    const { data } = validateProductWrite({ tier: null, businessSegment: 'Cardio' }, { partial: true });
    expect(data.tier).toBeNull();
    expect(data.businessSegment).toBe('Cardio');
    expect('name' in data).toBe(false);
  });
});

describe('validateProductWrite — length caps', () => {
  test('rejects an over-long name', () => {
    expect(() => validateProductWrite(good({ name: 'x'.repeat(300) }))).toThrow(/name.*long|too long/i);
  });
});
