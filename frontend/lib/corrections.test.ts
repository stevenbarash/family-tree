import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctRecords, type CorrectionsMap } from './corrections.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import type { Correction } from '@core/pages/types.ts';

function rec(id: string, overrides: Partial<DerivedRecord> = {}): DerivedRecord {
  return {
    record: id,
    name: `Person ${id}`,
    birth: { date: '1900', place: 'Somewhere' },
    death: null,
    parents: [],
    spouses: [],
    children: [],
    residences: [],
    occupations: [],
    sources: [],
    ...overrides,
  };
}

test('correctRecords: empty corrections map returns the same map', () => {
  const records = new Map([['I1', rec('I1')]]);
  const out = correctRecords(records, new Map());
  assert.equal(out, records); // same reference
});

test('correctRecords: record without corrections is passed through unchanged', () => {
  const r = rec('I1');
  const records = new Map([['I1', r]]);
  const corrections: CorrectionsMap = new Map([['I999', [{ field: 'name', value: 'X', source: 's' }]]]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1'), r); // same reference
});

test('correctRecords: applies death.date correction to matching record', () => {
  const records = new Map([['I1', rec('I1')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'death.date', value: '1989', source: 'Find A Grave' }]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.death!.date, '1989');
});

test('correctRecords: does not mutate the input records map', () => {
  const r = rec('I1', { death: { date: '1990', place: 'Rome' } });
  const records = new Map([['I1', r]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'death.date', value: '1989', source: 's' }]],
  ]);
  correctRecords(records, corrections);
  assert.equal(records.get('I1')!.death!.date, '1990'); // original preserved
});

test('correctRecords: applies multiple records independently', () => {
  const records = new Map([['I1', rec('I1')], ['I2', rec('I2')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'name', value: 'Renamed One', source: 's' }]],
    ['I2', [{ field: 'name', value: 'Renamed Two', source: 's' }]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.name, 'Renamed One');
  assert.equal(out.get('I2')!.name, 'Renamed Two');
});

test('correctRecords: multiple corrections on the same record compose', () => {
  const records = new Map([['I1', rec('I1')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [
      { field: 'death.date', value: '1989', source: 's1' },
      { field: 'death.place', value: 'Italy', source: 's2' },
    ]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.death!.date, '1989');
  assert.equal(out.get('I1')!.death!.place, 'Italy');
});
