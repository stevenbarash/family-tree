import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFullDate, findOnThisDay } from '../../src/family/on-this-day.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';

function rec(over: Partial<DerivedRecord> & { record: string; name: string }): DerivedRecord {
  return {
    birth: null,
    death: null,
    parents: [],
    spouses: [],
    children: [],
    familyOfOrigin: [],
    marriages: [],
    residences: [],
    occupations: [],
    sources: [],
    media: [],
    privacy: { restricted: false, reason: 'none' },
    ...over,
  };
}

test('extractFullDate: parses "27 Jul 1946"', () => {
  assert.deepEqual(extractFullDate('27 Jul 1946'), { month: 7, day: 27, year: 1946 });
});

test('extractFullDate: parses "12 JAN 1950" (uppercase)', () => {
  assert.deepEqual(extractFullDate('12 JAN 1950'), { month: 1, day: 12, year: 1950 });
});

test('extractFullDate: parses "5 september 1997" (lowercase, full name)', () => {
  assert.deepEqual(extractFullDate('5 september 1997'), { month: 9, day: 5, year: 1997 });
});

test('extractFullDate: returns null for year-only "1880"', () => {
  assert.equal(extractFullDate('1880'), null);
});

test('extractFullDate: returns null for month+year-only "Jul 1946"', () => {
  assert.equal(extractFullDate('Jul 1946'), null);
});

test('extractFullDate: returns null for any qualifier (Abt/Bef/Aft/Bet/Cal/Est)', () => {
  for (const raw of ['Abt 27 Jul 1946', 'Bef 1 Jan 1900', 'Aft 1980', 'Bet 1850 And 1860', 'Cal 1900', 'Est 1875']) {
    assert.equal(extractFullDate(raw), null, `expected null for "${raw}"`);
  }
});

test('extractFullDate: returns null for null/empty input', () => {
  assert.equal(extractFullDate(null), null);
  assert.equal(extractFullDate(''), null);
  assert.equal(extractFullDate('   '), null);
});

test('extractFullDate: returns null for garbage', () => {
  assert.equal(extractFullDate('what'), null);
  assert.equal(extractFullDate('27 Foo 1946'), null);
});

test('findOnThisDay: surfaces a birth, death, and marriage all on the same calendar day', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'Boris',     birth: { date: '15 Jun 1946', place: null }, death: { date: null, place: null } })],
    ['@I2@', rec({ record: '@I2@', name: 'Mordechai', death: { date: '15 Jun 1928', place: null } })],
    ['@I3@', rec({ record: '@I3@', name: 'Veniamin',  marriages: [{ fam: '@F1@', spouse: { record: '@I4@', name: 'Tatiana' }, children: [], marriedDate: '15 Jun 1956', marriedPlace: null }] })],
    ['@I4@', rec({ record: '@I4@', name: 'Tatiana',   marriages: [{ fam: '@F1@', spouse: { record: '@I3@', name: 'Veniamin' }, children: [], marriedDate: '15 Jun 1956', marriedPlace: null }] })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 3);
  // Sorted oldest-first.
  assert.deepEqual(events.map(e => e.year), [1928, 1946, 1956]);
  assert.deepEqual(events.map(e => e.type), ['death', 'birth', 'marriage']);
});

test('findOnThisDay: marriages are deduped by FAM id (one event, not two)', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I3@', rec({ record: '@I3@', name: 'Veniamin', marriages: [{ fam: '@F1@', spouse: { record: '@I4@', name: 'Tatiana' }, children: [], marriedDate: '15 Jun 1956', marriedPlace: null }] })],
    ['@I4@', rec({ record: '@I4@', name: 'Tatiana',  marriages: [{ fam: '@F1@', spouse: { record: '@I3@', name: 'Veniamin' }, children: [], marriedDate: '15 Jun 1956', marriedPlace: null }] })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'marriage');
  // Both spouses are populated; primary is whichever is alphabetically first by name, for determinism.
  assert.equal(events[0]!.primary.name, 'Tatiana');
  assert.equal(events[0]!.secondary?.name, 'Veniamin');
});

test('findOnThisDay: returns empty for a day with no matching events', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'Boris', birth: { date: '15 Jun 1946', place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 1, day: 1 }, { now: new Date('2026-01-01T12:00:00Z') });
  assert.equal(events.length, 0);
});

test('findOnThisDay: skips qualified dates (Abt 15 Jun 1946 does not match Jun 15)', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'Boris', birth: { date: 'Abt 15 Jun 1946', place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 0);
});

test('findOnThisDay: suppresses births of likely-living people (no death, within 110 years)', () => {
  const records = new Map<string, DerivedRecord>([
    // Boris: still living (no death), born 1990 — should be suppressed in 2026.
    ['@I1@', rec({ record: '@I1@', name: 'Boris', birth: { date: '15 Jun 1990', place: null }, death: { date: null, place: null } })],
    // Mordechai: died, born 1880 — surfaces fine.
    ['@I2@', rec({ record: '@I2@', name: 'Mordechai', birth: { date: '15 Jun 1880', place: null }, death: { date: '1 Jan 1955', place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.primary.name, 'Mordechai');
});

test('findOnThisDay: still surfaces births older than 110 years even when death is unrecorded', () => {
  // A 1900 birth with no death record is clearly historical, not living.
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'Mendel', birth: { date: '15 Jun 1900', place: null }, death: { date: null, place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.primary.name, 'Mendel');
});

test('findOnThisDay: skips births dated in the future relative to "now"', () => {
  // Defensive: data with a typo'd future year shouldn't show as an event.
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'GlitchPerson', birth: { date: '15 Jun 2099', place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 0);
});
