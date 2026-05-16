import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAgentLog, appendLogEntry } from '../../../src/commands/author/log.js';

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

test('appendLogEntry: creates the section when body has no prior log', () => {
  // First Phase 7 on a slug: talk body has research notes + plan but no
  // log yet. The new entry creates the section.
  const existing = '## Research notes\n\n- a note.\n\n## Drafting plan\n\nLead: X.\n';
  const result = appendLogEntry(existing, 'r1', { phases: 7, episodes: 0, sources: 0 }, '2026-05-15');
  assert.match(result, /## Agent log/);
  assert.match(result, /pipeline run r1/);
  // Exactly one Agent log header.
  assert.equal((result.match(/## Agent log/g) ?? []).length, 1);
  // Prior content preserved.
  assert.match(result, /## Research notes/);
  assert.match(result, /## Drafting plan/);
});

test('appendLogEntry: appends a new subsection inside existing log section, not a new header', () => {
  // Second Phase 7 on the same slug (e.g., resume after a downstream
  // fix): the section header isn't duplicated; the new run's subsection
  // is appended inside the existing section so prior runs stay as
  // visible history.
  const existing = [
    '## Research notes',
    '',
    '- a note.',
    '',
    '## Agent log',
    '',
    '### 2026-05-10 — pipeline run r1',
    '- Phases completed: 6/7',
    '- Episodes drafted: 1',
    '- Sources cited: 0',
  ].join('\n');
  const result = appendLogEntry(existing, 'r2', { phases: 7, episodes: 1, sources: 5 }, '2026-05-15');
  // Both runs' subsections are present.
  assert.match(result, /pipeline run r1/);
  assert.match(result, /pipeline run r2/);
  // The newer run's subsection comes after the older one.
  assert.ok(result.indexOf('pipeline run r1') < result.indexOf('pipeline run r2'));
  // Section header is not duplicated.
  assert.equal((result.match(/## Agent log/g) ?? []).length, 1);
});

test('appendLogEntry: new subsection lands inside log section even when later sections exist', () => {
  // The Agent log is in the middle of the body, with other sections
  // after it. The new subsection should still go inside the log section,
  // not at end-of-body.
  const existing = [
    '## Research notes',
    '',
    '- note.',
    '',
    '## Agent log',
    '',
    '### 2026-05-10 — pipeline run r1',
    '- Phases completed: 6/7',
    '',
    '## Open editorial questions',
    '',
    '::open',
    'a question.',
  ].join('\n');
  const result = appendLogEntry(existing, 'r2', { phases: 7, episodes: 0, sources: 0 }, '2026-05-15');
  // New run inside log section, not after Open editorial questions.
  assert.ok(result.indexOf('pipeline run r2') < result.indexOf('## Open editorial questions'));
  // Both runs present.
  assert.match(result, /pipeline run r1/);
  assert.match(result, /pipeline run r2/);
  // Open editorial questions section preserved at end.
  assert.match(result, /a question\./);
});

test('appendLogEntry: empty body produces just the new log section', () => {
  const result = appendLogEntry('', 'r1', { phases: 7, episodes: 0, sources: 0 }, '2026-05-15');
  assert.match(result, /^## Agent log\n/);
  assert.match(result, /pipeline run r1/);
});

test('appendLogEntry: does not treat "## Agent log" inside a code fence as the section header', () => {
  // A research note that quotes the template — including a literal `## Agent
  // log` line inside a fenced code block — was previously matched by
  // `indexOf('## Agent log')` as if it were the real section header. Splicing
  // then inserted the new subsection inside the code fence, corrupting both
  // the quoted-template block and the real talk-page structure (the actual
  // section header further down would no longer be the one being appended
  // into, leaving a duplicate run subsection orphaned). Anchor at line start
  // (start-of-body or after `\n`) so the false match in the fence is skipped
  // and the real section is found below.
  const existing = [
    '## Research notes',
    '',
    'Template excerpt for context:',
    '```markdown',
    '## Agent log',
    '',
    '### YYYY-MM-DD — pipeline run UUID',
    '```',
    '',
    '## Agent log',
    '',
    '### 2026-05-10 — pipeline run r1',
    '- Phases completed: 7/7',
    '- Episodes drafted: 0',
    '- Sources cited: 0',
  ].join('\n');
  const result = appendLogEntry(existing, 'r2', { phases: 7, episodes: 0, sources: 0 }, '2026-05-15');
  // The fenced template block is preserved untouched.
  assert.match(result, /```markdown\n## Agent log\n\n### YYYY-MM-DD — pipeline run UUID\n```/);
  // The real section has both runs.
  assert.match(result, /pipeline run r1/);
  assert.match(result, /pipeline run r2/);
  // r2 appears after r1 (i.e. spliced into the real section, not before it).
  assert.ok(result.indexOf('pipeline run r1') < result.indexOf('pipeline run r2'));
});
