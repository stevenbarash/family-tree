import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlacesDrift } from '../../src/checks/places-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { PlaceCoord } from '../../src/family/places-coords.ts';

function makeState(opts: {
  derived?: Map<string, DerivedRecord>;
  coords?: PlaceCoord[];
  gedcomText?: string;
}): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/genealogy/barash-tree.ged',
    gedcomText: opts.gedcomText ?? '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [] as ReadonlyArray<LoadedPage>,
    derivedDir: '/tmp/x/genealogy/derived',
    derived: opts.derived ?? new Map(),
    placesCoords: opts.coords ?? [],
  };
}

function ged(...placeStrings: string[]): string {
  return placeStrings.map(p => `2 PLAC ${p}`).join('\n');
}

function rec(id: string, opts: {
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
} = {}): DerivedRecord {
  return {
    record: id,
    name: `Person ${id}`,
    birth: (opts.birthDate || opts.birthPlace) ? { date: opts.birthDate ?? null, place: opts.birthPlace ?? null } : null,
    death: (opts.deathDate || opts.deathPlace) ? { date: opts.deathDate ?? null, place: opts.deathPlace ?? null } : null,
    parents: [],
    spouses: [],
    children: [],
    residences: [],
    occupations: [],
    sources: [],
    familyOfOrigin: [],
    marriages: [],
    media: [],
  };
}

test('places-drift: clean state → no findings', () => {
  assert.deepEqual(detectPlacesDrift(makeState({})), []);
});

test('places-drift: out-of-range latitude → schema error', () => {
  const coords: PlaceCoord[] = [
    { name: 'Bad', lat: 95, lon: 0, aliases: [] },
  ];
  const findings = detectPlacesDrift(makeState({ coords }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'schema');
  assert.equal(findings[0]!.severity, 'error');
  assert.match(findings[0]!.message, /invalid latitude 95/);
});

test('places-drift: out-of-range longitude → schema error', () => {
  const coords: PlaceCoord[] = [
    { name: 'Bad', lat: 0, lon: -200, aliases: [] },
  ];
  const findings = detectPlacesDrift(makeState({ coords }));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /invalid longitude -200/);
});

test('places-drift: alias collision across two entries → schema error', () => {
  const coords: PlaceCoord[] = [
    { name: 'A', lat: 0, lon: 0, aliases: ['shared'] },
    { name: 'B', lat: 1, lon: 1, aliases: ['shared'] },
  ];
  const findings = detectPlacesDrift(makeState({ coords }));
  const collisions = findings.filter(f => /claimed by 2 entries/.test(f.message));
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0]!.severity, 'error');
  assert.match(collisions[0]!.message, /"shared"/);
});

test('places-drift: alias duplicated within one entry → schema info (not error)', () => {
  const coords: PlaceCoord[] = [
    { name: 'A', lat: 0, lon: 0, aliases: ['dup', 'dup'] },
  ];
  const findings = detectPlacesDrift(makeState({ coords }));
  const dups = findings.filter(f => /listed twice within entry/.test(f.message));
  assert.equal(dups.length, 1);
  assert.equal(dups[0]!.severity, 'info');
});

test('places-drift: canonical name redundantly in same entry\'s aliases → no finding (harmless redundancy)', () => {
  const coords: PlaceCoord[] = [
    { name: 'Baltimore, Maryland, USA', lat: 39.29, lon: -76.61, aliases: ['Baltimore, Maryland, USA', 'Baltimore, Maryland'] },
  ];
  const findings = detectPlacesDrift(makeState({ coords }));
  assert.deepEqual(findings.filter(f => f.category === 'schema'), []);
});

test('places-drift: alias collides with another entry\'s canonical name → schema error', () => {
  const coords: PlaceCoord[] = [
    { name: 'Krumbach (Schwaben), Germany', lat: 48.24, lon: 10.36, aliases: [] },
    // Hypothetical second entry that aliases to the same string as Schwaben's canonical.
    { name: 'Krumbach (Bavaria, Amberg), Germany', lat: 49.44, lon: 11.85, aliases: ['Krumbach (Schwaben), Germany'] },
  ];
  const findings = detectPlacesDrift(makeState({ coords }));
  const collisions = findings.filter(f => /collides with canonical name/.test(f.message));
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0]!.severity, 'error');
});

test('places-drift: dead alias matches no GEDCOM string → coverage info', () => {
  const coords: PlaceCoord[] = [
    { name: 'Kyiv, Ukraine', lat: 50.45, lon: 30.52, aliases: ['Kiev, Ukraine', 'Khmelnystskyi-typo'] },
  ];
  const findings = detectPlacesDrift(makeState({ coords, gedcomText: ged('Kiev, Ukraine') }));
  const dead = findings.filter(f => /dead alias/.test(f.message));
  assert.equal(dead.length, 1);
  assert.match(dead[0]!.message, /"Khmelnystskyi-typo"/);
  assert.match(dead[0]!.message, /"Kyiv, Ukraine"/);
});

