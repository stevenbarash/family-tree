# Render Deployment + Descope Auth — Design

**Status:** approved, ready for implementation plan.
**Roadmap row:** new — to be added during implementation (Rule 14 triad).
**Lift:** L (multi-package: new `core/` git plumbing, frontend auth +
sync, deploy infrastructure, docs reconciliation).

---

## Background

The wiki today runs only on the project owner's machines, browsed over
Tailscale, with no auth (`SCOPE.md:46` — "Tailscale ACLs are the access
layer"). The frontend reads the family tree directly off disk from
`$WHOAMI_ROOT` (`frontend/lib/env.ts:5`, `core/src/paths.ts`), which is
a *separate* git repo (`~/whoami`, remote
`github.com/stevenbarash/family-tree-data`, branch `main`).

The owner wants the wiki reachable when their Mac Studio is off, and
wants family members to both **read** and **contribute** (talk pages,
research notes — the "family interview mode" the project is built
toward). The chosen host is Render.

This is a deliberate reversal of two `SCOPE.md` anti-goals — "no public
hosting" (`SCOPE.md:84`) and "re-adding app-layer auth" (`SCOPE.md:86`).
The owner has decided to make that change; this spec includes the
documentation reconciliation so the repo stops contradicting itself.

Three problems must be solved together: (1) getting the data onto a host
that has no `~/whoami`, (2) a durable round-trip for browser writes back
to the canonical repo, and (3) an auth gate so the public URL does not
expose private family data.

## Scope

**In scope:**

1. **Render web service + persistent disk** running the `frontend/`
   workspace as a read-write replica.
2. **Data bootstrap** — clone the data repo onto the persistent disk on
   first boot; no-op on subsequent boots.
3. **Two-way git sync** — new `push()` / `pullRebase()` plumbing in
   `core/src/pages/git.ts`; push-after-write on the replica; an
   in-process pull scheduler.
4. **Descope auth** — `@descope/nextjs-sdk`, gating every route and API
   handler; embedded `<Descope>` flow on a `/sign-in` page.
5. **Identity → attribution** — the authenticated Descope user replaces
   the `DEFAULT_AUTHOR` placeholder for browser writes.
6. **Docs reconciliation** — `SCOPE.md`, `AGENTS.md`,
   `frontend/AGENTS.md`, ROADMAP, CHANGELOG, plan index.

**Out of scope (explicit non-goals of this work):**

- **Browser article editing.** The replica's writable surface is talk
  pages + research notes only (matches the in-scope contribution model).
  Article authoring stays a CLI/agent activity on the Mac Studio. This
  is what keeps the two machines' writes path-disjoint — see
  [Conflict strategy](#conflict-strategy).
- **GEDCOM / derived-YAML editing from the browser** — already
  CLI/external-only; unchanged.
- **Render as the canonical copy.** The Mac Studio stays canonical; the
  Render instance is a replica (the rejected "Render primary" approach).
- **Privacy gate re-enable (P0.2).** `WHOAMI_PRIVACY_GATE` stays off —
  every authenticated viewer is invited, trusted family, so Descope is
  the access boundary. See [Open decisions](#open-decisions).
- **Multi-tenant / multi-tree hosting.** Single tree, single Descope
  project. (Cross-tree linking remains a `SCOPE.md` anti-goal.)
- **Custom domain.** Optional, addable later; the design works on the
  default `*.onrender.com` URL.
- **Render IaC polish.** The service already exists; config changes
  (env, health check, build scripts) apply to it directly. A
  `render.yaml` blueprint is optional and not part of this work.

## Topology

```
┌─────────────────────┐         ┌───────────────────────────┐         ┌──────────────────────────────┐
│ Mac Studio (home)   │  push   │ GitHub: family-tree-data  │  pull   │ Render Web Service           │
│ CANONICAL            │───────▶ │ (PRIVATE repo — sync bus, │ ◀────── │ REPLICA + persistent disk    │
│ • GEDCOM imports     │ ◀────── │  branch: main)            │ ──────▶ │ • family browse + write      │
│ • agent authoring    │  pull   │                           │  push   │ • Descope-gated              │
│ • `wai` CLI          │         └───────────────────────────┘         │ • WHOAMI_ROOT=/whoami        │
│ • manual git         │                                               └──────────────────────────────┘
└─────────────────────┘
```

Git is the only channel between the two machines. The Mac Studio keeps
its existing manual git workflow on `~/whoami`. Only the Render replica
runs automated sync.

## Architecture

### Host & data bootstrap

The Render service **already exists** — `family-tree`
(`srv-d807l4faqgkc739sqak0`), Starter plan, region ohio, URL
`https://family-tree-zffg.onrender.com`. It auto-deploys this **code**
repo (`github.com/stevenbarash/family-tree`) on every commit to `main`.
This work *adapts* that service; it does not create one.

- **Persistent disk** already attached — `dsk-d86sjumgvqtc73e1mrt0`,
  mounted at **`/whoami`**, 1 GB. So `WHOAMI_ROOT=/whoami`. The disk
  survives deploys, so the data clones **once**. The data repo is
  **65 MB** today (28 MB `.git` + 37 MB working tree, the bulk being
  `assets/sources/` scanned documents) — 1 GB is ~15× headroom, so no
  resize is needed for the foreseeable future.
- **Build:** the service runs Render's native Node runtime with
  `rootDir` empty and `buildCommand` / `startCommand` both `npm run …`
  at the monorepo root. The build must install the npm workspaces and
  build the `frontend/` workspace (`core/` is a workspace dependency,
  so `rootDir` must stay the monorepo root, not `frontend/`). Wiring
  the root `build` / `start` scripts to the frontend workspace is a
  plan-level task.
- **Health check:** the service's `healthCheckPath` is currently empty;
  set it to `/api/healthz`.
- **Bootstrap** runs from `frontend/instrumentation.ts` `register()`:
  1. If `$WHOAMI_ROOT/.git` is absent → `git clone` the data repo onto
     the disk.
  2. If the search index is absent → build it from disk
     (`rebuildSearchIndexFromDisk()`).
  3. Start the [sync scheduler](#sync-scheduler).
- **Repo access:** a GitHub **fine-grained personal access token**
  scoped to only `family-tree-data` with Contents read+write, stored as
  the Render secret `WHOAMI_DATA_REPO_TOKEN`. The clone/push use an
  HTTPS remote with the token embedded (`https://x-access-token:…@…`) —
  a headless container has no SSH agent, so a token-in-URL is simpler
  than managing key files. Same posture as a deploy key (one repo,
  read+write).
- ⚠️ **Precondition:** `family-tree-data` **must be a private GitHub
  repo.** Verify before any deploy work. A public data repo means the
  whole tree is already exposed — a separate problem this spec does not
  address.

### Sync — two-way git

**New `core/` plumbing.** `core/src/pages/git.ts` is already the git
boundary module (`addAndCommit`, `fileHistory`, `restoreFromIndex`). Add
two functions in the same `simple-git` style:

- `push(repoRoot, remote, branch)` — push committed work to the remote.
- `pullRebase(repoRoot, remote, branch)` — `fetch` + `rebase`; on
  conflict, `rebase --abort` and **throw a typed `RebaseConflictError`**
  so the caller surfaces it loudly rather than guessing.

These stay boundary-module functions (file/process I/O at the public
surface, like the existing exports). No pure-module rule is violated.

**Write path (Render → remote).** After the write API's existing
`addAndCommit` succeeds, a best-effort `push()` runs. Failure (offline,
non-fast-forward) leaves the local commit intact; the sync scheduler
retries on its next tick. Gated by `WHOAMI_SYNC_PUSH=on` so only the
replica auto-pushes — the Mac Studio's local frontend never auto-pushes.

**Pull path (remote → Render).** An **in-process scheduler** started
from `instrumentation.ts`, every `WHOAMI_SYNC_INTERVAL` (~10 min
default):

1. `pullRebase()` — bring in Mac Studio changes.
2. If anything changed, `rebuildSearchIndexFromDisk()` — a git pull is
   exactly the "direct edits" case in the search-rebuild contract
   (`core/AGENTS.md`).
3. `push()` — catch-up for any commits a write-path push missed.

*Why in-process and not a Render Cron Job:* a Render persistent disk
binds to a single service; a separate cron service cannot see the disk.
The scheduler therefore lives inside the web service process.

<a id="conflict-strategy"></a>**Conflict strategy — path partitioning.**
The replica writes only `pages/{locale}/*.talk.md` and research-notes
paths. The Mac Studio owns articles, GEDCOM, and `genealogy/derived/`.
Disjoint paths ⇒ `pull --rebase` is virtually always clean. When a
rebase *does* conflict, the scheduler aborts it, logs loudly, and (if
configured) notifies — it never auto-resolves. This is Rule 12, fail
loud: a wrong genealogy merge is worse than a stalled sync.

**Write/pull race.** Page writes are serialized by the in-memory promise
queue in `core/src/pages/locks.ts`. The sync scheduler **must acquire
the same lock** around `pullRebase()` so a rebase never races an
in-flight commit. This is a hard correctness requirement, not an
optimization.

Push target is **`main` directly** — a dedicated branch adds a manual
merge step a two-machine, path-partitioned setup does not need.

### Descope auth

- **Auth is env-gated — `WHOAMI_AUTH`.** Off by default; the Render
  service sets `WHOAMI_AUTH=on`. When off, `proxy.ts` skips Descope
  entirely and `requireSession()` returns `DEFAULT_AUTHOR` — so the
  Mac Studio's local frontend (browsed over Tailscale) has no login
  wall, exactly as today. Same pattern as the existing
  `WHOAMI_PRIVACY_GATE` flag (`frontend/lib/env.ts:39`).
- `@descope/nextjs-sdk`. `<AuthProvider projectId={…}>` wraps the app in
  `app/[locale]/layout.tsx` — the de-facto root layout (next-intl
  renders `<html>` there; there is **no** `app/layout.tsx`). `baseUrl`
  is **omitted** (no Descope custom domain) — the SDK uses Descope
  cloud defaults, which work from any origin including `*.onrender.com`.
- **Gate everything — two layers, no fragile merge.** Page routes are
  gated in `proxy.ts`; API route handlers gate themselves. This
  deliberately avoids composing two header-rewriting middlewares.
- **`proxy.ts` — page gating, redirect-or-fall-through.** `proxy.ts`
  calls Descope `authMiddleware(opts)` (a plain `(request) => Response`
  handler) and next-intl's `createMiddleware`. The composition: run
  Descope; if it returns a **redirect** (unauthenticated) → return it;
  otherwise **discard** Descope's response and run next-intl fresh.
  Descope's `X-Descope-Session` perf header is intentionally **not**
  carried forward — `session()` re-validates from the `DS` cookie
  wherever it is called, so the header is an optimization, not a
  requirement. Dropping it removes the two-middleware header-merge the
  Descope docs have no recipe for. `proxy.ts`'s matcher is **unchanged**
  (still excludes `/api`).
- **API gating.** Protected route handlers call a `requireSession()`
  helper (in `lib/descope.ts`) at the top — it returns the
  authenticated identity or throws a 401. Write handlers need the
  identity for attribution anyway, so the gate is not extra work.
  `/api/healthz` skips it. The middleware matcher is **not** extended
  to `/api`.
- **Sign-in page** `app/[locale]/sign-in/page.tsx` — lives inside the
  locale tree (there is no root layout to host a locale-exempt page),
  renders `<Descope flowId="sign-up-or-in" />`. Marked public in
  **both** next-intl and Descope; the middleware composition must
  tolerate the `/[locale]/` prefix on the public-route match and on the
  `redirectUrl`. The actual methods (magic link, social, passkey…) are
  configured in the Descope console flow, not in code.
- **Health check.** Render polls a health path on deploy; that path
  must be public. Add a locale-agnostic `app/api/healthz/route.ts` —
  route handlers need no layout, and `/api/*` is simplest to mark
  public in both middlewares.
- **Invite-only.** The Descope project/flow is configured so only
  family the owner adds can complete login — no open sign-up. Console
  configuration, not code.
- **CORS.** The embedded `<Descope>` flow calls `api.descope.com` from
  the browser; the Render URL must be added to the Descope project's
  approved/allowed origins.

### Identity → attribution

The write API (`PUT /api/pages/[slug]`) already needs `session()` to
gate. It also uses it to **attribute**:

1. `await session()` → `token.sub` (userId).
2. Resolve to a name + email. Server-side, `session()` exposes only
   `token.sub`; name/email come from either a custom JWT claim or a
   `createSdk().management.user.load(userId)` call. The design uses a
   small `frontend/lib/descope.ts` helper that resolves userId →
   `AuthorIdentity`, with a short-TTL in-memory cache to avoid a
   management call per write.
3. The resolved `AuthorIdentity` is passed to `pages.write()` in place
   of `DEFAULT_AUTHOR`.

Git commits and talk-page `recorded_by` then carry the real family
member's name — consistent with the project's real-identity attribution
rule (no `whoami` placeholder for human-authored content).
`DEFAULT_AUTHOR` remains the fallback for CLI and unauthenticated server
contexts (e.g. the GEDCOM sync route).

## Components / new code

| File | Change |
|---|---|
| `core/src/pages/git.ts` | + `push()`, `pullRebase()`, `RebaseConflictError` |
| `core/test/pages/git-sync.test.ts` | new — two-clone sync tests |
| `frontend/instrumentation.ts` | new — bootstrap clone + index build + start scheduler |
| `frontend/lib/sync.ts` | new — pull/rebuild/push loop; write-path push helper; lock coordination |
| `frontend/lib/descope.ts` | new — `createSdk` wiring + userId→`AuthorIdentity` resolver with TTL cache |
| `frontend/lib/env.ts` | + `WHOAMI_SYNC_PUSH`, `WHOAMI_SYNC_INTERVAL`, `WHOAMI_DATA_REPO_URL`, Descope env surface |
| `frontend/proxy.ts` | compose Descope `authMiddleware` with next-intl (redirect-or-fall-through); matcher unchanged |
| `frontend/app/[locale]/layout.tsx` | wrap in `<AuthProvider>` |
| `frontend/app/[locale]/sign-in/page.tsx` | new — embedded `<Descope>` flow (public route) |
| `frontend/app/api/healthz/route.ts` | new — public health-check route |
| `frontend/app/api/pages/[slug]/route.ts` | `session()` gate + attribution + post-write `push()` |
| `frontend/package.json` | + `@descope/nextjs-sdk` |
| _Render service config_ | adapt existing `family-tree` service — env vars, health check, root build/start scripts (no new file) |
| `docs/SCOPE.md` | move public-hosting + app-auth from anti-goals to in-scope, dated note |
| `AGENTS.md`, `frontend/AGENTS.md` | update "no auth" statements |
| `docs/ROADMAP.md` | new row for this work |
| `CHANGELOG.md` | entry naming the new P-ID |
| `docs/superpowers/plans/README.md` | add row for the implementation plan |

## Environment variables

| Var | Where | Public/secret |
|---|---|---|
| `WHOAMI_ROOT=/whoami` | Render | config |
| `WHOAMI_DATA_REPO_URL` (HTTPS remote) | Render | config |
| `WHOAMI_SYNC_PUSH=on` | Render only | config |
| `WHOAMI_SYNC_INTERVAL` (default ~600s) | Render | config |
| `WHOAMI_AUTH=on` | Render only | config |
| `WHOAMI_DATA_REPO_TOKEN` (GitHub PAT) | Render | **secret** |
| `NEXT_PUBLIC_DESCOPE_PROJECT_ID` | Render + local | public |
| `DESCOPE_MANAGEMENT_KEY` | Render | **secret** |

## Data flow

```
Browser write (talk/note)
  └─▶ PUT /api/pages/[slug]
        ├─ session() ──▶ descope.ts resolve ──▶ AuthorIdentity
        ├─ pages.write() ──▶ addAndCommit()        (existing)
        ├─ idx.upsert() + persist                   (existing)
        └─ push()  [WHOAMI_SYNC_PUSH=on, best-effort]

Sync scheduler tick (every WHOAMI_SYNC_INTERVAL)
  └─ acquire page-write lock
       ├─ pullRebase()  ──▶ RebaseConflictError? abort + alarm
       ├─ changed? ──▶ rebuildSearchIndexFromDisk()
       └─ push()
```

## Error handling

- **Clone fails on first boot** (bad key, repo unreachable) → fatal:
  `instrumentation.ts` logs loudly and the service is unhealthy. The
  app must not serve an empty wiki as if it were real.
- **`push()` fails** (offline, non-fast-forward) → best-effort: the
  local commit stands; the next scheduler tick retries. Logged at
  `warn`.
- **`pullRebase()` conflict** → `rebase --abort`, log at `error`,
  optional notification. Sync stalls until resolved; the app keeps
  serving the last-good tree. Never auto-resolved.
- **Descope session invalid/expired** → `authMiddleware` redirects to
  `/sign-in`. API handlers without a valid session return 401.
- **Descope management call fails** during attribution → fall back to a
  generic-but-honest `AuthorIdentity` (userId-derived), never silently
  to the `whoami` placeholder; log at `warn`.
- **Disk full** on the persistent disk → writes fail at `pages.write()`;
  the existing atomic-rollback path in `PageStore.write` applies.

## Tests

<a id="tests"></a>

- **`core/test/pages/git-sync.test.ts`** — build two clones of a temp
  git repo to simulate Mac Studio + replica:
  - push/pull round-trip moves a commit.
  - path-partitioned edits (talk file on one side, article on the
    other) rebase cleanly.
  - same-file divergent edits → `pullRebase()` throws
    `RebaseConflictError` and leaves no half-rebased state.
- **Middleware composition test** — the redirect-or-fall-through logic:
  a Descope redirect response is honored (returned as-is); a Descope
  pass response is discarded and next-intl runs (locale routing still
  applies). Tested with fake Descope responses, no live project.
- **Attribution test** — `PUT /api/pages/[slug]` with a mocked session
  produces a commit authored by the resolved family member, not
  `DEFAULT_AUTHOR`.
- **Existing suites must stay green** — notably
  `cli/test/roadmap-drift.test.ts` and
  `cli/test/plan-index-drift.test.ts` (the docs-reconciliation step
  must satisfy both directions of the Rule 14 / Rule 15 triads).

## Open decisions

Resolved during design; recorded so the plan does not reopen them:

1. **Push to `main` directly**, not a dedicated branch — path
   partitioning makes divergence rare; a branch adds a manual merge
   step for no benefit at two-machine scale.
2. **~10-minute pull cadence** — fast enough that family contributions
   appear on the Mac Studio within a coffee break; slow enough to be
   negligible load. Tunable via `WHOAMI_SYNC_INTERVAL`.
3. **Privacy gate (`WHOAMI_PRIVACY_GATE`) stays off** — Descope gates
   the whole site to invited family; every viewer is trusted, so the
   living-person filter adds friction without a threat model. P0.2
   stays parked. Re-raise only if a "guest" tier (less-trusted
   viewers) is ever introduced.
4. **Replica writable surface = talk pages + research notes only** —
   the partition that keeps two-way sync conflict-free. If browser
   article editing is ever wanted, the conflict strategy must be
   redesigned first.

## Implementation order (for the plan)

Sequenced so each phase is independently shippable and the public URL
is never reachable without auth:

1. **Core git plumbing** — `push()`, `pullRebase()`,
   `RebaseConflictError` + tests. Pure boundary-module work, no deploy.
2. **Descope auth** — SDK, `AuthProvider`, `proxy.ts` composition,
   `/sign-in` page, API gating, attribution. Verified locally that
   gating and attribution work *before* anything is public.
3. **Sync wiring** — `lib/sync.ts`, `instrumentation.ts` bootstrap +
   scheduler, write-path push, lock coordination.
4. **Render deploy** — adapt the existing `family-tree` service: add
   the data-repo token + all env vars, set `healthCheckPath`, fix the root
   build/start scripts. The service **auto-deploys on every commit to
   `main`**, so auth (phase 2) must be complete and correct before it
   merges — or autoDeploy/maintenance-mode holds the rollout.
5. **Docs reconciliation** — `SCOPE.md`, `AGENTS.md` ×2, ROADMAP,
   CHANGELOG, plan index. One commit, satisfies the Rule 14/15 triads.

**Safety-ordering rule:** the service auto-deploys from `main`, so the
first deploy carrying real data must already carry working Descope
gating — auth is not bolted on after the URL is live. If phases land
incrementally on `main`, hold the rollout with Render maintenance mode
or by pausing autoDeploy until auth is verified.
