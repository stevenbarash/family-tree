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
