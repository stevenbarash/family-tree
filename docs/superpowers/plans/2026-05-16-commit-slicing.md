# Working-Tree Commit-Slicing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution. This is a commit-slicing playbook, not a feature implementation — TDD steps don't apply (the tests these commits add or rely on are already in the working tree). Use `git add -p` where called out for mixed-diff files; verify tests + typecheck after every commit.

**Goal:** Slice the 45 uncommitted files on `main` into focused, conventional-commit-shaped commits — covering Groups A (session-output additions), B (uncommitted bug fixes), E (config tweaks), and F (build-artifact cleanup). Defer Group C (pre-session article-pipeline iteration, ~935 LOC) and Group D (CHANGELOG.md reorg) to follow-up plans.

**Architecture:** Inline execution from `main`. Order matters because some commits assume others have landed (e.g., the trailing-slash fix touches `cli/src/probe.ts` that the URL-edge-case test also touches). For each commit: stage the listed files (or hunks), run the suite, commit. CHANGELOG entries are deferred — every code commit will trigger the `changelog-nudge.sh` warning; ignore it, the user's CHANGELOG reorg in Group D will batch all the entries.

**Tech Stack:** Existing — git, `tsx --test`, `npx tsc --noEmit`.

---

## Pre-flight invariants

Before starting:

- `git branch --show-current` → `main`
- `git status --short | wc -l` → `45` (give or take depending on intervening edits)
- `cd /Users/nyetwork/dev/whoami/core && npm test` → all 463 pass
- `cd /Users/nyetwork/dev/whoami/cli && npm test` → 277 pass, 3 skipped
- `cd /Users/nyetwork/dev/whoami/frontend && npm test` → 66 pass, 4 skipped

If any of those drift before starting, stop and reconcile.

---

## Commit 1 — gitignore Next build artifacts and remove the `web/` directory

**Why first:** smallest, lowest-risk change. Pure cleanup. Doesn't touch any logic so no test re-run needed beyond a sanity check.

**Files:**
- Modify: `.gitignore` (add `web/` entry)
- Remove: `web/` directory (untracked → just `rm -rf`)

- [ ] **Step 1:** Inspect `web/` to confirm it's only build artifacts.

```bash
ls /Users/nyetwork/dev/whoami/web/
```

Expected: `node_modules`, `next-env.d.ts`, `tsconfig.tsbuildinfo`. If anything else appears, stop and investigate.

- [ ] **Step 2:** Add to `.gitignore`. First check the existing file:

```bash
grep -n "^web" /Users/nyetwork/dev/whoami/.gitignore
```

If `web/` isn't already there, append it. Edit `.gitignore` to add `web/` at the end of the file (or near other build-artifact entries if they're grouped).

- [ ] **Step 3:** Remove the directory:

```bash
rm -rf /Users/nyetwork/dev/whoami/web/
```

- [ ] **Step 4:** Verify:

```bash
git status --short | grep -E "^\?\? web|gitignore"
```

Expected: `web/` no longer appears in untracked; `.gitignore` shows as modified.

- [ ] **Step 5:** Commit:

```bash
cd /Users/nyetwork/dev/whoami
git add .gitignore
git commit -m "chore: gitignore stray web/ Next build artifacts"
```

---

## Commit 2 — `fix(cli):` trailing-slash normalization across server-URL sites

**Why:** Pure surgical fix. Was the first item in the bug-fix pass at session start. Five sites stripped a single trailing slash (`/\/$/`) instead of all (`/\/+$/`); a configured URL like `http://localhost:3001//` reached `fetch` malformed.

**Files (all pure bug fix, no intermixed work):**
- `cli/src/probe.ts`
- `cli/src/api-client.ts`
- `cli/src/config.ts`
- `cli/src/commands/doctor.ts`
- `cli/test/probe-edge-cases.test.ts` (new test file, untracked)

- [ ] **Step 1:** Verify the diff is pure trailing-slash work:

```bash
git diff cli/src/probe.ts cli/src/api-client.ts cli/src/config.ts cli/src/commands/doctor.ts | grep -E "^[-+]" | grep -v "^[-+][-+][-+]"
```

Expected: each `-` line shows `replace(/\/$/, '')` and matching `+` line shows `replace(/\/+$/, '')`. If you see other changes, stop and split — those changes belong in Group C, not here.

