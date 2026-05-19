// Prompt-CLI drift smoke test.
//
// The plugin's agent prompts (plugins/whoami/CLAUDE.md, agents/editor.md, and
// the editorial-guide / writing-articles skills) are the agent's primary
// surface guide. When they reference a `wai` subcommand or flag the live CLI
// doesn't actually accept, the agent attempts work that fails — sometimes
// silently, sometimes loud, always wasteful.
//
// This test extracts every `wai <command>` and `wai <command> --flag` mention
// from the agent-facing markdown files and asserts each command exists in the
// live CLI surface, and each flag is either declared on that command or in
// the small set of conventional flags.
//
// When you add a new CLI command, add it to LIVE_COMMANDS (and any new flags
// to LIVE_FLAGS for that command). When you rename or remove one, this test
// will fail until the prompt files are updated to match — which is the whole
// point.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Canonical CLI surface. Source of truth: cli/src/index.ts switch in main().
// Update this set when adding/removing a top-level command.
const LIVE_COMMANDS = new Set([
  'read', 'write', 'create', 'edit', 'delete',
  'note', 'search', 'redlinks',
  'sync-gedcom', 'recite',
  'check', 'audit', 'grep-claims', 'promote-corrections', 'init',
  'narrative', 'transcribe', 'interview',
  'author', 'revert', 'history',
  'rebuild-search', 'migrate', 'export',
  'doctor', 'healthz', 'config',
  'i18n',
  'help', 'version',
]);

// Commands explicitly removed in the v2 markdown migration. Prompts MAY
// mention these only inside a "removed in v2" / "rejected" context — the
// extraction step strips those sections before asserting.
const REMOVED_V2 = new Set([
  'upload', 'link', 'changes', 'category', 'source', 'task',
  'place', 'snapshot', 'import', 'talk', 'section', 'auth',
]);

// Flags declared on each command in cli/src/index.ts. Conservative — only
// flags the live switch actually reads. A flag missing here is either truly
// undocumented OR drift in the prompts.
const LIVE_FLAGS: Record<string, Set<string>> = {
  read:                new Set(['json']),
  write:               new Set(['file', 'stdin', 'summary']),
  create:              new Set(['file', 'stdin', 'summary']),
  edit:                new Set(['summary']),
  delete:              new Set(['yes']),
  note:                new Set(['file', 'stdin', 'list', 'edit', 'delete', 'restore', 'by', 'kind', 'as-agent', 'json']),
  search:              new Set(['limit', 'json', 'include-living']),
  redlinks:            new Set(['limit', 'json']),
  'sync-gedcom':       new Set(['ged-file', 'notes', 'force']),
  recite:              new Set(['apply']),
  check:               new Set(['fix', 'only', 'fail-on', 'min-severity', 'json']),
  audit:               new Set(['json']),
  'grep-claims':       new Set(['variants', 'no-talk', 'no-sources', 'case-sensitive', 'json']),
  'promote-corrections': new Set(['record', 'apply']),
  init:                new Set(['force', 'hook-only', 'ci-only']),
  narrative:           new Set(['file', 'print']),
  transcribe:          new Set(['lang', 'speaker', 'date', 'dir']),
  interview:           new Set(['questions']),
  author:              new Set(['no-web', 'skip-episodes', 'dry-run', 'branch', 'resume', 'cohort', 'parallel', 'order', 'resume-run', 'yes']),
  revert:              new Set(['run', 'phase', 'last', 'list', 'dry-run']),
  history:             new Set(['json', 'no-pipeline', 'pipeline-only', 'recent']),
  'rebuild-search':    new Set(['check']),
  migrate:             new Set(['dry-run', 'page', 'force', 'json']),
  export:              new Set(['out', 'redact-living']),
  doctor:              new Set(['fix']),
  healthz:             new Set([]),
  config:              new Set([]),
};

// Conventional flags accepted on any command at the top level.
const UNIVERSAL_FLAGS = new Set(['help', 'version']);

// Files whose `wai <command>` mentions must match the live surface.
const PROMPT_FILES = [
  'plugins/whoami/CLAUDE.md',
  'plugins/whoami/agents/editor.md',
  'plugins/whoami/skills/editorial-guide/SKILL.md',
  'plugins/whoami/skills/writing-articles/SKILL.md',
];

const REPO_ROOT = join(import.meta.dirname, '..', '..');

// Strip "removed in v2" / "deprecated" sections from a file before extracting
// commands. Matches a markdown H2/H3 heading whose text contains "Removed"
// (case-insensitive) and consumes through the next heading of equal-or-higher
// level (or EOF). This lets prompt files document the removed-v1 commands
// without tripping the drift check.
function stripRemovedSections(md: string): string {
  // For each H2/H3 line whose text matches /removed/i, drop the section.
  const lines = md.split('\n');
  const out: string[] = [];
  let skipping = false;
  let skipLevel = 0;
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1]!.length;
      const text = h[2]!;
      if (skipping && level <= skipLevel) {
        skipping = false;
      }
      if (!skipping && /removed/i.test(text)) {
        skipping = true;
        skipLevel = level;
        continue;
      }
    }
    if (!skipping) out.push(line);
  }
  return out.join('\n');
}

