import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDate } from '../../src/format/dates.ts';

test('normalizeDate: canonical D Mon YYYY is idempotent', () => {
  assert.equal(normalizeDate('7 Sep 1997').value, '7 Sep 1997');
  assert.equal(normalizeDate('28 Feb 1970').value, '28 Feb 1970');
  assert.equal(normalizeDate('15 Jul 1915').value, '15 Jul 1915');
});

test('normalizeDate: year-only is canonical', () => {
  assert.equal(normalizeDate('1923').value, '1923');
  assert.equal(normalizeDate('1989').value, '1989');
});

test('normalizeDate: Mon YYYY (no day) is canonical', () => {
  assert.equal(normalizeDate('Sep 1932').value, 'Sep 1932');
  assert.equal(normalizeDate('Jul 1969').value, 'Jul 1969');
});

test('normalizeDate: Abt YYYY is canonical', () => {
  assert.equal(normalizeDate('Abt 1886').value, 'Abt 1886');
});

test('normalizeDate: empty string returns empty result', () => {
  const r = normalizeDate('');
  assert.equal(r.value, '');
  assert.equal(r.changed, false);
});

test('normalizeDate: ALL-CAPS month → title case', () => {
  assert.equal(normalizeDate('11 MAR 1866').value, '11 Mar 1866');
  assert.equal(normalizeDate('08 OCT 1790').value, '8 Oct 1790');
  assert.equal(normalizeDate('MAY 1812').value, 'May 1812');
});

test('normalizeDate: lowercase month → title case', () => {
  assert.equal(normalizeDate('18 jul 1926').value, '18 Jul 1926');
});

test('normalizeDate: full month name → 3-letter abbreviation', () => {
  assert.equal(normalizeDate('25 August 1889').value, '25 Aug 1889');
  assert.equal(normalizeDate('30 January 1899').value, '30 Jan 1899');
});

test('normalizeDate: "Mon D YYYY" (no comma) → "D Mon YYYY"', () => {
  assert.equal(normalizeDate('Feb 28 1970').value, '28 Feb 1970');
  assert.equal(normalizeDate('May 8 1954').value, '8 May 1954');
  assert.equal(normalizeDate('April 2 1966').value, '2 Apr 1966');
});

test('normalizeDate: "Month D, YYYY" (with comma) → "D Mon YYYY"', () => {
  assert.equal(normalizeDate('August 19, 2001').value, '19 Aug 2001');
  assert.equal(normalizeDate('May 5, 1922').value, '5 May 1922');
});

test('normalizeDate: leading-zero day stripped', () => {
  assert.equal(normalizeDate('08 Oct 1790').value, '8 Oct 1790');
  assert.equal(normalizeDate('01 Jan 2000').value, '1 Jan 2000');
});

test('normalizeDate: changed flag true when output differs from input', () => {
  assert.equal(normalizeDate('Feb 28 1970').changed, true);
  assert.equal(normalizeDate('28 Feb 1970').changed, false);
});
