import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync as fsReadSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseGedcomFile } from '../../src/gedcom/parser.ts';
import { deriveIndividual, writeDerivedYaml, hashGedcomFile } from '../../src/gedcom/derive.ts';

const FIX = (n: string) => join(import.meta.dirname, 'fixtures', n);

test('deriveIndividual: extracts name and birth', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const i1 = result.individuals.get('I1')!;
  const derived = deriveIndividual(i1, 'I1', result);
  assert.equal(derived.record, 'I1');
  assert.equal(derived.name, 'John Doe');
  assert.deepEqual(derived.birth, { date: '12 JAN 1950', place: 'Pittsburgh, PA, USA' });
  assert.equal(derived.death, null);
});

test('deriveIndividual: surfaces SEX as M / F / U', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const m = deriveIndividual(result.individuals.get('I1')!, 'I1', result);
  const f = deriveIndividual(result.individuals.get('I2')!, 'I2', result);
  assert.equal(m.sex, 'M');
  assert.equal(f.sex, 'F');
});

test('deriveIndividual: missing or invalid SEX → U', () => {
  // Build a minimal GedcomNode without the SEX tag.
  const noSexNode = { tag: 'INDI', data: undefined, tree: [{ tag: 'NAME', data: 'Pat /Doe/', tree: [] }] };
  const garbageSexNode = { tag: 'INDI', data: undefined, tree: [
    { tag: 'NAME', data: 'Pat /Doe/', tree: [] },
    { tag: 'SEX', data: 'XYZ', tree: [] },
  ]};
  const emptyCtx = { individuals: new Map(), families: new Map(), sources: new Map(), media: new Map() };
  // @ts-expect-error — minimal ctx shape sufficient for sex derivation
  const noSex = deriveIndividual(noSexNode, 'IX', emptyCtx);
  // @ts-expect-error — minimal ctx shape sufficient for sex derivation
  const garbageSex = deriveIndividual(garbageSexNode, 'IY', emptyCtx);
  assert.equal(noSex.sex, 'U');
  assert.equal(garbageSex.sex, 'U');
});

test('deriveIndividual: name handles "/Surname/" wrapper', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const i2 = result.individuals.get('I2')!;
  const derived = deriveIndividual(i2, 'I2', result);
  assert.equal(derived.name, 'Jane Doe');
});

test('deriveIndividual: birth without place keeps place null', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const i2 = result.individuals.get('I2')!;
  const derived = deriveIndividual(i2, 'I2', result);
  assert.deepEqual(derived.birth, { date: '5 MAR 1952', place: null });
});

test('deriveIndividual: extracts parents from FAMC', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const child = result.individuals.get('I3')!;
  const derived = deriveIndividual(child, 'I3', result);
  const records = derived.parents.map(p => p.record).sort();
  assert.deepEqual(records, ['I1', 'I2']);
  const names = derived.parents.map(p => p.name).sort();
  assert.deepEqual(names, ['Jane Doe', 'John Doe']);
});

test('deriveIndividual: returns empty parents for top of tree', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const i1 = result.individuals.get('I1')!;
  const derived = deriveIndividual(i1, 'I1', result);
  assert.deepEqual(derived.parents, []);
});

test('deriveIndividual: extracts spouses and children from FAMS', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const i1 = result.individuals.get('I1')!;
  const derived = deriveIndividual(i1, 'I1', result);
  assert.equal(derived.spouses.length, 1);
  assert.equal(derived.spouses[0]!.record, 'I2');
  assert.equal(derived.spouses[0]!.name, 'Jane Doe');
  assert.equal(derived.spouses[0]!.married, '14 FEB 1975');
  assert.equal(derived.children.length, 1);
  assert.equal(derived.children[0]!.record, 'I3');
  assert.equal(derived.children[0]!.born, '1 JUN 1980');
});

test('deriveIndividual: spouse "married" is null when FAM has no MARR DATE', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const fam = result.families.get('F1')!;
  const original = fam.tree;
  fam.tree = original.filter(n => n.tag !== 'MARR');
  try {
    const derived = deriveIndividual(result.individuals.get('I1')!, 'I1', result);
    assert.equal(derived.spouses[0]!.married, null);
  } finally {
    fam.tree = original;
  }
});

test('deriveIndividual: extracts residences', async () => {
  const result = await parseGedcomFile(FIX('multi-event.ged'));
  const derived = deriveIndividual(result.individuals.get('I1')!, 'I1', result);
  assert.equal(derived.residences.length, 1);
  assert.equal(derived.residences[0]!.date, 'FROM 1881 TO 1928');
  assert.equal(derived.residences[0]!.place, 'Teofipol, Khmelnytsky, Ukraine');
});

test('deriveIndividual: extracts occupations', async () => {
  const result = await parseGedcomFile(FIX('multi-event.ged'));
  const derived = deriveIndividual(result.individuals.get('I1')!, 'I1', result);
  assert.equal(derived.occupations.length, 1);
  assert.equal(derived.occupations[0]!.title, 'Seamstress');
  assert.equal(derived.occupations[0]!.date, 'FROM 1900');
});

