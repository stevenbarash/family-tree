import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSearchIndex } from '../../src/search/index.ts';
import { saveSearchIndex, loadSearchIndex } from '../../src/search/persist.ts';
import type { SearchDoc } from '../../src/search/types.ts';

function doc(slug: string, title: string): SearchDoc {
  return { slug, title, type: 'person', body: '', aliases: '', categories: '', places: '', occupations: '', related: '' };
}

test('save then load round-trip', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'search-'));
  try {
    const file = join(dir, 'search.idx.json');
    const a = createSearchIndex();
    a.upsert(doc('abby', 'Abby Rickelman'));
    a.upsert(doc('steven', 'Steven Barash'));
    await saveSearchIndex(a, file);

    const b = createSearchIndex();
    await loadSearchIndex(b, file);
    assert.deepEqual(b.query('abby').map(h => h.slug), ['abby']);
    assert.deepEqual(b.query('steven').map(h => h.slug), ['steven']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('load: returns false on missing file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'search-'));
  try {
    const idx = createSearchIndex();
    const ok = await loadSearchIndex(idx, join(dir, 'nope.json'));
    assert.equal(ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('save then load round-trip: restricted-slug set preserved', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'search-'));
  try {
    const file = join(dir, 'search.idx.json');
    const a = createSearchIndex();
    a.upsert(doc('public', 'Smith Public'));
    a.upsert(doc('private', 'Smith Private'), { restricted: true });
    await saveSearchIndex(a, file);

    const b = createSearchIndex();
    await loadSearchIndex(b, file);
    // Default query excludes restricted
    assert.deepEqual(b.query('smith').map(h => h.slug), ['public']);
    // Explicit override returns both
    assert.deepEqual(
      b.query('smith', { includeRestricted: true }).map(h => h.slug).sort(),
      ['private', 'public'],
    );
    assert.ok(b.restrictedSlugs().has('private'));
    assert.ok(!b.restrictedSlugs().has('public'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('load: legacy index file (no __restricted_slugs key) loads as all-public', async () => {
  // Older index files written before the privacy field shouldn't crash;
  // they should just round-trip with an empty restricted set.
  const dir = mkdtempSync(join(tmpdir(), 'search-'));
  try {
    const file = join(dir, 'legacy.json');
    const a = createSearchIndex();
    a.upsert(doc('alice', 'Alice'));
    await saveSearchIndex(a, file);
    // Strip the sentinel key from disk to simulate an older file
    const { readFileSync, writeFileSync } = await import('node:fs');
    const shards = JSON.parse(readFileSync(file, 'utf-8'));
    delete shards.__restricted_slugs;
    writeFileSync(file, JSON.stringify(shards), 'utf-8');

    const b = createSearchIndex();
    const ok = await loadSearchIndex(b, file);
    assert.equal(ok, true);
    assert.equal(b.restrictedSlugs().size, 0);
    assert.deepEqual(b.query('alice').map(h => h.slug), ['alice']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('load: returns false on corrupt file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'search-'));
  try {
    const file = join(dir, 'corrupt.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, 'not json {{{', 'utf-8');
    const idx = createSearchIndex();
    const ok = await loadSearchIndex(idx, file);
    assert.equal(ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
