import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCitations, countOpenGaps, formatTalkLabel } from './citations.ts';

test('formatTalkLabel: singular/plural and empty', () => {
  assert.equal(formatTalkLabel(0, 0), '');
  assert.equal(formatTalkLabel(1, 0), '1 note');
  assert.equal(formatTalkLabel(2, 0), '2 notes');
  assert.equal(formatTalkLabel(0, 1), '1 open gap');
  assert.equal(formatTalkLabel(0, 3), '3 open gaps');
  assert.equal(formatTalkLabel(2, 3), '2 notes · 3 open gaps');
});

test('countOpenGaps: counts ::open and ::gap threads, ignores ::closed and ::superseded', () => {
  const body = `## Open question A
::open

prose

## Resolved question
::closed

prose

## Another open one
::open

prose

## A gap
::gap
`;
  assert.equal(countOpenGaps(body), 3);
});

test('countOpenGaps: counts level-3 (###) threads too', () => {
  const body = `## Section header (not a thread)

### Open: Yad Vashem search
::open

prose

### Open: USHMM databases
::open

prose
`;
  assert.equal(countOpenGaps(body), 2);
});

test('countOpenGaps: zero on empty body', () => {
  assert.equal(countOpenGaps(''), 0);
});

test('countCitations: zero on empty body', () => {
  assert.equal(countCitations(''), 0);
  assert.equal(countCitations('# Title\n\nNo citations here.'), 0);
});

test('countCitations: counts unique footnote ids only', () => {
  const body = `She was born[^a] in Kiev. She later moved[^a] to Brooklyn[^b].

[^a]: First source.
[^b]: Second source.
`;
  assert.equal(countCitations(body), 2);
});

test('countCitations: counts cite directives', () => {
  const body = `Some prose.

::cite-message{snapshot=x date=y}
::cite-photo{file=p hash=h}
:::cite-vault{type=genealogy}
`;
  assert.equal(countCitations(body), 3);
});

test('countCitations: footnotes + cite directives compose', () => {
  const body = `Text[^one] more text[^two].

::cite-message{snapshot=x}

[^one]: a
[^two]: b
`;
  assert.equal(countCitations(body), 3);
});