test('deriveIndividual: extracts source citations with metadata', async () => {
  const result = await parseGedcomFile(FIX('multi-event.ged'));
  const derived = deriveIndividual(result.individuals.get('I1')!, 'I1', result);
  assert.equal(derived.sources.length, 3);
  // Full metadata: title, author, publisher, _APID, note
  assert.deepEqual(derived.sources[0], {
    record: 'S1',
    title: '1928 Teofipol Census',
    author: 'Soviet Statistical Bureau',
    publisher: 'Khmelnytsky Regional Archive',
    apid: '1,99999::0',
    note: 'Census conducted by district inspector',
  });
  // Partial: title only
  assert.deepEqual(derived.sources[1], {
    record: 'S2',
    title: 'Yad Vashem Pages of Testimony',
  });
  // Orphan: cited record has no matching SOUR top-level entry
  assert.deepEqual(derived.sources[2], { record: 'S99' });
});

test('deriveIndividual: emits familyOfOrigin grouped by FAMC', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const derived = deriveIndividual(result.individuals.get('I3')!, 'I3', result);
  assert.equal(derived.familyOfOrigin.length, 1);
  const foo = derived.familyOfOrigin[0]!;
  assert.equal(foo.fam, 'F1');
  assert.deepEqual(foo.father, { record: 'I1', name: 'John Doe' });
  assert.deepEqual(foo.mother, { record: 'I2', name: 'Jane Doe' });
  assert.deepEqual(foo.siblings, []);
  assert.equal(foo.marriedDate, '14 FEB 1975');
  assert.equal(foo.marriedPlace, 'Pittsburgh, PA, USA');
});

test('deriveIndividual: emits marriages grouped by FAMS with spouse + children', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const derived = deriveIndividual(result.individuals.get('I1')!, 'I1', result);
  assert.equal(derived.marriages.length, 1);
  const m = derived.marriages[0]!;
  assert.equal(m.fam, 'F1');
  assert.deepEqual(m.spouse, { record: 'I2', name: 'Jane Doe' });
  assert.equal(m.marriedDate, '14 FEB 1975');
  assert.equal(m.marriedPlace, 'Pittsburgh, PA, USA');
  assert.equal(m.children.length, 1);
  assert.deepEqual(m.children[0], { record: 'I3', name: 'Junior Doe', born: '1 JUN 1980' });
});

test('deriveIndividual: omits pedigree for default birth FAMC', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const derived = deriveIndividual(result.individuals.get('I3')!, 'I3', result);
  assert.equal(derived.familyOfOrigin[0]!.pedigree, undefined);
});

test('deriveIndividual: surfaces pedigree=adopted from FAMC > PEDI', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const i3 = result.individuals.get('I3')!;
  const original = i3.tree;
  // Inject PEDI=adopted under I3's FAMC.
  i3.tree = original.map(n =>
    n.tag === 'FAMC'
      ? { ...n, tree: [...n.tree, { tag: 'PEDI', data: 'adopted', tree: [] }] }
      : n,
  );
  try {
    const derived = deriveIndividual(i3, 'I3', result);
    assert.equal(derived.familyOfOrigin[0]!.pedigree, 'adopted');
  } finally {
    i3.tree = original;
  }
});

test('deriveIndividual: empty familyOfOrigin and marriages when no FAMC/FAMS', async () => {
  const result = await parseGedcomFile(FIX('tiny.ged'));
  const i1 = deriveIndividual(result.individuals.get('I1')!, 'I1', result);  // no FAMC
  const i3 = deriveIndividual(result.individuals.get('I3')!, 'I3', result);  // no FAMS
  assert.deepEqual(i1.familyOfOrigin, []);
  assert.deepEqual(i3.marriages, []);
});

test('deriveIndividual: extracts media joined from OBJE pointer', async () => {
  const result = await parseGedcomFile(FIX('multi-event.ged'));
  const derived = deriveIndividual(result.individuals.get('I1')!, 'I1', result);
  assert.equal(derived.media.length, 1);
  assert.deepEqual(derived.media[0], {
    record: 'O1',
    title: 'Aidele Ayzman 1928 Teofipol portrait',
    form: 'jpg',
    oid: '12345-abcde',
    primary: true,
  });
});

test('deriveIndividual: orphan OBJE pointer keeps record-only ref', async () => {
  const result = await parseGedcomFile(FIX('multi-event.ged'));
  const i1 = result.individuals.get('I1')!;
  const original = i1.tree;
  i1.tree = [
    ...original,
    { tag: 'OBJE', data: '@O999@', tree: [] },
  ];
  try {
    const derived = deriveIndividual(i1, 'I1', result);
    const orphan = derived.media.find(m => m.record === 'O999');
    assert.ok(orphan, 'orphan ref present');
    assert.equal(orphan!.title, undefined);
    assert.equal(orphan!.form, undefined);
  } finally {
    i1.tree = original;
  }
});

test('writeDerivedYaml: writes a stable YAML file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'derived-'));
  try {
    const result = await parseGedcomFile(FIX('tiny.ged'));
    const derived = deriveIndividual(result.individuals.get('I1')!, 'I1', result);
    const path = await writeDerivedYaml(dir, derived);
    const round1 = fsReadSync(path, 'utf-8');
    await writeDerivedYaml(dir, derived);
    const round2 = fsReadSync(path, 'utf-8');
    assert.equal(round1, round2);
    assert.match(round1, /record: I1/);
    assert.match(round1, /name: John Doe/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hashGedcomFile: returns 64-char hex digest', async () => {
  const hash = await hashGedcomFile(FIX('tiny.ged'));
  assert.match(hash, /^[0-9a-f]{64}$/);
});
