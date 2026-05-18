import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTalkThreads, countOpenThreads } from '../../src/pages/talk-threads.ts';

test('parseTalkThreads: empty body returns no threads', () => {
  assert.deepEqual(parseTalkThreads(''), []);
});

test('parseTalkThreads: ## heading + ::open captures one thread with body', () => {
  const body = [
    '## Birth year 1881 vs 1887',
    '::open',
    '',
    'The 1928 census records age 47, implying 1881.',
    '',
    'Cross-check Soviet records for resolution.',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.level, 2);
  assert.equal(out[0]!.heading, 'Birth year 1881 vs 1887');
  assert.equal(out[0]!.marker, 'open');
  assert.equal(
    out[0]!.body,
    'The 1928 census records age 47, implying 1881.\n\nCross-check Soviet records for resolution.',
  );
});

test('parseTalkThreads: ### heading + ::closed is captured (currently missed by legacy regex)', () => {
  const body = [
    '## Section header (no marker)',
    '',
    '### Resolved: cousin terminology',
    '::closed',
    '',
    'Corrected on six pages.',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.level, 3);
  assert.equal(out[0]!.heading, 'Resolved: cousin terminology');
  assert.equal(out[0]!.marker, 'closed');
});

test('parseTalkThreads: all four markers recognized', () => {
  const body = [
    '## A', '::open', '', 'open body',
    '## B', '::closed', '', 'closed body',
    '## C', '::superseded', '', 'superseded body',
    '## D', '::gap', '', 'gap body',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.deepEqual(
    out.map(t => [t.heading, t.marker]),
    [['A', 'open'], ['B', 'closed'], ['C', 'superseded'], ['D', 'gap']],
  );
});

test('parseTalkThreads: headings without a marker are skipped', () => {
  const body = [
    '## Research notes',
    '',
    '### 2026-05-16',
    '- a captured note',
    '',
    '## Drafting plan',
    '',
    'Lead: three sentences...',
    '',
    '## Agent log',
    '',
    'Pipeline run 17ab.',
  ].join('\n');
  assert.deepEqual(parseTalkThreads(body), []);
});

test('parseTalkThreads: thread body ends at the next heading, not at a blank line', () => {
  const body = [
    '## First',
    '::open',
    '',
    'paragraph one',
    '',
    'paragraph two',
    '',
    '## Second',
    '::closed',
    '',
    'second body',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.body, 'paragraph one\n\nparagraph two');
  assert.equal(out[1]!.body, 'second body');
});

test('parseTalkThreads: tolerates blank lines between heading and marker', () => {
  const body = [
    '## Heading',
    '',
    '',
    '::open',
    '',
    'body',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.marker, 'open');
  assert.equal(out[0]!.body, 'body');
});

test('parseTalkThreads: heading followed by prose (no marker) is not a thread', () => {
  const body = [
    '## Heading',
    '',
    'Some prose. Not a marker.',
    '',
    '## Real thread',
    '::open',
    '',
    'body',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.heading, 'Real thread');
});

test('countOpenThreads: includes both ::open and ::gap, excludes ::closed and ::superseded', () => {
  const body = [
    '## A', '::open', '', 'x',
    '## B', '::closed', '', 'x',
    '## C', '::gap', '', 'x',
    '## D', '::superseded', '', 'x',
    '### E', '::open', '', 'x',
  ].join('\n');
  assert.equal(countOpenThreads(body), 3);
});

test('parseTalkThreads: ### subheading inside a thread body is preserved (NOT a boundary)', () => {
  const body = [
    '## Research plan: Zus Krasnov',
    '::open',
    '',
    'Lead-in paragraph.',
    '',
    '### Project objective',
    '',
    'Find Zus.',
    '',
    '### Why this is hard',
    '',
    'Records are sparse.',
    '',
    '## Next thread',
    '::open',
    '',
    'second body',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.heading, 'Research plan: Zus Krasnov');
  // The full body — including both ### subheadings — must be preserved.
  assert.match(out[0]!.body, /### Project objective/);
  assert.match(out[0]!.body, /Find Zus\./);
  assert.match(out[0]!.body, /### Why this is hard/);
  assert.match(out[0]!.body, /Records are sparse\./);
  assert.equal(out[1]!.heading, 'Next thread');
});

test('parseTalkThreads: ### heading WITH a marker still terminates the prior thread', () => {
  const body = [
    '## First',
    '::open',
    '',
    'first body',
    '',
    '### Second (also a thread)',
    '::closed',
    '',
    'second body',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.body, 'first body');
  assert.equal(out[1]!.heading, 'Second (also a thread)');
  assert.equal(out[1]!.body, 'second body');
});

test('parseTalkThreads: ## heading without marker still terminates body (structural break)', () => {
  const body = [
    '## Thread one',
    '::open',
    '',
    'body one',
    '',
    '## Research notes',
    '',
    'section content, not a thread',
  ].join('\n');
  const out = parseTalkThreads(body);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.body, 'body one');
});

test('countOpenThreads: counts level-3 threads that the legacy regex missed', () => {
  const body = [
    '## Section',
    '',
    '### Open: Yad Vashem search',
    '::open',
    '',
    'body',
    '',
    '### Open: USHMM databases',
    '::open',
    '',
    'body',
  ].join('\n');
  assert.equal(countOpenThreads(body), 2);
});
