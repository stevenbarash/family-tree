# Render Deploy + Two-Way Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the two-way git sync, deploy the wiki to the existing Render service as a read-write replica, and reconcile the docs that said "no public hosting / no auth."

**Architecture:** `instrumentation.ts` bootstraps the data repo onto Render's persistent disk on first boot and starts an in-process sync scheduler. The scheduler `pullRebase`s upstream changes every ~10 min and pushes local commits; the page-write API pushes after each write. A shared `REPO_LOCK` serialises writes against the sync so a rebase never races a commit. This is plan 3 of 3 for the Render deployment (see `docs/superpowers/specs/2026-05-20-render-deployment-design.md`, phases 3–5); **depends on plans 1 (`git-sync-core`) and 2 (`descope-auth`) being merged first.**

**Tech Stack:** Next.js 16 `instrumentation.ts`, `simple-git`, the `core/` git plumbing from plan 1, Render (web service + persistent disk), the Render MCP.

---

## File Structure

- `frontend/lib/env.ts` — **modify.** Add the sync env surface.
- `frontend/lib/sync.ts` — **create.** `composeAuthedUrl` (pure), `bootstrapData`, the `syncTick` scheduler, `pushAfterWrite`, the `REPO_LOCK` constant. `server-services` is imported *dynamically* so the module graph stays light enough to unit-test the pure parts.
- `frontend/lib/sync.test.ts` — **create.** Tests `composeAuthedUrl`.
- `frontend/instrumentation.ts` — **create.** Next's startup hook: bootstrap + start scheduler.
- `frontend/app/api/pages/[slug]/route.ts` — **modify.** Wrap writes in `REPO_LOCK`, push after each write. (Builds on the plan-2 version of this file.)
- `docs/SCOPE.md`, `AGENTS.md`, `frontend/AGENTS.md` — **modify.** Docs reconciliation.
- `docs/ROADMAP.md`, `CHANGELOG.md`, `docs/superpowers/plans/README.md` — **modify.** The Rule 14/15 triad.
- **Render service config** — adapt the existing `family-tree` service (`srv-d807l4faqgkc739sqak0`): env vars, build/start commands, health-check path. No repo file.

**Commit types:** `chore:` for the sync-wiring commits; the **final docs-reconciliation commit is `feat:`** and carries the CHANGELOG entry — that is the commit where the whole deployment ships.

**Prerequisite:** plans 1 and 2 are merged. Verify: `cd core && npx tsx -e "import('./src/pages/git.ts').then(m => console.log(typeof m.pullRebase))"` prints `function`, and `frontend/lib/descope.ts` exists.

---

### Task 1: Sync env surface

**Files:**
- Modify: `frontend/lib/env.ts` (append after the `DESCOPE_MANAGEMENT_KEY` export added by plan 2)

- [ ] **Step 1: Append the sync env exports**

Add to the end of `frontend/lib/env.ts`:

```typescript
/**
 * Two-way sync — see the render deployment spec. Only the Render replica
 * sets these; the Mac Studio leaves them unset (no auto-sync there).
 */
export const SYNC_PUSH = process.env.WHOAMI_SYNC_PUSH === 'on';
export const SYNC_INTERVAL_MS =
  Number(process.env.WHOAMI_SYNC_INTERVAL ?? '600') * 1000;
export const DATA_REPO_URL = process.env.WHOAMI_DATA_REPO_URL ?? '';
export const DATA_REPO_TOKEN = process.env.WHOAMI_DATA_REPO_TOKEN ?? '';
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/env.ts
git commit -m "chore: add two-way sync env surface"
```

---

### Task 2: `lib/sync.ts` — sync orchestration

