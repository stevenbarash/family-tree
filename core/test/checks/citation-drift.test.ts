import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCitationDrift } from '../../src/checks/citation-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';

function page(slug: string, body: string): LoadedPage {
  const meta: PageMeta = {
    schemaVersion: 1,
    title: slug,
    owner: 'x',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    created: '2026-01-01',
    corrections: [],
  };
  // Mimic on-disk shape: real pages always have frontmatter, so the detector's
  // bodyStartIndex skip must handle the leading `---\n...\n---\n` block.
  const text = `---\ntitle: ${slug}\n---\n\n${body}`;
  return { slug, path: `/tmp/x/pages/${slug}.md`, meta, body, text };
}

function makeState(pages: LoadedPage[]): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages,
    derivedDir: '/tmp/x/d',
    derived: new Map(),
    placesCoords: [],
  };
}

// ---------------------------------------------------------------------------
// Acceptance — sentences with a source marker pass
// ---------------------------------------------------------------------------

test('citation-drift: sentence with a footnote ref passes', () => {
  const findings = detectCitationDrift(makeState([
    page('p', 'Boris was born in 1946.[^birth-cert]'),
  ]));
  assert.equal(findings.length, 0);
});

test('citation-drift: sentence with [?] marker passes', () => {
  const findings = detectCitationDrift(makeState([
    page('p', 'Boris emigrated in the late 1970s.[?]'),
  ]));
  assert.equal(findings.length, 0);
});

test('citation-drift: non-factual sentence (no year, date, or wikilink) passes', () => {
  const findings = detectCitationDrift(makeState([
    page('p', 'This page describes a person and their family.'),
  ]));
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Flagging — unsourced factual sentences are flagged
// ---------------------------------------------------------------------------

test('citation-drift: factual sentence with a year and no marker is flagged', () => {
  const findings = detectCitationDrift(makeState([
    page('p', 'Boris was born in 1946.'),
  ]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'citation');
  assert.match(findings[0]!.message, /Boris was born in 1946/);
});

test('citation-drift: factual sentence with a date and no marker is flagged', () => {
  const findings = detectCitationDrift(makeState([
    page('p', 'Boris was born on 27 Jul 1946.'),
  ]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'citation');
});

test('citation-drift: factual sentence with a wikilink and no marker is flagged', () => {
  const findings = detectCitationDrift(makeState([
    page('p', 'He married [[Galina Burmenko]].'),
  ]));
  assert.equal(findings.length, 1);
});

test('citation-drift: line-numbers are 1-based and point to the offending line', () => {
  const findings = detectCitationDrift(makeState([
    page('p', 'Lead paragraph with no facts.\n\nBoris was born in 1946.'),
  ]));
  assert.equal(findings.length, 1);
  // body starts at line 5 (frontmatter takes 3 lines + 1 blank), so the
  // sentence about 1946 is on line 7.
  assert.equal(findings[0]!.location.line, 7);
});

// ---------------------------------------------------------------------------
// Skip rules — frontmatter, code, headers, footnote defs, directives
// ---------------------------------------------------------------------------

test('citation-drift: frontmatter is not scanned', () => {
  // Build a page where `title: Born in 1946` appears in frontmatter; if
  // bodyStart works, it must not be flagged.
  const meta: PageMeta = {
    schemaVersion: 1, title: 'p', owner: 'x', editors: [], type: 'person',
    aliases: [], categories: [], created: '2026-01-01', corrections: [],
  };
  const text = `---\ntitle: Born in 1946\ncreated: 1946-01-01\n---\n\nBody has no claims.`;
  const findings = detectCitationDrift(makeState([
    { slug: 'p', path: '/tmp/p.md', meta, body: 'Body has no claims.', text },
  ]));
  assert.equal(findings.length, 0);
});

test('citation-drift: header lines are not scanned', () => {
  const findings = detectCitationDrift(makeState([
    page('p', '## Born in 1946\n\nThis page is about someone.'),
  ]));
  assert.equal(findings.length, 0);
});

test('citation-drift: footnote definitions are not scanned (the source line itself is not a claim)', () => {
  const findings = detectCitationDrift(makeState([
    page('p', '[^cert]: Birth certificate dated 27 Jul 1946'),
  ]));
  assert.equal(findings.length, 0);
});

test('citation-drift: fenced code blocks are not scanned', () => {
  const body = '```\nBoris was born in 1946.\n```';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 0);
});

test('citation-drift: single-colon directives (`::open ...`, `::cite-message ...`) on their own lines are not scanned as prose', () => {
  // ::open is a single-colon admonition. The detector treats `:::` triple-colon
  // blocks as opaque; single-colon directive lines flow through but should
  // typically be on their own as block-level. v1: flag if a `::open` line
  // contains an unsourced factual claim, since that's the editorial intent
  // (gap threads identify open questions but don't assert facts).
  const body = '::open When did Veniamin emigrate to the United States?';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  // The line contains "United States" but no year/date/wikilink — should pass.
  assert.equal(findings.length, 0);
});

test('citation-drift: multi-line `:::name ... :::` directive body is not scanned', () => {
  const body = ':::infobox-person\nname: Boris Smertenko\nborn: 27 Jul 1946\n:::\n\nProse line with no factual triggers.';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// List items — facts in bullets must also be sourced
// ---------------------------------------------------------------------------

test('citation-drift: list items with factual content are scanned', () => {
  const body = '* [[Victoria Smertenko]] (b. 15 Jul 1974) — born in Kiev';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 1);
});

test('citation-drift: list items with footnote references pass', () => {
  const body = '* [[Victoria Smertenko]] (b. 15 Jul 1974) — born in Kiev[^vital]';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Regression — the exact failure mode that motivated this detector
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Skip rules — talk pages, embedded frontmatter, See-also navigation
// ---------------------------------------------------------------------------

test('citation-drift: talk pages are exempt (working-notes surface)', () => {
  // Talk pages carry outline drafts and raw research notes — applying
  // citation strictness there blocks the working-doc flow.
  const meta: PageMeta = {
    schemaVersion: 1, title: 'p.talk', owner: 'x', editors: [], type: 'meta' as any,
    aliases: [], categories: [], created: '2026-01-01', corrections: [],
  };
  const body = '## Drafting plan\n\nBoris was born in 1946. He married Galina.';
  const text = `---\ntitle: p.talk\n---\n\n${body}`;
  const findings = detectCitationDrift(makeState([
    { slug: 'p.talk', path: '/tmp/x/pages/p.talk.md', meta, body, text },
  ]));
  assert.equal(findings.length, 0);
});

test('citation-drift: embedded second frontmatter block is skipped (forgiving the double-frontmatter author bug)', () => {
  // Some author-pipeline writes produced pages with two `---...---` blocks:
  // the API-added meta block on top, plus a model-written `type: person`
  // block before the article body. Lines like `created: 2026-05-10` inside
  // the embedded block contain a 4-digit year and would be flagged as
  // factual; treat the second `---` block as frontmatter and skip its content.
  const body = '---\ntitle: Boris\nowner: steven\ncreated: 2026-05-10\n---\n\nBody has no claims.';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 0);
});

test('citation-drift: bare-wikilink navigation list items (See also) are not flagged', () => {
  const body = '## See also\n* [[Galina Burmenko]]\n* [[Burmenko family]]\n- [[Smertenko family|Smertenko]]';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 0);
});

test('citation-drift: list items with a wikilink AND additional facts ARE flagged', () => {
  // The skip applies only to bare-wikilink lines. A list item that carries
  // a date, place, or any prose alongside the wikilink is a factual claim
  // and must be sourced.
  const body = '* [[Victoria Smertenko]] (b. 15 Jul 1974) — born in Kiev';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 1);
});

// ---------------------------------------------------------------------------
// Skip rules — See-also relation bullets + Bibliography / Further reading
// ---------------------------------------------------------------------------

test('citation-drift: See-also bullet "[[link]] — wife" (single relation descriptor) is not flagged', () => {
  // The wikilink is navigation; " — wife" is the relation tag with no
  // independent factual content. The whole bullet is a See-also entry and
  // shouldn't be held to citation strictness. Repro from authored pages
  // abram-frankel-born-frenkel, hayman-seplowitz, judah-judko-myszkowski,
  // seligman-lob-millhauser — each verify-blocked on these lines.
  const body = '## See also\n\n- [[leah-rosinsky|Leah Rosinsky]] — wife\n- [[joseph-frankel|Joseph Frankel]] — son';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 0);
});

test('citation-drift: See-also bullet with a YEAR in the descriptor IS still flagged', () => {
  // The relief-valve is narrow on purpose: a See-also bullet that smuggles
  // a date or year in the descriptor is making a factual claim, not just
  // listing a relation. Keep flagging those.
  const body = '## See also\n\n- [[bob]] — emigrated in 1898';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 1);
});

test('citation-drift: See-also bullet with a SECOND wikilink in the descriptor IS still flagged', () => {
  // Two wikilinks in a bullet implies a relational claim ("son of X"); the
  // first link alone is navigation but the descriptor names another entity.
  const body = '## See also\n\n- [[bob]] — son of [[alice]]';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 1);
});

