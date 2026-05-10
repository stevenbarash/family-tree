import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeCodeAdapter } from '../../src/harness/claude-code.js';

function fakeSpawn(stdoutText: string, stderrText = '', code = 0) {
  return async (_cmd: string, _args: string[], _stdin: string): Promise<{ stdout: string; stderr: string; code: number }> => {
    return { stdout: stdoutText, stderr: stderrText, code };
  };
}

test('claude-code adapter: parses successful JSON response', async () => {
  const spawn = fakeSpawn(JSON.stringify({ result: '{"questions":["q1","q2"]}' }));
  const a = claudeCodeAdapter({ spawn });
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
  const a = claudeCodeAdapter({ spawn });
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
  const a = claudeCodeAdapter({ spawn });
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