**Files:**
- Create: `frontend/lib/sync.ts`
- Test: `frontend/lib/sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/sync.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeAuthedUrl } from './sync.ts';

test('composeAuthedUrl: embeds the token into an https URL', () => {
  assert.equal(
    composeAuthedUrl('https://github.com/u/r.git', 'TOK'),
    'https://x-access-token:TOK@github.com/u/r.git',
  );
});

test('composeAuthedUrl: returns the URL unchanged when there is no token', () => {
  assert.equal(
    composeAuthedUrl('https://github.com/u/r.git', ''),
    'https://github.com/u/r.git',
  );
});

test('composeAuthedUrl: leaves non-https (ssh) URLs alone', () => {
  assert.equal(
    composeAuthedUrl('git@github.com:u/r.git', 'TOK'),
    'git@github.com:u/r.git',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx --test lib/sync.test.ts`
Expected: FAIL — `./sync.ts` does not exist.

- [ ] **Step 3: Create `sync.ts`**

Create `frontend/lib/sync.ts`:

```typescript
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { pullRebase, push, RebaseConflictError } from '@core/pages/git.ts';
import { withLock } from '@core/pages/locks.ts';
import {
  WHOAMI_ROOT,
  SEARCH_INDEX_FILE,
  SYNC_PUSH,
  SYNC_INTERVAL_MS,
  DATA_REPO_URL,
  DATA_REPO_TOKEN,
} from '@/lib/env';

/**
 * Lock key shared by the page-write API and the sync scheduler, so a
 * `pullRebase` never rebases while a write is mid-commit. Any constant
 * string works — it only has to be identical on both sides.
 */
export const REPO_LOCK = 'whoami:repo';

const REMOTE = 'origin';
const BRANCH = 'main';

/**
 * Embed an access token into an https git URL. A clone/push from a headless
 * container has no credential helper, so the token rides in the URL.
 */
export function composeAuthedUrl(url: string, token: string): string {
  if (!token || !url.startsWith('https://')) return url;
  return url.replace('https://', `https://x-access-token:${token}@`);
}

/**
 * Clone the data repo onto the persistent disk if it is not there yet.
 * No-op when `WHOAMI_ROOT` is already a git repo — every boot after the
 * first, and always on the Mac Studio.
 */
export async function bootstrapData(): Promise<void> {
  if (existsSync(join(WHOAMI_ROOT, '.git'))) return;
  if (!DATA_REPO_URL) {
    console.error(
      '[sync] WHOAMI_ROOT is not a git repo and WHOAMI_DATA_REPO_URL is unset — cannot bootstrap',
    );
    return;
  }
  console.log('[sync] cloning data repo onto', WHOAMI_ROOT);
  await simpleGit().clone(composeAuthedUrl(DATA_REPO_URL, DATA_REPO_TOKEN), WHOAMI_ROOT);
}

/** One sync cycle: pull upstream, rebuild search if anything moved, push. */
async function syncTick(): Promise<void> {
  try {
    const advanced = await pullRebase(WHOAMI_ROOT, REMOTE, BRANCH);
    if (advanced) {
      const { rebuildSearchIndexFromDisk } = await import('@/lib/server-services');
      await rebuildSearchIndexFromDisk();
    }
  } catch (err) {
    if (err instanceof RebaseConflictError) {
      console.error('[sync] rebase conflict — sync stalled until resolved:', err.message);
    } else {
      console.error('[sync] pull failed:', err);
    }
    return; // never push on a failed pull
  }
  try {
    await push(WHOAMI_ROOT, REMOTE, BRANCH);
  } catch (err) {
    console.warn('[sync] push failed (will retry next tick):', err);
  }
}

let started = false;

/**
 * Run once at server startup (from `instrumentation.ts`): bootstrap the
 * data, ensure the search index exists, and — on the replica only — start
 * the pull/push scheduler.
 */
export async function bootstrapAndStartSync(): Promise<void> {
  if (started) return;
  started = true;

  await bootstrapData();

  if (!existsSync(SEARCH_INDEX_FILE)) {
    const { rebuildSearchIndexFromDisk } = await import('@/lib/server-services');
    await rebuildSearchIndexFromDisk();
  }

  if (!SYNC_PUSH) return; // the scheduler runs on the Render replica only

  const tick = () => withLock(REPO_LOCK, syncTick);
  await tick(); // initial catch-up pull
  setInterval(() => { void tick(); }, SYNC_INTERVAL_MS);
}

