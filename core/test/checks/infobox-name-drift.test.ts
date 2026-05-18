import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectInfoboxNameDrift } from '../../src/checks/infobox-name-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';

function meta(opts: { title: string; lang?: string; type?: PageMeta['type'] }): PageMeta {
  return {
    schemaVersion: 1,
    title: opts.title,
    type: opts.type ?? 'person',
    aliases: [],
    categories: [],
    created: '2026-01-01',
    corrections: [],
    ...(opts.lang ? { lang: opts.lang } : {}),
  };
}

function page(opts: { slug: string; locale: string; title: string; body: string; type?: PageMeta['type'] }): LoadedPage {
  return {
    slug: opts.slug,
    path: `/tmp/x/pages/${opts.locale}/${opts.slug}.md`,
    meta: meta({ title: opts.title, lang: opts.locale === 'en' ? undefined : opts.locale, type: opts.type }),
    body: opts.body,
    text: opts.body,
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

test('infobox-name: exact match → no finding', () => {
  const body = ':::infobox-person\nname: Abby Rickelman\nborn: 1880\n:::\n\nProse.';
  assert.deepEqual(detectInfoboxNameDrift(state([page({ slug: 'a', locale: 'en', title: 'Abby Rickelman', body })])), []);
});

test('infobox-name: clear divergence → warn finding', () => {
  const body = ':::infobox-person\nname: Someone Else\n:::\n';
  const findings = detectInfoboxNameDrift(state([page({ slug: 'a', locale: 'en', title: 'Abby Rickelman', body })]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'warn');
  assert.equal(findings[0]!.category, 'consistency');
  assert.match(findings[0]!.message, /infobox name/i);
  assert.match(findings[0]!.message, /Abby Rickelman/);
  assert.match(findings[0]!.message, /Someone Else/);
});

test('infobox-name: infobox name contains title as substring → allowed (richer form)', () => {
  // Clara case: title="Clara Barash", infobox name includes Hebrew form
  const body = ':::infobox-person\nname: Clara קלרה Barash\n:::\n';
  assert.deepEqual(detectInfoboxNameDrift(state([page({ slug: 'a', locale: 'en', title: 'Clara Barash', body })])), []);
});

test('infobox-name: quoted YAML value handled', () => {
  const body = ':::infobox-person\nname: "Aidele (recorded form *Eidel*)"\n:::\n';
  // title = Aidele, infobox name = Aidele (recorded form *Eidel*) — substring match
  assert.deepEqual(detectInfoboxNameDrift(state([page({ slug: 'a', locale: 'en', title: 'Aidele', body })])), []);
});

test('infobox-name: no infobox block → silent skip', () => {
  const body = 'Just prose, no infobox.\n';
  assert.deepEqual(detectInfoboxNameDrift(state([page({ slug: 'a', locale: 'en', title: 'Anything', body })])), []);
});

test('infobox-name: infobox block with no name field → silent skip', () => {
  const body = ':::infobox-person\nborn: 1880\n:::\n';
  assert.deepEqual(detectInfoboxNameDrift(state([page({ slug: 'a', locale: 'en', title: 'Anything', body })])), []);
});

test('infobox-name: non-person infobox is also checked (family/event)', () => {
  const body = ':::infobox-family\nname: The Smiths\n:::\n';
  const findings = detectInfoboxNameDrift(state([page({ slug: 'a', locale: 'en', title: 'The Joneses', body, type: 'family' })]));
  assert.equal(findings.length, 1);
});

test('infobox-name: translation page (lang=ru) flagged when title and infobox name diverge', () => {
  // Translations should keep title == infobox name for the locale.
  const body = ':::infobox-person\nname: Софья\n:::\n';
  const findings = detectInfoboxNameDrift(state([page({ slug: 'a', locale: 'ru', title: 'Анна', body })]));
  assert.equal(findings.length, 1);
});
