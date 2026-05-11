import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAgentLog } from '../../../src/commands/author/log.js';

test('formatAgentLog: emits ## Agent log header and run id', () => {
  const text = formatAgentLog('aidele', 'r1', { phases: 7, episodes: 1, sources: 12 }, '2026-05-10');
  assert.match(text, /^## Agent log$/m);
  assert.match(text, /### 2026-05-10 — pipeline run r1/);
  assert.match(text, /Phases completed: 7\/7/);
  assert.match(text, /Episodes drafted: 1/);
  assert.match(text, /Sources cited: 12/);
});

test('formatAgentLog: handles zero episodes/sources', () => {
  const text = formatAgentLog('aidele', 'r2', { phases: 4, episodes: 0, sources: 0 }, '2026-05-10');
  assert.match(text, /Episodes drafted: 0/);
  assert.match(text, /Sources cited: 0/);
});
