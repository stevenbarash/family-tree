import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCoverageDrift } from '../../src/checks/coverage-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';
import type { PlaceCoord } from '../../src/family/places-coords.ts';

function page(slug: string, opts: { record?: string; body?: string } = {}): LoadedPage {
  const meta: PageMeta = {
    schemaVersion: 1,
    title: slug,
    owner: 'x',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    gedcom: opts.record ? { file: 'g.ged', record: opts.record, snapshot: 'abc' } : undefined,
    created: '2026-01-01',
    corrections: [],
  };
  return { slug, path: `/tmp/x/pages/${slug}.md`, meta, body: opts.body ?? '', text: opts.body ?? '' };
}

function rec(id: string, place?: string): DerivedRecord {
  return {
    record: id,
    name: `Person ${id}`,
    birth: place ? { date: null, place } : null,
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
  pages?: LoadedPage[];
  derived?: Map<string, DerivedRecord>;
  coords?: PlaceCoord[];
}): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: opts.pages ?? [],
    derivedDir: '/tmp/x/d',
    derived: opts.derived ?? new Map(),
    placesCoords: opts.coords ?? [],
  };
}

test('coverage-drift: clean state → no findings', () => {
  assert.deepEqual(detectCoverageDrift(makeState({})), []);
});

test('coverage-drift: redlink — page links to a slug not in the page set', () => {
  const a = page('alice', { body: 'See [[Bob Smith]] for details.' });
  const findings = detectCoverageDrift(makeState({ pages: [a] }));
  const redlinks = findings.filter(f => /redlink/i.test(f.message));
  assert.equal(redlinks.length, 1);
  assert.match(redlinks[0]!.message, /Bob Smith/);
});

test('coverage-drift: unmapped place — derived record uses a place with no coord match', () => {
  const records = new Map([['I1', rec('I1', 'Atlantis, Lost')]]);
  const findings = detectCoverageDrift(makeState({ derived: records }));
  const unmapped = findings.filter(f => /unmapped place/i.test(f.message));
  assert.equal(unmapped.length, 1);
  assert.match(unmapped[0]!.message, /Atlantis/);
});

test('coverage-drift: place resolves via alias → no unmapped finding', () => {
  const records = new Map([['I1', rec('I1', 'Kiev, Ukraine')]]);
  const coords: PlaceCoord[] = [
    { name: 'Kyiv, Ukraine', lat: 50.45, lon: 30.52, aliases: ['Kiev, Ukraine'] },
  ];
  const findings = detectCoverageDrift(makeState({ derived: records, coords }));
  const unmapped = findings.filter(f => /unmapped place/i.test(f.message));
  assert.equal(unmapped.length, 0);
});

test('coverage-drift: orphan derived — record without a page', () => {
  const records = new Map([['I1', rec('I1')], ['I2', rec('I2')]]);
  const pages = [page('alice', { record: 'I1' })];
  const findings = detectCoverageDrift(makeState({ pages, derived: records }));
  const orphans = findings.filter(f => /orphan derived/i.test(f.message));
  assert.equal(orphans.length, 1);
  assert.match(orphans[0]!.message, /I2/);
});

test('coverage-drift: page covers record → no orphan', () => {
  const records = new Map([['I1', rec('I1')]]);
  const pages = [page('alice', { record: 'I1' })];
  const findings = detectCoverageDrift(makeState({ pages, derived: records }));
  const orphans = findings.filter(f => /orphan derived/i.test(f.message));
  assert.equal(orphans.length, 0);
});