- [ ] **Step 2:** Stage and commit:

```bash
cd /Users/nyetwork/dev/whoami
git add cli/src/probe.ts cli/src/api-client.ts cli/src/config.ts cli/src/commands/doctor.ts cli/test/probe-edge-cases.test.ts
git diff --cached --stat
git commit -m "$(cat <<'EOF'
fix(cli): strip all trailing slashes in server-URL normalization

Five sites (probe.ts, api-client.ts, config.ts, doctor.ts x2) used
`replace(/\/$/, '')`, which strips only one trailing slash. A configured
URL like `http://localhost:3001//` reached `fetch` as
`http://localhost:3001//api/healthz` and still compared equal against
the also-once-stripped baseUrl in doctor/api-client — so the bug only
surfaced as a malformed request URL.

Switched all five sites to `/\/+$/` so every trailing slash is dropped,
and updated probe-edge-cases.test.ts to assert the corrected behavior.
EOF
)"
```

- [ ] **Step 3:** Verify tests still pass:

```bash
cd /Users/nyetwork/dev/whoami/cli && npm test 2>&1 | tail -5
```

Expected: 280 pass / 3 skipped.

---

## Commit 3 — `fix(cli):` author phase 3/7 section finders skip fenced code blocks

**Why:** Pure surgical fix. `replaceOrAppendOutline` and `appendLogEntry` used bare `indexOf(marker)` for `## Drafting plan` / `## Agent log`, so a literal marker inside a fenced code block in a research note would be matched as the section header and the splice would corrupt the talk page.

**Files (likely pure bug fix — verify in Step 1):**
- `cli/src/commands/author/outline.ts`
- `cli/src/commands/author/log.ts`
- `cli/test/commands/author/outline.test.ts`
- `cli/test/commands/author/log.test.ts`

- [ ] **Step 1:** Look at the diff to verify it's only the section-finder fix (a `findSectionStart` helper introduced in each file + a new "does not match inside a fenced code block" test):

```bash
git diff cli/src/commands/author/outline.ts cli/src/commands/author/log.ts | head -120
```

Expected: a new `findSectionStart` function in each .ts file that walks lines with `inCode` tracking. If there are other changes (e.g., refactoring of `appendLogEntry`'s splice logic unrelated to section finding), stop — selectively stage with `git add -p` instead.

- [ ] **Step 2:** Stage and commit:

```bash
cd /Users/nyetwork/dev/whoami
git add cli/src/commands/author/outline.ts cli/src/commands/author/log.ts cli/test/commands/author/outline.test.ts cli/test/commands/author/log.test.ts
git diff --cached --stat
git commit -m "$(cat <<'EOF'
fix(cli): author phase 3/7 section finders skip fenced code blocks

`replaceOrAppendOutline` (phase 3) and `appendLogEntry` (phase 7)
located their section headers (`## Drafting plan` / `## Agent log`)
with bare `indexOf(marker)`. A literal "## Drafting plan" inside a
fenced code block — common when a research note quotes the prompt
template verbatim — was matched as the section header, and the splice
inserted the new subsection inside the quoted code block, corrupting
the talk page.

Replaced both lookups with a `findSectionStart` line-scanning helper
that tracks `inCode` state and only matches the marker at the start of
a non-fenced line. Covered by two new tests
(`replaceOrAppendOutline: does not match ... inside a code fence` /
`appendLogEntry: does not treat "## Agent log" inside a code fence as
the section header`).
EOF
)"
```

- [ ] **Step 3:** Verify:

```bash
cd /Users/nyetwork/dev/whoami/cli && npm test 2>&1 | tail -5
```

Expected: 280 pass / 3 skipped.

---

## Commit 4 — `fix(core):` preserve interview/research/transcript kinds through the research-note parser

**Why:** The parser narrowed any kind other than `'agent'` back to `'human'` on read. After the API route was widened to accept `interview`/`research`/`transcript`, those kinds were silently lost on round-trip, breaking the transcript-collection path in `gather.ts:65`.

**Files (all pure bug fix):**
- `core/src/pages/research-notes.ts`
- `core/test/pages/research-notes.test.ts`
- `frontend/lib/server-services.ts`
- `frontend/components/research-notes/note-item.tsx`
- `frontend/app/api/notes/[slug]/route.ts`

- [ ] **Step 1:** Inspect the diff scope:

```bash
git diff core/src/pages/research-notes.ts | grep -E "^[-+]" | grep -v "^[-+][-+][-+]" | head -30
git diff frontend/app/api/notes/\[slug\]/route.ts | head -20
```

Expected: `NoteKind` type widened from `'human' | 'agent'` to the 5-element union; parser uses `KNOWN_KINDS.has(...)` instead of `attrs.kind === 'agent'`; route Zod schema widened to match.

- [ ] **Step 2:** Stage and commit:

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages/research-notes.ts core/test/pages/research-notes.test.ts frontend/lib/server-services.ts frontend/components/research-notes/note-item.tsx "frontend/app/api/notes/[slug]/route.ts"
git diff --cached --stat
git commit -m "$(cat <<'EOF'
fix(core): preserve interview/research/transcript kinds in research-note round-trip

parseResearchNotes narrowed any kind other than 'agent' back to 'human'
on read — a stale `(attrs.kind === 'agent' ? 'agent' : 'human')`
conditional from when only those two kinds existed. The route was
widened to accept interview/research/transcript, but the parser silently
collapsed them back to 'human' on the next read.

Downstream impact was severe: cli/src/commands/author/gather.ts filters
notes by `n.kind === 'transcript'` to populate the evidence drawer with
transcripts; the filter never matched and `wai author` couldn't see any
transcript evidence. Same path for `wai interview` (kind=interview) and
the author pipeline's phase-2 research notes (kind=research).

Widened NoteKind in core/src/pages/research-notes.ts; taught the parser
to preserve any known kind (unknown values still fall back to 'human'
defensively); propagated the type through frontend/lib/server-services
and frontend/components/research-notes/note-item.tsx. Also caught a
frontend typecheck regression the route widening had introduced (the
route compiled but `appendNoteOnDisk` rejected the wider kind).
Covered by two new tests in core/test/pages/research-notes.test.ts.
EOF
)"
```