test('places-drift: dead-alias check sees PLAC strings from any event type (residence, etc), not just birth/death', () => {
  // GEDCOM has "Columbus, OH" only as a residence place — alias should still
  // be considered live, even though the joinCoords matcher uses birth/death.
  const coords: PlaceCoord[] = [
    { name: 'Columbus, Ohio, USA', lat: 39.96, lon: -82.99, aliases: ['Columbus, OH'] },
  ];
  const findings = detectPlacesDrift(makeState({ coords, gedcomText: ged('Columbus, OH') }));
  assert.deepEqual(findings.filter(f => /dead alias/.test(f.message)), []);
});

test('places-drift: dead-alias check skipped when GEDCOM text not loaded', () => {
  const coords: PlaceCoord[] = [
    { name: 'Anywhere', lat: 0, lon: 0, aliases: ['unused'] },
  ];
  const findings = detectPlacesDrift(makeState({ coords }));
  // No GEDCOM text → cannot validate aliases; should not flag.
  assert.deepEqual(findings.filter(f => /dead alias/.test(f.message)), []);
});

test('places-drift: anachronism — Soviet Union before 1922', () => {
  const derived = new Map([
    ['I1', rec('I1', { birthDate: '1902', birthPlace: 'Kiev, Ukraine, Soviet Union' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  const anachs = findings.filter(f => f.category === 'data');
  assert.equal(anachs.length, 1);
  assert.match(anachs[0]!.message, /Soviet Union existed 1922/);
  assert.match(anachs[0]!.message, /1902/);
});

test('places-drift: anachronism — Russian Empire after 1917', () => {
  const derived = new Map([
    ['I1', rec('I1', { deathDate: '1925', deathPlace: 'Krasilov, Khmelnytskyi, Ukraine, Russian Empire' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  const anachs = findings.filter(f => f.category === 'data');
  assert.equal(anachs.length, 1);
  assert.match(anachs[0]!.message, /Russian Empire ended in 1917/);
});

test('places-drift: anachronism — Prussia after 1947', () => {
  const derived = new Map([
    ['I1', rec('I1', { deathDate: '1960', deathPlace: 'Ostrowo, Posen, Prussia, Germany' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  const anachs = findings.filter(f => f.category === 'data');
  assert.equal(anachs.length, 1);
  assert.match(anachs[0]!.message, /Prussia was formally dissolved in 1947/);
});

test('places-drift: NOT an anachronism — Soviet Union 1941 (in-range)', () => {
  const derived = new Map([
    ['I1', rec('I1', { deathDate: '30 Sep 1941', deathPlace: 'Kiev, Ukraine, Soviet Union' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  assert.deepEqual(findings.filter(f => f.category === 'data'), []);
});

test('places-drift: NOT an anachronism — Russian Empire 1900 (in-range)', () => {
  const derived = new Map([
    ['I1', rec('I1', { birthDate: '1900', birthPlace: 'Kiev, Ukraine, Russian Empire' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  assert.deepEqual(findings.filter(f => f.category === 'data'), []);
});

test('places-drift: anachronism — "Bet 1900 And 1925, Russian Empire" flags via upper bound', () => {
  // The pre-fix bug: extracting only the first year (1900) made this
  // pass even though the upper bound (1925) postdates the empire's end.
  const derived = new Map([
    ['I1', rec('I1', { birthDate: 'Bet 1900 And 1925', birthPlace: 'Krasilov, Russian Empire' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  assert.equal(findings.filter(f => f.category === 'data').length, 1);
});

test('places-drift: anachronism — "Bef 1925, Russian Empire" flags', () => {
  const derived = new Map([
    ['I1', rec('I1', { deathDate: 'Bef 1925', deathPlace: 'Kiev, Ukraine, Russian Empire' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  assert.equal(findings.filter(f => f.category === 'data').length, 1);
});

test('places-drift: NOT an anachronism — "Bet 1923 And 1930, Soviet Union" (entire range valid)', () => {
  const derived = new Map([
    ['I1', rec('I1', { birthDate: 'Bet 1923 And 1930', birthPlace: 'X, Soviet Union' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  assert.deepEqual(findings.filter(f => f.category === 'data'), []);
});

test('places-drift: anachronism — Soviet Union after 1991 (upper bound)', () => {
  const derived = new Map([
    ['I1', rec('I1', { deathDate: '2005', deathPlace: 'X, Soviet Union' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  assert.equal(findings.filter(f => f.category === 'data').length, 1);
});

test('places-drift: anachronism — "Prussian" (adjective) does NOT trigger (only bare token)', () => {
  // "Prussian" appears in the GEDCOM in places like "Posen, Prussia, Germany" too.
  // The detector matches comma-bounded "Prussia", not the adjective "Prussian".
  const derived = new Map([
    ['I1', rec('I1', { deathDate: '1960', deathPlace: 'A Prussian-style estate, Germany' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  assert.deepEqual(findings.filter(f => f.category === 'data'), []);
});

test('places-drift: missing date → no anachronism finding (insufficient info)', () => {
  const derived = new Map([
    ['I1', rec('I1', { birthPlace: 'Anywhere, Soviet Union' })],
  ]);
  const findings = detectPlacesDrift(makeState({ derived }));
  assert.deepEqual(findings.filter(f => f.category === 'data'), []);
});
