import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectConsistencyDrift, extractQuotedPhrases } from '../../src/checks/consistency-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function page(slug: string, opts: {
  body?: string;
  record?: string;
  corrections?: Array<{ field: 'birth.date' | 'birth.place' | 'death.date' | 'death.place' | 'name'; value: string; source: string }>;
} = {}): LoadedPage {
  const meta: PageMeta = {
    schemaVersion: 1,
    title: slug,
    owner: 'x',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    gedcom: opts.record
      ? { file: 'g.ged', record: opts.record, snapshot: 'abc' }
      : undefined,
    created: '2026-01-01',
    corrections: opts.corrections ?? [],
  };
  const body = opts.body ?? '';
  return { slug, path: `/tmp/x/pages/${slug}.md`, meta, body, text: body };
}

function derivedRec(id: string, opts: {
  birthDate?: string | null;
  birthPlace?: string | null;
  deathDate?: string | null;
} = {}): DerivedRecord {
  return {
    record: id,
    name: `Person ${id}`,
    birth: (opts.birthDate !== undefined || opts.birthPlace !== undefined)
      ? { date: opts.birthDate ?? null, place: opts.birthPlace ?? null }
      : null,
    death: opts.deathDate !== undefined
      ? { date: opts.deathDate, place: null }
      : null,
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
  };
}

function makeState(opts: {
  pages?: LoadedPage[];
  derived?: Map<string, DerivedRecord>;
}): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: opts.pages ?? [],
    derivedDir: '/tmp/x/d',
    derived: opts.derived ?? new Map(),
    placesCoords: [],
  };
}

// ---------------------------------------------------------------------------
// Footnote orphan tests
// ---------------------------------------------------------------------------

test('consistency-drift: matched footnotes → no findings', () => {
  const body = [
    'Some text.[^fn1]',
    '',
    '[^fn1]: The footnote definition.',
  ].join('\n');
  const findings = detectConsistencyDrift(makeState({ pages: [page('alice', { body })] }));
  assert.deepEqual(findings, []);
});

test('consistency-drift: footnote referenced but never defined → error', () => {
  const body = 'Some text.[^missing]';
  const findings = detectConsistencyDrift(makeState({ pages: [page('alice', { body })] }));
  const orphans = findings.filter(f => /referenced but never defined/.test(f.message));
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0]!.category, 'consistency');
  assert.equal(orphans[0]!.severity, 'error');
  assert.match(orphans[0]!.message, /\[\^missing\]/);
});

test('consistency-drift: footnote defined but never referenced → error', () => {
  const body = [
    'Some prose with no inline refs.',
    '',
    '[^unused]: An unused definition.',
  ].join('\n');
  const findings = detectConsistencyDrift(makeState({ pages: [page('alice', { body })] }));
  const orphans = findings.filter(f => /defined but never referenced/.test(f.message));
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0]!.category, 'consistency');
  assert.equal(orphans[0]!.severity, 'error');
  assert.match(orphans[0]!.message, /\[\^unused\]/);
});

// ---------------------------------------------------------------------------
// Bibliography mismatch tests
// ---------------------------------------------------------------------------

test('consistency-drift: inline cite-vault present in bibliography → no finding', () => {
  const body = [
    'He was born in 1880.::cite-vault{snapshot=snap1 note="census 1880"}',
    '',
    '## Bibliography',
    '',
    '::cite-vault{snapshot=snap1 note="census 1880"}',
  ].join('\n');
  const findings = detectConsistencyDrift(makeState({ pages: [page('alice', { body })] }));
  const bib = findings.filter(f => /cite-vault/.test(f.message));
  assert.equal(bib.length, 0);
});

test('consistency-drift: inline cite-vault not in bibliography → info finding', () => {
  const body = [
    'He was born in 1880.::cite-vault{snapshot=snap1 note="census 1880"}',
    '',
    '## Bibliography',
    '',
    '(no entries)',
  ].join('\n');
  const findings = detectConsistencyDrift(makeState({ pages: [page('alice', { body })] }));
  const bib = findings.filter(f => /inline cite-vault entry not listed/.test(f.message));
  assert.equal(bib.length, 1);
  assert.equal(bib[0]!.category, 'consistency');
  assert.equal(bib[0]!.severity, 'info');
});

test('consistency-drift: a body mention of "## Bibliography" mid-prose is not treated as the section', () => {
  // A bare `indexOf('## Bibliography')` matches mid-paragraph text like
  // "see ## Bibliography below." Before the line-anchoring fix, the
  // bibSection slice would start at that mid-prose position — sweeping any
  // body-prose `::cite-vault` directives between the false match and the
  // real `## Bibliography` into the bib-keys set, so a real
  // "inline cite missing from bibliography" finding would be hidden.
  // The page below has a cite-vault appearing between the prose mention
  // and the actual bib section; with the fix, that cite IS counted as
  // inline-only and the missing-from-bib finding surfaces.
  const body = [
    'In the source list (see ## Bibliography below), entries are sorted.',
    '',
    'He married in 1892.::cite-vault{snapshot=snapX note="marriage 1892"}',
    '',
    '## Bibliography',
    '',
    '(no entries)',
  ].join('\n');
  const findings = detectConsistencyDrift(makeState({ pages: [page('alice', { body })] }));
  const bib = findings.filter(f => /inline cite-vault entry not listed/.test(f.message));
  assert.equal(bib.length, 1, 'expected one missing-from-bib finding, not hidden by mid-prose match');
});

