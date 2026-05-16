import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeCodeAdapter } from '../../src/harness/claude-code.js';

function fakeSpawn(stdoutText: string, stderrText = '', code = 0) {
  return async (_cmd: string, _args: string[], _stdin: string): Promise<{ stdout: string; stderr: string; code: number }> => {
    return { stdout: stdoutText, stderr: stderrText, code };
  };
}

function makeFakeReader(skillContent = 'SKILL', templateContent = 'TEMPLATE'): (path: string) => string | null {
  return (p: string) => p.endsWith('SKILL.md') ? skillContent : (p.endsWith('.md') ? templateContent : null);
}

test('claude-code adapter: parses successful JSON response', async () => {
  const spawn = fakeSpawn(JSON.stringify({ result: '{"questions":["q1","q2"]}' }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, { questions: string[] }>({
    skill: 'writing-articles',
    template: 'interview',
    context: { slug: 'aidele' },
    outputSchema: { type: 'object', required: ['questions'], properties: { questions: { type: 'array' } } },
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.result.questions, ['q1', 'q2']);
  }
});

test('claude-code adapter: returns ok=false on non-zero exit', async () => {
  const spawn = fakeSpawn('', 'something broke', 2);
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {}, outputSchema: {},
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /something broke/);
    assert.equal(res.retryable, true);
  }
});

test('claude-code adapter: returns ok=false when result fails outputSchema', async () => {
  const spawn = fakeSpawn(JSON.stringify({ result: '{"unrelated":1}' }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['questions'] },
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /schema/);
    assert.equal(res.retryable, false);
  }
});

test('claude-code adapter: research-questions template gets WebSearch and WebFetch only', async () => {
  // Research is the one template that legitimately needs network access; it
  // gets WebSearch + WebFetch and nothing else. No Write/Edit/Bash means the
  // sub-model can't write to disk or run shell commands even if it tries.
  let capturedTools: string | null = null;
  const spawn = async (_cmd: string, args: string[], _stdin: string): Promise<{ stdout: string; stderr: string; code: number }> => {
    const i = args.indexOf('--tools');
    capturedTools = i >= 0 && i + 1 < args.length ? (args[i + 1] ?? null) : null;
    return { stdout: JSON.stringify({ result: '{"claims":[]}' }), stderr: '', code: 0 };
  };
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  await a.invoke({
    skill: 'writing-articles', template: 'research-questions', context: {},
    outputSchema: { type: 'object', required: ['claims'] },
  });
  assert.equal(capturedTools, 'WebSearch,WebFetch');
});

test('claude-code adapter: non-research templates get empty --tools (no tools allowed)', async () => {
  // The outline / draft-person / draft-episode / interview templates all
  // transform JSON in JSON out and need no tools. Passing --tools "" tells
  // claude to disable all built-in tools, which prevents the sub-model
  // from writing files directly even if its prompt-following slips.
  // This is the structural safeguard against the Phase 4 partial-write
  // failure mode that bit boris-ayzman in this session.
  for (const template of ['outline', 'draft-person', 'draft-episode', 'interview']) {
    let capturedTools: string | null = null;
    const spawn = async (_cmd: string, args: string[], _stdin: string): Promise<{ stdout: string; stderr: string; code: number }> => {
      const i = args.indexOf('--tools');
      capturedTools = i >= 0 && i + 1 < args.length ? (args[i + 1] ?? null) : null;
      return { stdout: JSON.stringify({ result: '{"x":1}' }), stderr: '', code: 0 };
    };
    const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
    await a.invoke({
      skill: 'writing-articles', template, context: {},
      outputSchema: { type: 'object' },
    });
    assert.equal(capturedTools, '', `template "${template}" should get empty --tools`);
  }
});

test('claude-code adapter: unknown skill+template combos default to no tools', async () => {
  // Defense in depth: a new template added without a corresponding allowlist
  // entry must not inherit dangerous capabilities by accident. The default
  // is the safest possible — no tools — so a forgotten allowlist entry
  // surfaces as a "sub-model can't search" error, never as a silent
  // permission grant.
  let capturedTools: string | null = null;
  const spawn = async (_cmd: string, args: string[], _stdin: string): Promise<{ stdout: string; stderr: string; code: number }> => {
    const i = args.indexOf('--tools');
    capturedTools = i >= 0 && i + 1 < args.length ? (args[i + 1] ?? null) : null;
    return { stdout: JSON.stringify({ result: '{}' }), stderr: '', code: 0 };
  };
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  await a.invoke({
    skill: 'some-future-skill', template: 'some-future-template', context: {},
    outputSchema: { type: 'object' },
  });
  assert.equal(capturedTools, '');
});

