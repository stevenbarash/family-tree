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

test('normalizeDerivedRecord: returns null on empty name', () => {
  assert.equal(normalizeDerivedRecord({ record: 'I123', name: '' }), null);
});

test('normalizeDerivedRecord: fills missing array fields with []', () => {
  // Simulates a YAML written by a pre-session deriver — has the old fields
  // but lacks familyOfOrigin, marriages, media. Schema `.default([])` is
  // what makes this work without coercion of wrong-shape values.
  const stale = {
    record: 'I123',
    name: 'Alice',
    birth: { date: '1900', place: null },
    death: null,
  };
  const out = normalizeDerivedRecord(stale)!;
  assert.deepEqual(out.familyOfOrigin, []);
  assert.deepEqual(out.marriages, []);
  assert.deepEqual(out.media, []);
  assert.deepEqual(out.parents, []);
  assert.deepEqual(out.spouses, []);
  // Missing privacy defaults to unrestricted.
  assert.deepEqual(out.privacy, { restricted: false, reason: 'none' });
  // Existing fields preserved.
  assert.deepEqual(out.birth, { date: '1900', place: null });
});

test('normalizeDerivedRecord: preserves populated arrays as-is', () => {
  const populated = {
    record: 'I1',
    name: 'Bob',
    birth: null,
    death: null,
    familyOfOrigin: [{ fam: 'F1', siblings: [], marriedDate: null, marriedPlace: null }],
    media: [{ record: 'O1', title: 'Photo' }],
  };
  const out = normalizeDerivedRecord(populated)!;
  assert.equal(out.familyOfOrigin.length, 1);
  assert.equal(out.familyOfOrigin[0]!.fam, 'F1');
  assert.equal(out.media.length, 1);
  assert.equal(out.media[0]!.title, 'Photo');
});

test('normalizeDerivedRecord: rejects wrong-shape array fields (was: silently coerced)', () => {
  // Previously the coercive normalizer turned `parents: null` and
  // `spouses: 'not-an-array'` into [] silently — hiding real bugs from
  // hand-edits or buggy upstream tooling. Schema posture: fail loud.
  const broken1 = { record: 'I1', name: 'Alice', birth: null, death: null, parents: null };
  assert.equal(normalizeDerivedRecord(broken1), null);
  const broken2 = { record: 'I1', name: 'Alice', birth: null, death: null, spouses: 'not-an-array' };
  assert.equal(normalizeDerivedRecord(broken2), null);
});

test('normalizeDerivedRecord: rejects malformed nested ids', () => {
  // A parent with a wrong-shape record id is a real bug — historically the
  // coercer would have passed it through unchecked. The schema catches it.
  const broken = {
    record: 'I1', name: 'A', birth: null, death: null,
    parents: [{ record: 'not-an-id', name: 'B', role: 'father' }],
  };
  assert.equal(normalizeDerivedRecord(broken), null);
});

test('normalizeDerivedRecord: nameTranslations with bad locale key is rejected', () => {
  const broken = {
    record: 'I1', name: 'A', birth: null, death: null,
    nameTranslations: { 'English': 'Alice' }, // should be 'en'
  };
  assert.equal(normalizeDerivedRecord(broken), null);
});

test('normalizeDerivedRecord: nameTranslations with valid BCP47 keys is accepted', () => {
  const ok = {
    record: 'I1', name: 'A', birth: null, death: null,
    nameTranslations: { ru: 'А', uk: 'Б', he: 'ג' },
  };
  const out = normalizeDerivedRecord(ok)!;
  assert.deepEqual(out.nameTranslations, { ru: 'А', uk: 'Б', he: 'ג' });
});
