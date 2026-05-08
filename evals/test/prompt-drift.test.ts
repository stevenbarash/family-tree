import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static drift gate per platform-review §P0.1.
//
// When the v2 markdown migration removed a batch of v1 commands
// (`task`, `source`, `snapshot`, `talk`, etc.), the agent prompts in
// `plugins/whoami/` kept telling agents to use them. Editor agents
// followed the prompts, the CLI rejected the calls, evals scored it
// as wrong tool usage. This test fails the build if any prompt file
// references a command that the v2 CLI rejects (`REMOVED`) or that
// it doesn't handle at all (not in the dispatch switch).
//
// Single source of truth: `cli/src/index.ts`. We parse the file's
// `REMOVED` set and `case '<name>':` lines so the test stays in sync
// with the CLI surface as it evolves — no hard-coded duplicates.

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');

const PROMPT_FILES = [
  'plugins/whoami/AGENTS.md',
  'plugins/whoami/CLAUDE.md',
  'plugins/whoami/GEMINI.md',
  'plugins/whoami/agents/editor.md',
  'plugins/whoami/skills/editorial-guide/SKILL.md',
];

function parseCli(): { known: Set<string>; removed: Set<string> } {
  const src = readFileSync(join(REPO, 'cli/src/index.ts'), 'utf8');
  const known = new Set<string>(['help', 'version']);
  for (const m of src.matchAll(/case '([a-z][a-z-]*)':/g)) known.add(m[1]!);
  const removed = new Set<string>();
  const removedBlock = src.match(/const REMOVED = new Set\(\[([^\]]+)\]\)/);
  if (removedBlock) {
    for (const m of removedBlock[1]!.matchAll(/'([a-z][a-z-]*)'/g)) removed.add(m[1]!);
  }
  return { known, removed };
}

interface Ref { file: string; line: number; cmd: string; }

function findRefs(): Ref[] {
  const refs: Ref[] = [];
  for (const rel of PROMPT_FILES) {
    const text = readFileSync(join(REPO, rel), 'utf8');
    for (const m of text.matchAll(/\bwai[ \t]+([a-z][a-z-]*)/g)) {
      const line = text.slice(0, m.index!).split('\n').length;
      refs.push({ file: rel, line, cmd: m[1]! });
    }
  }
  return refs;
}

test('prompt drift: cli/src/index.ts parsing produces non-empty surfaces', () => {
  const { known, removed } = parseCli();
  assert.ok(known.size > 5, `parsed too few known commands: ${[...known].join(', ')}`);
  assert.ok(removed.size > 0, 'parsed empty REMOVED set — selector regex may have rotted');
  assert.ok(known.has('read') && known.has('write') && known.has('check'));
});

test('prompt drift: no agent prompt references a v1-removed command', () => {
  const { removed } = parseCli();
  const offenders: string[] = [];
  for (const ref of findRefs()) {
    if (removed.has(ref.cmd)) {
      offenders.push(`${ref.file}:${ref.line}: \`wai ${ref.cmd}\` was removed in v2`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Agent prompts reference removed commands:\n  ${offenders.join('\n  ')}\n` +
      'Update the prompt to use the v2 surface, or extend `cli/src/index.ts` REMOVED ' +
      'set if the command is intentionally retired.',
  );
});

test('prompt drift: every wai <cmd> reference targets a known v2 command', () => {
  const { known, removed } = parseCli();
  const offenders: string[] = [];
  for (const ref of findRefs()) {
    if (known.has(ref.cmd)) continue;
    if (removed.has(ref.cmd)) continue;
    offenders.push(`${ref.file}:${ref.line}: \`wai ${ref.cmd}\` is not a known v2 command`);
  }
  assert.deepEqual(
    offenders,
    [],
    `Agent prompts reference unknown commands:\n  ${offenders.join('\n  ')}\n` +
      'Either fix the prompt or wire the command into `cli/src/index.ts`.',
  );
});