test('citation-drift: Bibliography section lines are not flagged', () => {
  // ## Bibliography lists the sources the page draws on. Holding bibliography
  // entries to "must have a [^id] footnote" is recursive — bibliography
  // entries ARE the references. Repro from saul-howard-klaff and
  // moshe-dov-ber-kalwarisky-berekhyah which both got verify-blocked on
  // bibliography lines with years (Berl Kagan 1961, Maryland archives 2014).
  const body = '## Bibliography\n\n- Berl Kagan (ed.), *Yisker bukh Suvalk*. New York, 1961.\n- Maryland State Archives, 2014 deaths file.';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 0);
});

test('citation-drift: Further reading section lines are not flagged', () => {
  // Same rationale as Bibliography. Some pages use "Further reading" as the
  // section name when the listed items inform but weren't specifically cited.
  const body = '## Further reading\n\n- Meir Wunder, *Elef Margaliot* (1990s).\n- Neil Rosenstein, *The Unbroken Chain*.';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 0);
});

test('citation-drift: skipped-section rule resets on the next H2 header', () => {
  // After leaving a skipped section, normal scanning resumes. A factual
  // line in the next section must still be flagged.
  const body = '## Bibliography\n\n- Some Source, 1961.\n\n## Life\n\nBoris was born in 1946.';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /Boris was born in 1946/);
});

test('citation-drift: catches a fabricated narrative date (the Veniamin/1988 case)', () => {
  const body = 'After [[Galina Burmenko|Galina]]\'s father [[Veniamin Petrovich Burmenko]] arrived in the United States in 1988, he lived with the couple at their Brooklyn home until his death there on 29 Jan 1999.';
  const findings = detectCitationDrift(makeState([page('p', body)]));
  // Both clauses are factual (1988, 29 Jan 1999, wikilinks); both unsourced.
  // The sentence has no `[^id]` or `[?]` — must flag.
  assert.equal(findings.length >= 1, true);
  const blocked = findings.find(f => f.message.includes('1988') || f.message.includes('Veniamin'));
  assert.ok(blocked, 'detector must mention the offending content');
});