// ---------------------------------------------------------------------------
// GEDCOM mismatch tests
// ---------------------------------------------------------------------------

test('consistency-drift: page without gedcom.record frontmatter → no GEDCOM findings', () => {
  const body = [
    ':::infobox-person',
    'born: 1 Jan 1880',
    'died: 5 Mar 1950',
    ':::',
  ].join('\n');
  // No record= → no gedcom link
  const findings = detectConsistencyDrift(makeState({ pages: [page('alice', { body })] }));
  const gedcom = findings.filter(f => /infobox/.test(f.message));
  assert.equal(gedcom.length, 0);
});

test('consistency-drift: GEDCOM born matches infobox → no finding', () => {
  const body = [
    ':::infobox-person',
    'born: 12 Jan 1880',
    ':::',
  ].join('\n');
  const derived = new Map([['I1', derivedRec('I1', { birthDate: '12 Jan 1880' })]]);
  const findings = detectConsistencyDrift(makeState({
    pages: [page('alice', { body, record: 'I1' })],
    derived,
  }));
  const gedcom = findings.filter(f => /born/.test(f.message));
  assert.equal(gedcom.length, 0);
});

test('consistency-drift: GEDCOM born mismatch with no corrections → error', () => {
  const body = [
    ':::infobox-person',
    'born: 1 Jan 1880',
    ':::',
  ].join('\n');
  const derived = new Map([['I1', derivedRec('I1', { birthDate: '5 Mar 1882' })]]);
  const findings = detectConsistencyDrift(makeState({
    pages: [page('alice', { body, record: 'I1' })],
    derived,
  }));
  const gedcom = findings.filter(f => /infobox born/.test(f.message));
  assert.equal(gedcom.length, 1);
  assert.equal(gedcom[0]!.category, 'consistency');
  assert.equal(gedcom[0]!.severity, 'error');
  assert.match(gedcom[0]!.message, /no corrections entry/);
});

test('consistency-drift: GEDCOM mismatch covered by corrections entry → no finding', () => {
  const body = [
    ':::infobox-person',
    'born: 1 Jan 1880',
    ':::',
  ].join('\n');
  const derived = new Map([['I1', derivedRec('I1', { birthDate: '5 Mar 1882' })]]);
  const corrections = [{ field: 'birth.date' as const, value: '1 Jan 1880', source: 'family confirmation' }];
  const findings = detectConsistencyDrift(makeState({
    pages: [page('alice', { body, record: 'I1', corrections })],
    derived,
  }));
  const gedcom = findings.filter(f => /infobox born/.test(f.message));
  assert.equal(gedcom.length, 0);
});

test('consistency-drift: GEDCOM birthplace mismatch with no corrections → error', () => {
  const body = [
    ':::infobox-person',
    'birthplace: Minsk, Belarus',
    ':::',
  ].join('\n');
  const derived = new Map([['I1', derivedRec('I1', { birthPlace: 'Kiev, Ukraine' })]]);
  const findings = detectConsistencyDrift(makeState({
    pages: [page('alice', { body, record: 'I1' })],
    derived,
  }));
  const gedcom = findings.filter(f => /infobox birthplace/.test(f.message));
  assert.equal(gedcom.length, 1);
  assert.equal(gedcom[0]!.severity, 'error');
});

test('consistency-drift: empty state → no findings', () => {
  assert.deepEqual(detectConsistencyDrift(makeState({})), []);
});

// ---------------------------------------------------------------------------
// extractQuotedPhrases tests
// ---------------------------------------------------------------------------

test('extractQuotedPhrases: pulls double-quoted phrases from prose', () => {
  const body = 'Boris had the "For Defense of Kyiv" medal and also "For Victory".';
  assert.deepEqual(extractQuotedPhrases(body), ['For Defense of Kyiv', 'For Victory']);
});

test('extractQuotedPhrases: pulls guillemet-quoted phrases', () => {
  const body = 'The book reads «Айзман Борис Хаскельович» on p. 120.';
  assert.deepEqual(extractQuotedPhrases(body), ['Айзман Борис Хаскельович']);
});

test('extractQuotedPhrases: handles mixed quote styles in one body', () => {
  const body = 'Medal "За оборону Києва" matches «За оборону Києва» (Ukrainian).';
  assert.deepEqual(extractQuotedPhrases(body), ['За оборону Києва', 'За оборону Києва']);
});

test('extractQuotedPhrases: ignores empty quotes and apostrophes', () => {
  const body = "It's his \"\" or '' — neither counts. \"Real phrase\" does.";
  assert.deepEqual(extractQuotedPhrases(body), ['Real phrase']);
});

test('extractQuotedPhrases: trims whitespace inside quotes', () => {
  const body = 'Phrase: "  spaced out  " — kept trimmed.';
  assert.deepEqual(extractQuotedPhrases(body), ['spaced out']);
});

test('extractQuotedPhrases: returns empty array for empty body', () => {
  assert.deepEqual(extractQuotedPhrases(''), []);
});
