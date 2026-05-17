@AGENTS.md

# CLAUDE.md — 12-rule template

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

## Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

## Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

## Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

## Rule 6 — Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

## Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

## Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

## Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

## Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

## Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

## Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

## Rule 13 — Commit hygiene
**Commit at logical units, not at end of session.** When a fix or feature
task is complete, commit it immediately. Don't leave a working unit
sitting in working tree — it accumulates with other in-flight work and
forces a painful slicing pass later.

**`feat:` / `fix:` commits MUST include the CHANGELOG entry in the same
commit.** The `changelog-nudge.sh` hook enforces this — feat/fix without
a staged `CHANGELOG.md` is blocked, not warned. If the change has no
user-facing impact, retitle as `chore:` / `refactor:` / `docs:` /
`test:` (those prefixes are exempt). The user reads the CHANGELOG to
understand what shipped; missing entries mean missing visibility.

**Push after each batch.** A meaningful commit (or a small cluster of
related commits) goes to `origin` before the next batch starts. Local
commits are not backups. If a session ends with N local-only commits,
that's N commits' worth of work the user could lose to a laptop
incident. Default: `git push` after each plan task or each bug-fix
batch unless the user explicitly says otherwise.

## Rule 14 — Roadmap–CHANGELOG–ROADMAP triad
When you ship a roadmap item identified by a `P#.#` (e.g. `P0.3`),
update **both** `docs/ROADMAP.md` (flip the row to `✅ shipped` with a
brief shipped-summary appendix) **and** `CHANGELOG.md` (entry naming
the P-ID inline) — in the same commit. The `roadmap-drift` test in
`cli/test/roadmap-drift.test.ts` enforces both directions: every
`✅ shipped` row must have its P-ID mentioned in CHANGELOG, and every
CHANGELOG "closes P#.#" / "completes P#.#" / "ships P#.#" claim must
land in a ✅ roadmap row.

Use **"addresses" / "lands" / "starts"** for partial / sub-item work
that doesn't yet justify flipping the roadmap row. Reserve
**"closes" / "completes" / "ships"** for entries that warrant the
status bump. The test ignores "Partial close" prefixes; everything
else triggers.

## Rule 15 — Plan-index keeps pace
When you ship, abandon, or rename a plan under
`docs/superpowers/plans/`, update its row in
`docs/superpowers/plans/README.md` in the **same commit**. New plan
file → add a row. Plan finished → flip to `✅`. Plan superseded →
flip to `📦`. The `plan-index-drift` test in
`cli/test/plan-index-drift.test.ts` enforces (A) every plan file has
a row, (B) every row references an existing file, (C) no `🚧`
in-progress plan has all its `Create: \`<path>\`` files already on
disk (file-existence is the strongest evidence of shipping), and
(D) the `**Total: N plans**` footer matches the actual counts.
