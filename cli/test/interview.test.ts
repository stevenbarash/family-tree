import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInterview } from '../src/commands/interview.js';
import type { HarnessAdapter } from '../src/harness/types.js';

interface Calls {
  notes: { slug: string; text: string; kind: string }[];
}

function fakeHarness(questions: { text: string; rationale?: string }[]): HarnessAdapter {
  return {
    invoke: async () => ({ ok: true, result: { questions } }),
  };
}

function failingHarness(error: string, retryable = true): HarnessAdapter {
  return { invoke: async () => ({ ok: false, error, retryable }) };
}

const baseDeps = (calls: Calls) => ({
  appendNote: async (slug: string, text: string, opts: { kind: string }) => { calls.notes.push({ slug, text, kind: opts.kind }); },
  loadEvidence: async () => ({ derived: { name: 'Aidele' }, talk: '', narrative: null }),
});

test('interview: writes Q+A buffer to $EDITOR; saves answered pairs as kind=interview notes', async () => {
  const calls: Calls = { notes: [] };
  const harness = fakeHarness([
    { text: 'How did Aidele come to Teofipol?', rationale: 'Origin family undocumented' },
    { text: 'What was her work like?', rationale: 'Trade recorded but no detail' },
  ]);
  let bufferGivenToEditor = '';
  const code = await runInterview({
    slug: 'aidele',
    maxQuestions: 8,
    harness,
    editInEditor: async (initial) => {
      bufferGivenToEditor = initial;
      // Simulate user filling in only the first answer block.
      // Replace only the FIRST <answer>\n\n</answer> with content.
      let firstReplaced = false;
      return initial.replace(/<answer>\s*<\/answer>/g, (m) => {
        if (firstReplaced) return m;
        firstReplaced = true;
        return '<answer>\nfirst answer\n</answer>';
      });
    },
    ...baseDeps(calls),
    write: () => {}, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(bufferGivenToEditor, /How did Aidele come to Teofipol\?/);
  assert.equal(calls.notes.length, 1);
  assert.equal(calls.notes[0]!.kind, 'interview');
  assert.match(calls.notes[0]!.text, /How did Aidele come to Teofipol\?/);
  assert.match(calls.notes[0]!.text, /first answer/);
});

test('interview: drops blank answers; commits zero notes when all blank', async () => {
  const calls: Calls = { notes: [] };
  const harness = fakeHarness([{ text: 'Q?' }, { text: 'Q2?' }]);
  const code = await runInterview({
    slug: 'aidele', maxQuestions: 8, harness,
    editInEditor: async (initial) => initial,
    ...baseDeps(calls), write: () => {}, writeErr: () => {},
  });
  assert.equal(code, 3); // editor exited empty
  assert.equal(calls.notes.length, 0);
});

test('interview: returns exit 6 when harness fails', async () => {
  const calls: Calls = { notes: [] };
  const code = await runInterview({
    slug: 'aidele', maxQuestions: 8,
    harness: failingHarness('claude-code crashed', true),
    editInEditor: async () => '',
    ...baseDeps(calls), write: () => {}, writeErr: () => {},
  });
  assert.equal(code, 6);
});
