import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPipelineFrontmatterDrift } from '../../src/checks/pipeline-frontmatter-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';

const SHA = 'a3f2c19abcdef0123456789abcdef0123456789a';

function meta(opts: Partial<PageMeta> & { title: string }): PageMeta {
  return {
    schemaVersion: 1,
    type: 'person',
    aliases: [],
    categories: [],
    created: '2026-01-01',
    corrections: [],
    ...opts,
  };
}

function page(opts: { slug: string; locale: string; meta: PageMeta }): LoadedPage {
  return {
    slug: opts.slug,
    path: `/tmp/x/pages/${opts.locale}/${opts.slug}.md`,
    meta: opts.meta,
    body: '',
    text: '',
  };
}

function state(pages: LoadedPage[]): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages,
    derivedDir: '/tmp/x/d',
    derived: new Map(),
    placesCoords: [],
  };
}

test('pipeline-frontmatter: complete translation → no finding', () => {
  const p = page({
    slug: 'a',
    locale: 'ru',
    meta: meta({
      title: 'А',
      lang: 'ru',
      translationOf: 'a',
      canonicalSha: SHA,
      translatedAt: '2026-05-01',
      author: 'Claude Opus 4.7',
    }),
  });
  assert.deepEqual(detectPipelineFrontmatterDrift(state([p])), []);
});

test('pipeline-frontmatter: translation missing translation_of → finding', () => {
  const p = page({
    slug: 'a',
    locale: 'ru',
    meta: meta({ title: 'А', lang: 'ru', canonicalSha: SHA, translatedAt: '2026-05-01', author: 'Claude Opus 4.7' }),
  });
  const findings = detectPipelineFrontmatterDrift(state([p]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /translation_of/);
  assert.equal(findings[0]!.severity, 'warn');
  assert.equal(findings[0]!.category, 'schema');
});

test('pipeline-frontmatter: translation missing lang → finding', () => {
  // Located in pages/ru/ but no `lang:` set
  const p = page({
    slug: 'a',
    locale: 'ru',
    meta: meta({ title: 'А', translationOf: 'a', canonicalSha: SHA, translatedAt: '2026-05-01', author: 'Claude Opus 4.7' }),
  });
  const findings = detectPipelineFrontmatterDrift(state([p]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /lang/);
});

test('pipeline-frontmatter: translation missing several pipeline fields → one finding listing all', () => {
  const p = page({ slug: 'a', locale: 'ru', meta: meta({ title: 'А', lang: 'ru' }) });
  const findings = detectPipelineFrontmatterDrift(state([p]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /translation_of/);
  assert.match(findings[0]!.message, /canonical_sha/);
  assert.match(findings[0]!.message, /translated_at/);
  assert.match(findings[0]!.message, /author/);
});

test('pipeline-frontmatter: canonical EN page → no finding (pipeline fields not required there)', () => {
  const p = page({ slug: 'a', locale: 'en', meta: meta({ title: 'A', author: 'Claude Opus 4.7' }) });
  assert.deepEqual(detectPipelineFrontmatterDrift(state([p])), []);
});

test('pipeline-frontmatter: lang=en page in pages/en/ → no finding', () => {
  const p = page({ slug: 'a', locale: 'en', meta: meta({ title: 'A', lang: 'en' }) });
  assert.deepEqual(detectPipelineFrontmatterDrift(state([p])), []);
});

test('pipeline-frontmatter: top-level legacy page → no finding (not a per-locale page)', () => {
  const p: LoadedPage = {
    slug: 'a',
    path: '/tmp/x/pages/a.md',
    meta: meta({ title: 'A' }),
    body: '',
    text: '',
  };
  assert.deepEqual(detectPipelineFrontmatterDrift(state([p])), []);
});
