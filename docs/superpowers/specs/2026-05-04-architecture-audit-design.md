# Architecture audit + adjustment for the family-tree wiki

> Spec for a structural audit of the whoami.wiki monorepo and the
> adjustments needed to fully align the architecture with the
> family-tree-wiki product (post personal-wiki rewrite), targeting a
> single-user-on-Tailscale baseline that can grow into a multi-reader
> family-shared deployment with an auth seam already in place.

## Context

whoami.wiki started as a personal MediaWiki-based encyclopedia (one
user documenting their life from personal archives) and was rewritten
into a markdown + Next.js family-tree wiki driven by a GEDCOM file.
The rewrite reshaped most of the code but left vestiges of the old
shape in several layers. The product's intended scope has also shifted:
the near-term goal is still single-user, but the medium-term horizon
is **family-shared self-hosted** (parents, siblings, cousins reading on
the user's server, with eventual contribution).

This spec inventories the misalignments that remain, names a target
architecture that fits the family-tree-wiki + multi-reader scope, picks
the framework moves that follow from it, and stages the changes into a
sequence of independently-shippable moves.

The output of this spec is one design document. The implementation
follows as one or more plans under `docs/superpowers/plans/` (one per
move), produced via the writing-plans skill.

## Non-goals

- **Building auth.** Auth is explicitly out of scope right now (Tailscale
  ACLs are the access layer). The architecture must leave a clean seam
  for it; we do not add code.
- **Hosted multi-tenant.** Other people running their own whoami.wiki
  is the C-tier scope; that's already implied by the `plugins/whoami/`
  shape and not the focus here.
- **Replacing Next.js.** Next is the right renderer for the wiki UI.
  Nothing here removes it.
- **Redesigning `core/`.** The pure-modules-vs-boundary-modules table
  in `core/AGENTS.md` is sound. We migrate a few files into it, we don't
  reshape it.
- **Redesigning the data repo (`~/whoami/`).** The two-repo split is
  working. Stays as-is.
- **Reworking schema migrations.** The recent registry+composer+runner+
  409-on-stale pattern is sound. One stabilization pass at the boundary,
  not a redesign.

## Diagnosis: where the architecture is rubbing wrong

Five misalignments, ordered by structural weight.

### D1. Frontend is doing two jobs

The Next.js app renders the wiki *and* hosts the API the CLI talks to.
Concrete API surface today:

- `GET /api/healthz`
- `GET /api/pages`, `GET/PUT/DELETE /api/pages/[slug]`
- `POST /api/migrate`
- `GET /api/search`, `POST /api/search/rebuild`
- `POST /api/gedcom/sync`, `GET/POST /api/gedcom/recite`

The handler bodies live in `frontend/app/api/*/route.ts`, calling
through `frontend/lib/server-services.ts`. This causes:

- Agent loop requires `next dev` running. No headless agent sessions.
- The eval suite has to provision the entire Next app to get HTTP. Slow,
  brittle, hard to parallelize.
- Future auth would have to slot into Next route handlers individually
  instead of one middleware seam.
- The mental model "the agent talks to the wiki" is more accurately
  "the agent talks to the Next.js app's `/api` routes," which conflates
  two responsibilities.

Maps to user pain points 1 (agent loop) and 3 (CLI ↔ frontend coupling).

### D2. Plugin runtime is mid-pivot and drifting across harnesses

`plugins/whoami/` ships three runtime files that the user's agent loads:

- `CLAUDE.md` — **still the old personal-MediaWiki prompt**: describes
  MediaWiki at `localhost:8080`, wikitext editing, a `Task:` namespace,
  the `wai snapshot`/`wai task`/`wai upload`/`wai section` commands, a
  vault at `~/Library/Application Support/whoami/vault`, source pages
  with WhatsApp JIDs and Facebook thread paths. None of this matches
  the product. Family-tree-wiki agents are reading wrong instructions.
- `agents/editor.md` — **partially refreshed**: uses the *new* CLI
  surface (markdown, `.talk` siblings, `wai sync-gedcom`, `wai recite`,
  `:::cite-vault:::` directives) but still calls the wiki "a personal
  encyclopedia" and centers WhatsApp/photos/voice-notes source pages.
  Mid-pivot.
- `GEMINI.md` — present in the working tree but untracked; alignment
  with `CLAUDE.md` and `editor.md` unverified.

Three runtime files expressing overlapping intent will drift; every
drift is a behavior delta between Claude Code and Gemini agents on the
same task.

Maps to pain points 1 and 6.

### D3. Layer leaks in `frontend/lib/`

Several `frontend/lib/` files contain pure logic that has nothing to
do with React or Next, but lives in the renderer because that's where
the data joins happen:

- `wikilinks.ts` — `[[double-bracket]]` resolution, slug index. Pure.
- `slug.ts` — slug helpers. Pure.
- `initials.ts` — initials/monogram derivation. Pure.
- `search-staleness.ts` — mtime-based staleness check (calls `statSync`
  but the policy logic is pure).
- Parts of `derived.ts` — record shaping logic (the file reading is the
  boundary; the mapping is pure).

These belong in `core/` so the host package and the eval suite can
reuse them without pulling in the Next renderer. They ended up in
`frontend/lib/` because that was the only consumer when they were
written.

Maps to pain point 2.

### D4. There is no named "agent-author contract"

The contract the agent is held to is implicit and spread across:

- The `wai` CLI flag surface (input shape).
- The `host`/Next API response shapes (output shape).
- The `PageMeta` Zod schema (page persistence shape).
- `plugins/whoami/agents/editor.md` (workflow).
- `plugins/whoami/skills/editorial-guide/` (style + structure).

No single artifact says "this is what the agent agrees to." The eval
suite indirectly tests this contract; the contract itself isn't
versioned, ownable, or describable as a single thing.

Maps to pain points 1 and 6.

### D5. Schema-migration boundary is still settling

The recent commits (`957fd8e` add `schemaVersion` field, `cf815fe` add
migration registry + composer, `4a512e3` parsePage owns migration chain,
`a65abc5` enforce strict write rule, `bf5f730` 409 on stale, `b232a17`
migrate-runner boundary, `b66241c` `POST /api/migrate`, `9150f31` CLI
client, `47db2f1` `wai migrate`, `46ed278` future-version error page)
show the pattern landed across `core/`, the Next API, and the CLI in a
short window. The pattern is sound. The boundary between the layers is
still finding itself — for example, `runMigrateOnDisk` lives in
`server-services.ts` (a frontend file) but it's not really a frontend
concern; it's a host concern.

One stabilization pass after the host extraction, not a redesign.

Maps to pain point 5.

## Target architecture

A **5-layer model with deployment flexibility**. Most of the current
packages stay; one new package is extracted; a handful of files move.

```
┌─ Agent layer ──────────────────────────────────────────────┐
│ plugins/whoami/  — runtime prompts, skills, sub-agents     │
│ Single source of intent; per-harness files thinly wrap it  │
└────────────────────────────────────────────────────────────┘
              │ drives via wai CLI
┌─ Surface layer ────────────────────────────────────────────┐
│ cli/  (agent surface)          frontend/  (human surface)  │
│ HTTP client to host            Next renderer + thin shims  │
└────────────────────────────────────────────────────────────┘
              │ both call
┌─ Host layer  ★ NEW (extracted from frontend) ──────────────┐
│ host/  — pure (Request) → Response handler functions       │
│ Each Next route file becomes a one-line re-export shim     │
│ Eval suite calls handlers in-process (no HTTP, no Next)    │
│ Auth seam lives here (one place, when added)               │
└────────────────────────────────────────────────────────────┘
              │ uses
┌─ Core layer ───────────────────────────────────────────────┐
│ core/  — pure logic + documented disk boundaries           │
│ Gains: wikilinks, slug, initials, search-staleness         │
└────────────────────────────────────────────────────────────┘
              │ reads/writes
┌─ Data layer ───────────────────────────────────────────────┐
│ ~/whoami/  (separate repo, owned by the user)              │
│ Unchanged                                                   │
└────────────────────────────────────────────────────────────┘
```

### What changes vs. today

| Layer    | Today                                                         | Target                                                           |
| -------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Data     | `~/whoami/`                                                   | Same                                                             |
| Core     | `core/` — pure + boundary modules                             | Same shape; absorbs pure logic from `frontend/lib/`              |
| Host     | (none — API lives in `frontend/app/api/*`)                    | New `host/` package: pure handler functions, mounted as Next shims, in-process callable |
| Surface  | `frontend/` (renderer + API), `cli/` (HTTP client)            | `frontend/` is renderer + thin Next mount of host. `cli/` unchanged externally |
| Agent    | `plugins/whoami/` (runtime files inconsistent)                | One canonical source of intent; per-harness files wrap it         |

## Framework choices

Two picks. The guiding principle is to introduce the smallest amount of
new surface that solves the structural problem. We can always add a
framework later when a felt pain justifies it.

### F1. Pure request-handler functions in `host/`, no new framework

`host/` is a plain TypeScript package. It exports each route as a
function with the standard Web Fetch shape:

```ts
// host/src/pages.ts
export async function pagesGet(req: Request): Promise<Response> { ... }
export async function pagesPut(req: Request): Promise<Response> { ... }
export async function pagesDelete(req: Request): Promise<Response> { ... }
```

Each Next route handler under `frontend/app/api/*/route.ts` becomes a
one-line shim:

```ts
// frontend/app/api/pages/[slug]/route.ts
import { pagesGet, pagesPut, pagesDelete } from 'host';
export const GET = pagesGet;
export const PUT = pagesPut;
export const DELETE = pagesDelete;
```

This gives us the architectural payoff (host logic out of `frontend/`,
layer leaks fixable, schema-migration boundary nameable, eval suite
can call handlers in-process without HTTP) without introducing any
framework dependency.

Why not Hono (the natural alternative):

- Next is always up in this deployment, so the standalone-server story
  Hono enables is not a current need.
- Cross-route middleware (auth, etc.) can be expressed as a higher-
  order function wrapper around the handlers when auth is reintroduced
  — see Future-auth seam.
- If/when a felt pain justifies Hono (eval-suite parallelization
  becomes painful, or we want true headless agent runs), the handlers
  are already framework-agnostic Web Fetch shape — adding Hono later
  is a 1-day move, not a rewrite.

Why not "extract handler bodies as helper functions but keep them in
Next route files":

- That keeps the layer mixing problem (frontend owns the API) and
  doesn't address D1.

### F2. Zod as the wire-schema source of truth

`PageMeta` is already defined in Zod (`core/src/pages/schema.ts`).
Extend that pattern: every `host/` route validates request bodies and
query params through a Zod schema, and the response shape is also a
named Zod type re-exported for the CLI to consume.

A small validation helper sits in `host/src/validate.ts`:

```ts
export async function parseJsonBody<T>(
  req: Request, schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; res: Response }> { ... }
```

Each handler calls it once at the top:

```ts
const parsed = await parseJsonBody(req, PutPageBody);
if (!parsed.ok) return parsed.res; // 400 with structured errors
```

This makes the wire contract a typed artifact rather than implicit
documentation, and feeds D4 (named agent-author contract).

### F3. No other framework introductions

- Test runner stays `tsx --test` (Node `node:test`). No Vitest.
- Build stays per-package as it is (esbuild for the CLI bundle, Next's
  build for the frontend). `host/` ships unbundled TS — it's
  consumed in-process by Next route handlers and tests.
- No ORM (file-based persistence stays).
- No new state management library, UI kit, etc.

## The moves

Five moves. M1 is the structural change; everything else cascades or
is independent and can ship in any order after.

### M1. Extract `host/` package (pure handler functions, mounted as Next route shims)

**Scope.** Create a new `host/` workspace package. Move the request-
handling logic from `frontend/app/api/*/route.ts` and the orchestration
from `frontend/lib/server-services.ts` into `host/` modules. Each route
exports one or more handler functions of shape
`(req: Request) => Promise<Response>`. Keep the singletons (page store,
search index, slug index, list cache) in `host/src/services.ts` so they
initialize once and are reused across calls.

Each `frontend/app/api/*/route.ts` becomes a thin shim that re-exports
the corresponding handler from `host/`:

```ts
// frontend/app/api/pages/[slug]/route.ts
import { pagesGet, pagesPut, pagesDelete } from 'host/pages';
export const GET = pagesGet;
export const PUT = pagesPut;
export const DELETE = pagesDelete;
```

**What stays in `frontend/`.** SSR data joins in `frontend/lib/family.ts`
that read directly from disk for render performance. The renderer can
read from disk directly when it doesn't need the host's
write-validation; it doesn't have to round-trip its own HTTP layer.

**What moves into `host/`.**

- All `frontend/app/api/*/route.ts` handler bodies (each becomes a
  function in `host/src/<area>.ts`).
- `runMigrateOnDisk`, `searchAndJoin`, `rebuildSearchIndexFromDisk`,
  `orchestrateMigrate`, `persistSearchIndex`, the singleton accessors
  (`getPageStore`, `getCachedList`, `getSearchIndex`,
  `invalidateListCache`) from `frontend/lib/server-services.ts`.
- `frontend/lib/env.ts` is split: variables that the renderer also
  needs (`WHOAMI_ROOT`, `PAGES_DIR`) move to `core/env.ts` (or stay in
  `frontend/lib/env.ts` and `host/` re-exports them — pick during
  implementation).

**What the CLI sees.** No external change. The CLI continues to speak
HTTP to whatever is on the configured server URL.

**What the eval suite sees.** Today it has to provision the full Next
frontend to get HTTP. After M1, the eval runner can call handler
functions in-process: build a `Request`, await the handler, inspect
the `Response`. No HTTP, no Next compile.

**Acceptance.**

- `wai healthz` works against `npm --workspace frontend run dev` (the
  Next-mounted route handlers).
- The eval runner exercises handlers in-process with no HTTP server
  for unit/integration tests.
- All current API behavior is preserved; existing `*.test.ts` files
  pass with no logic changes.

**Estimated size.** Largest of the five moves. One implementation plan,
sequenced as: (1) scaffold `host/` workspace package, (2) move
services + singletons, (3) port routes one at a time as pure handlers,
(4) replace each Next route file with a re-export shim, (5) update the
eval runner to call handlers in-process where it currently HTTPs.

### M2. Refresh `plugins/whoami/` runtime prompts for the family-tree-wiki product

**Scope.** Replace `plugins/whoami/CLAUDE.md` and align `GEMINI.md` and
`agents/editor.md` so the runtime prompts describe the *current*
product:

- Family tree (GEDCOM-derived people, places, events) is the spine.
- Articles are markdown + frontmatter under `~/whoami/pages/`.
- Source pages still exist but the canonical sources are GEDCOM-derived
  records and user-supplied research notes, not WhatsApp/Facebook
  archives. (If the personal-archive use case is still wanted, it
  becomes one *kind* of source page, not the whole framing.)
- The CLI surface is the current `wai` (no `wai task`, `wai snapshot`,
  `wai upload`, `wai section`).
- Workflow is: read GEDCOM-derived person, read prior page, draft,
  post questions to talk page, publish, log.

**Single source pattern.** Introduce one canonical document
(`plugins/whoami/SKILL.md` or similar — name during implementation)
that owns the runtime intent. `CLAUDE.md`, `GEMINI.md`, and
`agents/editor.md` become thin adapters that include or reference the
canonical doc. This addresses cross-harness drift (D2).

**Validation.** Re-run the eval suite after each substantial change.
Plugin changes are prompt engineering; correctness is measured, not
asserted.

**Acceptance.**

- No mention of MediaWiki, wikitext, `localhost:8080`, `Task:`
  namespace, vault snapshots, `wai snapshot`/`wai task`/`wai upload`/
  `wai section`, `~/Library/Application Support/whoami/vault`.
- Single canonical document is the source of truth; per-harness files
  defer to it.
- Eval scores on existing fixtures are equal-or-better after the
  refresh (regression baseline established before starting).

**Estimated size.** Medium. One implementation plan. Independent of
M1; can ship before, after, or alongside.

### M3. Pull pure logic from `frontend/lib/` into `core/`

**Scope.** Move the following into `core/`:

- `frontend/lib/wikilinks.ts` → `core/src/pages/wikilinks.ts` (the
  `[[link]]` resolver and slug index belong with page parsing).
- `frontend/lib/slug.ts` → `core/src/pages/slug.ts` (already a pages
  concern; possibly merge with the existing `core/src/pages/slug.ts`
  if it overlaps — verify during implementation).
- `frontend/lib/initials.ts` → `core/src/family/initials.ts` (initials
  are a family-display concern).
- `frontend/lib/search-staleness.ts` → `core/src/search/staleness.ts`
  (search-index concern; the file I/O is already a boundary in
  `core/src/search/`).
- Portions of `frontend/lib/derived.ts` — split the pure shaping logic
  out from the I/O.

After the move, `frontend/lib/` contains only: `env.ts`, `family.ts`
(orchestration + caching), `render.tsx` (JSX), `assets.ts` (frontend-
specific), `utils.ts` (if still needed), and tests.

**Acceptance.**

- `frontend/lib/` shrinks measurably (target: 5-7 source files
  remaining, down from ~12 today).
- `host/` and `evals/` can import these utilities from `core/` without
  pulling in any frontend code.
- Existing tests pass with updated imports.

**Estimated size.** Small. One implementation plan; can ship before or
after M1, but easier after (so `host/` consumers exist immediately).

### M4. Stabilize the schema-migration boundary

**Scope.** With M1 done, the migration story has a clear home: `core/`
owns the migration chain (registry + composer), `host/` owns the wire
contract (writes return 409 on stale, GETs return migrated), `cli/`
exposes `wai migrate`. One pass to:

- Move `runMigrateOnDisk` and `orchestrateMigrate` into `host/` (they
  shouldn't be in `frontend/lib/` once `host/` exists).
- Document the contract in one place (in the host package README and
  cross-referenced from `core/AGENTS.md` and `cli/AGENTS.md`).
- Confirm the 409 response shape is documented in the agent-author
  contract artifact (D4 / M5).
- Add an integration test that exercises the full chain (write a
  schemaVersion=N page, bump the registry, hit `POST /api/migrate`,
  verify migrated content + git commit).

**Acceptance.**

- One canonical document describes the migration contract.
- No migration logic lives in `frontend/lib/`.
- The integration test exercises the chain by calling host handlers
  in-process — no HTTP, no Next compile, no test fixtures of `Request`
  objects beyond what the handler signature requires.

**Estimated size.** Small. One implementation plan; depends on M1.

### M5. Name the agent-author contract

**Scope.** Produce one artifact that says "this is what the agent
agrees to." Options:

- **A markdown document** under `plugins/whoami/` (e.g.
  `agent-author-contract.md`) that enumerates: CLI command surface,
  host API endpoints + Zod schemas, `PageMeta` schema with `schemaVersion`,
  editorial guide reference, talk-page conventions.
- **A generated artifact** built from the Zod schemas + CLI help output
  + editorial guide table of contents.

Recommended: start with a hand-written markdown document and consider
generation later if drift becomes a problem. The doc is short (few
hundred lines), changes infrequently, and benefits from human framing.

This is the contract the eval suite is testing against; naming it
makes it ownable, versionable, and a clean reference for any future
harness.

**Acceptance.**

- One artifact exists and is referenced from `plugins/whoami/AGENTS.md`,
  `cli/AGENTS.md`, and `host/AGENTS.md`.
- The artifact is updated atomically with any change to CLI flags,
  host routes, or `PageMeta` schema (a checklist item in the relevant
  PR templates).

**Estimated size.** Small. One implementation plan; depends on M1
(needs `host/` to exist) and ideally M2 (the refreshed runtime prompts
reference the contract).

## Sequencing

Recommended order:

1. **M1** (extract `host/`) — structural; everything else depends on it
   or is much easier after it.
2. **M3** (pull pure logic into `core/`) — small, independent, makes
   the next moves cleaner. Can be done in parallel with M1 if separate
   sessions.
3. **M2** (refresh plugins) — independent of M1/M3 in code, but the
   *content* of the refreshed prompts can reference `host/` cleanly
   once it exists.
4. **M4** (stabilize migration boundary) — depends on M1.
5. **M5** (name the contract) — depends on M1, ideally M2.

M1 + M3 ship first. M2 ships when ready (eval-validated). M4 + M5
follow as cleanup.

## Future-auth seam

When auth is reintroduced, it lands as a higher-order function in
`host/` that wraps each handler:

```ts
// host/src/auth.ts
export function withAuth(
  handler: (req: Request, user: User) => Promise<Response>,
  opts?: { allowAnonymous?: boolean },
): (req: Request) => Promise<Response> { ... }
```

Each route module then wraps its handlers once:

```ts
// host/src/pages.ts
export const pagesPut = withAuth(async (req, user) => { ... });
```

No changes to `core/`, `cli/`, or `frontend/` renderers. The CLI gains
an authenticated client (it already had one historically — the
removal commit was `309619a chore: remove auth entirely (will re-add
later)`). The `users.json` file in `~/whoami/data/` already exists in
the data layer.

This spec leaves the seam in place; building auth is a separate plan,
later. (If a framework like Hono is adopted later, `withAuth` becomes
`app.use('*', authMiddleware)` — the seam moves but the per-handler
shape doesn't change.)

## What we are explicitly NOT doing

- Not introducing a new test framework, build tool, ORM, or state
  manager.
- Not redesigning `core/`'s pure-vs-boundary module pattern.
- Not redesigning the `~/whoami/` data repo layout.
- Not redesigning the schema-migration registry/composer pattern.
- Not adding auth.
- Not removing Next.js or replacing it for the renderer.
- Not changing the `wai` CLI's external flag surface (agents in the
  wild depend on it).
- Not building any "anyone with their own tree" / hosted multi-tenant
  features.

## Appendix: relevant prior plans

- `docs/superpowers/plans/2026-05-04-schema-migrations.md` — recent
  schema-migration implementation plan (M4 builds on this).
- `docs/superpowers/plans/2026-05-03-cli-server-contract.md` — prior
  cleanup of the CLI-server wire types (M5 references this).
- `docs/superpowers/plans/2026-05-02-cli-rewrite.md` — the CLI rewrite
  that produced the current `wai` surface (M2 must be consistent with
  this).
- `docs/superpowers/specs/2026-05-01-family-wiki-migration-design.md` —
  the original spec for the personal-wiki → family-wiki rewrite (M2
  refreshes the runtime prompts that this rewrite left behind).
