---
title: whoami.wiki — Whole-Codebase Audit
subtitle: Code-health pass across core, frontend, cli, evals, tools, plugins, and repo-level config
date: 2026-05-20
author: Claude Opus 4.7 (1M context)
---

# Whole-Codebase Audit — 2026-05-20

**Scope:** every package in the monorepo (`core/`, `frontend/`, `cli/`,
`evals/`, `tools/`, `plugins/whoami/`) plus repo-level concerns (CI, git
hooks, tsconfig, dependency hygiene, doc drift).

**Method:** five parallel read-only audit passes, one per package group,
each reading actual source (not grep excerpts), running that package's
`tsc --noEmit` and test suite, and reporting prioritized findings.

**Build status at audit time:** every package typechecks clean and every
test suite passes — 623 `core`, 119 `frontend`, 315 `cli`, 76 `evals`,
101 `tools`. The findings below are correctness edge-cases,
trust-boundary gaps, and infrastructure — not a broken build.

---

## TL;DR

Two themes account for most of the serious findings:

1. **Inconsistent input sanitization at boundaries.** Page commands
   sanitize slugs; several newer CLI commands and six frontend API
   routes do not. This is the root of the shell-injection,
   path-traversal, and auth-bypass findings.
2. **The gap between asserted and enforced discipline.** CLAUDE.md
   describes strong rules (CI verification, blocked commits, auth
   gating) that currently rest on convention and the Claude Code
   harness rather than enforced infrastructure.

Nothing here is data-loss or RCE in normal use, and the architecture is
sound — pure/shell splits are honored, graph traversals are
cycle-guarded, markdown is sanitized.

---

## Critical

### C1 — Six mutating API routes bypass auth entirely

`frontend/app/api/notes/[slug]/route.ts`, `notes/[slug]/[id]/route.ts`,
`notes/[slug]/[id]/restore/route.ts`, `api/migrate/route.ts`,
`api/gedcom/sync/route.ts`, `api/gedcom/recite/route.ts`,
`api/search/rebuild/route.ts`

Only `/api/pages/[slug]` calls `requireSession()`. The proxy matcher
(`proxy.ts:52`) excludes `/api`, so Descope middleware never runs on API
routes — auth is per-route opt-in and six mutating routes didn't opt in.
On the `WHOAMI_AUTH=on` Render replica, an unauthenticated client can
write/edit/delete/restore research notes (each a git commit + push),
trigger a full GEDCOM sync, run a recite migration, and run the schema
migration runner. The notes endpoints also take a free-text `by` field,
so writes are unattributed/spoofable. `requireSession()` is inert when
auth is off, so the fix is auth-off-safe.

### C2 — CI covers only the `cli/` build

`.github/workflows/ci.yml`

CI runs `pnpm install && pnpm build && wai --version` in `cli/` only —
no typecheck, no test run, for any package including `cli/` itself. The
drift tests (`roadmap-drift`, `plan-index-drift`) and all 600+ `core/`
tests never run on PRs. A `core/` family-graph regression, a `frontend/`
`tsc` break, or a drift-test failure all merge to `main` green. The
project's Rule 4/9/12 discipline is unenforced by infrastructure.

---

## High

### Trust-boundary cluster (`cli/`)

One root cause: page commands route the slug positional through
`toSlug()`; several newer commands take it raw.

- **Shell injection** — `cli/src/commands/i18n-sync.ts:176,280,434` and
  `i18n-status.ts:84` interpolate an unvalidated slug into
  `execSync('git … pages/en/${slug}.md')`. `i18n sync` takes the slug
  raw (`index.ts:503`); a slug like `x.md; rm -rf ~/whoami #` executes.
- **Path traversal** — `narrative`, `transcribe`, `interview`, `author`,
  `revert` (`index.ts:609,644,720,944,976`) join a raw slug into
  filesystem paths; `../../../tmp/x` escapes `$WHOAMI_ROOT`.
