# Article-authoring pipeline — Plan 3 of 3: Cohort + review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the cohort batch mode (`wai author --cohort missing|file:slugs.txt`), the wiki-style undo command (`wai revert`), and the page-changelog command (`wai history`). After Plan 3 the article-authoring pipeline is feature-complete for v1.

**Architecture:** Three additions on top of Plan 2's `wai author`. The cohort runner wraps the existing single-slug runner with a worker pool, a global commit serializer, and a per-run journal. `wai revert` and `wai history` are read-only-ish git wrappers that filter by the pipeline-run trailer added in Plan 2.

**Tech Stack:** TypeScript, Node 22, `tsx --test`. No new runtime dependencies. Reuses `cli/src/commands/author.ts` (Plan 2) for per-slug runs.

**Spec reference:** `docs/superpowers/specs/2026-05-10-article-authoring-pipeline-design.md` (rev 1).

**Plan dependencies:** Plan 1 (foundation) must be merged. Plan 2 (`wai author` single-slug) must be merged.

---

## Scope

**In scope:**

1. **Cohort selector resolver** (Task 1) — `missing` and `file:<path>` selectors. Returns the slug list with confirmation prompt for >25 slugs.
2. **`runAuthorCohort`** (Task 2) — worker pool + global committer pattern; per-run journal at `data/author-runs/<run-id>.jsonl`; failed-slug list for retry.
3. **Cohort `--resume`** (Task 3) — read the journal, skip completed slugs, pick up partial slugs at their last committed phase via the existing `findResumePoint`.
4. **`wai revert`** (Task 4) — friendly wrapper over `git revert` filtered by `pipeline-run` trailer. Modes: most-recent run for slug, specific run, single phase, dry-run, list.
5. **`wai history <slug>`** (Task 5) — render commits filtered by `slug:` trailer. Markdown table by default; `--json` for tooling; `--no-pipeline` filter.
6. **CHANGELOG + plan-index** (Task 6).

**Out of scope (deferred):**
- The other cohort selectors (`branch:`, `generation:`, `since:`, `redlinks`) — implement when `missing` + `file:` prove insufficient.
- `--background` daemon mode.
- A `wai history` view in the frontend (the spec defers a UI version).

## File structure

```
cli/src/commands/author/cohort.ts              NEW. Selector resolution + worker pool.
cli/src/commands/author/cohort-journal.ts      NEW. Journal write/read.
cli/src/commands/revert.ts                     NEW.
cli/src/commands/history.ts                    NEW.
cli/src/commands/author.ts                     MODIFY. --cohort branch in runAuthor.
cli/src/index.ts                               MODIFY. Wire revert / history.
cli/test/commands/author/cohort.test.ts        NEW.
cli/test/commands/author/cohort-journal.test.ts NEW.
cli/test/commands/revert.test.ts               NEW.
cli/test/commands/history.test.ts              NEW.
CHANGELOG.md                                   MODIFY.
docs/superpowers/plans/README.md               MODIFY.
```

## Conventions adhered to

- All commands export a `runX` function with injected I/O.
- `runAuthorCohort` reuses the single-slug `runAuthor` (Plan 2) per slug; never duplicates phase logic.
- Cohort journal lives at `$WHOAMI_ROOT/data/author-runs/<run-id>.jsonl` (already gitignored — `data/` is runtime state).
- `wai revert` and `wai history` use stock `git revert` and `git log` under the hood; the wrappers don't try to recreate git semantics.

---

## Task 1: Cohort selector resolution

Resolve `--cohort missing` and `--cohort file:<path>` into a slug list, with a confirmation prompt for cohorts of >25.

**Files:**
- Create: `cli/src/commands/author/cohort.ts`
- Create: `cli/test/commands/author/cohort.test.ts`

- [ ] **Step 1: `resolveCohort` function**

