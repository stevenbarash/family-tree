import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForAmbiguousDates } from '../../src/checks/ambiguous-dates.js';

test('scanForAmbiguousDates: flags m/d/y vs d/m/y ambiguous date', () => {
  const hits = scanForAmbiguousDates('foo.ged', '2 DATE 9/7/1997\n');
  assert.equal(hits.length, 1);
  const h = hits[0]!;
  assert.equal(h.text, '9/7/1997');
  assert.equal(h.line, 1);
  assert.equal(h.file, 'foo.ged');
  assert.match(h.context, /9\/7\/1997/);
});

test('scanForAmbiguousDates: does NOT flag d/m/y where day > 12 (unambiguous)', () => {
  const hits = scanForAmbiguousDates('foo.ged', '2 DATE 17/9/1923\n');
  assert.equal(hits.length, 0);
});

test('scanForAmbiguousDates: does NOT flag m/d/y where day > 12 (unambiguous)', () => {
  const hits = scanForAmbiguousDates('foo.ged', '2 DATE 9/17/1923\n');
  assert.equal(hits.length, 0);
});

test('scanForAmbiguousDates: ignores canonical "D Mon YYYY" dates', () => {
  const hits = scanForAmbiguousDates('p.md', 'born: 5 May 2001\ndied: 12 Mar 2024\n');
  assert.equal(hits.length, 0);
});

test('scanForAmbiguousDates: collects multiple hits across lines with correct line numbers', () => {
  const text = [
    'born on 3/4/1955 in Kyiv',
    'no date here',
    'married 8/8/1980',
    'died Jun 2020',
  ].join('\n');
  const hits = scanForAmbiguousDates('p.md', text);
  assert.equal(hits.length, 2);
  assert.equal(hits[0]!.line, 1);
  assert.equal(hits[0]!.text, '3/4/1955');
  assert.equal(hits[1]!.line, 3);
  assert.equal(hits[1]!.text, '8/8/1980');
});

test('scanForAmbiguousDates: column is 1-indexed to the start of the date', () => {
  const hits = scanForAmbiguousDates('p.md', 'event date: 3/4/1955\n');
  assert.equal(hits.length, 1);
  // "event date: " is 12 chars before the slash date → column 13
  assert.equal(hits[0]!.column, 13);
});

test('scanForAmbiguousDates: empty input yields zero hits', () => {
  assert.deepEqual(scanForAmbiguousDates('x.md', ''), []);
});

test('scanForAmbiguousDates: same line with one ambiguous + one unambiguous reports only the ambiguous one', () => {
  const hits = scanForAmbiguousDates('x.md', 'born 9/7/1997, died 17/9/2050\n');
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.text, '9/7/1997');
});