- **`parseInt` accepts negatives** — `index.ts:421,917,1049,1018`:
  `--limit -5` passes through (truthy, the `|| 25` fallback never
  fires); `history --recent -3` becomes `git log -n -3`.

### H1 — Privacy gate bypassable by query parameter

`frontend/app/api/search/route.ts:15`

`?include_living=1` flips `includeRestricted` with no auth/capability
check. On an unauthenticated route, anyone surfaces living/restricted
individuals when `PRIVACY_GATE_ENABLED` is on.

### H2 — Full message catalog shipped to every client + doc drift

`frontend/app/[locale]/layout.tsx:74`

`NextIntlClientProvider` is rendered with no `messages` prop, so the
full 17 KB `en.json` serializes into the client bundle on every page.
`frontend/AGENTS.md` describes a scoped `pick(...)` pattern the code
does not honor (Rule 17).

### H3 — Author names with spaces silently truncated

`core/src/pages/research-notes.ts:183,261`

The note trailer is space-delimited; `parseTrailerAttrs` splits on
`\s+`. A `by` value with a space — `Claude Opus 4.7`, which the
project's LLM-attribution convention mandates — round-trips as
`by=Claude`; the rest is silently dropped. Affects every model-authored
note; no test catches it.

### H4 — `git` hooks are not real git hooks

`.claude/hooks/`, `.claude/settings.json`

CLAUDE.md says feat/fix without a CHANGELOG entry is "blocked, not
warned." Reality: `changelog-nudge.sh` is a Claude Code `PreToolUse`
hook; a terminal `git commit` (or Codex/OpenCode) bypasses it.
`data-repo-guard.sh` is tracked but registered nowhere — dead code. The
changelog hook also greps `plugins/whoami/src/`, a directory that does
not exist, so plugin edits never trigger it.

### H5 — Migrate-runner processes `.narrative.md` authoring inputs

`core/src/pages/migrate-runner.ts:129`

`store.list()` and `rebuildSearchIndex` both skip `*.narrative.md` as
"authoring input only." `walk()` in the migrate runner does not — a
narrative file gets parsed, validated, and committed as a spurious
`chore: migrate` commit (or pollutes the failed report).

### H6 — Eval harness/grader bugs that skew benchmark results

`evals/src/harnesses/*.ts`, `evals/src/graders/cross-ref.ts:10`

All four harnesses read `WIKI_SERVER` (never set; the isolated wiki
exposes `WHOAMI_SERVER`), so eval prompts show agents a stale
`localhost:8081` URL. The `cross-ref` grader returns a hard `score: 0`
(not `skipped: true`) for single-source fixtures, dragging the
20%-weighted mechanics tier toward 0 for something the agent cannot
control.

### H7 — Mixed package managers; no Node engine pin

`cli/` and `evals/` ship both `pnpm-lock.yaml` and `package-lock.json`;
the other packages use `package-lock.json` only. No package declares
`engines`, no `.nvmrc`; CI pins Node 22 while every package depends on
`@types/node@^25`.

---

## Medium

- **`core`** — hardcoded user-specific `barash-tree.ged` filename in
  platform-agnostic code (`checks/load.ts:21`, fails the stranger test);
  unchecked `as DerivedRecord` YAML cast in `trace.ts:61`; `softDelete`
  leaves a dirty tree if the commit fails — no rollback, unlike `write`
  (`store.ts:150`); citation-drift year regex misses pre-1500 years
  (`citation-drift.ts:45`).
- **`frontend`** — keyboard-focused note-action buttons are `opacity-0`
  but still tabbable, giving invisible focus (`note-item.tsx:125`);
  `RestrictedNotice` + cite directives are hard-coded English;
  `getCanonicalHeadSha` interpolates a slug into a shell string with no
  guard of its own (`server-services.ts:615`); `extractLinkedSlugs`
  re-implements wikilink parsing with a divergent regex.
- **`cli`** — `transcribe` copies the audio file into the repo *before*
  transcription, so a failure orphans an uncommitted file
  (`transcribe.ts:34`); `--summary` given as a bare flag becomes the
  literal summary `"true"`; batch `transcribe` swallows per-file error
  detail.