- [ ] **Step 3:** Verify all three suites:

```bash
cd /Users/nyetwork/dev/whoami/core && npm test 2>&1 | tail -5
cd /Users/nyetwork/dev/whoami/cli && npm test 2>&1 | tail -5
cd /Users/nyetwork/dev/whoami/frontend && npm test 2>&1 | tail -5
cd /Users/nyetwork/dev/whoami/frontend && npx tsc --noEmit 2>&1 | head -3
```

Expected: core 463 / cli 280 / frontend 70; frontend typecheck clean.

---

## Commit 5 — `fix(cli):` harness adapter — JSON preamble-quote extraction, tool-restriction allowlist, template cache

**Why:** Three improvements to `cli/src/harness/claude-code.ts` made in the same session. They touch the same file and are related (sub-claude adapter behavior); commit together. The harness file is MIXED with pre-session work, so use `git add -p` to stage only the relevant hunks.

**Files:**
- `cli/src/harness/claude-code.ts` (selective stage via `git add -p`)
- `cli/test/harness/claude-code.test.ts` (selective stage via `git add -p`)

- [ ] **Step 1:** Inspect the harness diff to confirm what's mine vs pre-session:

```bash
git diff cli/src/harness/claude-code.ts | head -80
```

The session changes you're looking for:
- `extractFirstBalancedJson` function with the `depth > 0 && c === '"'` guard
- A `--tools` allowlist function `toolsAllowedFor`
- A template cache `Map<string, { skill: string; template: string }>` at the top of the adapter
- The test additions in `cli/test/harness/claude-code.test.ts` for "unmatched quote in preamble" and the tool-restriction integration tests

If you can clearly see those + nothing else, stage the whole file. If there's pre-session iteration mixed in, use `git add -p` and reject hunks that aren't part of this fix.

- [ ] **Step 2:** Stage. If the whole file is your work:

```bash
cd /Users/nyetwork/dev/whoami
git add cli/src/harness/claude-code.ts cli/test/harness/claude-code.test.ts
```

If MIXED, use:

```bash
git add -p cli/src/harness/claude-code.ts cli/test/harness/claude-code.test.ts
```

…accepting only the JSON-extractor / tools-allowlist / template-cache hunks. Any pre-session hunks go in Group C.

- [ ] **Step 3:** Also stage the new integration test file (untracked, pure session work):

