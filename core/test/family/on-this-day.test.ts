import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFullDate } from '../../src/family/on-this-day.ts';

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
