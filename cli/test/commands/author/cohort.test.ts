import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCohort, parseSelector } from '../../../src/commands/author/cohort.js';

test('parseSelector: parses missing', () => {
  assert.deepEqual(parseSelector('missing'), { kind: 'missing' });
});

test('parseSelector: parses file: with path', () => {
  assert.deepEqual(parseSelector('file:/in/list.txt'), { kind: 'file', path: '/in/list.txt' });
});

test('parseSelector: throws on unknown selector', () => {
  assert.throws(() => parseSelector('branch:ayzman'), /unknown selector/);
});

test('resolveCohort missing: returns derived slugs without pages', async () => {
  const slugs = await resolveCohort({ kind: 'missing' }, {
    rootDir: '/repo',
    listExistingPages: () => ['aidele', 'kelman-ayzman'],
    listDerivedSlugs: async () => ['aidele', 'kelman-ayzman', 'haskel-pinchas-ayzman', 'unknown-relative'],
    readFile: () => null,
  });
  assert.deepEqual([...slugs].sort(), ['haskel-pinchas-ayzman', 'unknown-relative']);
});

test('resolveCohort file: parses the file, drops comments and blanks', async () => {
  const slugs = await resolveCohort({ kind: 'file', path: '/in/list.txt' }, {
    rootDir: '/repo',
    listExistingPages: () => [],
    listDerivedSlugs: async () => [],
    readFile: (p) => p === '/in/list.txt'
      ? 'aidele\n# comment\nkelman-ayzman\n\nshimon-ayzman'
      : null,
  });
  assert.deepEqual(slugs, ['aidele', 'kelman-ayzman', 'shimon-ayzman']);
});

test('resolveCohort file: drops inline comments', async () => {
  const slugs = await resolveCohort({ kind: 'file', path: '/in/list.txt' }, {
    rootDir: '/repo',
    listExistingPages: () => [],
    listDerivedSlugs: async () => [],
    readFile: (_p) => 'aidele # comment after slug\nkelman-ayzman',
  });
  assert.deepEqual(slugs, ['aidele', 'kelman-ayzman']);
});

test('resolveCohort file: throws when file missing', async () => {
  await assert.rejects(
    resolveCohort({ kind: 'file', path: '/none' }, {
      rootDir: '/repo',
      listExistingPages: () => [],
      listDerivedSlugs: async () => [],
      readFile: () => null,
    }),
    /not found/,
  );
});
