import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { correctRecords, type CorrectionsMap, loadPageCorrections } from './corrections.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import type { Correction } from '@core/pages/types.ts';

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
    ...overrides,
  };
}

test('correctRecords: empty corrections map returns the same map', () => {
  const records = new Map([['I1', rec('I1')]]);
  const out = correctRecords(records, new Map());
  assert.equal(out, records); // same reference
});

test('correctRecords: record without corrections is passed through unchanged', () => {
  const r = rec('I1');
  const records = new Map([['I1', r]]);
  const corrections: CorrectionsMap = new Map([['I999', [{ field: 'name', value: 'X', source: 's' }]]]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1'), r); // same reference
});

test('correctRecords: applies death.date correction to matching record', () => {
  const records = new Map([['I1', rec('I1')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'death.date', value: '1989', source: 'Find A Grave' }]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.death!.date, '1989');
});

test('correctRecords: does not mutate the input records map', () => {
  const r = rec('I1', { death: { date: '1990', place: 'Rome' } });
  const records = new Map([['I1', r]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'death.date', value: '1989', source: 's' }]],
  ]);
  correctRecords(records, corrections);
  assert.equal(records.get('I1')!.death!.date, '1990'); // original preserved
});

test('correctRecords: applies multiple records independently', () => {
  const records = new Map([['I1', rec('I1')], ['I2', rec('I2')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'name', value: 'Renamed One', source: 's' }]],
    ['I2', [{ field: 'name', value: 'Renamed Two', source: 's' }]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.name, 'Renamed One');
  assert.equal(out.get('I2')!.name, 'Renamed Two');
});

test('correctRecords: multiple corrections on the same record compose', () => {
  const records = new Map([['I1', rec('I1')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [
      { field: 'death.date', value: '1989', source: 's1' },
      { field: 'death.place', value: 'Italy', source: 's2' },
    ]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.death!.date, '1989');
  assert.equal(out.get('I1')!.death!.place, 'Italy');
});

function tempPagesDir(pages: Array<{ slug: string; frontmatter: string; body?: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), 'whoami-corrections-test-'));
  for (const p of pages) {
    const content = `---\n${p.frontmatter}\n---\n${p.body ?? ''}`;
    writeFileSync(join(dir, `${p.slug}.md`), content);
  }
  return dir;
}

test('loadPageCorrections: empty pages dir returns empty map', () => {
  const dir = tempPagesDir([]);
  try {
    const out = loadPageCorrections(dir);
    assert.equal(out.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: extracts a correction with explicit record id', () => {
  const dir = tempPagesDir([
    {
      slug: 'a',
      frontmatter: `title: A
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom:
  file: barash-tree.ged
  record: I1
  snapshot: abc
corrections:
  - record: I1
    field: death.date
    value: "1989"
    source: "src"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    const cs = out.get('I1');
    assert.ok(cs);
    assert.equal(cs!.length, 1);
    assert.equal(cs![0]!.value, '1989');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: stamps record from page gedcom.record when correction omits it', () => {
  const dir = tempPagesDir([
    {
      slug: 'sofia',
      frontmatter: `title: Sofia
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom:
  file: barash-tree.ged
  record: I372189255251
  snapshot: abc
corrections:
  - field: death.date
    value: "1989"
    source: "src"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    assert.equal(out.size, 1);
    assert.ok(out.get('I372189255251'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: skips correction when record is absent and page has no gedcom block', () => {
  const dir = tempPagesDir([
    {
      slug: 'meta',
      frontmatter: `title: Meta page
owner: x
editors: []
type: meta
aliases: []
categories: []
created: 2026-01-01
corrections:
  - field: death.date
    value: "1989"
    source: "src"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    assert.equal(out.size, 0); // no record id available, correction dropped
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: groups multiple pages targeting the same record', () => {
  const dir = tempPagesDir([
    {
      slug: 'a',
      frontmatter: `title: A
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I1, snapshot: abc }
corrections:
  - field: death.date
    value: "1989"
    source: "src1"`,
    },
    {
      slug: 'b',
      frontmatter: `title: B
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I2, snapshot: abc }
corrections:
  - record: I1
    field: death.place
    value: "Italy"
    source: "src2"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    const cs = out.get('I1');
    assert.ok(cs);
    assert.equal(cs!.length, 2); // one from page A's own subject, one cross-referenced from B
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: skips pages whose frontmatter fails Zod validation', () => {
  const dir = tempPagesDir([
    { slug: 'broken', frontmatter: `title: ""` }, // invalid: empty title
    {
      slug: 'good',
      frontmatter: `title: Good
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I1, snapshot: abc }
corrections:
  - field: death.date
    value: "1989"
    source: "src"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    assert.ok(out.get('I1')); // good page parsed
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
