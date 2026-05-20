# Git Sync Core Plumbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `push()` and `pullRebase()` git operations to `core/`, so the two-way sync between the Mac Studio and the Render replica has a tested git foundation.

**Architecture:** Two new functions in the existing git boundary module `core/src/pages/git.ts`, alongside `addAndCommit`. `push()` uploads committed work to a remote; `pullRebase()` fetches and rebases, aborting cleanly and throwing a typed `RebaseConflictError` on conflict so callers never inherit a half-rebased repo. Pure plumbing — no frontend, no deployment. This is plan 1 of 3 for the Render deployment (see `docs/superpowers/specs/2026-05-20-render-deployment-design.md`, phase 1).

**Tech Stack:** TypeScript 6, `simple-git@^3.36.0` (already a `core/` dependency), `node:test` + `node:assert/strict`.

---

## File Structure

- `core/src/pages/git.ts` — **modify.** Append `RebaseConflictError`, `push()`, `pullRebase()`. Already the git boundary module; new functions match the existing `addAndCommit` style and reuse the private `client()` helper.
- `core/test/pages/helpers.ts` — **modify.** Append a `makeSyncedRepos()` fixture that builds a bare remote plus two working clones (modelling Mac Studio + Render replica). All imports it needs (`mkdtempSync`, `mkdirSync`, `writeFileSync`, `rmSync`, `join`, `tmpdir`, `simpleGit`) are already imported by the existing `makeTestRepo`.
- `core/test/pages/git-sync.test.ts` — **create.** Tests for `push` and `pullRebase`.

**Commit type:** these are `chore:` commits. The plumbing has no standalone user-facing effect, so it is changelog-exempt (CLAUDE.md Rule 13); the `feat:` + CHANGELOG entry lands when the deployment ships in plan 3.

---

### Task 1: `makeSyncedRepos` test fixture

**Files:**
- Modify: `core/test/pages/helpers.ts` (append after the existing `makeTestRepo`)
- Test: `core/test/pages/git-sync.test.ts` (create — smoke test only in this task)

- [ ] **Step 1: Write the failing test**

Create `core/test/pages/git-sync.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { makeSyncedRepos } from './helpers.ts';

test('makeSyncedRepos: builds a bare remote and two seeded clones', async () => {
  const repos = await makeSyncedRepos();
  try {
    // bare remote exists and has the seed commit
    const remoteLog = await simpleGit(repos.remote).log();
    assert.equal(remoteLog.latest?.message, 'seed');
    // both clones have the seed file checked out
    assert.equal(readFileSync(join(repos.a, 'seed.md'), 'utf-8'), 'seed\n');
    assert.equal(readFileSync(join(repos.b, 'seed.md'), 'utf-8'), 'seed\n');
    // both clones are on main and clean
    assert.equal((await simpleGit(repos.a).status()).current, 'main');
    assert.equal((await simpleGit(repos.b).status()).current, 'main');
  } finally {
    repos.cleanup();
    assert.equal(existsSync(repos.a), false);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && npx tsx --test test/pages/git-sync.test.ts`
Expected: FAIL — `makeSyncedRepos` is not exported from `./helpers.ts`.

- [ ] **Step 3: Append the fixture to `helpers.ts`**

Add to the end of `core/test/pages/helpers.ts`:

