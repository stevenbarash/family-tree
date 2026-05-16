import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outline, formatOutlineForTalk, replaceOrAppendOutline, type OutlinePlan } from '../../../src/commands/author/outline.js';
import type { EvidenceDrawer } from '../../../src/commands/author/gather.js';
import type { HarnessAdapter } from '../../../src/harness/types.js';

const emptyDrawer: EvidenceDrawer = {
  slug: 'aidele', derived: null, talkBody: null, researchNotes: [], narrativeBody: null, transcripts: [], inputs: [],
};

test('outline: returns parsed harness result', async () => {
  const expected: OutlinePlan = {
    person: { lead: 'Aidele was…', sections: [{ heading: 'Family', gist: 'Husband + 6 kids' }] },
    episodes: [{ slug: 'aidele-and-the-bazaliya-road', title: 'Aidele and the Bazaliya Road', scope: 'The 1942 ghetto liquidation' }],
  };
  const harness: HarnessAdapter = { invoke: async () => ({ ok: true, result: expected }) };
  const got = await outline(emptyDrawer, harness);
  assert.deepEqual(got, expected);
});

test('outline: harness failure throws', async () => {
  const harness: HarnessAdapter = { invoke: async () => ({ ok: false, error: 'broke', retryable: true }) };
  await assert.rejects(outline(emptyDrawer, harness), /outline: harness failed/);
});

