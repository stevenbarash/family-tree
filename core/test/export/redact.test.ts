import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactRecord } from '../../src/export/redact.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';

function rec(over: Partial<DerivedRecord> = {}): DerivedRecord {
  return {
    record: 'I1',
    name: 'Steven Barash',
    birth: { date: '28 Feb 1998', place: 'Pittsburgh, Pennsylvania, USA' },
    death: null,
    parents: [
      { record: 'I2', name: 'Brad Barash', role: 'father' },
      { record: 'I3', name: 'Sara Barash', role: 'mother' },
    ],
    spouses: [{ record: 'I4', name: 'Spouse Name', married: '2020' }],
    children: [{ record: 'I5', name: 'Child Name', born: '2024' }],
    familyOfOrigin: [],
    marriages: [],
    residences: [{ date: '2020', place: 'Brooklyn, NY' }],
    occupations: [{ title: 'Engineer', date: null }],
    sources: [],
    media: [],
    privacy: { restricted: true, reason: 'living-heuristic' },
    ...over,
  };
}

test('redactRecord: name → initials', () => {
  const out = redactRecord(rec());
  assert.equal(out.name, 'S. B.');
});

test('redactRecord: triple-barreled name → all initials', () => {
  const out = redactRecord(rec({ name: 'Mary Jane Watson' }));
  assert.equal(out.name, 'M. J. W.');
});

test('redactRecord: empty name → empty string', () => {
  const out = redactRecord(rec({ name: '' }));
  assert.equal(out.name, '');
});

test('redactRecord: birth → year only, place dropped', () => {
  const out = redactRecord(rec());
  assert.deepEqual(out.birth, { date: '1998', place: null });
});

test('redactRecord: birth with no parseable year → null', () => {
  const out = redactRecord(rec({ birth: { date: 'unknown', place: 'X' } }));
  assert.equal(out.birth, null);
});

test('redactRecord: birth qualifier date → extract first year ("Abt 1880" → 1880)', () => {
  const out = redactRecord(rec({ birth: { date: 'Abt 1880', place: null } }));
  assert.equal(out.birth?.date, '1880');
});

test('redactRecord: missing birth → null', () => {
  const out = redactRecord(rec({ birth: null }));
  assert.equal(out.birth, null);
});

test('redactRecord: death always dropped', () => {
  const out = redactRecord(rec({ death: { date: '2024', place: 'X' } }));
  assert.equal(out.death, null);
});

test('redactRecord: all relational fields are emptied', () => {
  const out = redactRecord(rec());
  assert.deepEqual(out.parents, []);
  assert.deepEqual(out.spouses, []);
  assert.deepEqual(out.children, []);
  assert.deepEqual(out.familyOfOrigin, []);
  assert.deepEqual(out.marriages, []);
  assert.deepEqual(out.residences, []);
  assert.deepEqual(out.occupations, []);
  assert.deepEqual(out.sources, []);
  assert.deepEqual(out.media, []);
});

test('redactRecord: record id preserved', () => {
  const out = redactRecord(rec({ record: 'I999' }));
  assert.equal(out.record, 'I999');
});

test('redactRecord: privacy payload preserved (not flipped to false)', () => {
  const out = redactRecord(rec());
  assert.deepEqual(out.privacy, { restricted: true, reason: 'living-heuristic' });
});

test('redactRecord: passing an unrestricted record still applies redactions (caller decides which to redact)', () => {
  // The function does not gate on privacy.restricted — that's the caller's
  // job. This test pins the contract: redactRecord is unconditional.
  const input = rec({ privacy: { restricted: false, reason: 'none' } });
  const out = redactRecord(input);
  assert.equal(out.name, 'S. B.');
  assert.equal(out.privacy.restricted, false);
});
