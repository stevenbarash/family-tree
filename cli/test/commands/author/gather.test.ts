import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gather, type GatherDeps } from '../../../src/commands/author/gather.js';

const baseDeps: GatherDeps = {
  rootDir: '/repo',
  readFile: (_p: string) => null,
  readPage: async () => null,
  readTalk: async () => null,
};

test('gather: empty drawer when nothing exists', async () => {
  const d = await gather('aidele', baseDeps);
  assert.deepEqual(d.inputs, []);
  assert.equal(d.derived, null);
  assert.equal(d.talkBody, null);
  assert.equal(d.narrativeBody, null);
  assert.deepEqual(d.researchNotes, []);
  assert.deepEqual(d.transcripts, []);
});

test('gather: pulls derived YAML via page frontmatter gedcom.record', async () => {
  const d = await gather('aidele', {
    ...baseDeps,
    readPage: async () => ({ frontmatter: { gedcom: { record: 'I123' } }, body: '' }),
    readFile: (p) => p === '/repo/genealogy/derived/I123.yml' ? 'name: Aidele\n' : null,
  });
  assert.equal(d.derived?.record, 'I123');
  assert.match(d.derived!.raw, /name: Aidele/);
  assert.deepEqual(d.inputs, ['derived']);
});

test('gather: separates transcript notes from research notes', async () => {
  const d = await gather('aidele', {
    ...baseDeps,
    readTalk: async () => ({
      body: '',
      notes: [
        { id: 'n1', date: '2026-05-01', text: 'Yad Vashem confirms birthplace.', kind: 'research' },
        { id: 'n2', date: '2026-05-02', text: 'Transcript of `voice.m4a` (speaker: Steven), lang=en:\n\nbody text', kind: 'transcript' },
      ],
    }),
  });
  assert.equal(d.researchNotes.length, 1);
  assert.equal(d.transcripts.length, 1);
  assert.equal(d.transcripts[0]!.audioFile, 'voice.m4a');
  assert.equal(d.transcripts[0]!.lang, 'en');
  assert.equal(d.transcripts[0]!.text, 'body text');
  assert.deepEqual(d.inputs, ['talk', 'audio']);
});

test('gather: picks up narrative file', async () => {
  const d = await gather('aidele', {
    ...baseDeps,
    readFile: (p) => p === '/repo/pages/aidele.narrative.md' ? 'body of narrative' : null,
  });
  assert.equal(d.narrativeBody, 'body of narrative');
  assert.deepEqual(d.inputs, ['narrative']);
});
