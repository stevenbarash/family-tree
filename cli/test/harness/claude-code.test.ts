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