test('claude-code adapter: passes concatenated skill+template content as --append-system-prompt', async () => {
  let appendedPrompt = '';
  const spawn = async (_cmd: string, args: string[], _stdin: string): Promise<{ stdout: string; stderr: string; code: number }> => {
    const i = args.indexOf('--append-system-prompt');
    appendedPrompt = args[i + 1] ?? '';
    return { stdout: JSON.stringify({ result: '{"questions":[]}' }), stderr: '', code: 0 };
  };
  const a = claudeCodeAdapter({
    spawn,
    skillsDir: '/skills',
    readSkillFile: makeFakeReader('SKILL CONTENT', 'TEMPLATE CONTENT'),
  });
  await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['questions'] },
  });
  assert.match(appendedPrompt, /SKILL CONTENT/);
  assert.match(appendedPrompt, /TEMPLATE CONTENT/);
  assert.match(appendedPrompt, /---/);
});

test('claude-code adapter: caches skill+template per pair across invocations within one adapter', async () => {
  // A real pipeline run calls each (skill, template) once per phase.
  // We want disk reads to happen at-most-once per pair for the lifetime
  // of the adapter so a template edit between phase 2 and phase 4
  // (in-progress refactor, editor auto-save) doesn't ship inconsistent
  // instructions across phases of the same run. Distinct pairs are
  // read independently — caching is keyed on the pair, not global.
  const reads: string[] = [];
  const reader = (p: string) => {
    reads.push(p);
    if (p.endsWith('SKILL.md')) return 'SKILL';
    if (p.endsWith('.md')) return 'TEMPLATE';
    return null;
  };
  const spawn = fakeSpawn(JSON.stringify({ result: '{"x":1}' }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: reader });
  // First call: 2 reads (SKILL.md + template).
  await a.invoke({ skill: 'writing-articles', template: 'outline', context: {}, outputSchema: { type: 'object' } });
  const readsAfterFirst = reads.length;
  // Second call, same pair: should NOT read from disk again.
  await a.invoke({ skill: 'writing-articles', template: 'outline', context: {}, outputSchema: { type: 'object' } });
  assert.equal(reads.length, readsAfterFirst, 'second invoke with same (skill, template) must hit the cache');
  // Different template: should read.
  await a.invoke({ skill: 'writing-articles', template: 'draft-person', context: {}, outputSchema: { type: 'object' } });
  assert.ok(reads.length > readsAfterFirst, 'different template should trigger fresh reads');
});

test('claude-code adapter: returns ok=false when skill file is missing', async () => {
  const a = claudeCodeAdapter({
    spawn: async () => ({ stdout: '', stderr: '', code: 0 }),
    skillsDir: '/skills',
    readSkillFile: () => null,
  });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {}, outputSchema: {},
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /skill not found/);
    assert.equal(res.retryable, false);
  }
});

test('claude-code adapter: returns ok=false when template file is missing', async () => {
  const a = claudeCodeAdapter({
    spawn: async () => ({ stdout: '', stderr: '', code: 0 }),
    skillsDir: '/skills',
    readSkillFile: (p) => p.endsWith('SKILL.md') ? 'skill' : null,
  });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {}, outputSchema: {},
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /template not found/);
    assert.equal(res.retryable, false);
  }
});