```bash
git add cli/test/integration/harness.integration.test.ts
```

If that file isn't there, skip — it may have been part of pre-session bundle-freshness work and belong in Group C instead.

- [ ] **Step 4:** Commit:

```bash
git diff --cached --stat
git commit -m "$(cat <<'EOF'
fix(cli): harness adapter — JSON preamble-quote, tool allowlist, template cache

Three improvements to the sub-claude harness adapter, all in
cli/src/harness/claude-code.ts:

1. extractFirstBalancedJson now only enters string-tracking mode once
   it's inside a JSON structure (`depth > 0`). Previously, a `"` in
   preamble prose (e.g. `I read "the docs: {"answer":42}`) flipped
   inString=true and swallowed the real JSON's opening `{`, leaving
   the extractor unable to find any balanced structure and producing a
   misleading "Unexpected token" error on the raw prose.

2. Per-(skill, template) `--tools` allowlist. The research-questions
   template gets `WebSearch,WebFetch`; every other template gets `""`
   (all tools disabled). Prevents the sub-claude from accidentally
   calling Write/Edit/Bash when the orchestrator only expects JSON
   back. Catches a real regression observed in the boris-ayzman phase 4
   run where the sub-model wrote page content directly via Write while
   also returning malformed JSON.

3. Per-author-run template cache. The adapter previously re-read
   SKILL.md and the prompt-template file from disk on every phase
   invocation; a mid-pipeline edit (in-progress refactor, editor
   autosave) would silently change instructions between phases of the
   same run. Now caches (skill, template) → content the first time
   each pair is seen.

Covered by new tests in cli/test/harness/claude-code.test.ts
(unmatched-quote preamble) and cli/test/integration/harness.integration.test.ts
(real-binary --tools restriction; SKIPPED by default — run with
WAI_INTEGRATION_TESTS=1).
EOF
)"
```

- [ ] **Step 5:** Verify:

```bash
cd /Users/nyetwork/dev/whoami/cli && npm test 2>&1 | tail -5
```

Expected: 280 pass / 3 skipped.

---

## Commit 6 — `chore(tools):` add Tesseract OCR helper for source-document images

**Why:** Pure session output. New `tools/ocr/` directory with the helper script + README documenting the macOS Tahoe sandbox + PNG-alpha quirks the script handles transparently. `AGENTS.md` gets a one-line mention.

**Files:**
- New: `tools/ocr/ocr-source-image.sh`
- New: `tools/ocr/README.md`
- Modify: `AGENTS.md` (one-line mention of `tools/ocr/`)

- [ ] **Step 1:** Verify the `AGENTS.md` diff is purely the one-line tools/ocr mention:

```bash
git diff AGENTS.md
```

Expected: a single hunk near the "tools/" row in the package table, expanding the cell to mention `tools/ocr/`. If there are other changes, use `git add -p` to stage only that hunk.

- [ ] **Step 2:** Stage and commit:

```bash
cd /Users/nyetwork/dev/whoami
git add tools/ocr/ AGENTS.md
git diff --cached --stat
git commit -m "$(cat <<'EOF'
chore(tools): add Tesseract OCR helper for source-document images

Local helper at tools/ocr/ocr-source-image.sh for OCR'ing photographed
book pages, archival letters, certificates etc. Defaults to a 10-language
combination covering the family's archive (eng, ukr, rus, heb, yid, pol,
deu, lit, aze, aze_cyrl); accepts extra Tesseract language codes as
additional positional args.

The script transparently handles two macOS quirks:

1. macOS Tahoe (26.x) shell sandbox: tesseract called with an absolute
   image path from certain CWDs silently produces empty output (exit 0,
   no warnings). The script always cds to the image's directory first.

2. PNG alpha-channel quirk: PNGs created via `sips` (the resampled bio
   scans in assets/sources/) sometimes can't be read by tesseract despite
   working fine in other tools. The script converts PNG → JPG via sips
   before OCR and cleans up the temp afterward.