test('formatOutlineForTalk: emits ## Drafting plan header and lead', () => {
  const plan: OutlinePlan = {
    person: { lead: 'Aidele was…', sections: [] },
    episodes: [],
  };
  const text = formatOutlineForTalk(plan);
  assert.match(text, /^## Drafting plan$/m);
  assert.match(text, /Lead: Aidele was/);
});

test('formatOutlineForTalk: lists sections', () => {
  const plan: OutlinePlan = {
    person: { lead: 'L', sections: [{ heading: 'Family', gist: 'g1' }, { heading: 'Death', gist: 'g2' }] },
    episodes: [],
  };
  const text = formatOutlineForTalk(plan);
  assert.match(text, /- Family: g1/);
  assert.match(text, /- Death: g2/);
});

test('formatOutlineForTalk: emits episode wikilinks', () => {
  const plan: OutlinePlan = {
    person: { lead: 'L', sections: [] },
    episodes: [{ slug: 'aidele-and-the-bazaliya-road', title: 'Aidele and the Bazaliya Road', scope: 'scope' }],
  };
  const text = formatOutlineForTalk(plan);
  assert.match(text, /\[\[aidele-and-the-bazaliya-road\|Aidele and the Bazaliya Road\]\]: scope/);
});

test('formatOutlineForTalk: shows "none" when no episodes', () => {
  const plan: OutlinePlan = {
    person: { lead: 'L', sections: [] },
    episodes: [],
  };
  const text = formatOutlineForTalk(plan);
  assert.match(text, /\*\*Episode spinoffs\*\*: none/);
});

test('formatOutlineForTalk: renders chronology entries before the person hub', () => {
  // Chronology surfaces the dated spine of the page on the talk page so a
  // reviewer can see what events the draft is organized around and what's
  // sourced versus what's [?] before the prose is even written.
  const plan: OutlinePlan = {
    person: { lead: 'L', sections: [] },
    episodes: [],
    chronology: [
      { date: '27 Jul 1946', event: 'Born in Kyiv', source: 'gedcom' },
      { date: 'Abt 1991', event: 'Naturalized in Eastern District of NY', source: 'research-note-3' },
    ],
  };
  const text = formatOutlineForTalk(plan);
  assert.match(text, /\*\*Chronology\*\*/);
  assert.match(text, /- 27 Jul 1946: Born in Kyiv \(gedcom\)/);
  assert.match(text, /- Abt 1991: Naturalized in Eastern District of NY \(research-note-3\)/);
  // Chronology appears before person hub so the reviewer reads the spine first.
  assert.ok(text.indexOf('**Chronology**') < text.indexOf('**Person hub**'));
});

test('formatOutlineForTalk: renders silences as named gaps', () => {
  // Silences are unfilled chronology stretches that the writer must *not*
  // paper over in prose. Surfacing them on the talk page is how they become
  // editorial open threads instead of getting silently invented.
  const plan: OutlinePlan = {
    person: { lead: 'L', sections: [] },
    episodes: [],
    silences: [
      '1910–1920: no US census record; emigration year unconfirmed.',
    ],
  };
  const text = formatOutlineForTalk(plan);
  assert.match(text, /\*\*Silences\*\*/);
  assert.match(text, /- 1910–1920: no US census record/);
});

test('replaceOrAppendOutline: appends when talk body has no prior plan', () => {
  // First run on a fresh slug: talk body has only research notes, no
  // plan yet. The new outline goes on the end with a blank-line gap.
  const existing = '## Research notes\n\n- a note from gather.\n';
  const outlineText = '## Drafting plan\n\n**Person hub**\n\nLead: X.\n';
  const result = replaceOrAppendOutline(existing, outlineText);
  assert.match(result, /## Research notes/);
  assert.match(result, /## Drafting plan/);
  // Outline should appear once, after the research notes.
  const planMatches = result.match(/## Drafting plan/g) ?? [];
  assert.equal(planMatches.length, 1);
  assert.ok(result.indexOf('## Research notes') < result.indexOf('## Drafting plan'));
});

test('replaceOrAppendOutline: replaces existing plan in place, preserves prior research notes', () => {
  // Second outline run on the same slug: the old plan should be replaced
  // by the new one, NOT appended. Research notes above stay; anything
  // below (an Agent log added by Phase 7, say) stays too. This is the
  // exact fix for the boris-ayzman duplicate-plan situation that bit
  // this session.
  const existing = [
    '## Research notes',
    '',
    '- a note from gather.',
    '',
    '## Drafting plan',
    '',
    '**Person hub**',
    '',
    'Lead: OLD lead, must be replaced.',
    '',
    '## Agent log',
    '',
    '- previous run log entry.',
  ].join('\n');
  const newOutline = '## Drafting plan\n\n**Person hub**\n\nLead: NEW lead.\n';
  const result = replaceOrAppendOutline(existing, newOutline);
  // Old lead is gone.
  assert.doesNotMatch(result, /OLD lead/);
  // New lead is present.
  assert.match(result, /NEW lead/);
  // Research notes preserved.
  assert.match(result, /a note from gather/);
  // Agent log preserved (it was after the old plan).
  assert.match(result, /previous run log entry/);
  // Exactly one Drafting plan section.
  const planMatches = result.match(/## Drafting plan/g) ?? [];
  assert.equal(planMatches.length, 1);
});

test('replaceOrAppendOutline: replaces a trailing plan with no later sections', () => {
  // Old plan was the last thing in the body. Replacement should yield
  // exactly the new plan at the end, with the same body before it.
  const existing = '## Research notes\n\n- note.\n\n## Drafting plan\n\nOLD CONTENT';
  const newOutline = '## Drafting plan\n\nNEW CONTENT';
  const result = replaceOrAppendOutline(existing, newOutline);
  assert.doesNotMatch(result, /OLD CONTENT/);
  assert.match(result, /NEW CONTENT/);
  assert.match(result, /- note\./);
  const planMatches = result.match(/## Drafting plan/g) ?? [];
  assert.equal(planMatches.length, 1);
});

test('replaceOrAppendOutline: empty body yields just the outline', () => {
  // A brand-new slug with no talk page yet — author.ts calls this with
  // existingBody = ''. The result is the outline alone, no leading blank.
  const result = replaceOrAppendOutline('', '## Drafting plan\n\ncontent');
  assert.equal(result, '## Drafting plan\n\ncontent');
});

test('replaceOrAppendOutline: does not match "## Drafting plan" inside a code fence', () => {
  // A research note quoting the prompt template — the literal string
  // `## Drafting plan` lives inside a fenced code block, with no real
  // drafting-plan section yet. Without line-anchoring, the bare
  // `indexOf('## Drafting plan')` matches the fenced occurrence; the splice
  // then replaces the contents of the fence and corrupts the talk body.
  // Anchored search finds no match and falls through to the append path.
  const existing = [
    '## Research notes',
    '',
    'Template excerpt for context:',
    '```markdown',
    '## Drafting plan',
    '',
    '**Person hub**',
    '```',
  ].join('\n');
  const newOutline = '## Drafting plan\n\n**Person hub**\n\nLead: NEW.\n';
  const result = replaceOrAppendOutline(existing, newOutline);
  // The fenced template block is preserved character-for-character.
  assert.match(result, /```markdown\n## Drafting plan\n\n\*\*Person hub\*\*\n```/);
  // The new outline appears once, after the fence.
  const planMatches = result.match(/## Drafting plan/g) ?? [];
  assert.equal(planMatches.length, 2); // one in fence, one in new section
  assert.match(result, /Lead: NEW/);
  // New section appears after the fenced quotation, not before/inside it.
  assert.ok(result.lastIndexOf('```') < result.indexOf('Lead: NEW'));
});

test('formatOutlineForTalk: omits chronology and silences blocks when arrays empty or absent', () => {
  // Backwards compat: a plan without these fields renders the same shape as
  // before (no Chronology / Silences headers), so existing talk pages don't
  // get phantom-empty sections after the upgrade.
  const planWithEmpty: OutlinePlan = {
    person: { lead: 'L', sections: [] },
    episodes: [],
    chronology: [],
    silences: [],
  };
  const planWithoutFields: OutlinePlan = {
    person: { lead: 'L', sections: [] },
    episodes: [],
  };
  for (const plan of [planWithEmpty, planWithoutFields]) {
    const text = formatOutlineForTalk(plan);
    assert.doesNotMatch(text, /\*\*Chronology\*\*/);
    assert.doesNotMatch(text, /\*\*Silences\*\*/);
  }
});
