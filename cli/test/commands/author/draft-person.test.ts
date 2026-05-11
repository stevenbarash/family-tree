import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftPerson } from '../../../src/commands/author/draft-person.js';
import type { EvidenceDrawer } from '../../../src/commands/author/gather.js';
import type { OutlinePlan } from '../../../src/commands/author/outline.js';
import type { HarnessAdapter } from '../../../src/harness/types.js';

const drawer: EvidenceDrawer = {
  slug: 'aidele', derived: null, talkBody: null, researchNotes: [], narrativeBody: null, transcripts: [], inputs: [],
};
const plan: OutlinePlan = {
  person: { lead: 'L', sections: [] },
  episodes: [],
};

test('draftPerson: returns body and redlinks from harness', async () => {
  const harness: HarnessAdapter = {
    invoke: async () => ({ ok: true, result: { body: '# Aidele\n\nbody text', redlinks: ['boris-ayzman'] } }),
  };
  const out = await draftPerson(plan, drawer, harness);
  assert.match(out.body, /# Aidele/);
  assert.deepEqual(out.redlinks, ['boris-ayzman']);
});

test('draftPerson: defaults redlinks to empty array when omitted', async () => {
  const harness: HarnessAdapter = {
    invoke: async () => ({ ok: true, result: { body: 'body' } }),
  };
  const out = await draftPerson(plan, drawer, harness);
  assert.deepEqual(out.redlinks, []);
});

test('draftPerson: throws on harness failure', async () => {
  const harness: HarnessAdapter = {
    invoke: async () => ({ ok: false, error: 'failed', retryable: true }),
  };
  await assert.rejects(draftPerson(plan, drawer, harness), /draft-person: harness failed/);
});

test('draftPerson: passes plan, drawer, slug into harness context', async () => {
  let capturedContext: unknown = null;
  const harness: HarnessAdapter = {
    invoke: async (req) => {
      capturedContext = req.context;
      return { ok: true, result: { body: 'b' } };
    },
  };
  await draftPerson(plan, drawer, harness);
  const ctx = capturedContext as { slug: string; plan: OutlinePlan; drawer: EvidenceDrawer };
  assert.equal(ctx.slug, 'aidele');
  assert.deepEqual(ctx.plan, plan);
  assert.deepEqual(ctx.drawer, drawer);
});
