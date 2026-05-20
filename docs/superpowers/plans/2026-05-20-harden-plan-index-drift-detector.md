# Harden the plan-index-drift Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** 📝 sketch — written 2026-05-20, not yet started.

**Goal:** Close a blind spot in `plan-index-drift` check (C) so a plan that shipped but kept its `🚧` status is caught regardless of how the plan spelled its new files.

**Architecture:** A one-function change to the existing detector test, `cli/test/plan-index-drift.test.ts` — broaden `createdFilesFromPlan()` to read the File Structure section's `**create.**` convention, which every plan uses consistently, instead of relying on the per-task `` Create: `path` `` phrasing only some plans use.

**Tech Stack:** TypeScript 6, `node:test` + `node:assert/strict`.

---

## Background

`plan-index-drift (C)` ("no `🚧` plan has all its `Create:` files on disk")
is the guard that catches a plan that shipped but never had its index row
flipped to `✅`. It missed exactly that on the `2026-05-20-git-sync-core`
plan — the plan shipped via PR #13 (`130b3bb`) but stayed `🚧` until
caught by hand on 2026-05-20.

**Why it slipped:** `createdFilesFromPlan()` extracts a plan's new files
with `/Create:\s+`([^`]+)`/g`. That matches the per-task `Files:` blocks
of plans written like `descope-auth` (`- Create: \`path\``), but the
`git-sync-core` plan wrote its one new file as a per-task
`- Test: \`core/test/pages/git-sync.test.ts\` (create — …)` and as a File
Structure bullet `- \`…/git-sync.test.ts\` — **create.**`. Neither
matches `Create:`, so `createdFilesFromPlan()` returned `[]`, and check
(C) skips a plan with zero detected create-files (`if (created.length
=== 0) continue`). The drift was invisible.

## The fix

Every plan in `docs/superpowers/plans/` opens with a **File Structure**
section that lists each file with a `**create.**` or `**modify.**`
marker — a far more consistent convention than the per-task `Create:` /
`Test:` / `Modify:` phrasing. Re-base `createdFilesFromPlan()` on that:

- Extract paths from File Structure bullets of the form
  `` - `<path>` — **create.** `` (case-insensitive, tolerate the trailing
  period and surrounding whitespace; the em-dash is the bullet's
  separator). This is the primary, reliable signal.
- Keep matching the existing `` Create: `<path>` `` form as well, so
  plans that only have per-task `Create:` lines (and a thinner File
  Structure) are still covered. Union the two sets.

The change is confined to `createdFilesFromPlan()` in
`cli/test/plan-index-drift.test.ts` — checks (A), (B), (D) and the
`readIndexRows()` parser are unaffected.

## Tasks

### Task 1: Broaden `createdFilesFromPlan()`

**Files:**
- Modify: `cli/test/plan-index-drift.test.ts` — `createdFilesFromPlan()` only.

- [ ] Rewrite `createdFilesFromPlan()` to union two extractions: the
  existing `` Create: `path` `` matches, plus File Structure
  `` - `path` — **create.** `` matches. De-duplicate.
- [ ] Keep the function's contract identical: takes a plan file path,
  returns `string[]` of repo-root-relative paths.

### Task 2: Regression test

**Files:**
- Modify: `cli/test/plan-index-drift.test.ts`

- [ ] Add a test that proves the blind spot is closed: a small
  in-memory or fixture plan body written in the `git-sync-core` style
  (a File Structure `**create.**` bullet, a per-task `Test: … (create)`
  line, no `Create:` line) yields the created file from
  `createdFilesFromPlan()`. The test must encode *why* — that check (C)
  could not see git-sync-core's drift before this. Consider exporting
  `createdFilesFromPlan` (or testing it via a temp plan file) so the
  assertion is direct.
- [ ] Run `cd cli && npm test` — whole suite green, including the four
  existing `plan-index-drift` checks (broadening extraction must not
  make (C) false-flag a genuinely in-progress plan; verify
  `render-deploy-and-sync`, the one live `🚧` plan, is not flagged —
  its `**create.**` files such as `frontend/instrumentation.ts` and
  `frontend/lib/sync.ts` do not yet exist, so it stays correctly
  un-flagged).
- [ ] Typecheck: `cd cli && npx tsc --noEmit`.

## Acceptance criteria

- `createdFilesFromPlan()` returns the new file for a plan that declares
  it only via `**create.**` / `Test: … (create)` (no `Create:` line).
- Check (C) would flag a `🚧` plan written in that style once all its
  files are on disk.
- All existing `plan-index-drift` checks still pass; no live `🚧` plan
  is false-flagged.

## Out of scope

- Reformatting existing plan docs to a single `Create:` convention —
  the detector adapts to the docs, not the reverse.
- Any change to checks (A), (B), (D) or `readIndexRows()`.