```typescript
export type CohortSelector =
  | { kind: 'missing' }
  | { kind: 'file'; path: string };

export interface ResolveDeps {
  rootDir: string;
  /** Reads slugs that exist as pages (basename without .md, excluding *.talk.md and *.narrative.md). */
  listExistingPages: (rootDir: string) => ReadonlyArray<string>;
  /** Reads derived/<rec>.yml files; returns slugs derivable from each. */
  listDerivedSlugs: (rootDir: string) => Promise<ReadonlyArray<string>>;
  readFile: (path: string) => string | null;
}

export async function resolveCohort(selector: CohortSelector, deps: ResolveDeps): Promise<ReadonlyArray<string>> {
  if (selector.kind === 'file') {
    const text = deps.readFile(selector.path);
    if (text === null) throw new Error(`cohort: file not found: ${selector.path}`);
    return text.split('\n').map(l => l.replace(/#.*$/, '').trim()).filter(l => l.length > 0);
  }
  // 'missing': all derived slugs without a page.
  const pages = new Set(deps.listExistingPages(deps.rootDir));
  const derived = await deps.listDerivedSlugs(deps.rootDir);
  return derived.filter(s => !pages.has(s));
}
```

`listDerivedSlugs` walks `genealogy/derived/*.yml`, reads each, and emits the slug derivable from the `name` field (kebab-case the name; if the name contains diacritics, transliterate via the existing `core/src/pages/slug.ts` `toSlug` function — import it).

- [ ] **Step 2: Tests**

```typescript
test('resolveCohort missing: returns derived slugs without pages', async () => {
  const deps = {
    rootDir: '/repo',
    listExistingPages: () => ['aidele', 'kelman-ayzman'],
    listDerivedSlugs: async () => ['aidele', 'kelman-ayzman', 'haskel-pinchas-ayzman', 'unknown-relative'],
    readFile: () => null,
  };
  const slugs = await resolveCohort({ kind: 'missing' }, deps);
  assert.deepEqual([...slugs].sort(), ['haskel-pinchas-ayzman', 'unknown-relative']);
});

test('resolveCohort file: parses the file, drops comments and blanks', async () => {
  const deps = {
    rootDir: '/repo',
    listExistingPages: () => [],
    listDerivedSlugs: async () => [],
    readFile: (p: string) => p === '/in/list.txt'
      ? 'aidele\n# comment\nkelman-ayzman\n\nshimon-ayzman'
      : null,
  };
  const slugs = await resolveCohort({ kind: 'file', path: '/in/list.txt' }, deps);
  assert.deepEqual(slugs, ['aidele', 'kelman-ayzman', 'shimon-ayzman']);
});

test('resolveCohort file: throws when file missing', async () => {
  const deps = {
    rootDir: '/repo', listExistingPages: () => [], listDerivedSlugs: async () => [],
    readFile: () => null,
  };
  await assert.rejects(resolveCohort({ kind: 'file', path: '/none' }, deps), /not found/);
});
```

- [ ] **Step 3: Run + Commit**

```bash
git add cli/src/commands/author/cohort.ts cli/test/commands/author/cohort.test.ts
git commit -m "feat(cli): cohort selector resolution (missing, file)"
```

---

## Task 2: Cohort runner — worker pool + global committer + journal

Iterate the resolved slugs, run `runAuthor` per slug. Workers run gather/research/outline phases in parallel up to `--parallel N`; commits serialize globally. Journal each transition.

