import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDerivedRecord } from '../../src/gedcom/normalize.ts';

test('normalizeDerivedRecord: returns null on non-object input', () => {
  assert.equal(normalizeDerivedRecord(null), null);
  assert.equal(normalizeDerivedRecord(undefined), null);
  assert.equal(normalizeDerivedRecord('string'), null);
  assert.equal(normalizeDerivedRecord(42), null);
});

test('normalizeDerivedRecord: returns null on missing record id', () => {
  assert.equal(normalizeDerivedRecord({ name: 'Alice' }), null);
});

test('normalizeDerivedRecord: returns null on malformed record id', () => {
  assert.equal(normalizeDerivedRecord({ record: 'not-an-id', name: 'Alice' }), null);
});

test('normalizeDerivedRecord: returns null on missing name', () => {
  assert.equal(normalizeDerivedRecord({ record: 'I123' }), null);
});

test('normalizeDerivedRecord: fills missing array fields with []', () => {
  // Simulates a YAML written by a pre-session deriver — has the old fields
  // but lacks familyOfOrigin, marriages, media.
  const stale = {
    record: 'I123',
    name: 'Alice',
    birth: { date: '1900', place: null },
    death: null,
    parents: [],
    spouses: [],
    children: [],
    residences: [],
    occupations: [],
    sources: [],
  };
  const out = normalizeDerivedRecord(stale)!;
  assert.deepEqual(out.familyOfOrigin, []);
  assert.deepEqual(out.marriages, []);
  assert.deepEqual(out.media, []);
  // Pre-privacy YAMLs default to unrestricted — older deriver had no privacy field.
  assert.deepEqual(out.privacy, { restricted: false, reason: 'none' });
  // Existing fields preserved
  assert.deepEqual(out.birth, { date: '1900', place: null });
});

test('normalizeDerivedRecord: preserves populated arrays as-is', () => {
  const populated = {
    record: 'I1',
    name: 'Bob',
    birth: null,
    death: null,
    parents: [],
    spouses: [],
    children: [],
    familyOfOrigin: [{ fam: 'F1', siblings: [], marriedDate: null, marriedPlace: null }],
    marriages: [],
    residences: [],
    occupations: [],
    sources: [],
    media: [{ record: 'O1', title: 'Photo' }],
  };
  const out = normalizeDerivedRecord(populated)!;
  assert.equal(out.familyOfOrigin.length, 1);
  assert.equal(out.familyOfOrigin[0]!.fam, 'F1');
  assert.equal(out.media.length, 1);
  assert.equal(out.media[0]!.title, 'Photo');
});

test('normalizeDerivedRecord: defaults non-array shape for array fields', () => {
  // A YAML with parents: null (rare but possible from hand-edits) shouldn't crash.
  const broken = { record: 'I1', name: 'Alice', parents: null, spouses: 'not-an-array' };
  const out = normalizeDerivedRecord(broken)!;
  assert.deepEqual(out.parents, []);
  assert.deepEqual(out.spouses, []);
});