README covers install (`brew install tesseract tesseract-lang`), the
full language list (22 useful languages installed), usage, and accuracy
tips. AGENTS.md gets a one-line mention pointing at the helper.
EOF
)"
```

- [ ] **Step 3:** Sanity-check the script:

```bash
cd /Users/nyetwork/dev/whoami && ls tools/ocr/ && which tesseract && tools/ocr/ocr-source-image.sh ~/whoami/assets/sources/teofipol-history-stasyuk/kelman/02-bio-p122.png 2>&1 | head -5
```

Expected: the helper produces Cyrillic OCR output (a few lines of text in Ukrainian).

---

## Commit 7 — `feat(cli):` `wai grep-claims` for finding quoted phrases across pages + sources

**Why:** Pure session output. New command for the fact-correction workflow. The cli/src/index.ts wiring is intermixed with pre-session work, so use `git add -p` to stage only the grep-claims case + import + help-text addition.

**Files:**
- New: `cli/src/commands/grep-claims.ts`
- New: `cli/test/commands/grep-claims.test.ts`
- Modify: `cli/src/index.ts` (selective stage via `git add -p` — only the grep-claims import, case, and help-text addition)

- [ ] **Step 1:** Stage the new files plainly:

```bash
cd /Users/nyetwork/dev/whoami
git add cli/src/commands/grep-claims.ts cli/test/commands/grep-claims.test.ts
```

- [ ] **Step 2:** Stage the relevant `cli/src/index.ts` hunks selectively:

```bash
git add -p cli/src/index.ts
```

Accept three hunks only:
1. The `import { runGrepClaims } from './commands/grep-claims.js';` line
2. The `case 'grep-claims': { ... }` block
3. The help-text addition under "Quality:" describing `grep-claims`

Reject every other hunk (those belong in Group C — author/check/bundle-freshness wiring).

- [ ] **Step 3:** Verify the staged diff is bounded to grep-claims only:

```bash
git diff --cached --stat
git diff --cached cli/src/index.ts | head -60
```

Expected: only the three hunks above appear.

- [ ] **Step 4:** Commit:

```bash
git commit -m "$(cat <<'EOF'
feat(cli): wai grep-claims — find quoted phrases across pages + sources

New command that walks ~/whoami/pages/ and ~/whoami/assets/sources/
looking for occurrences of a phrase (and optional comma-separated
--variants for English/Russian/Ukrainian forms of the same claim).
Used as the first step of any factual correction in the wiki, so
every place the wrong claim lives can be fixed in one pass instead
of discovered piecemeal across rounds of "did you also fix the talk
page" follow-ups.

Output groups hits by file with line numbers — an audit list the user
can scan before opening any editor. --json for structured consumption.
--no-talk skips *.talk.md files; --no-sources skips assets/sources/
transcripts; --case-sensitive overrides the default case-insensitive
match.

Covered by 8 tests in cli/test/commands/grep-claims.test.ts.
EOF
)"
```

- [ ] **Step 5:** Verify:

```bash
cd /Users/nyetwork/dev/whoami/cli && npm test 2>&1 | tail -5
cd /Users/nyetwork/dev/whoami/cli && npx tsx src/index.ts grep-claims "For Defense of Kyiv" --variants "За оборону Києва" 2>&1 | tail -10
```

Expected: tests pass; grep-claims finds the corrected-from-X annotations on the real wiki.

---

## Commit 8 — `docs:` editorial-guide fact-correction discipline section

**Why:** Pure session output. The systemize step #1 — encode the grep-before-fixing rule in the editorial-guide skill so all editorial agents (not just my Claude sessions) follow the discipline.

**Files:**
- Modify: `plugins/whoami/skills/editorial-guide/SKILL.md` (selective stage if mixed)

- [ ] **Step 1:** Inspect:

```bash
git diff plugins/whoami/skills/editorial-guide/SKILL.md | head -30
```

You're looking for a new `## Fact-correction discipline` section between `## Corrections` and `## Genealogy data quality`. If you see that as the only addition, stage the whole file. If there are unrelated pre-session edits, use `git add -p` and accept only the fact-correction-discipline hunk.

- [ ] **Step 2:** Stage and commit:

