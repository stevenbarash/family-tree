import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLeadSentence, buildHoverDataBySlug } from './page-card-data';
import type { PageMetaSummary } from '@core/pages/index.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';

test('extractLeadSentence: returns the first non-blank prose line', () => {
  const body = 'Abby Rickelman was a milliner who arrived in Brooklyn in 1898.\n\nMore text here.';
  assert.equal(extractLeadSentence(body), 'Abby Rickelman was a milliner who arrived in Brooklyn in 1898.');
});

test('extractLeadSentence: skips opening frontmatter delimiter and content', () => {
  const body = '---\ntitle: Foo\n---\n\nLead line here.';
  assert.equal(extractLeadSentence(body), 'Lead line here.');
});

test('extractLeadSentence: skips H1/H2/H3 headings', () => {
  const body = '# A Heading\n\n## Subheading\n\nActual lead.';
  assert.equal(extractLeadSentence(body), 'Actual lead.');
});

test('extractLeadSentence: skips directive blocks (:::name … :::)', () => {
  const body = ':::infobox-person\nborn: 1880\n:::\n\nFirst prose line.';
  assert.equal(extractLeadSentence(body), 'First prose line.');
});

test('extractLeadSentence: skips fenced code blocks', () => {
  const body = '```\ncode here\n```\n\nFirst prose.';
  assert.equal(extractLeadSentence(body), 'First prose.');
});

test('extractLeadSentence: strips markdown emphasis and links', () => {
  const body = '**Boris** was a *teacher* in [[Brooklyn]] before 1946.';
  // Bold/italic markers stripped; wikilink reduced to its display text.
  assert.equal(extractLeadSentence(body), 'Boris was a teacher in Brooklyn before 1946.');
});

test('extractLeadSentence: truncates to ~160 chars with ellipsis', () => {
  const long = 'a'.repeat(250);
  const out = extractLeadSentence(long);
  assert.ok(out !== null, 'expected a non-null lead');
  assert.ok(out!.length <= 161, `expected length ≤ 161, got ${out!.length}`);
  assert.ok(out!.endsWith('…'), `expected ellipsis, got "${out!.slice(-3)}"`);
});

test('extractLeadSentence: returns null when nothing prose-like is found', () => {
  assert.equal(extractLeadSentence(''), null);
  assert.equal(extractLeadSentence('---\ntitle: Foo\n---\n'), null);
  assert.equal(extractLeadSentence('# Just a heading\n'), null);
});

test('extractLeadSentence: handles a list item as a lead (treat as prose, strip the bullet)', () => {
  const body = '- One thing happened.\n- Then another.';
  assert.equal(extractLeadSentence(body), 'One thing happened.');
});

function pmSummary(over: Partial<PageMetaSummary> & { slug: string; title: string }): PageMetaSummary {
  return {
    type: 'person',
    categories: [],
    aliases: [],
    isTalk: false,
    isArchived: false,
    ...over,
  };
}

function dRecord(over: Partial<DerivedRecord> & { record: string; name: string }): DerivedRecord {
  return {
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

test('buildHoverDataBySlug: produces entries with title, lead, portrait, and dates', () => {
  const list: PageMetaSummary[] = [
    pmSummary({ slug: 'abby', title: 'Abby Rickelman', gedcomRecord: '@I1@', portrait: 'abby.jpg' }),
  ];
  const derived = new Map<string, DerivedRecord>([
    ['@I1@', dRecord({ record: '@I1@', name: 'Abby Rickelman', birth: { date: '1 Jan 1880', place: null }, death: { date: '5 Mar 1955', place: null } })],
  ]);
  const bodies = new Map<string, string>([
    ['abby', 'Abby Rickelman was a milliner who arrived in Brooklyn in 1898.'],
  ]);
  const cards = buildHoverDataBySlug(list, derived, bodies);
  const abby = cards.get('abby');
  assert.ok(abby);
  assert.equal(abby.title, 'Abby Rickelman');
  assert.equal(abby.lead, 'Abby Rickelman was a milliner who arrived in Brooklyn in 1898.');
  assert.equal(abby.portrait, 'abby.jpg');
  assert.equal(abby.born, '1880');
  assert.equal(abby.died, '1955');
});

test('buildHoverDataBySlug: skips talk and archived pages', () => {
  const list: PageMetaSummary[] = [
    pmSummary({ slug: 'abby.talk', title: 'Talk: Abby', isTalk: true }),
    pmSummary({ slug: 'abby-old', title: 'Abby (archived)', isArchived: true }),
    pmSummary({ slug: 'abby', title: 'Abby' }),
  ];
  const cards = buildHoverDataBySlug(list, new Map(), new Map());
  assert.equal(cards.size, 1);
  assert.ok(cards.has('abby'));
});

test('buildHoverDataBySlug: lead is null when no body is provided for the slug', () => {
  const list: PageMetaSummary[] = [pmSummary({ slug: 'abby', title: 'Abby' })];
  const cards = buildHoverDataBySlug(list, new Map(), new Map());
  assert.equal(cards.get('abby')?.lead, null);
});

test('buildHoverDataBySlug: dates omitted when no derived record is joined', () => {
  const list: PageMetaSummary[] = [pmSummary({ slug: 'someplace', title: 'A Place', type: 'meta' })];
  const cards = buildHoverDataBySlug(list, new Map(), new Map());
  const e = cards.get('someplace');
  assert.ok(e);
  assert.equal(e.born, undefined);
  assert.equal(e.died, undefined);
});

test('buildHoverDataBySlug: living person (birth, no death) renders as "1990–"', () => {
  const list: PageMetaSummary[] = [pmSummary({ slug: 'boris', title: 'Boris', gedcomRecord: '@I1@' })];
  const derived = new Map<string, DerivedRecord>([
    ['@I1@', dRecord({ record: '@I1@', name: 'Boris', birth: { date: '15 Jun 1990', place: null }, death: { date: null, place: null } })],
  ]);
  const cards = buildHoverDataBySlug(list, derived, new Map());
  const boris = cards.get('boris');
  assert.equal(boris?.born, '1990');
  assert.equal(boris?.died, undefined);
});
