import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { exportRedacted } from '../../src/export/run.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'export-'));
  const derived = join(root, 'genealogy', 'derived');
  mkdirSync(derived, { recursive: true });
  return root;
}

function writeRecord(root: string, rec: DerivedRecord): void {
  const path = join(root, 'genealogy', 'derived', `${rec.record}.yml`);
  writeFileSync(path, yaml.dump(rec), 'utf-8');
}

function basicRec(over: Partial<DerivedRecord>): DerivedRecord {
  return {
    record: 'I0',
    name: 'Default Name',
    birth: null,
    death: null,
    parents: [],
    spouses: [],
    children: [],
    familyOfOrigin: [],
    marriages: [],
    residences: [],
    occupations: [],
    sources: [],
    media: [],
    privacy: { restricted: false, reason: 'none' },
    ...over,
  };
}

test('exportRedacted: copies unrestricted records verbatim', () => {
  const root = setup();
  try {
    writeRecord(root, basicRec({ record: 'I1', name: 'Alice Public', birth: { date: '1900', place: 'X' } }));
    const out = join(root, 'export-out');
    const result = exportRedacted({ whoamiRoot: root, outDir: out, redactLiving: true });
    assert.deepEqual(result, { scanned: 1, copied: 1, redacted: 0, skipped: 0 });
    const written = yaml.load(readFileSync(join(out, 'genealogy/derived/I1.yml'), 'utf-8')) as DerivedRecord;
    assert.equal(written.name, 'Alice Public');
    assert.deepEqual(written.birth, { date: '1900', place: 'X' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exportRedacted: redacts restricted records when redactLiving=true', () => {
  const root = setup();
  try {
    writeRecord(root, basicRec({
      record: 'I2',
      name: 'Living Person',
      birth: { date: '28 Feb 1998', place: 'Pittsburgh' },
      parents: [{ record: 'I3', name: 'Parent', role: 'father' }],
      privacy: { restricted: true, reason: 'living-heuristic' },
    }));
    const out = join(root, 'export-out');
    const result = exportRedacted({ whoamiRoot: root, outDir: out, redactLiving: true });
    assert.deepEqual(result, { scanned: 1, copied: 0, redacted: 1, skipped: 0 });
    const written = yaml.load(readFileSync(join(out, 'genealogy/derived/I2.yml'), 'utf-8')) as DerivedRecord;
    assert.equal(written.name, 'L. P.');
    assert.equal(written.birth?.date, '1998');
    assert.equal(written.birth?.place, null);
    assert.deepEqual(written.parents, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exportRedacted: redactLiving=false copies restricted verbatim and warns', () => {
  const root = setup();
  try {
    writeRecord(root, basicRec({
      record: 'I3',
      name: 'Living Person',
      privacy: { restricted: true, reason: 'living-heuristic' },
    }));
    const out = join(root, 'export-out');
    const warnings: string[] = [];
    const result = exportRedacted({
      whoamiRoot: root,
      outDir: out,
      redactLiving: false,
      warn: (m) => warnings.push(m),
    });
    assert.deepEqual(result, { scanned: 1, copied: 1, redacted: 0, skipped: 0 });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /restricted but --redact-living was not set/);
    const written = yaml.load(readFileSync(join(out, 'genealogy/derived/I3.yml'), 'utf-8')) as DerivedRecord;
    assert.equal(written.name, 'Living Person');  // verbatim, not redacted
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exportRedacted: mixed batch — only restricted are redacted', () => {
  const root = setup();
  try {
    writeRecord(root, basicRec({ record: 'I1', name: 'Public Alice' }));
    writeRecord(root, basicRec({
      record: 'I2',
      name: 'Restricted Bob',
      privacy: { restricted: true, reason: 'living-heuristic' },
    }));
    writeRecord(root, basicRec({ record: 'I3', name: 'Public Carol' }));
    const out = join(root, 'export-out');
    const result = exportRedacted({ whoamiRoot: root, outDir: out, redactLiving: true });
    assert.deepEqual(result, { scanned: 3, copied: 2, redacted: 1, skipped: 0 });
    const i2 = yaml.load(readFileSync(join(out, 'genealogy/derived/I2.yml'), 'utf-8')) as DerivedRecord;
    assert.equal(i2.name, 'R. B.');
    const i1 = yaml.load(readFileSync(join(out, 'genealogy/derived/I1.yml'), 'utf-8')) as DerivedRecord;
    assert.equal(i1.name, 'Public Alice');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exportRedacted: missing derived dir → returns empty result with warning', () => {
  const root = mkdtempSync(join(tmpdir(), 'export-'));
  try {
    const warnings: string[] = [];
    const result = exportRedacted({
      whoamiRoot: root,
      outDir: join(root, 'export-out'),
      redactLiving: true,
      warn: (m) => warnings.push(m),
    });
    assert.deepEqual(result, { scanned: 0, copied: 0, redacted: 0, skipped: 0 });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /no derived directory/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exportRedacted: malformed YAML → skipped, others continue', () => {
  const root = setup();
  try {
    writeRecord(root, basicRec({ record: 'I1', name: 'Good' }));
    // Hand-write an invalid YAML structure (no record id)
    writeFileSync(
      join(root, 'genealogy/derived/I2.yml'),
      yaml.dump({ name: 'NoRecord' }),
      'utf-8',
    );
    const out = join(root, 'export-out');
    const warnings: string[] = [];
    const result = exportRedacted({
      whoamiRoot: root, outDir: out, redactLiving: true, warn: (m) => warnings.push(m),
    });
    assert.equal(result.scanned, 2);
    assert.equal(result.copied, 1);
    assert.equal(result.skipped, 1);
    assert.equal(warnings.filter(w => /skipped malformed/.test(w)).length, 1);
    // Good record still landed
    const files = readdirSync(join(out, 'genealogy/derived'));
    assert.deepEqual(files.sort(), ['I1.yml']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exportRedacted: ignores non-yml files in derived/', () => {
  const root = setup();
  try {
    writeRecord(root, basicRec({ record: 'I1', name: 'Real' }));
    writeFileSync(join(root, 'genealogy/derived/.DS_Store'), 'binary', 'utf-8');
    writeFileSync(join(root, 'genealogy/derived/notes.txt'), 'misc', 'utf-8');
    const out = join(root, 'export-out');
    const result = exportRedacted({ whoamiRoot: root, outDir: out, redactLiving: true });
    assert.equal(result.scanned, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
