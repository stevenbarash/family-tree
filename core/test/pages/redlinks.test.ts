import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRedlinks } from '../../src/pages/redlinks.ts';

test('findRedlinks: lists unresolved targets ranked by source count', () => {
  const pages = [
    { slug: 'a', body: 'See [[Steven Barash]] and [[Unknown One]].' },
    { slug: 'b', body: 'See [[Unknown One]] again.' },
    { slug: 'c', body: 'Linking to [[Unknown Two]].' },
  ];
  const known = new Set(['steven barash']);
  const result = findRedlinks(pages, known);

  assert.equal(result.length, 2);
  assert.equal(result[0]!.canonical, 'unknown one');
  assert.equal(result[0]!.count, 2);
  assert.deepEqual(result[0]!.sources, ['a', 'b']);
  assert.equal(result[1]!.canonical, 'unknown two');
  assert.equal(result[1]!.count, 1);
});

test('findRedlinks: dedupes within a single source page', () => {
  const pages = [
    { slug: 'a', body: '[[Ghost]] and [[Ghost]] again, also [[Ghost|alias]].' },
  ];
  const result = findRedlinks(pages, new Set());
  assert.equal(result.length, 1);
  assert.equal(result[0]!.count, 1);
  assert.deepEqual(result[0]!.sources, ['a']);
});

test('findRedlinks: ignores anchors and labels when matching', () => {
  const pages = [
    { slug: 'a', body: '[[Ghost#section]] and [[Ghost|see ghost]].' },
  ];
  const known = new Set(['ghost']);
  const result = findRedlinks(pages, known);
  assert.equal(result.length, 0);
});

test('findRedlinks: canonicalizes whitespace and case', () => {
  const pages = [
    { slug: 'a', body: '[[Some Place]] and [[some_place]] and [[SOME  PLACE]].' },
  ];
  const result = findRedlinks(pages, new Set());
  assert.equal(result.length, 1);
  assert.equal(result[0]!.canonical, 'some place');
  assert.equal(result[0]!.count, 1);
});

test('findRedlinks: empty pages return empty', () => {
  assert.deepEqual(findRedlinks([], new Set()), []);
  assert.deepEqual(findRedlinks([{ slug: 'a', body: 'no links here' }], new Set()), []);
});

test('findRedlinks: target preserves first-seen casing', () => {
  const pages = [
    { slug: 'a', body: 'a [[Ghost Town]]' },
    { slug: 'b', body: 'b [[ghost town]]' },
  ];
  const result = findRedlinks(pages, new Set());
  assert.equal(result[0]!.target, 'Ghost Town');
});

test('findRedlinks: secondary sort by canonical when counts tie', () => {
  const pages = [
    { slug: 'a', body: '[[Charlie]] and [[Alpha]] and [[Bravo]].' },
  ];
  const result = findRedlinks(pages, new Set());
  assert.deepEqual(result.map(r => r.canonical), ['alpha', 'bravo', 'charlie']);
});