```typescript
export interface SyncedRepos {
  /** Path to the bare repo that stands in for the GitHub data repo. */
  remote: string;
  /** Working clone A — stands in for the Mac Studio (canonical). */
  a: string;
  /** Working clone B — stands in for the Render replica. */
  b: string;
  cleanup: () => void;
}

/**
 * Build a bare remote plus two working clones, each with an identical
 * `seed.md` initial commit on `main`. Models the Mac Studio + Render
 * replica both cloned from the GitHub data repo.
 */
export async function makeSyncedRepos(): Promise<SyncedRepos> {
  const base = mkdtempSync(join(tmpdir(), 'git-sync-test-'));
  const remote = join(base, 'remote.git');
  mkdirSync(remote, { recursive: true });
  await simpleGit(remote).init(['--bare']);

  // Clone A: seed an initial commit, force the branch name to `main`, push.
  const a = join(base, 'a');
  await simpleGit(base).clone(remote, a);
  const ga = simpleGit(a);
  await ga.addConfig('user.name', 'Clone A');
  await ga.addConfig('user.email', 'a@example.com');
  writeFileSync(join(a, 'seed.md'), 'seed\n');
  await ga.add('seed.md');
  await ga.commit('seed');
  await ga.branch(['-M', 'main']);
  await ga.push(['-u', 'origin', 'main']);

  // Clone B: clone the now-seeded remote.
  const b = join(base, 'b');
  await simpleGit(base).clone(remote, b);
  const gb = simpleGit(b);
  await gb.addConfig('user.name', 'Clone B');
  await gb.addConfig('user.email', 'b@example.com');

  return {
    remote,
    a,
    b,
    cleanup: () => {
      try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
```

Note: `branch(['-M', 'main'])` renames whatever the local default branch is (`master` or `main`) to `main`, so the fixture is deterministic across git versions.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && npx tsx --test test/pages/git-sync.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add core/test/pages/helpers.ts core/test/pages/git-sync.test.ts
git commit -m "chore: add makeSyncedRepos test fixture for git sync"
```

---

### Task 2: `RebaseConflictError` + `push()`

**Files:**
- Modify: `core/src/pages/git.ts` (append after `restoreFromIndex`)
- Test: `core/test/pages/git-sync.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `core/test/pages/git-sync.test.ts`:

```typescript
test('push: uploads a local commit to the remote', async () => {
  const repos = await makeSyncedRepos();
  try {
    const path = join(repos.b, 'note.md');
    writeFileSync(path, 'hello from b\n');
    await addAndCommit(repos.b, [path], { name: 'B', email: 'b@x.test' }, 'add note');

    await push(repos.b, 'origin', 'main');

    const remoteLog = await simpleGit(repos.remote).log();
    assert.equal(remoteLog.latest?.message, 'add note');
  } finally {
    repos.cleanup();
  }
});
```

Add `addAndCommit`, `push` to the existing import from `../../src/pages/git.ts` (the import line does not exist yet — add it under the `simple-git` import):

```typescript
import { addAndCommit, push } from '../../src/pages/git.ts';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && npx tsx --test test/pages/git-sync.test.ts`
Expected: FAIL — `push` is not exported from `git.ts`.

- [ ] **Step 3: Append `RebaseConflictError` and `push` to `git.ts`**

Add to the end of `core/src/pages/git.ts`:

```typescript
/**
 * Thrown by `pullRebase` when a rebase hits a merge conflict. The rebase
 * is aborted before this is thrown, so the repo is left clean at its
 * pre-rebase HEAD — never in a half-rebased state.
 */
export class RebaseConflictError extends Error {
  constructor(public readonly conflictedFiles: string[]) {
    super(
      `rebase conflict — aborted; ${conflictedFiles.length} file(s) conflicted: ` +
        (conflictedFiles.join(', ') || '(unknown)'),
    );
    this.name = 'RebaseConflictError';
  }
}

/**
 * Push committed work on `branch` to `remote`. Throws if the push is
 * rejected (e.g. a non-fast-forward when the remote has commits the
 * local branch lacks) so the caller can pull-rebase and retry.
 */
export async function push(
  repoRoot: string,
  remote: string,
  branch: string,
): Promise<void> {
  await client(repoRoot).push(remote, branch);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && npx tsx --test test/pages/git-sync.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add core/src/pages/git.ts core/test/pages/git-sync.test.ts
git commit -m "chore: add push + RebaseConflictError to git plumbing"
```

---

### Task 3: `pullRebase()` — happy path

