import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcomFile } from '../../src/gedcom/parser.ts';

const FIX = (n: string) => join(import.meta.dirname, 'fixtures', n);

test('parseGedcomFile: returns INDI and FAM records by id', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  assert.equal(result.individuals.size, 3);
  assert.equal(result.families.size, 1);
  assert.ok(result.individuals.has('I1'));
  assert.ok(result.families.has('F1'));
});

test('parseGedcomFile: rejects ANSEL-encoded GEDCOM', async () => {
  await assert.rejects(parseGedcomFile(FIX('ansel-rejected.ged')), /ANSEL/i);
});

test('parseGedcomFile: rejects when CHAR is missing', async () => {
  const tmpFile = join(import.meta.dirname, 'fixtures', '_tmp-no-char.ged');
  const { writeFileSync, unlinkSync } = await import('node:fs');
  writeFileSync(tmpFile, '0 HEAD\n0 @I1@ INDI\n1 NAME X /Y/\n0 TRLR\n');
  try {
    await assert.rejects(parseGedcomFile(tmpFile), /CHAR/i);
  } finally {
    unlinkSync(tmpFile);
  }
});

test('parseGedcomFile: each individual exposes its raw children tree', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const i1 = result.individuals.get('I1')!;
  const nameNode = i1.tree.find(n => n.tag === 'NAME');
  assert.equal(nameNode?.data, 'John /Doe/');
});

test('parseGedcomFile: parses a GEDCOM 7.0 file (no CHAR required)', async () => {
  const result = await parseGedcomFile(FIX('tiny-v7.ged'));
  assert.equal(result.individuals.size, 2);
  assert.equal(result.families.size, 1);
  const i1 = result.individuals.get('I1')!;
  assert.equal(i1.tree.find(n => n.tag === 'NAME')?.data, 'Alice /Smith/');
  assert.equal(i1.tree.find(n => n.tag === 'SEX')?.data, 'F');
  // HUSB pointer in F1 should resolve to "@I2@" — payload that's a struct ref
  // gets serialized back to its xref_id wrapped in @...@.
  const f1 = result.families.get('F1')!;
  assert.equal(f1.tree.find(n => n.tag === 'HUSB')?.data, '@I2@');
});
