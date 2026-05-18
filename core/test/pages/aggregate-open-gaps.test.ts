import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOpenGaps } from '../../src/pages/talk-threads.ts';

const noThreads = '# Talk\n\nNothing here.\n';
const oneOpen = '## Thread A\n\n::open\n\nBody.\n';
const twoMixed = '## Thread A\n\n::open\n\nBody.\n\n## Thread B\n\n::gap\n\nBody.\n';
const oneClosed = '## Thread A\n\n::closed\n\nBody.\n';

test('aggregateOpenGaps: empty input returns []', () => {
  assert.deepEqual(aggregateOpenGaps([], 5), []);
});

test('aggregateOpenGaps: all-zero counts return []', () => {
  const result = aggregateOpenGaps(
    [
      { slug: 'a', title: 'A', talkBody: noThreads },
      { slug: 'b', title: 'B', talkBody: oneClosed },
    ],
    5,
  );
  assert.deepEqual(result, []);
});

test('aggregateOpenGaps: counts ::open and ::gap, drops ::closed', () => {
  const result = aggregateOpenGaps(
    [{ slug: 'a', title: 'A', talkBody: twoMixed }],
    5,
  );
  assert.deepEqual(result, [{ slug: 'a', title: 'A', count: 2 }]);
});

test('aggregateOpenGaps: sorts by count desc', () => {
  const result = aggregateOpenGaps(
    [
      { slug: 'a', title: 'A', talkBody: oneOpen },     // 1
      { slug: 'b', title: 'B', talkBody: twoMixed },    // 2
    ],
    5,
  );
  assert.deepEqual(result, [
    { slug: 'b', title: 'B', count: 2 },
    { slug: 'a', title: 'A', count: 1 },
  ]);
});

test('aggregateOpenGaps: ties broken by slug asc', () => {
  const result = aggregateOpenGaps(
    [
      { slug: 'zebra', title: 'Zebra', talkBody: oneOpen },
      { slug: 'apple', title: 'Apple', talkBody: oneOpen },
      { slug: 'mango', title: 'Mango', talkBody: oneOpen },
    ],
    5,
  );
  assert.deepEqual(result.map(r => r.slug), ['apple', 'mango', 'zebra']);
});

test('aggregateOpenGaps: truncates to top N', () => {
  const inputs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, i) => ({
    slug: s,
    title: s.toUpperCase(),
    // Generate 7-i open threads each so order is deterministic
    talkBody: Array.from({ length: 7 - i }, (_, k) => `## T${k}\n\n::open\n\nBody.\n`).join('\n'),
  }));
  const result = aggregateOpenGaps(inputs, 3);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(r => r.slug), ['a', 'b', 'c']);
});

test('aggregateOpenGaps: pages with no talkBody are silently ignored', () => {
  const result = aggregateOpenGaps(
    [
      { slug: 'a', title: 'A', talkBody: '' },
      { slug: 'b', title: 'B', talkBody: oneOpen },
    ],
    5,
  );
  assert.deepEqual(result, [{ slug: 'b', title: 'B', count: 1 }]);
});

test('aggregateOpenGaps: limit <= 0 returns []', () => {
  assert.deepEqual(aggregateOpenGaps([{ slug: 'a', title: 'A', talkBody: '## T\n\n::open\n\n' }], 0), []);
  assert.deepEqual(aggregateOpenGaps([{ slug: 'a', title: 'A', talkBody: '## T\n\n::open\n\n' }], -1), []);
});
