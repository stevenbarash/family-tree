import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNameTranDrift } from '../../src/checks/name-tran-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';

function pageMeta(opts: { title: string; record?: string; lang?: string }): PageMeta {
  return {
    schemaVersion: 1,
    title: opts.title,
    type: 'person',
    aliases: [],
    categories: [],
    ...(opts.record ? { gedcom: { file: 'g.ged', record: opts.record, snapshot: 'abc' } } : {}),
    created: '2026-01-01',
    corrections: [],
    ...(opts.lang ? { lang: opts.lang } : {}),
  };
}

function trPage(slug: string, locale: string, record: string, title: string): LoadedPage {
  return {
    slug,
    path: `/tmp/x/pages/${locale}/${slug}.md`,
    meta: pageMeta({ title, record, lang: locale }),
    body: '',
    text: '',
  };
}

function rec(id: string, nameTranslations?: Record<string, string>): DerivedRecord {
  return {
    record: id,
    name: `Person ${id}`,
    ...(nameTranslations ? { nameTranslations } : {}),
    birth: null,
    death: null,
    parents: [],
    spouses: [],
    children: [],
    residences: [],
    occupations: [],
    sources: [],
    familyOfOrigin: [],
    marriages: [],
    media: [],
    privacy: { restricted: false, reason: 'none' },
  };
}

function makeState(opts: {
  records?: Array<[string, Record<string, string> | undefined]>;
  pages?: LoadedPage[];
}): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: opts.pages ?? [],
    derivedDir: '/tmp/x/d',
    derived: new Map((opts.records ?? []).map(([id, tr]) => [id, rec(id, tr)])),
    placesCoords: [],
  };
}

test('name-tran-drift: NAME.TRAN matches translation title → no finding', () => {
  const state = makeState({
    records: [['I1', { ru: 'А', uk: 'Б', he: 'ג' }]],
    pages: [
      trPage('a', 'ru', 'I1', 'А'),
      trPage('a', 'uk', 'I1', 'Б'),
      trPage('a', 'he', 'I1', 'ג'),
    ],
  });
  assert.deepEqual(detectNameTranDrift(state), []);
});

test('name-tran-drift: NAME.TRAN differs from translation title → one finding per locale', () => {
  const state = makeState({
    records: [['I1', { ru: 'А', uk: 'Б' }]],
    pages: [
      trPage('a', 'ru', 'I1', 'А-WRONG'),
      trPage('a', 'uk', 'I1', 'Б'),
    ],
  });
  const findings = detectNameTranDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'warn');
  assert.equal(findings[0]!.category, 'data');
  assert.match(findings[0]!.message, /NAME\.TRAN \(ru\)/);
  assert.match(findings[0]!.message, /"А".*"А-WRONG"/);
  assert.equal(findings[0]!.location.file, '/tmp/x/pages/ru/a.md');
});

test('name-tran-drift: NAME.TRAN exists but no translation page for that locale → skip silently', () => {
  // Record has uk translation in GEDCOM but no uk page yet — that's fine.
  const state = makeState({
    records: [['I1', { ru: 'А', uk: 'Б', he: 'ג' }]],
    pages: [
      trPage('a', 'ru', 'I1', 'А'),
      // no uk, no he pages
    ],
  });
  assert.deepEqual(detectNameTranDrift(state), []);
});

test('name-tran-drift: translation page exists but no NAME.TRAN for record → skip silently', () => {
  // Phase 1 not yet promoted for this record — translation page exists,
  // GEDCOM has no TRAN. That's the "needs promotion" state, not drift.
  const state = makeState({
    records: [['I1', undefined]],
    pages: [trPage('a', 'ru', 'I1', 'Some title')],
  });
  assert.deepEqual(detectNameTranDrift(state), []);
});

test('name-tran-drift: canonical EN page (lang undefined) is never compared', () => {
  // Translation pages have lang set. Canonical EN pages have lang undefined
  // (or 'en'). The detector only looks at translation pages.
  const enPage: LoadedPage = {
    slug: 'a',
    path: '/tmp/x/pages/en/a.md',
    meta: pageMeta({ title: 'Some EN title', record: 'I1' }),
    body: '',
    text: '',
  };
  const state = makeState({
    records: [['I1', { ru: 'А' }]],
    pages: [enPage],  // no ru page; only the canonical
  });
  assert.deepEqual(detectNameTranDrift(state), []);
});

test('name-tran-drift: emits one finding per (record, locale) mismatch, not per page', () => {
  const state = makeState({
    records: [
      ['I1', { ru: 'А', uk: 'Б', he: 'ג' }],
      ['I2', { ru: 'Г' }],
    ],
    pages: [
      trPage('a', 'ru', 'I1', 'X'),    // drift
      trPage('a', 'uk', 'I1', 'Б'),    // ok
      trPage('a', 'he', 'I1', 'Y'),    // drift
      trPage('b', 'ru', 'I2', 'Z'),    // drift
    ],
  });
  const findings = detectNameTranDrift(state);
  assert.equal(findings.length, 3);
});
