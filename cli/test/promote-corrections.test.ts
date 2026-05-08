import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPromoteCorrections } from '../src/commands/promote-corrections.js';
import type { SourcedCorrection } from '@core/corrections/load.ts';

const sample: SourcedCorrection = {
  record: 'I1',
  field: 'death.date',
  value: '1989',
  source: 'Find A Grave #209496149',
  sourcePagePath: '/tmp/x/pages/sofia.md',
};

test('promote-corrections: dry-run prints planned diff and does not write', async () => {
  let out = '';
  let writes = 0;
  const code = await runPromoteCorrections({
    record: 'I1',
    apply: false,
    gedcomPath: '/tmp/x/g.ged',
    pagesDir: '/tmp/x/pages',
    loadCorrections: () => [sample],
    readFile: (path) => {
      if (path === '/tmp/x/g.ged') return '0 @I1@ INDI\n1 DEAT\n2 DATE 1990\n0 TRLR\n';
      if (path === '/tmp/x/pages/sofia.md') return '---\ntitle: X\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: 2026-01-01\ngedcom: { file: barash-tree.ged, record: I1, snapshot: abc }\ncorrections:\n  - field: death.date\n    value: "1989"\n    source: "Find A Grave #209496149"\n---\n';
      throw new Error('unknown path: ' + path);
    },
    writeFile: () => { writes += 1; },
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(writes, 0);
  assert.match(out, /1989/);
  assert.match(out, /Find A Grave/);
  assert.match(out, /dry-run|would write/i);
});

test('promote-corrections --apply: writes both files and reports', async () => {
  let out = '';
  const writes: Array<{ path: string; content: string }> = [];
  const code = await runPromoteCorrections({
    record: 'I1',
    apply: true,
    gedcomPath: '/tmp/x/g.ged',
    pagesDir: '/tmp/x/pages',
    loadCorrections: () => [sample],
    readFile: (path) => {
      if (path === '/tmp/x/g.ged') return '0 @I1@ INDI\n1 DEAT\n2 DATE 1990\n0 TRLR\n';
      if (path === '/tmp/x/pages/sofia.md') return '---\ntitle: X\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: 2026-01-01\ngedcom: { file: barash-tree.ged, record: I1, snapshot: abc }\ncorrections:\n  - field: death.date\n    value: "1989"\n    source: "Find A Grave #209496149"\n---\n';
      throw new Error('unknown path: ' + path);
    },
    writeFile: (path, content) => writes.push({ path, content }),
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(writes.length, 2);
  assert.ok(writes.find(w => w.path === '/tmp/x/g.ged' && /2 DATE 1989/.test(w.content)));
  assert.ok(writes.find(w => w.path.endsWith('.md') && !/corrections:/.test(w.content)));
  assert.match(out, /promoted/i);
});

test('promote-corrections: exits 1 when no correction matches the record', async () => {
  let outErr = '';
  const code = await runPromoteCorrections({
    record: 'I999',
    apply: false,
    gedcomPath: '/tmp/x/g.ged',
    pagesDir: '/tmp/x/pages',
    loadCorrections: () => [sample],
    readFile: () => '',
    writeFile: () => {},
    write: () => {},
    writeErr: (s) => { outErr += s; },
  });
  assert.equal(code, 1);
  assert.match(outErr, /no.*correction.*found/i);
});

test('promote-corrections --apply: two corrections to same record both land in GEDCOM', async () => {
  let out = '';
  // Track the latest GEDCOM written, simulating disk state
  let gedcomDisk = '0 @I1@ INDI\n1 NAME X //\n1 BIRT\n2 DATE 1900\n1 DEAT\n2 DATE 1990\n2 PLAC OldPlace\n0 TRLR\n';
  const writes: Array<{ path: string; content: string }> = [];
  const corrections: SourcedCorrection[] = [
    { record: 'I1', field: 'death.date', value: '1989', source: 's1', sourcePagePath: '/tmp/x/pages/p1.md' },
    { record: 'I1', field: 'death.place', value: 'NewPlace', source: 's2', sourcePagePath: '/tmp/x/pages/p2.md' },
  ];
  const code = await runPromoteCorrections({
    record: 'I1',
    apply: true,
    gedcomPath: '/tmp/x/g.ged',
    pagesDir: '/tmp/x/pages',
    loadCorrections: () => corrections,
    readFile: (p) => {
      if (p === '/tmp/x/g.ged') return gedcomDisk;
      // page files: build a minimal valid frontmatter for each
      const slug = p.includes('p1') ? 'p1' : 'p2';
      const field = p.includes('p1') ? 'death.date' : 'death.place';
      const value = p.includes('p1') ? '1989' : 'NewPlace';
      const src = p.includes('p1') ? 's1' : 's2';
      return `---\ntitle: ${slug}\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: 2026-01-01\ngedcom: { file: barash-tree.ged, record: I1, snapshot: abc }\ncorrections:\n  - field: ${field}\n    value: "${value}"\n    source: "${src}"\n---\n`;
    },
    writeFile: (p, c) => {
      writes.push({ path: p, content: c });
      if (p === '/tmp/x/g.ged') gedcomDisk = c;  // simulate disk update
    },
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 0);
  // Final GEDCOM must contain BOTH corrections.
  assert.match(gedcomDisk, /2 DATE 1989/);
  assert.match(gedcomDisk, /2 PLAC NewPlace/);
  assert.doesNotMatch(gedcomDisk, /2 DATE 1990/);
  assert.doesNotMatch(gedcomDisk, /OldPlace/);
});