**Files:**
- Create: `cli/src/commands/author/cohort-journal.ts`
- Modify: `cli/src/commands/author.ts` (add `runAuthorCohort`).
- Create: `cli/test/commands/author/cohort.test.ts` (extends Task 1's file with cohort-runner tests).

- [ ] **Step 1: Journal**

```typescript
export interface JournalEntry {
  ts: string;
  runId: string;
  slug: string;
  status: 'started' | 'phase-completed' | 'completed' | 'failed' | 'skipped';
  phase?: number;
  reason?: string;
}

export interface JournalDeps {
  rootDir: string;
  appendFile: (path: string, content: string) => void;
  mkdirP: (path: string) => void;
}

export function journalAppend(entry: JournalEntry, deps: JournalDeps): void {
  const path = `${deps.rootDir}/data/author-runs/${entry.runId}.jsonl`;
  deps.mkdirP(`${deps.rootDir}/data/author-runs`);
  deps.appendFile(path, JSON.stringify(entry) + '\n');
}

export function journalReadCompleted(runId: string, rootDir: string, readFile: (p: string) => string | null): ReadonlySet<string> {
  const text = readFile(`${rootDir}/data/author-runs/${runId}.jsonl`);
  if (!text) return new Set();
  const completed = new Set<string>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as JournalEntry;
    if (entry.status === 'completed') completed.add(entry.slug);
  }
  return completed;
}
```

- [ ] **Step 2: Tests for journal** (round-trip; resume detection).

- [ ] **Step 3: `runAuthorCohort` in `cli/src/commands/author.ts`**

```typescript
export interface AuthorCohortOptions {
  slugs: ReadonlyArray<string>;
  parallel: number; // 1..3
  order: 'chronological' | 'alphabetical' | 'file';
  resumeRunId?: string;
  // Same dependencies as AuthorOptions (harness, client, gather, etc.) plus journal deps.
  // For brevity, share with `AuthorOptions` via composition.
  perSlug: Omit<AuthorOptions, 'slug'>;
  journal: JournalDeps;
  appendFile: (path: string, content: string) => void;
  writeFailedFile: (path: string, content: string) => void;
}

export async function runAuthorCohort(opts: AuthorCohortOptions): Promise<number> {
  const runId = opts.resumeRunId ?? newRunId();

  // If resuming, skip already-completed slugs.
  const completed = opts.resumeRunId
    ? journalReadCompleted(opts.resumeRunId, opts.perSlug.rootDir, opts.perSlug.readFile)
    : new Set<string>();
  const remaining = opts.slugs.filter(s => !completed.has(s));

  // Order according to selector.
  const ordered = orderSlugs(remaining, opts.order, opts.perSlug);

  // Worker pool with global committer. v1 simplification: serialize fully (parallel=1).
  // Real parallelism lands as a follow-on; for v1, the worker pool degenerates to a sequential loop.
  // Acceptable because each `runAuthor` already commits per phase; making them sequential is correct.
  const failed: { slug: string; reason: string }[] = [];
  for (const slug of ordered) {
    journalAppend({ ts: new Date().toISOString(), runId, slug, status: 'started' }, opts.journal);
    const code = await runAuthor({ ...opts.perSlug, slug });
    if (code === 0) {
      journalAppend({ ts: new Date().toISOString(), runId, slug, status: 'completed' }, opts.journal);
    } else {
      journalAppend({ ts: new Date().toISOString(), runId, slug, status: 'failed', reason: `exit ${code}` }, opts.journal);
      failed.push({ slug, reason: `exit ${code}` });
    }
  }

  if (failed.length > 0) {
    const failedPath = `${opts.perSlug.rootDir}/data/author-runs/${runId}-failed.txt`;
    const lines = failed.map(f => `${f.slug}\t${f.reason}`);
    opts.writeFailedFile(failedPath, lines.join('\n') + '\n');
    opts.perSlug.writeErr(`author --cohort: ${ordered.length - failed.length} succeeded, ${failed.length} failed (run ${runId})\nRetry: wai author --cohort file:${failedPath}\n`);
    return 1;
  }
  opts.perSlug.write(`author --cohort: ${ordered.length} succeeded (run ${runId})\n`);
  return 0;
}

function orderSlugs(slugs: ReadonlyArray<string>, order: AuthorCohortOptions['order'], perSlug: AuthorCohortOptions['perSlug']): ReadonlyArray<string> {
  if (order === 'alphabetical') return [...slugs].sort();
  if (order === 'file') return slugs;
  // chronological: walk derived/*.yml for each slug, sort by birth date (earliest first; unknown dates last).
  // For v1, fall back to alphabetical with a warning if birth dates can't be resolved cheaply.
  return [...slugs].sort();
}
```

**v1 simplification:** the `--parallel` flag is parsed but the worker pool degenerates to a sequential loop. This makes the implementation simpler and avoids the global-committer-lock complexity until measurements show parallelism is needed. The spec mentions this is an internal optimization and v1 can ship with parallel=1 effective.

- [ ] **Step 4: Tests for `runAuthorCohort`**

```typescript
test('cohort: iterates slugs sequentially; commits per slug; reports per-slug results', async () => {
  // Mock perSlug.runAuthor that always returns 0 → verify all slugs marked complete.
  // Mock that returns failure on one slug → verify failed.txt is written and exit 1.
});

test('cohort --resume: skips slugs already in journal as completed', async () => {
  // Journal claims 'aidele' was completed; verify runAuthor isn't called for that slug.
});
```

- [ ] **Step 5: Wire `--cohort` into `index.ts`**

In the `wai author` subcommand handler, branch on whether `--cohort` was passed:

```typescript
if (args.flags.cohort) {
  const sel = parseCohortSelector(args.flags.cohort as string); // 'missing' or 'file:path'
  const slugs = await resolveCohort(sel, /* deps */);
  if (slugs.length > 25 && !args.flags.yes && !process.env.WHOAMI_AUTO) {
    process.stderr.write(`cohort: ${slugs.length} slugs resolved; pass --yes to proceed\n`);
    process.exit(2);
  }
  if (slugs.length > 100 && !args.flags.yes) {
    process.stderr.write(`cohort: ${slugs.length} slugs requires --yes\n`);
    process.exit(2);
  }
  const code = await runAuthorCohort({ slugs, parallel: 1, order: 'chronological', perSlug: /* … */, journal: /* … */, /* … */ });
  process.exit(code);
}
// else single-slug branch (Plan 2 behavior, unchanged)
```

- [ ] **Step 6: Help text**

```
  author --cohort missing      Run author for every derived record without a page
  author --cohort file:F.txt   Run author for slugs listed in F (one per line)
                                 --parallel N (v1: ignored, always sequential)
                                 --order chronological|alphabetical|file
                                 --resume <run-id>
                                 --yes (skip the >25 prompt)
```

- [ ] **Step 7: Run typecheck + tests + Commit**

```bash
git add cli/src/commands/author/cohort-journal.ts cli/src/commands/author.ts cli/src/index.ts cli/test/commands/author/*.test.ts
git commit -m "feat(cli): wai author --cohort with journal + retry list"
```

---

## Task 3: `--resume` for cohort

Already covered in Task 2 (`runAuthorCohort` reads the journal, skips completed slugs). This task adds an integration test that exercises the full resume cycle and a small refinement: partial slugs (started but not completed) should pick up at their last completed phase via the existing `findResumePoint` from Plan 2.

**Files:**
- Modify: `cli/src/commands/author.ts` — for partial slugs, pass `resume: true` into the inner `runAuthor` call.
- Modify: `cli/test/commands/author/cohort.test.ts`.

- [ ] **Step 1: Mark partial slugs**

In `runAuthorCohort`, detect slugs that have a `started` entry but no `completed` entry in the journal — these are partial. Set `resume: true` for those when calling `runAuthor`.

- [ ] **Step 2: Integration test**

```typescript
test('cohort --resume: passes resume=true to runAuthor for partial slugs', async () => {
  // Journal: 'aidele' started but not completed. Verify runAuthor receives { resume: true }.
});
```

- [ ] **Step 3: Run + Commit**

```bash
git add cli/src/commands/author.ts cli/test/commands/author/cohort.test.ts
git commit -m "feat(cli): cohort --resume picks up partial slugs at last phase"
```

---

## Task 4: `wai revert`

Friendly wrapper over `git revert` filtered by `pipeline-run` trailer. Modes: most-recent run for slug, specific run, single phase, list, dry-run.

**Files:**
- Create: `cli/src/commands/revert.ts`
- Create: `cli/test/commands/revert.test.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Function**

```typescript
export type RevertMode =
  | { kind: 'slug-latest'; slug: string }
  | { kind: 'slug-run'; slug: string; runId: string }
  | { kind: 'slug-phase'; slug: string; phase: 'research' | 'outline' | 'draft' | 'verify' | 'log' }
  | { kind: 'last' }
  | { kind: 'list'; slug: string };

export interface RevertDeps {
  rootDir: string;
  gitLog: (rootDir: string, args: string[]) => string;
  gitRevert: (rootDir: string, shas: ReadonlyArray<string>, message: string) => void;
  dryRun: boolean;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runRevert(mode: RevertMode, deps: RevertDeps): Promise<number> {
  switch (mode.kind) {
    case 'slug-latest': {
      const log = deps.gitLog(deps.rootDir, [`--grep=slug: ${mode.slug}`, '--format=%H%n%s%n%B%n---']);
      const commits = parseLogBlocks(log);
      if (commits.length === 0) { deps.writeErr(`revert: no pipeline runs for ${mode.slug}\n`); return 2; }
      const latestRun = commits[0]!.runId;
      const shasInRun = commits.filter(c => c.runId === latestRun).map(c => c.sha);
      if (deps.dryRun) {
        deps.write(`revert (dry-run): would revert ${shasInRun.length} commits from run ${latestRun}\n`);
        return 0;
      }
      deps.gitRevert(deps.rootDir, shasInRun, `revert(${mode.slug}): pipeline-run ${latestRun}`);
      deps.write(`revert: undid ${shasInRun.length} commits from run ${latestRun} for ${mode.slug}\n`);
      return 0;
    }
    case 'slug-run': /* … similar, filtered by runId … */
    case 'slug-phase': /* … */
    case 'last': /* find most recent pipeline-run trailer regardless of slug … */
    case 'list': /* render run summaries … */
  }
  return 1;
}

interface ParsedCommit { sha: string; subject: string; runId: string | null; phase: number | null; slug: string | null }

function parseLogBlocks(text: string): ReadonlyArray<ParsedCommit> {
  // Split on '\n---\n', parse each block: first line is sha, second is subject, rest is body.
  // Extract pipeline-run / phase / slug from the body via regex.
}
```

- [ ] **Step 2: Tests**

Test each mode with a fake `gitLog` returning canned commit history and a fake `gitRevert` that records what got reverted.

- [ ] **Step 3: Wire into `index.ts`**

```
  revert <slug>                Undo most recent pipeline run for slug
  revert <slug> --run <uuid>   Undo a specific run
  revert <slug> --phase draft  Undo just one phase
  revert --last                Undo most recent pipeline activity, any slug
  revert <slug> --list         Show runs with summaries
  revert <slug> --dry-run      Show what would be reverted; no commits
```

- [ ] **Step 4: Run + Commit**

```bash
git add cli/src/commands/revert.ts cli/src/index.ts cli/test/commands/revert.test.ts
git commit -m "feat(cli): wai revert wraps git revert with pipeline-run filtering"
```

---

## Task 5: `wai history <slug>`

Render commits filtered by the `slug:` trailer. Markdown table by default; `--json` for tooling; `--no-pipeline` excludes commits with `pipeline-run:` trailer.

**Files:**
- Create: `cli/src/commands/history.ts`
- Create: `cli/test/commands/history.test.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Function**

```typescript
export interface HistoryOptions {
  rootDir: string;
  slug?: string;
  format: 'table' | 'json';
  filter: 'all' | 'pipeline-only' | 'no-pipeline';
  recent?: number; // limit
  gitLog: (rootDir: string, args: string[]) => string;
  write: (s: string) => void;
}

interface CommitRecord {
  sha: string;
  date: string;
  runId: string | null;
  phase: number | null;
  slug: string;
  subject: string;
  summary: string;
}

export async function runHistory(opts: HistoryOptions): Promise<number> {
  const args = ['--format=%H%n%cI%n%s%n%B%n---'];
  if (opts.slug) args.push(`--grep=slug: ${opts.slug}`);
  if (opts.recent) args.push(`-n ${opts.recent}`);
  const text = opts.gitLog(opts.rootDir, args);
  const commits = parseLogBlocks(text);
  const filtered = applyFilter(commits, opts.filter);

  if (opts.format === 'json') {
    opts.write(JSON.stringify(filtered, null, 2) + '\n');
    return 0;
  }
  opts.write(renderTable(filtered) + '\n');
  return 0;
}

function renderTable(commits: ReadonlyArray<CommitRecord>): string {
  const rows = ['Date         Run     Phase     Summary'];
  for (const c of commits) {
    const run = c.runId?.slice(0, 4) ?? '(none)';
    const phase = c.phase !== null ? phaseName(c.phase) : 'edit';
    rows.push(`${c.date.slice(0, 10)}   ${run}    ${phase.padEnd(8)}  ${c.summary}`);
  }
  return rows.join('\n');
}

function phaseName(n: number): string {
  return ['', 'gather', 'research', 'outline', 'draft', 'episode', 'verify', 'log'][n] ?? `phase ${n}`;
}
```

- [ ] **Step 2: Tests** — verify table format, JSON format, `--no-pipeline` filter, `--recent N`.

- [ ] **Step 3: Wire into `index.ts`**

```
  history <slug>               Show pipeline-relevant commits for a page
                                 --json (machine-readable)
                                 --no-pipeline (exclude pipeline commits)
                                 --pipeline-only (default)
  history --recent             Last 50 pipeline commits across all slugs
```

- [ ] **Step 4: Run + Commit**

```bash
git add cli/src/commands/history.ts cli/src/index.ts cli/test/commands/history.test.ts
git commit -m "feat(cli): wai history renders per-slug pipeline log"
```

---

## Task 6: CHANGELOG + plan-index entries

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: CHANGELOG entries**

Under the existing `### Added`:

```markdown
- **`wai author --cohort`** *(2026-05-XX)*. Batch mode for the author
  pipeline. Selectors: `missing` (all derived records without a page)
  and `file:<path>` (one slug per line; comments with `#`). Writes a
  per-run journal at `data/author-runs/<run-id>.jsonl` and a
  `<run-id>-failed.txt` retry list when any slug fails. `--resume
  <run-id>` skips completed slugs and picks up partial ones at their
  last phase. v1 runs slugs sequentially; `--parallel` flag is
  parsed but defaults to 1 (worker-pool optimization deferred).
- **`wai revert`** *(2026-05-XX)*. Wiki-style undo built on `git
  revert` filtered by the `pipeline-run` trailer. Modes: undo most
  recent run for a slug, undo a specific run, undo one phase, undo
  most recent pipeline activity (any slug), list runs, dry-run.
- **`wai history <slug>`** *(2026-05-XX)*. Render the pipeline-related
  commit log for a page as a markdown table or JSON. Filters:
  `--no-pipeline` (only manual edits), `--pipeline-only` (default),
  `--recent N`.
```

- [ ] **Step 2: Plan-index row**

```markdown
| 🚧 | [`2026-05-10-article-pipeline-plan-3-cohort-review.md`](./2026-05-10-article-pipeline-plan-3-cohort-review.md) | Article pipeline — Plan 3: Cohort + review | `wai author --cohort missing\|file:`, `wai revert`, `wai history`. Final plan in the article-authoring pipeline series. |
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "docs: changelog + plan-index entries for article pipeline plan 3"
```

---

## Done with Plan 3

After Task 6 the article-authoring pipeline ships in full v1 form:

- Author one person at a time (`wai author <slug>`, Plan 2).
- Author a cohort (`wai author --cohort missing`, Plan 3).
- Undo any pipeline run (`wai revert`, Plan 3).
- Read the per-page edit history (`wai history <slug>`, Plan 3).
- Drop in narrative, transcribe audio, run interviews to build the evidence drawer (Plan 1).

The next iteration of work — beyond the article pipeline — would be the deferred items: cohort selectors `branch:`/`generation:`, `--background` daemon mode, local-Whisper fallback, Codex/OpenCode harness adapters, frontend "hide pipeline noise" toggle on page history, SQLite for the consistency fact map (only when full passes exceed 5s).
