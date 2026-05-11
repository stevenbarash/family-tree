import { test } from 'node:test';
import assert from 'node:assert/strict';
import { research, formatResearchNote, type ResearchDeps } from '../../../src/commands/author/research.js';
import type { EvidenceDrawer } from '../../../src/commands/author/gather.js';

function fakeDrawer(over: Partial<EvidenceDrawer> = {}): EvidenceDrawer {
  return {
    slug: 'aidele',
    derived: null,
    talkBody: null,
    researchNotes: [],
    narrativeBody: null,
    transcripts: [],
    inputs: [],
    ...over,
  };
}

function fakeDeps(over: Partial<ResearchDeps> = {}): ResearchDeps {
  return {
    harness: { invoke: async () => ({ ok: true, result: { claims: [] } as never }) },
    client: {} as never,
    ...over,
  };
}

test('research: returns claims from harness result', async () => {
  const deps = fakeDeps({
    harness: {
      invoke: async () => ({
        ok: true,
        result: {
          claims: [
            { text: 'Aidele lived in Teofipol per 1928 census', url: 'https://collections.yadvashem.org/...', gap: 'origin family' },
          ],
        } as never,
      }),
    },
  });
  const out = await research(fakeDrawer({ derived: { record: 'I1', raw: 'name: Aidele' }, inputs: ['derived'] }), 12, deps);
  assert.equal(out.candidateClaims.length, 1);
  assert.equal(out.candidateClaims[0]!.url, 'https://collections.yadvashem.org/...');
  assert.equal(out.candidateClaims[0]!.gap, 'origin family');
  assert.equal(out.sourcesQueried, 1);
  assert.equal(out.refuseToFabricate, false);
});

test('research: refuseToFabricate=true when zero claims AND no local evidence', async () => {
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { claims: [] } as never }) },
  });
  const out = await research(fakeDrawer(), 12, deps);
  assert.equal(out.candidateClaims.length, 0);
  assert.equal(out.refuseToFabricate, true);
});

test('research: refuseToFabricate=false when zero claims but derived data exists', async () => {
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { claims: [] } as never }) },
  });
  const out = await research(fakeDrawer({ derived: { record: 'I1', raw: 'name: A' }, inputs: ['derived'] }), 12, deps);
  assert.equal(out.candidateClaims.length, 0);
  assert.equal(out.refuseToFabricate, false);
});

test('research: harness refuseToFabricate=true overrides local evidence check', async () => {
  const deps = fakeDeps({
    harness: {
      invoke: async () => ({
        ok: true,
        result: { claims: [], refuseToFabricate: true } as never,
      }),
    },
  });
  const out = await research(fakeDrawer({ derived: { record: 'I1', raw: 'name: A' }, inputs: ['derived'] }), 12, deps);
  assert.equal(out.refuseToFabricate, true);
});

test('research: harness failure throws', async () => {
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: false, error: 'harness broke', retryable: true }) },
  });
  await assert.rejects(research(fakeDrawer(), 12, deps), /harness failed/);
});

test('research: caps claims at maxClaims', async () => {
  const claims = Array.from({ length: 20 }, (_, i) => ({ text: `claim ${i}`, url: `https://example.com/${i}`, gap: `gap${i}` }));
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { claims } as never }) },
  });
  const out = await research(fakeDrawer(), 5, deps);
  assert.equal(out.candidateClaims.length, 5);
  assert.equal(out.sourcesQueried, 5);
});

test('research: sourcesQueried equals number of claims returned', async () => {
  const claims = [
    { text: 'claim 1', url: 'https://example.com/1', gap: 'gap1' },
    { text: 'claim 2', url: 'https://example.com/2', gap: 'gap2' },
    { text: 'claim 3', url: 'https://example.com/3', gap: 'gap3' },
  ];
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { claims } as never }) },
  });
  const out = await research(fakeDrawer(), 12, deps);
  assert.equal(out.sourcesQueried, 3);
});

test('formatResearchNote: includes text, gap, source URL, accessed date', () => {
  const note = formatResearchNote(
    { text: 'Aidele lived in Teofipol per 1928 census', url: 'https://yadvashem.org/x', gap: 'origin family' },
    '2026-05-10'
  );
  assert.match(note, /Aidele lived/);
  assert.match(note, /Gap: origin family/);
  assert.match(note, /https:\/\/yadvashem\.org\/x/);
  assert.match(note, /accessed 2026-05-10/);
});
