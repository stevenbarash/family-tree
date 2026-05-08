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