test('claude-code adapter: strips ```json fences from inner result', async () => {
  const spawn = fakeSpawn(JSON.stringify({ result: '```json\n{"questions":["q1"]}\n```' }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, { questions: string[] }>({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['questions'] },
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.result.questions, ['q1']);
});

test('claude-code adapter: strips plain ``` fences from inner result', async () => {
  const spawn = fakeSpawn(JSON.stringify({ result: '```\n{"x":1}\n```' }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object' },
  });
  assert.equal(res.ok, true);
});

test('claude-code adapter: parses unfenced JSON unchanged', async () => {
  const spawn = fakeSpawn(JSON.stringify({ result: '{"questions":["q1"]}' }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, { questions: string[] }>({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['questions'] },
  });
  assert.equal(res.ok, true);
});

test('claude-code adapter: tolerates preamble text before JSON object', async () => {
  // Real-world failure mode: longer prompts cause the model to sometimes emit
  // a brief conversational preamble ("Draft writing follows:", "Here is the
  // JSON:") ahead of the JSON. Without preamble-stripping, the orchestrator
  // throws and the run aborts mid-pipeline. The extractor must locate the
  // first balanced object and parse from there.
  const spawn = fakeSpawn(JSON.stringify({
    result: 'Draft writing follows:\n{"questions":["q1","q2"]}',
  }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, { questions: string[] }>({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['questions'] },
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.result.questions, ['q1', 'q2']);
});

test('claude-code adapter: tolerates preamble text before JSON array', async () => {
  // Arrays are a valid top-level JSON shape; extractor must handle `[` not
  // only `{`. (Cohort/list responses from future templates may use arrays.)
  const spawn = fakeSpawn(JSON.stringify({
    result: 'Here are the items: [1, 2, 3]',
  }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, number[]>({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'array' },
  });
  assert.equal(res.ok, true);
});

test('claude-code adapter: ignores braces inside JSON string literals when locating JSON', async () => {
  // The extractor is character-by-character; a `}` inside a string value
  // must not close the outer object prematurely. This is the classic
  // brace-matching trap and the most likely silent-corruption mode if the
  // string-awareness logic is wrong.
  const spawn = fakeSpawn(JSON.stringify({
    result: 'Preamble {"note":"contains } and { and \\"escaped\\" quotes","ok":true}',
  }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, { note: string; ok: boolean }>({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['note', 'ok'] },
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.result.note, 'contains } and { and "escaped" quotes');
    assert.equal(res.result.ok, true);
  }
});

test('claude-code adapter: ignores trailing text after JSON object', async () => {
  // Models also sometimes emit trailing text ("Done!", "Hope this helps.")
  // after the JSON. The extractor stops at the first balanced close so the
  // trailing text is dropped.
  const spawn = fakeSpawn(JSON.stringify({
    result: '{"x":1}\nThanks for the prompt!',
  }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, { x: number }>({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object' },
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.result.x, 1);
});

test('claude-code adapter: preserves original error when result has no JSON at all', async () => {
  // If the model refused to produce JSON ("I cannot help with that"), the
  // extractor finds no balanced structure and returns the stripped text
  // unchanged. JSON.parse then fails with a real error message — not a
  // misleading "empty payload" — so the caller can surface the refusal.
  const spawn = fakeSpawn(JSON.stringify({
    result: 'I cannot help with that request.',
  }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object' },
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /harness inner result is not JSON/);
    assert.match(res.error, /Unexpected token/);
  }
});

test('claude-code adapter: extracts JSON from a fenced block embedded in preamble', async () => {
  // The model writes prose, then a ```json fenced block, then more prose.
  // stripMarkdownFences only handles fences at the boundary; for embedded
  // fences the extractor finds the first `{` after the fence opens and
  // brace-matches through to its close, ignoring everything outside.
  const spawn = fakeSpawn(JSON.stringify({
    result: 'Sure! Here is the JSON:\n```json\n{"answer":42}\n```\nLet me know if you need anything else.',
  }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, { answer: number }>({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['answer'] },
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.result.answer, 42);
});

test('claude-code adapter: unmatched quote in preamble does not swallow the real JSON', async () => {
  // The extractor was previously eager about entering string state — any `"`
  // outside JSON depth flipped inString=true. A preamble with an unmatched
  // quote (model says `Look at "this {"x":1}` — common when a model quotes
  // a phrase but the close quote is missing or far away) consumed the
  // real JSON's opening `{` as part of a "string", leaving the extractor
  // unable to find any balanced structure and returning null. JSON.parse
  // then failed on the raw prose with an unhelpful "Unexpected token"
  // pointing at the first letter of the preamble. The fix is to only
  // enter string state once depth > 0: quotes in preamble are just text.
  const spawn = fakeSpawn(JSON.stringify({
    result: 'I read "the docs and here it is: {"answer":42}',
  }));
  const a = claudeCodeAdapter({ spawn, skillsDir: '/skills', readSkillFile: makeFakeReader() });
  const res = await a.invoke<unknown, { answer: number }>({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['answer'] },
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.result.answer, 42);
});