**Files:**
- Modify: `core/src/pages/git.ts` (append after `push`)
- Test: `core/test/pages/git-sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `core/test/pages/git-sync.test.ts`:

```typescript
test('pullRebase: integrates upstream commits and returns true', async () => {
  const repos = await makeSyncedRepos();
  try {
    // B commits a new file and pushes it.
    const bPath = join(repos.b, 'from-b.md');
    writeFileSync(bPath, 'b\n');
    await addAndCommit(repos.b, [bPath], { name: 'B', email: 'b@x.test' }, 'b adds file');
    await push(repos.b, 'origin', 'main');

    // A pulls — must integrate B's commit and report HEAD advanced.
    const advanced = await pullRebase(repos.a, 'origin', 'main');
    assert.equal(advanced, true);
    assert.equal(readFileSync(join(repos.a, 'from-b.md'), 'utf-8'), 'b\n');
  } finally {
    repos.cleanup();
  }
});

test('pullRebase: returns false when already up to date', async () => {
  const repos = await makeSyncedRepos();
  try {
    const advanced = await pullRebase(repos.a, 'origin', 'main');
    assert.equal(advanced, false);
  } finally {
    repos.cleanup();
  }
});
```

Update the `git.ts` import line to add `pullRebase`:

```typescript
import { addAndCommit, push, pullRebase } from '../../src/pages/git.ts';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd core && npx tsx --test test/pages/git-sync.test.ts`
Expected: FAIL — `pullRebase` is not exported from `git.ts`.

- [ ] **Step 3: Append `pullRebase` to `git.ts`**

Add to the end of `core/src/pages/git.ts`:

```typescript
/**
 * Fetch `remote`/`branch` and rebase the local branch onto it.
 *
 * Returns `true` if the rebase integrated new upstream commits (HEAD
 * moved), `false` if the local branch was already up to date.
 *
 * On a rebase conflict, aborts the rebase and throws
 * `RebaseConflictError` — the working tree is left clean at the
 * pre-rebase HEAD, never half-rebased.
 *
 * Precondition: the working tree is clean (no uncommitted changes).
 * Callers running alongside page writes must hold the page-write lock
 * so a rebase never races an in-flight commit.
 */
