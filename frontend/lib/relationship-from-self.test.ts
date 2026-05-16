import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRelationshipFromSelf } from './relationship-from-self';
import type { DerivedRecord } from '@core/gedcom/types.ts';

function rec(record: string, name: string, parents: { record: string; role: 'father' | 'mother' }[] = []): DerivedRecord {
  return {
    record,
    name,
    birth: null,
    death: null,
    parents: parents.map((p) => ({ ...p, name: p.record })),
    spouses: [],
    children: [],
    familyOfOrigin: [],
    marriages: [],
    residences: [],
    occupations: [],
    sources: [],
    media: [],
    privacy: { restricted: false, reason: 'none' },
  };
}

test('computeRelationshipFromSelf: returns null when target equals self', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec('@I1@', 'Me')],
  ]);
  const result = computeRelationshipFromSelf({
    selfRecord: '@I1@',
    targetRecord: '@I1@',
    records,
    findSlug: () => undefined,
  });
  assert.equal(result, null);
});

test('computeRelationshipFromSelf: returns null when target unreachable from self', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec('@I1@', 'Me')],
    ['@I2@', rec('@I2@', 'Stranger')],
  ]);
  const result = computeRelationshipFromSelf({
    selfRecord: '@I1@',
    targetRecord: '@I2@',
    records,
    findSlug: () => undefined,
  });
  assert.equal(result, null);
});

test('computeRelationshipFromSelf: returns null when target record is missing from the map', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec('@I1@', 'Me')],
  ]);
  const result = computeRelationshipFromSelf({
    selfRecord: '@I1@',
    targetRecord: '@I99@',
    records,
    findSlug: () => undefined,
  });
  assert.equal(result, null);
});