/**
 * Best-effort push after a browser write. The caller already holds
 * `REPO_LOCK`. Never throws — the write has already succeeded; if the push
 * fails the scheduler retries on its next tick.
 */
export async function pushAfterWrite(): Promise<void> {
  if (!SYNC_PUSH) return;
  try {
    await push(WHOAMI_ROOT, REMOTE, BRANCH);
  } catch (err) {
    console.warn('[sync] post-write push failed (scheduler will retry):', err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx --test lib/sync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/sync.ts frontend/lib/sync.test.ts
git commit -m "chore: add two-way sync orchestration"
```

---

### Task 3: `instrumentation.ts` — startup hook

**Files:**
- Create: `frontend/instrumentation.ts`

- [ ] **Step 1: Create `instrumentation.ts`**

Create `frontend/instrumentation.ts` (at the `frontend/` root, beside `next.config.ts`):

```typescript
/**
 * Next.js startup hook — runs once when the server process boots. Bootstraps
 * the data repo onto the persistent disk and starts the sync scheduler.
 * Guarded to the Node.js runtime so it never loads into the edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { bootstrapAndStartSync } = await import('./lib/sync.ts');
  await bootstrapAndStartSync();
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify it runs once and is a no-op locally**

Run: `cd frontend && npm run dev`. Watch the startup logs.
Expected: the server boots normally. `WHOAMI_ROOT` (`~/whoami`) already has `.git`, so `bootstrapData` is a silent no-op; `WHOAMI_SYNC_PUSH` is unset, so no scheduler starts and no `[sync]` log lines appear. The wiki loads as before. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add frontend/instrumentation.ts
git commit -m "chore: bootstrap data + start sync from instrumentation hook"
```

---

### Task 4: Write-path push + REPO_LOCK

**Files:**
- Modify: `frontend/app/api/pages/[slug]/route.ts` (the plan-2 version, which already has the `requireSession` gate)

- [ ] **Step 1: Add the imports**

Add to the import block of `frontend/app/api/pages/[slug]/route.ts`:

```typescript
import { withLock } from '@core/pages/locks.ts';
import { REPO_LOCK, pushAfterWrite } from '@/lib/sync';
```

- [ ] **Step 2: Wrap the `PUT` write in `REPO_LOCK` + push**

In `PUT`, the write currently looks like:

```typescript
  try {
    await pages.write(slug, page, author, parsed.data.summary);
  } catch (err) {
    return routeError(err, slug, 'write-failed');
  }
```

Replace it with:

```typescript
  try {
    await withLock(REPO_LOCK, async () => {
      await pages.write(slug, page, author, parsed.data.summary);
      await pushAfterWrite();
    });
  } catch (err) {
    return routeError(err, slug, 'write-failed');
  }
```

- [ ] **Step 3: Wrap the `DELETE` write in `REPO_LOCK` + push**

In `DELETE`, the delete currently looks like:

```typescript
  try {
    await getPageStore().softDelete(slug, author);
  } catch (err) {
    return routeError(err, slug, 'delete-failed');
  }
```

Replace it with:

```typescript
  try {
    await withLock(REPO_LOCK, async () => {
      await getPageStore().softDelete(slug, author);
      await pushAfterWrite();
    });
  } catch (err) {
    return routeError(err, slug, 'delete-failed');
  }
```

`pushAfterWrite()` never throws and is a no-op unless `WHOAMI_SYNC_PUSH=on`, so this is inert on the Mac Studio and active only on the replica. `REPO_LOCK` serialises these writes against the sync scheduler's `pullRebase`.

- [ ] **Step 4: Typecheck + full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 5: Verify a local write still works**

Run: `cd frontend && npm run dev`, then:

```bash
curl -s -X PUT localhost:3001/api/pages/test-sync-scratch \
  -H 'content-type: application/json' \
  -d '{"body":"scratch","summary":"sync wiring smoke test"}'
```

Expected: `{"ok":true}` — the write goes through `REPO_LOCK`; `pushAfterWrite` is a no-op (sync off locally). Clean up: `curl -s -X DELETE localhost:3001/api/pages/test-sync-scratch`. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api/pages/[slug]/route.ts
git commit -m "chore: serialise page writes with sync + push after write"
```

---

### Task 5: GitHub data-repo access token

**Files:** none (GitHub + Render setup; the user performs the GitHub step)

- [ ] **Step 1: Create the access token**

Ask the user to create a **fine-grained GitHub Personal Access Token** scoped to **only** the `family-tree-data` repository, with **Contents: Read and write** permission. (A repo-scoped fine-grained token is tighter than a classic PAT.) The user provides the token string; it is never committed.

- [ ] **Step 2: Confirm the data repo is private**

Run: `gh repo view stevenbarash/family-tree-data --json visibility -q .visibility`
Expected: `private`. If it prints `public`, **stop** — the tree is exposed; resolve that before deploying.

---

### Task 6: Render service configuration

**Files:** none (Render service `srv-d807l4faqgkc739sqak0`, via the Render MCP or dashboard)

Configure — but do **not** deploy yet (next task gates the first deploy).

- [ ] **Step 1: Set the build & start commands**

There is no root `package.json`, so the monorepo is installed package-by-package. Set on the `family-tree` service (`rootDir` stays empty):

- Build command: `cd core && npm ci && cd ../frontend && npm ci && npm run build`
- Start command: `cd frontend && npm run start`

- [ ] **Step 2: Set the health-check path**

Set the service's `healthCheckPath` to `/api/healthz` (the public route added in plan 2).

- [ ] **Step 3: Set environment variables**

Via the Render MCP `update_environment_variables` (or the dashboard), set on the service:

| Key | Value |
|---|---|
| `WHOAMI_ROOT` | `/whoami` |
| `WHOAMI_DATA_REPO_URL` | `https://github.com/stevenbarash/family-tree-data.git` |
| `WHOAMI_DATA_REPO_TOKEN` | the token from Task 5 (secret) |
| `WHOAMI_SYNC_PUSH` | `on` |
| `WHOAMI_SYNC_INTERVAL` | `600` |
| `WHOAMI_AUTH` | `on` |
| `NEXT_PUBLIC_DESCOPE_PROJECT_ID` | the Descope project ID |
| `DESCOPE_MANAGEMENT_KEY` | the Descope management key (secret) |

- [ ] **Step 4: Confirm the disk**

Confirm the persistent disk `dsk-d86sjumgvqtc73e1mrt0` is mounted at `/whoami`. (It is, per the spec — this is a read-only confirmation via the Render MCP `get_service`.)

---

### Task 7: First deploy + verification

**Files:** none (deploy + verification)

⚠️ **Safety gate:** the service auto-deploys on every commit to `main`. By this task, plan 2's Descope gating is already merged and `WHOAMI_AUTH=on` is set — so the first deploy carrying real data is auth-gated from the start. Do not deploy with `WHOAMI_AUTH` unset.

- [ ] **Step 1: Trigger the deploy**

The sync-wiring commits (Tasks 1–4) push to `main` triggers an auto-deploy; or trigger manually via the Render MCP / dashboard. Watch the build log.
Expected: build succeeds (both `npm ci` steps + `next build`).

- [ ] **Step 2: Verify the bootstrap clone**

In the Render service logs, expect `[sync] cloning data repo onto /whoami` on the first boot, then no error. The disk now holds the cloned data repo.

- [ ] **Step 3: Verify the health check**

Run: `curl -s https://family-tree-zffg.onrender.com/api/healthz`
Expected: `{"ok":true}`.

- [ ] **Step 4: Verify the auth gate**

Open `https://family-tree-zffg.onrender.com/` in a browser.
Expected: redirected to `/en/sign-in`; the Descope flow renders; completing it (as an invited user) reaches the wiki.

- [ ] **Step 5: Verify the sync round-trip**

Edit a talk page in the browser on the deployed site. Within ~10 min (or check sooner), confirm the commit appears on `origin/main` of `family-tree-data` (`git -C "$WHOAMI_ROOT" fetch && git -C "$WHOAMI_ROOT" log origin/main -1` on the Mac Studio). Then make a commit on the Mac Studio, push it, and confirm it appears on the deployed site after the next sync tick.

- [ ] **Step 6: Verify the conflict alarm (optional but recommended)**

Temporarily create a same-file divergence (edit one file on both sides, push from the Mac Studio) and confirm the Render logs show `[sync] rebase conflict — sync stalled` rather than a crash or a bad merge. Resolve by aligning the file.

---

### Task 8: Reconcile `SCOPE.md`

**Files:**
- Modify: `docs/SCOPE.md`

- [ ] **Step 1: Move the two anti-goals into scope**

In `docs/SCOPE.md`, the "Out of scope (anti-goals)" section lists **"Public hosting. No SaaS deployment, no cloud DB, no public URL."** and an **app-layer auth** anti-goal. The "no public hosting" anti-goal and the "no app-layer auth" anti-goal are now false. Edit `SCOPE.md` to:

- Remove those two items from the anti-goals list.
- Add, to the in-scope section, a dated note:

  > **Public deployment (added 2026-05-20).** The wiki may be deployed
  > to a public host (Render) as a read-write replica, gated by Descope
  > auth. This reverses the former "no public hosting" / "no app-layer
  > auth" anti-goals. The Mac Studio remains the canonical copy; the
  > local-first model is preserved (see the render deployment spec).

- Leave the `local-first` description intact — it is still true (the Mac Studio is canonical).

- [ ] **Step 2: Commit**

```bash
git add docs/SCOPE.md
git commit -m "docs: scope public hosting + descope auth as in-scope"
```

---

### Task 9: Reconcile `AGENTS.md` files

**Files:**
- Modify: `AGENTS.md`
- Modify: `frontend/AGENTS.md`

- [ ] **Step 1: Update the root `AGENTS.md`**

`AGENTS.md` states **"No auth in `frontend/`"** (in the "Tech and conventions" area). Update that line to note auth is now env-gated:

> **Auth is env-gated.** `frontend/` has no auth locally (Tailscale is
> the access layer, as before); the Render replica sets `WHOAMI_AUTH=on`
> to enable the Descope gate. See the render deployment spec.

- [ ] **Step 2: Update `frontend/AGENTS.md`**

`frontend/AGENTS.md` has a Conventions bullet **"No auth — Tailscale ACLs are the access layer. Don't add login screens, sessions, or auth headers."** Replace it with:

> **Auth is env-gated (`WHOAMI_AUTH`).** Off locally — Tailscale is the
> access layer, no login wall. On for the Render replica — Descope gates
> every page via `proxy.ts`; API routes self-gate via `requireSession()`.
> Don't add a *second* auth system; extend the Descope integration.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md frontend/AGENTS.md
git commit -m "docs: update AGENTS auth conventions for descope gate"
```

---

### Task 10: ROADMAP + CHANGELOG + plan-index triad

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

This is the `feat:` commit — the deployment ships here. CLAUDE.md Rules 14 and 15 and the `roadmap-drift` / `plan-index-drift` tests apply.

- [ ] **Step 1: Add a ROADMAP row**

In `docs/ROADMAP.md`, add a row for this work in the appropriate band (infrastructure / deployment). Mark it `✅ shipped`, dated 2026-05-20, with a one-paragraph summary. Assign the next free `P#.#` ID in that band — note the exact ID chosen; the CHANGELOG entry must reference the same ID.

- [ ] **Step 2: Add the CHANGELOG entry**

Under `## [Unreleased]` in `/CHANGELOG.md`, add an entry that **names the P-ID inline** and uses a status verb (`closes` / `ships`):

```
- **feat:** Public deployment on Render with Descope auth — closes P#.#.
  Two-way git sync (`core` `pullRebase`/`push`, in-process scheduler),
  `WHOAMI_AUTH`-gated Descope login, browser writes attributed to the
  signed-in family member. Mac Studio stays canonical; Render runs a
  read-write replica.
```

(Replace `P#.#` with the ID from Step 1.)

- [ ] **Step 3: Flip the three plan rows to ✅**

In `docs/superpowers/plans/README.md`, change the `🚧` to `✅` for all three rows: `2026-05-20-git-sync-core.md`, `2026-05-20-descope-auth.md`, `2026-05-20-render-deploy-and-sync.md`. Update the footer counts: in-progress drops by 3, shipped rises by 3 (`45 shipped`, `0 in-progress`); total stays `51`.

- [ ] **Step 4: Run the drift tests**

Run: `cd cli && npx tsx --test test/roadmap-drift.test.ts test/plan-index-drift.test.ts`
Expected: both PASS — the `✅` ROADMAP row's P-ID is named in CHANGELOG, the CHANGELOG `closes P#.#` claim lands in a `✅` roadmap row, every plan file has a row, and the footer counts match.

- [ ] **Step 5: Commit (the `feat:` commit)**

```bash
git add docs/ROADMAP.md CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "feat: deploy to render with descope auth and two-way sync"
```

The `changelog-nudge.sh` hook allows this `feat:` commit because `CHANGELOG.md` is staged.

- [ ] **Step 6: Push**

```bash
git push origin main
```

This triggers the final auto-deploy. Re-run Task 7's verification checklist against the deployed site to confirm nothing regressed.

---

## Self-Review Notes

- **Spec coverage:** implements spec phases 3–5 — sync env, `lib/sync.ts` (`composeAuthedUrl`, `bootstrapData`, scheduler, `pushAfterWrite`), `instrumentation.ts` bootstrap, write-path push, `REPO_LOCK` write/sync serialisation, Render service adaptation (build/start commands, env, health check, disk), first deploy + verification, and the `SCOPE.md` / `AGENTS.md` ×2 / ROADMAP / CHANGELOG / plan-index reconciliation.
- **Lock coordination:** the spec requires the pull to not race a write. `REPO_LOCK` is a single shared key acquired by both the write API (Task 4) and the sync scheduler (`bootstrapAndStartSync`'s `tick`). Both import `withLock` from the same `@core/pages/locks.ts` module instance in the one server process, so they genuinely serialise — without touching `core/` (the per-slug lock inside `pages.write` stays, harmlessly nested).
- **Credential approach:** the spec's "SSH deploy key" is implemented as an **HTTPS fine-grained token** (`WHOAMI_DATA_REPO_TOKEN`) instead — runtime `git` from a headless container has no SSH agent, and a token-in-URL needs no key-file or `known_hosts` setup. Same security posture (one repo, read+write). The spec env table was updated to match.
- **Type consistency:** `composeAuthedUrl(url, token)`, `bootstrapData()`, `bootstrapAndStartSync()`, `pushAfterWrite()`, and `REPO_LOCK` have one signature each, used identically in `sync.ts`, `sync.test.ts`, `instrumentation.ts`, and the write route.
- **Safety ordering:** Task 7 deploys only after plan 2's auth is merged and `WHOAMI_AUTH=on` is set (Task 6) — the first data-carrying deploy is gated from the start.
- **Depends on:** plans 1 (`git-sync-core`) and 2 (`descope-auth`). The prerequisite check at the top of this plan confirms both before starting.
