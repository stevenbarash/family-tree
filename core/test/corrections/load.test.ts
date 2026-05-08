import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPageCorrectionsWithSource, loadPageCorrections } from '../../src/corrections/load.ts';

function tempPagesDir(pages: Array<{ slug: string; frontmatter: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), 'whoami-corrections-test-'));
  for (const p of pages) {
    writeFileSync(join(dir, `${p.slug}.md`), `---\n${p.frontmatter}\n---\n`);
  }
  return dir;
}

const VALID_PAGE = `title: Sofia
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
    source: "src"`;

test('loadPageCorrectionsWithSource: tags each correction with source page path', () => {
  const dir = tempPagesDir([{ slug: 'sofia', frontmatter: VALID_PAGE }]);
  try {
    const out = loadPageCorrectionsWithSource(dir);
    assert.equal(out.length, 1);
    assert.match(out[0]!.sourcePagePath, /sofia\.md$/);
    assert.equal(out[0]!.value, '1989');
    assert.equal(out[0]!.record, 'I1'); // stamped from page.gedcom.record
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: groups by record id', () => {
  const dir = tempPagesDir([{ slug: 'sofia', frontmatter: VALID_PAGE }]);
  try {
    const out = loadPageCorrections(dir);
    assert.equal(out.size, 1);
    assert.equal(out.get('I1')!.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrectionsWithSource: empty dir returns empty array', () => {
  const dir = tempPagesDir([]);
  try {
    assert.deepEqual(loadPageCorrectionsWithSource(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
