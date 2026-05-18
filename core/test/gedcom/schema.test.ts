import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDerivedRecord, DerivedRecordSchema } from '../../src/gedcom/schema.ts';

test('parseDerivedRecord: success returns tagged ok result', () => {
  const result = parseDerivedRecord({
    record: 'I1', name: 'Alice', birth: null, death: null,
    privacy: { restricted: false, reason: 'none' },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.record, 'I1');
});

test('parseDerivedRecord: failure returns tagged error with field path', () => {
  const result = parseDerivedRecord({ record: 'not-an-id', name: 'Alice' });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /record/);
    assert.match(result.error, /I<digits>/);
  }
});

test('parseDerivedRecord: failure includes nested field path', () => {
  const result = parseDerivedRecord({
    record: 'I1', name: 'Alice', birth: null, death: null,
    parents: [{ record: 'BAD', name: 'B', role: 'father' }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /parents\.0\.record/);
  }
});

test('DerivedRecordSchema: family/source/media id patterns enforced', () => {
  const bad = {
    record: 'I1', name: 'A', birth: null, death: null,
    media: [{ record: 'BAD-ID' }],
  };
  const r = DerivedRecordSchema.safeParse(bad);
  assert.equal(r.success, false);
});

test('DerivedRecordSchema: sex enum rejects unknown values', () => {
  const bad = { record: 'I1', name: 'A', sex: 'X', birth: null, death: null };
  const r = DerivedRecordSchema.safeParse(bad);
  assert.equal(r.success, false);
});

test('DerivedRecordSchema: round-trips a fully-populated record', () => {
  const full = {
    record: 'I42',
    name: 'Test Person',
    sex: 'F',
    nameTranslations: { ru: 'Тест', he: 'בדיקה' },
    birth: { date: '1 JAN 1900', place: 'Somewhere' },
    death: { date: 'ABT 1970', place: null },
    parents: [{ record: 'I43', name: 'Mom', role: 'mother' }],
    spouses: [{ record: 'I44', name: 'Spouse', married: '1925' }],
    children: [{ record: 'I45', name: 'Kid', born: '1926' }],
    familyOfOrigin: [{
      fam: 'F1',
      pedigree: 'adopted',
      father: { record: 'I46', name: 'Dad' },
      siblings: [{ record: 'I47', name: 'Sib' }],
      marriedDate: null,
      marriedPlace: null,
    }],
    marriages: [{
      fam: 'F2',
      spouse: { record: 'I44', name: 'Spouse' },
      children: [{ record: 'I45', name: 'Kid' }],
      marriedDate: '1925',
      marriedPlace: null,
    }],
    residences: [{ date: '1950', place: 'Address' }],
    occupations: [{ title: 'Teacher', date: null }],
    sources: [{ record: 'S5', title: 'Census', apid: '1,2::3' }],
    media: [{ record: 'O7', title: 'Photo', form: 'image/jpeg', primary: true }],
    privacy: { restricted: true, reason: 'living-heuristic' },
  };
  const r = DerivedRecordSchema.safeParse(full);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.record, 'I42');
    assert.equal(r.data.nameTranslations?.ru, 'Тест');
    assert.equal(r.data.parents.length, 1);
    assert.equal(r.data.familyOfOrigin[0]!.pedigree, 'adopted');
  }
});

test('DerivedRecordSchema: pedigree enum rejects unknown values', () => {
  const bad = {
    record: 'I1', name: 'A', birth: null, death: null,
    familyOfOrigin: [{ fam: 'F1', pedigree: 'unknown-kind', siblings: [], marriedDate: null, marriedPlace: null }],
  };
  const r = DerivedRecordSchema.safeParse(bad);
  assert.equal(r.success, false);
});
