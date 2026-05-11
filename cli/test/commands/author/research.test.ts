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
    harness: { invoke: async () => ({ ok: true, result: { queries: [] } as never }) },
    webSearch: async () => [],
    webFetch: async () => null,
    client: {} as never,
    ...over,
  };
}

test('research: drops unreliable sources; keeps reliable ones', async () => {
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { queries: [{ text: 'Aidele Teofipol', gap: 'origin family' }] } as never }) },
    webSearch: async () => [
      { title: 'Random blog', url: 'https://randomblog.com/aidele', snippet: '...' },
      { title: 'Yad Vashem entry', url: 'https://collections.yadvashem.org/...', snippet: '...' },
      { title: 'Forum post', url: 'https://ancestryforum.example/...', snippet: '...' },
    ],
    webFetch: async () => 'page content',
  });
  const out = await research(fakeDrawer({ derived: { record: 'I1', raw: 'name: Aidele' }, inputs: ['derived'] }), 12, deps);
  assert.equal(out.candidateClaims.length, 1);
  assert.equal(out.candidateClaims[0]!.url, 'https://collections.yadvashem.org/...');
  assert.equal(out.unreliableDropped, 2);
  assert.equal(out.sourcesQueried, 1);
  assert.equal(out.refuseToFabricate, false);
});

test('research: refuseToFabricate=true when zero claims AND no local evidence', async () => {
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { queries: [{ text: 'q', gap: 'g' }] } as never }) },
    webSearch: async () => [{ title: 't', url: 'https://random.com', snippet: 's' }],
  });
  const out = await research(fakeDrawer(), 12, deps);
  assert.equal(out.candidateClaims.length, 0);
  assert.equal(out.refuseToFabricate, true);
});

test('research: refuseToFabricate=false when zero claims but derived data exists', async () => {
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { queries: [{ text: 'q', gap: 'g' }] } as never }) },
    webSearch: async () => [{ title: 't', url: 'https://random.com', snippet: 's' }],
  });
  const out = await research(fakeDrawer({ derived: { record: 'I1', raw: 'name: A' }, inputs: ['derived'] }), 12, deps);
  assert.equal(out.candidateClaims.length, 0);
  assert.equal(out.refuseToFabricate, false);
});

test('research: harness failure throws', async () => {
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: false, error: 'harness broke', retryable: true }) },
  });
  await assert.rejects(research(fakeDrawer(), 12, deps), /harness failed/);
});

test('research: caps queries at maxQueries', async () => {
  const queries = Array.from({ length: 20 }, (_, i) => ({ text: `q${i}`, gap: `g${i}` }));
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { queries } as never }) },
    webSearch: async () => [],
  });
  const out = await research(fakeDrawer(), 5, deps);
  assert.equal(out.sourcesQueried, 5);
});

test('research: drops fetched=null even when URL is reliable', async () => {
  const deps = fakeDeps({
    harness: { invoke: async () => ({ ok: true, result: { queries: [{ text: 'q', gap: 'g' }] } as never }) },
    webSearch: async () => [{ title: 't', url: 'https://collections.yadvashem.org/...', snippet: 's' }],
    webFetch: async () => null,
  });
  const out = await research(fakeDrawer(), 12, deps);
  assert.equal(out.candidateClaims.length, 0);
  assert.equal(out.unreliableDropped, 1);
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