export async function pullRebase(
  repoRoot: string,
  remote: string,
  branch: string,
): Promise<boolean> {
  const git = client(repoRoot);
  const before = await git.revparse(['HEAD']);
  await git.fetch(remote, branch);
  try {
    await git.rebase([`${remote}/${branch}`]);
  } catch {
    let conflicted: string[] = [];
    try {
      conflicted = (await git.status()).conflicted;
    } catch {
      // `git status` can fail mid-rebase on some git versions; fall through
      // with an empty list rather than masking the conflict.
    }
    try {
      await git.rebase(['--abort']);
    } catch {
      // nothing to abort / already aborted — ignore
    }
    throw new RebaseConflictError(conflicted);
  }
  const after = await git.revparse(['HEAD']);
  return before !== after;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd core && npx tsx --test test/pages/git-sync.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add core/src/pages/git.ts core/test/pages/git-sync.test.ts
git commit -m "chore: add pullRebase to git plumbing"
```

---

### Task 4: `pullRebase()` — conflict + path-partitioning behaviour

These two tests validate the conflict path of the Task 3 implementation and the path-partitioning premise the whole sync design rests on (Render writes talk/notes, the Mac Studio writes articles — disjoint paths rebase cleanly). They encode *why* the behaviour matters, per CLAUDE.md Rule 9.

**Files:**
- Test: `core/test/pages/git-sync.test.ts`

- [ ] **Step 1: Write the tests**

Append to `core/test/pages/git-sync.test.ts`:

```typescript
test('pullRebase: path-disjoint local + upstream edits rebase cleanly', async () => {
  // The sync design partitions writes — the replica only writes talk/notes,
  // the Mac Studio writes articles. Disjoint paths must rebase without conflict.
  const repos = await makeSyncedRepos();
  try {
    // B (replica) edits an article and pushes.
    const article = join(repos.b, 'article.md');
    writeFileSync(article, 'article by b\n');
    await addAndCommit(repos.b, [article], { name: 'B', email: 'b@x.test' }, 'b: article');
    await push(repos.b, 'origin', 'main');

    // A (Mac Studio) commits a *different* file locally, not yet pushed.
    const talk = join(repos.a, 'page.talk.md');
    writeFileSync(talk, 'talk by a\n');
    await addAndCommit(repos.a, [talk], { name: 'A', email: 'a@x.test' }, 'a: talk');

    const advanced = await pullRebase(repos.a, 'origin', 'main');
    assert.equal(advanced, true);
    assert.equal(readFileSync(join(repos.a, 'article.md'), 'utf-8'), 'article by b\n');
    assert.equal(readFileSync(join(repos.a, 'page.talk.md'), 'utf-8'), 'talk by a\n');
  } finally {
    repos.cleanup();
  }
});

test('pullRebase: same-file divergent edits throw RebaseConflictError and leave the repo clean', async () => {
  // A conflicting rebase must abort, not leave a half-rebased repo — a wrong
  // genealogy merge is worse than a stalled sync (fail loud, Rule 12).
  const repos = await makeSyncedRepos();
  try {
    // B edits seed.md and pushes.
    const bSeed = join(repos.b, 'seed.md');
    writeFileSync(bSeed, 'seed edited by b\n');
    await addAndCommit(repos.b, [bSeed], { name: 'B', email: 'b@x.test' }, 'b: seed');
    await push(repos.b, 'origin', 'main');

    // A edits the SAME file differently, locally.
    const aSeed = join(repos.a, 'seed.md');
    writeFileSync(aSeed, 'seed edited by a\n');
    await addAndCommit(repos.a, [aSeed], { name: 'A', email: 'a@x.test' }, 'a: seed');
    const headBefore = await simpleGit(repos.a).revparse(['HEAD']);

    await assert.rejects(
      () => pullRebase(repos.a, 'origin', 'main'),
      (err: unknown) => {
        assert.ok(err instanceof RebaseConflictError, 'expected RebaseConflictError');
        assert.deepEqual(err.conflictedFiles, ['seed.md']);
        return true;
      },
    );

    // Repo is clean (not mid-rebase) at the pre-rebase HEAD.
    const status = await simpleGit(repos.a).status();
    assert.equal(status.conflicted.length, 0);
    assert.equal(status.isClean(), true);
    assert.equal(await simpleGit(repos.a).revparse(['HEAD']), headBefore);
  } finally {
    repos.cleanup();
  }
});
```

Update the `git.ts` import line to add `RebaseConflictError`:

```typescript
import { addAndCommit, push, pullRebase, RebaseConflictError } from '../../src/pages/git.ts';
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd core && npx tsx --test test/pages/git-sync.test.ts`
Expected: PASS (6 tests). The Task 3 implementation already handles both cases; these tests confirm and lock the behaviour. If the conflict test fails (repo left mid-rebase, or a plain `Error` thrown instead of `RebaseConflictError`), the Task 3 `pullRebase` catch block is wrong — fix it there, do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add core/test/pages/git-sync.test.ts
git commit -m "chore: test pullRebase conflict + path-partitioning behaviour"
```

---

### Task 5: Full-suite + typecheck gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full core test suite**

Run: `cd core && npm test`
Expected: PASS — the whole suite green, including the 6 new `git-sync.test.ts` tests. No prior test regressed.

- [ ] **Step 2: Run the typecheck gate**

Run: `cd core && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Push the batch**

```bash
git push origin main
```

Expected: the four `chore:` commits land on `origin/main`. (No CHANGELOG entry is needed — `chore:` is exempt from the `changelog-nudge.sh` hook.)

---

## Self-Review Notes

- **Spec coverage:** implements spec phase 1 (`core/src/pages/git.ts` gains `push()`, `pullRebase()`, `RebaseConflictError` + tests). The two-clone sync test, path-partitioned clean rebase, and conflict-aborts-loudly cases from the spec's Tests section are all covered by Task 4.
- **Type consistency:** `push(repoRoot, remote, branch)` and `pullRebase(repoRoot, remote, branch)` use the same `(repoRoot, …)` shape as the existing `addAndCommit`. `RebaseConflictError.conflictedFiles` is the single property name used in both `git.ts` and the test.
- **Out of scope here:** the sync scheduler, write-path push, `instrumentation.ts`, and env wiring are plan 3 (`render-deploy-and-sync`). This plan stops at tested core functions.