- **`tools`** — `wiki-preview` page route has a path-traversal hole plus
  a dead identical-branch ternary (`server.ts:184`).
- **`evals`** — the "median-of-2" in `source-criticism.ts` /
  `integration.ts` picks the more lenient of two scores, biasing them
  upward; `prompt-drift` test does not cover the eval harness's own
  prompts.

## Low

- **`core`** — `extractFullDate` accepts impossible dates (`31 Feb`);
  inconsistent `.js` import extension in `ambiguous-dates.ts`;
  non-exhaustive `applyOne` switch with no `default`.
- **`frontend`** — `routeError` (the API status-code contract) is
  untested; several pure `lib/` modules lack coverage.
- **`cli`** — `process.env.HOME!` non-null assertion repeated ~12×;
  `migrate` writes errors to stdout instead of stderr; near-duplicate
  `parseLogBlocks` in `revert.ts` / `history.ts`.
- **`tools`** — OCR script hides the first tesseract call's errors;
  `wikitext-to-md` / `wiki-preview` are spent migration tools and are
  retirement candidates (a ROADMAP decision, not janitorial).
- **`plugins`** — `editor.md` + plugin `CLAUDE.md` still describe the
  old flat `pages/<slug>.md` layout; pages now live under
  `pages/<locale>/` (Rule 17).
- **Repo** — no root "test/typecheck everything" command;
  `noUncheckedIndexedAccess` set in only 2 of 6 tsconfigs;
  `release.yml` publishes with no test gate; `frontend` has 2 moderate
  `postcss` advisories via `next` (low exploitability, no clean fix
  yet); `evals` version is `0.1.0` but AGENTS.md says `2.0.0-pre.0`;
  AGENTS.md's "cli un-released against v2" claim is stale
  (`cli-v2.0.0-pre.1` exists).

---

## Disposition

This audit drove a remediation pass on 2026-05-20/21. The CHANGELOG
records the user-facing fixes. Shipped:

- **Both Critical findings closed.** `requireSession()` now gates the
  six unprotected mutating API routes (and the `include_living` search
  bypass); CI runs typecheck + tests for `core`/`cli`/`frontend`/`evals`
  plus the cli bundle build.
- **High findings closed** — the cli trust-boundary cluster (slug
  sanitization, `execFileSync`, numeric-flag clamping), the `core`
  author-name truncation, the two `evals` grader/harness bugs, the
  `git`-hook gaps (`data-repo-guard` wired up, `changelog-nudge` path
  fixed), and the doc-drift items. Mixed package managers resolved —
  npm is the single manager now (pnpm lockfiles removed); workflows
  migrated to Node 25.

Left open:

- **Medium/Low correctness edge-cases** in `core` (impossible dates,
  pre-1500 citation years) — tracked, not yet fixed.
- **`postcss` advisory** (repo) — awaiting an upstream `next` patch;
  `audit fix --force` would downgrade `next` and is not an option.
- **`tools/` migration-helper retirement** — a ROADMAP decision, out of
  scope for a code-health pass.
- **`noUncheckedIndexedAccess` uniformity** — deferred; expect it to
  surface real fixes in `cli`/`frontend`/`evals`.
- **Plugin docs' stale `pages/` paths** — `editor.md` / plugin
  `CLAUDE.md` describe a flat layout; correcting them needs the v2
  source-page access model pinned down first. A dedicated plan will
  cover it.
- **CI does not trigger on push** — surfaced during the CI work: no
  `push`/`pull_request` event has ever started a workflow run here (the
  workflow registration sat frozen at its 2026-05-04 creation date
  through 70+ pushes). `workflow_dispatch` works; the CI and Release
  workflows were re-registered via a disable/enable cycle. A GitHub
  repo-settings issue, not a workflow-file bug.

Overall health: **good.** The architecture is sound and test coverage
is broad. The findings clustered into two fixable themes rather than
indicating structural decay.
