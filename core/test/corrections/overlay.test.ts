import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCorrections } from '../../src/corrections/overlay.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { Correction } from '../../src/pages/types.ts';

function baseRecord(overrides: Partial<DerivedRecord> = {}): DerivedRecord {
  return {
    record: 'I1',
    name: 'Test Person',
    birth: { date: '1900', place: 'Somewhere' },
    death: null,
    parents: [],
    spouses: [],
    children: [],
    residences: [],
    occupations: [],
    sources: [],
    familyOfOrigin: [],
    marriages: [],
    media: [],
    privacy: { restricted: false, reason: 'none' },
    ...overrides,
  };
}

test('applyCorrections: empty list returns input unchanged', () => {
  const r = baseRecord();
  const out = applyCorrections(r, []);
  assert.deepEqual(out, r);
});

test('applyCorrections: overrides death.date when death is null', () => {
  const r = baseRecord({ death: null });
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1989', source: 'src' },
  ]);
  assert.equal(out.death!.date, '1989');
  assert.equal(out.death!.place, null);
});

test('applyCorrections: overrides death.date when death already exists', () => {
  const r = baseRecord({ death: { date: '1990', place: 'Rome' } });
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1989', source: 'src' },
  ]);
  assert.equal(out.death!.date, '1989');
  assert.equal(out.death!.place, 'Rome'); // preserved
});

test('applyCorrections: overrides birth.place', () => {
  const r = baseRecord({ birth: { date: '1900', place: 'OldName' } });
  const out = applyCorrections(r, [
    { field: 'birth.place', value: 'NewName', source: 'src' },
  ]);
  assert.equal(out.birth!.place, 'NewName');
  assert.equal(out.birth!.date, '1900'); // preserved
});

test('applyCorrections: overrides name', () => {
  const r = baseRecord({ name: 'Old Name' });
  const out = applyCorrections(r, [
    { field: 'name', value: 'New Name', source: 'src' },
  ]);
  assert.equal(out.name, 'New Name');
});

test('applyCorrections: returns a new object — does not mutate input', () => {
  const r = baseRecord({ death: { date: '1990', place: 'Rome' } });
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1989', source: 'src' },
  ]);
  assert.notEqual(out, r);                    // top-level is new
  assert.notEqual(out.death, r.death);        // sub-object is new
  assert.equal(r.death!.date, '1990');        // input preserved
});

test('applyCorrections: multiple corrections on different fields compose', () => {
  const r = baseRecord();
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1989', source: 's1' },
    { field: 'death.place', value: 'Italy', source: 's2' },
  ]);
  assert.equal(out.death!.date, '1989');
  assert.equal(out.death!.place, 'Italy');
});

test('applyCorrections: later correction on the same field wins', () => {
  const r = baseRecord();
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1988', source: 's1' },
    { field: 'death.date', value: '1989', source: 's2' },
  ]);
  assert.equal(out.death!.date, '1989');
});

test('applyCorrections: idempotent — applying the same list twice yields the same result', () => {
  const r = baseRecord();
  const corrections: Correction[] = [
    { field: 'death.date', value: '1989', source: 's' },
    { field: 'name', value: 'Renamed', source: 's' },
  ];
  const once = applyCorrections(r, corrections);
  const twice = applyCorrections(once, corrections);
  assert.deepEqual(twice, once);
});
