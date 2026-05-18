import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStaleCanonicalSha } from '../../src/checks/stale-canonical-sha.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';

const HEAD = 'a3f2c19abcdef0123456789abcdef0123456789a';
const OLD = 'b3f2c19abcdef0123456789abcdef0123456789b';

function meta(opts: { title: string; lang?: string; translationOf?: string; canonicalSha?: string }): PageMeta {
  return {
    schemaVersion: 1,
    title: opts.title,
    type: 'person',
    aliases: [],
    categories: [],
    created: '2026-01-01',
    corrections: [],
    ...(opts.lang ? { lang: opts.lang } : {}),
    ...(opts.translationOf ? { translationOf: opts.translationOf } : {}),
    ...(opts.canonicalSha ? { canonicalSha: opts.canonicalSha } : {}),
  };
}

function page(slug: string, locale: string, m: PageMeta): LoadedPage {
  return { slug, path: `/tmp/x/pages/${locale}/${slug}.md`, meta: m, body: '', text: '' };
}

function makeState(opts: { pages: LoadedPage[]; headByCanonical?: Array<[string, string]> }): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: opts.pages,
    derivedDir: '/tmp/x/d',
    derived: new Map(),
    placesCoords: [],
    canonicalHeadSha: new Map(opts.headByCanonical ?? []),
  };
}

test('stale-canonical-sha: translation sha === canonical HEAD → no finding', () => {
  const state = makeState({
    pages: [page('a', 'ru', meta({ title: 'А', lang: 'ru', translationOf: 'a', canonicalSha: HEAD }))],
    headByCanonical: [['a', HEAD]],
  });
  assert.deepEqual(detectStaleCanonicalSha(state), []);
});

test('stale-canonical-sha: translation sha is an old SHA → warn finding with diff hint', () => {
  const state = makeState({
    pages: [page('a', 'ru', meta({ title: 'А', lang: 'ru', translationOf: 'a', canonicalSha: OLD }))],
    headByCanonical: [['a', HEAD]],
  });
  const findings = detectStaleCanonicalSha(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'warn');
  assert.equal(findings[0]!.category, 'data');
  assert.equal(findings[0]!.location.file, '/tmp/x/pages/ru/a.md');
  assert.match(findings[0]!.message, /canonical_sha/);
  assert.match(findings[0]!.message, new RegExp(OLD.slice(0, 8)));
  assert.match(findings[0]!.message, new RegExp(HEAD.slice(0, 8)));
});

test('stale-canonical-sha: missing canonical_sha → warn (translations should carry one)', () => {
  const state = makeState({
    pages: [page('a', 'ru', meta({ title: 'А', lang: 'ru', translationOf: 'a' }))],
    headByCanonical: [['a', HEAD]],
  });
  const findings = detectStaleCanonicalSha(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /canonical_sha/);
  assert.match(findings[0]!.message, /missing/i);
});

test('stale-canonical-sha: translation_of points to canonical with no git history → silent skip', () => {
  // Page is untracked / never committed. Don't pretend to know it's stale.
  const state = makeState({
    pages: [page('a', 'ru', meta({ title: 'А', lang: 'ru', translationOf: 'a', canonicalSha: OLD }))],
    headByCanonical: [], // no head SHA for 'a'
  });
  assert.deepEqual(detectStaleCanonicalSha(state), []);
});

test('stale-canonical-sha: canonical EN page is never flagged', () => {
  // EN canonical has lang=undefined (or 'en'); it never carries canonical_sha.
  const state = makeState({
    pages: [page('a', 'en', meta({ title: 'A' }))],
    headByCanonical: [['a', HEAD]],
  });
  assert.deepEqual(detectStaleCanonicalSha(state), []);
});

test('stale-canonical-sha: translation without translation_of → skip silently', () => {
  // Defended by schema-drift; not our problem to repeat.
  const state = makeState({
    pages: [page('a', 'ru', meta({ title: 'А', lang: 'ru', canonicalSha: OLD }))],
    headByCanonical: [['a', HEAD]],
  });
  assert.deepEqual(detectStaleCanonicalSha(state), []);
});

test('stale-canonical-sha: canonicalHeadSha undefined entirely → no findings (non-git context)', () => {
  const state: RepoState = {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [page('a', 'ru', meta({ title: 'А', lang: 'ru', translationOf: 'a', canonicalSha: OLD }))],
    derivedDir: '/tmp/x/d',
    derived: new Map(),
    placesCoords: [],
    // canonicalHeadSha intentionally omitted
  };
  assert.deepEqual(detectStaleCanonicalSha(state), []);
});
