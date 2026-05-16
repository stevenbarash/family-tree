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

test('computeRelationshipFromSelf: returns label, crumbs, and degree for a parent chain', () => {
  // Self -> father -> father's father. Target is grandfather: degree 2.
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec('@I1@', 'Me', [{ record: '@I2@', role: 'father' }])],
    ['@I2@', rec('@I2@', 'Dad', [{ record: '@I3@', role: 'father' }])],
    ['@I3@', rec('@I3@', 'Grandpa')],
  ]);
  const result = computeRelationshipFromSelf({
    selfRecord: '@I1@',
    targetRecord: '@I3@',
    records,
    findSlug: (record) => (record === '@I3@' ? 'grandpa' : undefined),
  });
  assert.ok(result);
  assert.match(result.label, /grandfather/i);
  assert.equal(result.degree, 2);
  // Crumbs walk self -> dad -> grandpa, in that order.
  assert.deepEqual(
    result.crumbs.map((c) => c.record),
    ['@I1@', '@I2@', '@I3@'],
  );
  // Grandpa's slug came through; the in-between records had no page.
  const last = result.crumbs[result.crumbs.length - 1];
  assert.equal(last?.slug, 'grandpa');
  const middle = result.crumbs[1];
  assert.equal(middle?.slug, undefined);
});
