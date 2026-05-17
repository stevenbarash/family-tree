// docs/superpowers/plans/ ↔ README.md index drift guard.
//
// Each plan file in docs/superpowers/plans/ is a self-contained
// implementation document. README.md in that directory is the status
// index that says which plans are shipped / in-progress / sketches.
// Three failure modes are common enough to be worth catching:
//
//   (A) A plan file exists in the directory but has no row in README.
//       — plan added without indexing; people lose track.
//   (B) README has a row referencing a plan file that doesn't exist.
//       — plan was renamed or removed but the index wasn't updated.
//   (C) A plan is marked 🚧 in-progress in README, yet every file it
//       claims to "Create: `path`" exists on disk.
//       — plan shipped but nobody flipped the status. The agent-driven
//       workflow rarely checks off `- [ ]` boxes consistently, so file
//       existence is a more reliable shipping signal than checkboxes.
//
// (C) is best-effort: if a plan happens to "Create: `tools/foo.ts`" and
// someone deletes tools/foo.ts later for unrelated reasons, the test
// quiets. That's acceptable — the goal is to surface obvious drift,
// not to enforce semantic completeness.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const PLANS_DIR = join(REPO_ROOT, 'docs/superpowers/plans');
const README = join(PLANS_DIR, 'README.md');

function planFiles(): string[] {
  return readdirSync(PLANS_DIR)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .sort();
}

// Parse README rows of the form:
//   | <icon> | [`<filename>`](./<filename>) | <title> | <summary> |
// Returns (filename, statusIcon, lineNumber).
function readIndexRows(): Array<{ filename: string; status: string; line: number }> {
  const text = readFileSync(README, 'utf8');
  const lines = text.split('\n');
  const rows: Array<{ filename: string; status: string; line: number }> = [];
  const rowRe = /^\|\s*(✅|🚧|📝|🗂|📦)\s*\|\s*\[`([^`]+\.md)`\]/;
  lines.forEach((line, i) => {
    const m = line.match(rowRe);
    if (m) rows.push({ status: m[1]!, filename: m[2]!, line: i + 1 });
  });
  return rows;
}

// Pull every `Create: \`<path>\`` from a plan body. Paths are relative
// to the repo root by convention.
function createdFilesFromPlan(planPath: string): string[] {
  const text = readFileSync(planPath, 'utf8');
  const re = /Create:\s+`([^`]+)`/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]!);
  return out;
}

test('plan-index-drift (A): every plan file has a row in README', () => {
  const files = planFiles();
  const indexed = new Set(readIndexRows().map(r => r.filename));
  const missing = files.filter(f => !indexed.has(f));
  assert.deepEqual(
    missing,
    [],
    `plans without README rows (add a row to docs/superpowers/plans/README.md):\n  - ${missing.join('\n  - ')}`,
  );
});

test('plan-index-drift (B): every README row references an existing plan file', () => {
  const files = new Set(planFiles());
  const stale = readIndexRows()
    .filter(r => !files.has(r.filename))
    .map(r => `README.md:${r.line} references ${r.filename} which no longer exists. Either restore the file or remove the row.`);
  assert.deepEqual(stale, [], `stale README rows:\n  - ${stale.join('\n  - ')}`);
});

test('plan-index-drift (C): no 🚧 in-progress plan has all its Create: files already on disk', () => {
  const rows = readIndexRows().filter(r => r.status === '🚧');
  const shipped: string[] = [];
  for (const row of rows) {
    const planPath = join(PLANS_DIR, row.filename);
    if (!existsSync(planPath)) continue; // covered by test B
    const created = createdFilesFromPlan(planPath);
    if (created.length === 0) continue; // plan defines no Create: paths; can't infer
    const onDisk = created.filter(p => {
      const full = join(REPO_ROOT, p);
      try { return statSync(full).isFile(); } catch { return false; }
    });
    if (onDisk.length === created.length) {
      shipped.push(
        `README.md:${row.line} marks ${row.filename} as 🚧 in-progress, but all ${created.length} of its Create: files exist on disk — looks shipped. Either flip status to ✅ or split the plan if some scope is genuinely incomplete.`,
      );
    }
  }
  assert.deepEqual(shipped, [], `plan-index drift (🚧 with all files present):\n  - ${shipped.join('\n  - ')}`);
});

test('plan-index-drift: README totals line matches actual row counts', () => {
  // Defensive: the "Total: N plans — K shipped (✅), …" footer is human-
  // maintained and historically lagged behind reality (we just caught it
  // off by 7). Parse the line, recount the table, fail on mismatch.
  const text = readFileSync(README, 'utf8');
  const totalsLine = text.split('\n').find(l => /^\*\*Total:\s+\d+\s+plans?\*\*/.test(l));
  assert.ok(totalsLine, 'README missing **Total: N plans** footer line');
  const m = totalsLine!.match(/Total:\s+(\d+)\s+plans?\*\*\s+—\s+(\d+)\s+shipped[^,]*,\s+(\d+)\s+in-progress[^,]*,\s+(\d+)\s+sketches[^,]*,\s+(\d+)\s+index[^,]*,\s+(\d+)\s+abandoned/);
  assert.ok(m, `totals footer malformed: "${totalsLine}"\nExpected: **Total: N plans** — N shipped (✅), N in-progress (🚧), N sketches (📝), N index (🗂), N abandoned (📦).`);
  const [, totalStr, shippedStr, progressStr, sketchStr, indexStr, abandonedStr] = m;
  const claimed = {
    total: Number(totalStr),
    shipped: Number(shippedStr),
    progress: Number(progressStr),
    sketch: Number(sketchStr),
    index: Number(indexStr),
    abandoned: Number(abandonedStr),
  };
  const rows = readIndexRows();
  const actual = {
    total: rows.length,
    shipped: rows.filter(r => r.status === '✅').length,
    progress: rows.filter(r => r.status === '🚧').length,
    sketch: rows.filter(r => r.status === '📝').length,
    index: rows.filter(r => r.status === '🗂').length,
    abandoned: rows.filter(r => r.status === '📦').length,
  };
  assert.deepEqual(actual, claimed, 'README totals footer is stale — update it to match the actual row counts.');
});

// Sanity: helps if someone refactors filenames.
test('plan-index-drift: every plan file basename matches its directory entry', () => {
  for (const f of planFiles()) {
    const full = join(PLANS_DIR, f);
    assert.equal(basename(full), f);
  }
});
