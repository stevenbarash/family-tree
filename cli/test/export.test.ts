import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runExport } from '../src/commands/export.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cli-export-'));
  const derived = join(root, 'genealogy', 'derived');
  mkdirSync(derived, { recursive: true });
  writeFileSync(join(derived, 'I1.yml'), `
record: I1
name: Alice Public
birth: null
death: null
parents: []
spouses: []
children: []
familyOfOrigin: []
marriages: []
residences: []
occupations: []
sources: []
media: []
privacy:
  restricted: false
  reason: none
`.trimStart(), 'utf-8');
  writeFileSync(join(derived, 'I2.yml'), `
record: I2
name: Living Bob
birth:
  date: '1998'
  place: NYC
death: null
parents: []
spouses: []
children: []
familyOfOrigin: []
marriages: []
residences: []
occupations: []
sources: []
media: []
privacy:
  restricted: true
  reason: living-heuristic
`.trimStart(), 'utf-8');
  return root;
}

test('runExport: prints summary, returns counts', async () => {
  const root = fixture();
  try {
    let out = '';
    let err = '';
    const result = await runExport({
      whoamiRoot: root,
      outDir: join(root, 'out'),
      redactLiving: true,
      write: (s) => { out += s; },
      writeErr: (s) => { err += s; },
    });
    assert.equal(result.scanned, 2);
    assert.equal(result.copied, 1);
    assert.equal(result.redacted, 1);
    assert.match(out, /exported 2 records/);
    assert.match(out, /1 verbatim/);
    assert.match(out, /1 redacted/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runExport: redactLiving=false produces stderr warning for restricted records', async () => {
  const root = fixture();
  try {
    let err = '';
    await runExport({
      whoamiRoot: root,
      outDir: join(root, 'out'),
      redactLiving: false,
      write: () => {},
      writeErr: (s) => { err += s; },
    });
    assert.match(err, /restricted but --redact-living was not set/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
