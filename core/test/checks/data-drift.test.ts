import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDataDrift } from '../../src/checks/data-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { PageMeta, Correction } from '../../src/pages/types.ts';

function metaWith(record: string, corrections: Correction[]): PageMeta {
  return {
    schemaVersion: 1,
    title: 'T',
    owner: 'x',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    gedcom: { file: 'g.ged', record, snapshot: 'abc' },
    created: '2026-01-01',
    corrections,
  };
}

function page(slug: string, record: string, corrections: Correction[]): LoadedPage {
  return {
    slug,
    path: `/tmp/x/pages/${slug}.md`,
    meta: metaWith(record, corrections),
    body: '',
    text: '',
  };
}

function rec(id: string, overrides: Partial<DerivedRecord> = {}): DerivedRecord {
  return {
    record: id,
    name: `Person ${id}`,
    birth: { date: '1900', place: 'Somewhere' },
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
    ...overrides,
  };
}

function makeState(pages: LoadedPage[], records: Map<string, DerivedRecord>): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages,
    derivedDir: '/tmp/x/d',
    derived: records,
    placesCoords: [],
  };
}

test('data-drift: no corrections → no findings', () => {
  const state = makeState([page('a', 'I1', [])], new Map([['I1', rec('I1')]]));
  assert.deepEqual(detectDataDrift(state), []);
});

test('data-drift: active correction (overlay differs from raw)', () => {
  const correction: Correction = { field: 'death.date', value: '1989', source: 'src' };
  const state = makeState(
    [page('a', 'I1', [correction])],
    new Map([['I1', rec('I1', { death: { date: '1990', place: 'Rome' } })]]),
  );
  const findings = detectDataDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'data');
  assert.match(findings[0]!.message, /active/);
  assert.match(findings[0]!.message, /1989/);
  assert.match(findings[0]!.message, /1990/);
});

test('data-drift: promotable correction (overlay matches raw)', () => {
  const correction: Correction = { field: 'death.date', value: '1989', source: 'src' };
  const state = makeState(
    [page('a', 'I1', [correction])],
    new Map([['I1', rec('I1', { death: { date: '1989', place: 'Rome' } })]]),
  );
  const findings = detectDataDrift(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /promotable/);
  assert.match(findings[0]!.message, /wai promote-corrections|drop/i);
});

test('data-drift: missing record id → finding flags it', () => {
  const correction: Correction = { record: 'I999', field: 'death.date', value: '1989', source: 'src' };
  const state = makeState([page('a', 'I1', [correction])], new Map([['I1', rec('I1')]]));
  const findings = detectDataDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'error');
  assert.match(findings[0]!.message, /I999.*not found/i);
});

test('data-drift: conflict — two pages target the same record/field with different values', () => {
  const c1: Correction = { record: 'I1', field: 'death.date', value: '1989', source: 's1' };
  const c2: Correction = { record: 'I1', field: 'death.date', value: '1988', source: 's2' };
  const state = makeState(
    [page('a', 'I1', [c1]), page('b', 'I2', [c2])],
    new Map([['I1', rec('I1')], ['I2', rec('I2')]]),
  );
  const findings = detectDataDrift(state);
  // Expect 1 conflict finding (with both pages cited) — duplicate per-correction findings
  // are de-duplicated when they merge into a single conflict.
  const conflicts = findings.filter(f => /conflict/i.test(f.message));
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.severity, 'error');
  assert.match(conflicts[0]!.message, /1988/);
  assert.match(conflicts[0]!.message, /1989/);
});

test('data-drift: correction defaults record to page own gedcom.record', () => {
  const correction: Correction = { field: 'name', value: 'Renamed', source: 'src' };
  const state = makeState(
    [page('a', 'I1', [correction])],
    new Map([['I1', rec('I1', { name: 'Original' })]]),
  );
  const findings = detectDataDrift(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /active/);
});

test('data-drift: correction with no record id and no page gedcom block → skipped (no findings)', () => {
  const meta: PageMeta = {
    schemaVersion: 1,
    title: 'T',
    owner: 'x',
    editors: [],
    type: 'meta',
    aliases: [],
    categories: [],
    created: '2026-01-01',
    corrections: [{ field: 'death.date', value: '1989', source: 'src' }],
  };
  const p: LoadedPage = { slug: 'a', path: '/tmp/x/pages/a.md', meta, body: '', text: '' };
  const state = makeState([p], new Map());
  // No record to attach correction to; detector silently skips.
  assert.deepEqual(detectDataDrift(state), []);
});
