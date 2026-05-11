import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outline, formatOutlineForTalk, type OutlinePlan } from '../../../src/commands/author/outline.js';
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
