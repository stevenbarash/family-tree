import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftEpisode } from '../../../src/commands/author/draft-episode.js';
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
const episode = { slug: 'aidele-and-the-bazaliya-road', title: 'Aidele and the Bazaliya Road', scope: 'The 1942 liquidation' };

test('draftEpisode: returns body and redlinks', async () => {
  const harness: HarnessAdapter = {
    invoke: async () => ({ ok: true, result: { body: '# Episode\n\nbody', redlinks: [] } }),
  };
  const out = await draftEpisode(episode, drawer, plan, harness);
  assert.match(out.body, /# Episode/);
  assert.deepEqual(out.redlinks, []);
});

test('draftEpisode: throws on harness failure with episode slug in error', async () => {
  const harness: HarnessAdapter = {
    invoke: async () => ({ ok: false, error: 'broke', retryable: true }),
  };
  await assert.rejects(draftEpisode(episode, drawer, plan, harness), /draft-episode: harness failed for aidele-and-the-bazaliya-road/);
});

test('draftEpisode: passes episode, drawer, plan into harness context', async () => {
  let capturedContext: unknown = null;
  const harness: HarnessAdapter = {
    invoke: async (req) => {
      capturedContext = req.context;
      return { ok: true, result: { body: 'b' } };
    },
  };
  await draftEpisode(episode, drawer, plan, harness);
  const ctx = capturedContext as { episode: typeof episode; drawer: EvidenceDrawer; plan: OutlinePlan };
  assert.equal(ctx.episode.slug, episode.slug);
  assert.deepEqual(ctx.drawer, drawer);
  assert.deepEqual(ctx.plan, plan);
});
