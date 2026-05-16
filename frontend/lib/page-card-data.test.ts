import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLeadSentence } from './page-card-data';

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