// Extract `wai <command>` mentions. Tolerates spaces, backticks, end of line.
// Returns array of (command, position-in-file) for error messages.
function extractCommandMentions(md: string): Array<{ command: string; lineNumber: number }> {
  const results: Array<{ command: string; lineNumber: number }> = [];
  const lines = md.split('\n');
  // Match `wai <subcommand>` where <subcommand> is a lowercase word possibly
  // with hyphens. Allow it to follow a backtick, whitespace, or start-of-line.
  const re = /(?:^|[\s`(])wai\s+([a-z][a-z0-9-]*)/g;
  lines.forEach((line, i) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      results.push({ command: m[1]!, lineNumber: i + 1 });
    }
  });
  return results;
}

// Extract `--flag` mentions attached to a specific command. To avoid false
// joins in prose where `wai foo` and `--unrelated` sit in *separate*
// backtick spans on the same line, we extract from two scopes only:
//
//   1. Single-backtick inline spans, e.g. `wai check --fix --only A`
//   2. Triple-backtick code-block lines, e.g.
//          wai note <slug> --kind interview "text"
//
// Anything else (prose with a `wai foo` mention and a `--bar` mention
// elsewhere in the same sentence) is ignored.
function extractFlagMentions(
  md: string,
): Array<{ command: string; flag: string; lineNumber: number }> {
  const results: Array<{ command: string; flag: string; lineNumber: number }> = [];
  const cmdRe = /\bwai\s+([a-z][a-z0-9-]*)\b([^\n`]*)/g;
  const collectFromScope = (scope: string, lineNumber: number) => {
    cmdRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = cmdRe.exec(scope)) !== null) {
      const command = m[1]!;
      const tail = m[2]!;
      const flagRe = /--([a-z][a-z0-9-]*)/g;
      let f: RegExpExecArray | null;
      while ((f = flagRe.exec(tail)) !== null) {
        results.push({ command, flag: f[1]!, lineNumber });
      }
    }
  };
  const lines = md.split('\n');
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) {
      // Whole line is a code-block scope.
      collectFromScope(line, i + 1);
      return;
    }
    // Outside fences: only consider single-backtick inline spans.
    const inlineRe = /`([^`\n]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = inlineRe.exec(line)) !== null) {
      collectFromScope(m[1]!, i + 1);
    }
  });
  return results;
}

test('prompt-drift: every `wai <cmd>` in an agent prompt is a live CLI command', () => {
  const errors: string[] = [];
  for (const relPath of PROMPT_FILES) {
    const full = join(REPO_ROOT, relPath);
    const raw = readFileSync(full, 'utf-8');
    const cleaned = stripRemovedSections(raw);
    const mentions = extractCommandMentions(cleaned);
    for (const { command, lineNumber } of mentions) {
      if (LIVE_COMMANDS.has(command)) continue;
      if (REMOVED_V2.has(command)) {
        errors.push(
          `${relPath}:${lineNumber} mentions removed-v2 command \`wai ${command}\` outside a "Removed" section. ` +
          `Either move the reference into a clearly-headed removed-commands section, or drop it.`,
        );
        continue;
      }
      errors.push(
        `${relPath}:${lineNumber} mentions \`wai ${command}\` which is not a live CLI command. ` +
        `Either fix the prompt or add ${command} to LIVE_COMMANDS in cli/test/prompt-drift.test.ts.`,
      );
    }
  }
  assert.deepEqual(errors, [], `prompt-CLI drift:\n  - ${errors.join('\n  - ')}`);
});

test('prompt-drift: every `--flag` on a `wai <cmd>` line is declared in LIVE_FLAGS for that command', () => {
  const errors: string[] = [];
  for (const relPath of PROMPT_FILES) {
    const full = join(REPO_ROOT, relPath);
    const raw = readFileSync(full, 'utf-8');
    const cleaned = stripRemovedSections(raw);
    const mentions = extractFlagMentions(cleaned);
    for (const { command, flag, lineNumber } of mentions) {
      if (UNIVERSAL_FLAGS.has(flag)) continue;
      if (!LIVE_COMMANDS.has(command)) continue; // covered by the other test
      const declared = LIVE_FLAGS[command];
      if (!declared) {
        errors.push(
          `${relPath}:${lineNumber} mentions \`wai ${command} --${flag}\` but ${command} has no LIVE_FLAGS entry. ` +
          `Add an entry to cli/test/prompt-drift.test.ts.`,
        );
        continue;
      }
      if (declared.has(flag)) continue;
      errors.push(
        `${relPath}:${lineNumber} mentions \`wai ${command} --${flag}\` but --${flag} is not declared for ${command}. ` +
        `Either fix the prompt or add ${flag} to LIVE_FLAGS[${command}] in cli/test/prompt-drift.test.ts.`,
      );
    }
  }
  assert.deepEqual(errors, [], `prompt-CLI flag drift:\n  - ${errors.join('\n  - ')}`);
});