```bash
cd /Users/nyetwork/dev/whoami
git add plugins/whoami/skills/editorial-guide/SKILL.md
git diff --cached --stat
git commit -m "$(cat <<'EOF'
docs(editorial-guide): fact-correction discipline section

When correcting a factual error in any wiki page, the correction has
to be replicated everywhere the wrong claim lives — wiki facts are
graph-distributed across the live page, its talk file (research notes,
drafting plan), any episode page that derived from the same source
extraction, the source page's confirmed-entries summary, and
cross-references on related people's pages.

New section in editorial-guide encodes the required workflow:

1. List every variant of the wrong claim (English + Ukrainian +
   Russian + Hebrew/Yiddish forms, plus inverse framings).
2. Grep the entire wiki for every variant before editing any single
   file (`wai grep-claims "<phrase>"` is the helper).
3. Build a numbered audit list — file/line/wrong/right — before
   opening any editor.
4. Fix all locations in one pass so the wiki is internally consistent
   at every commit boundary.
5. Final grep to confirm zero remaining hits.

Also explains: talk pages need fixing too (stale claims feed the next
regeneration of the live page); episode pages are derived content and
propagate mix-ups into authoritative-looking narrative; the same
discipline applies symmetrically when adding new facts.

Motivated by the Boris/Kelman Stasyuk medal mix-up that this session
unwound, where the wrong claim about "For Defense of Kyiv" being
Boris's medal lived in boris-ayzman.md, boris-ayzman.talk.md, and the
boris-and-the-road-to-prague.md episode page — and fixing only the
live page on the first pass missed two of the three locations.
EOF
)"
```

- [ ] **Step 3:** Verify (no test, but the file should parse as valid markdown — no broken section headers):

```bash
head -200 plugins/whoami/skills/editorial-guide/SKILL.md | grep -c "^## "
```

Expected: a positive number, no errors.

---

## Commit 9 — `docs(plans):` four implementation plans from this session

**Why:** All four are now-shipped. The plan documents are the historical record of how each feature was scoped and sliced. Adding them to the plans index alongside the existing rows.

**Files (all untracked):**
- `docs/superpowers/plans/2026-05-16-relationship-strip-on-person-pages.md`
- `docs/superpowers/plans/2026-05-16-this-day-in-family-history-ribbon.md`
- `docs/superpowers/plans/2026-05-16-wikilink-hover-cards.md`
- `docs/superpowers/plans/2026-05-16-cross-page-consistency-detector.md`

Note: this commit-slicing plan document itself (`2026-05-16-commit-slicing.md`) is in the working tree too — include it.

- [ ] **Step 1:** Check the plan index already has rows for these (each subagent updated `docs/superpowers/plans/README.md` as their final task):

```bash
grep "2026-05-16" /Users/nyetwork/dev/whoami/docs/superpowers/plans/README.md | head -6
```

Expected: 4 or 5 rows for 2026-05-16 plans. If the index is missing rows, add them now (or note as a follow-up).

- [ ] **Step 2:** Stage and commit:

```bash
cd /Users/nyetwork/dev/whoami
git add docs/superpowers/plans/2026-05-16-relationship-strip-on-person-pages.md docs/superpowers/plans/2026-05-16-this-day-in-family-history-ribbon.md docs/superpowers/plans/2026-05-16-wikilink-hover-cards.md docs/superpowers/plans/2026-05-16-cross-page-consistency-detector.md docs/superpowers/plans/2026-05-16-commit-slicing.md
git diff --cached --stat
git commit -m "$(cat <<'EOF'
docs(plans): four 2026-05-16 implementation plans (now shipped)

Plan documents for the four features executed via subagent-driven
development in this session:

- 2026-05-16-relationship-strip-on-person-pages.md
- 2026-05-16-this-day-in-family-history-ribbon.md
- 2026-05-16-wikilink-hover-cards.md
- 2026-05-16-cross-page-consistency-detector.md

Plus the commit-slicing plan that this commit is itself part of
(2026-05-16-commit-slicing.md).

All four features have already shipped in main; the plans are committed
now as historical record of how each was scoped and decomposed. The
plan-status index in docs/superpowers/plans/README.md was updated with
shipped rows by each plan's final task at execution time.
EOF
)"
```

---

## Commit 10 — `chore(config):` remove data-repo-guard hook + CLAUDE.md 12-rule template

**Why:** Two user-intentional config edits. The `.claude/settings.json` change removes a `data-repo-guard.sh` hook entry the user deliberately turned off. `CLAUDE.md` is the 12-rule project-discipline template the user added. They're independent but tiny — one commit.

**Files:**
- Modify: `.claude/settings.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1:** Verify the diffs are what they should be:

```bash
git diff .claude/settings.json
git diff CLAUDE.md | head -30
```

Expected: settings.json shows a single deletion of a Bash-matcher hook entry referencing `data-repo-guard.sh`; CLAUDE.md shows the addition of "# CLAUDE.md — 12-rule template" + the 12 numbered rules.

If either file has unexpected additional changes, stop and ask before committing.

- [ ] **Step 2:** Commit:

```bash
cd /Users/nyetwork/dev/whoami
git add .claude/settings.json CLAUDE.md
git diff --cached --stat
git commit -m "$(cat <<'EOF'
chore(config): remove data-repo-guard hook; add 12-rule CLAUDE.md template

Two user-intentional config edits:

1. .claude/settings.json — removes the data-repo-guard.sh PreToolUse
   hook that was firing on every Bash git command. Hook removed
   deliberately (the data-repo / code-repo separation is still
   enforced by AGENTS.md and the existing .githooks/pre-commit on
   the data repo; the Claude-Code-level guard was redundant).

2. CLAUDE.md — extends the existing @AGENTS.md include with a
   12-rule project discipline template (Think Before Coding,
   Simplicity First, Surgical Changes, Goal-Driven Execution, Use
   the model only for judgment calls, Token budgets are not
   advisory, Surface conflicts don't average them, Read before you
   write, Tests verify intent not just behavior, Checkpoint after
   every significant step, Match the codebase's conventions,
   Fail loud).
EOF
)"
```

---

## Commit 11 — DEFERRED: Group C (article-pipeline iteration) + Group D (CHANGELOG)

**Not in this plan.** After Commits 1–10, the remaining working tree should be:

- Group C: `cli/src/commands/author.ts`, `cli/src/commands/author/{gather,verify}.ts` plus matching tests, `cli/src/commands/check.ts` + test, `cli/src/index.ts` (remaining hunks: bundle-freshness wiring + author flag plumbing + check flag plumbing), `cli/src/bundle-freshness.ts` + test, the 4 writing-articles prompt templates
- Group D: `CHANGELOG.md` (303 lines of user reorg + my session entries)

Group C needs your read on intent (finished? mid-iteration?). Group D is your CHANGELOG reorg that deserves its own dedicated commit. Both get their own follow-up plans.

---

## Verification checklist (run after all 10 commits)

```bash
cd /Users/nyetwork/dev/whoami
git log --oneline | head -12
git status --short | wc -l            # expect roughly 17-20 remaining (Group C + CHANGELOG)
cd core && npm test 2>&1 | tail -3    # expect 463 pass
cd ../cli && npm test 2>&1 | tail -3  # expect 280 pass / 3 skipped
cd ../frontend && npm test 2>&1 | tail -3 # expect 70 pass / 4 skipped
cd ../core && npx tsc --noEmit 2>&1 | head -3
cd ../cli && npx tsc --noEmit 2>&1 | head -3
cd ../frontend && npx tsc --noEmit 2>&1 | head -3
```

Expected: 10 new commits on top of main; ~17–20 files still uncommitted (Group C + D); all suites green; all typechecks clean.

---

## Notes on the changelog-nudge hook

Every code-touching commit in this plan (Commits 2–7, possibly 8) will trigger the `changelog-nudge.sh` PreToolUse hook with a warning that CHANGELOG.md isn't staged. **Ignore the warning.** The user's CHANGELOG reorg in Group D will batch all the entries.

If the hook is BLOCKING (not just warning), check its `if:` matcher in `.claude/settings.json` — but per the user's earlier conversation it nudges, not blocks. Commits should land.

---

## Risk register

- **Commit 5 (harness) MIGHT have intermixed pre-session work.** If `git diff cli/src/harness/claude-code.ts` shows anything beyond the three improvements listed, use `git add -p`. If the pre-session work is the bulk and your fix is small, consider deferring the harness commit to Group C as a single combined commit.
- **Commit 7's `cli/src/index.ts` selective stage** is the highest-risk step. The file has 209 lines of diff. Take the time to read each hunk before accepting/rejecting.
- **No tests fail at any point.** If a commit causes test failures, stop and investigate — likely a dependency on something in a later commit. Reorder, or fold commits together.
- **The diff inspection in each commit's Step 1 is load-bearing.** If a file's diff doesn't match the expected shape, the slicing assumption is wrong and the plan needs revision before that commit.
