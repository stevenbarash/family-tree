# Drift prevention — Plan 7 of 7: agent-side prevention

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the agent-facing surfaces (editorial-guide skill + runtime prompts + eval suite) so future agent generations follow the corrections workflow and don't introduce drift in the first place.

**Architecture:** Three documentation files on the editorial side; one new fixture stub on the eval side. No new code, just prompt/doc/test-fixture updates. After this plan, the spec's full surface is complete.

**Spec reference:** `docs/superpowers/specs/2026-05-07-drift-prevention-design.md` move 7.

---

## Scope

**In scope:**
- `plugins/whoami/skills/editorial-guide/SKILL.md` — add a Corrections section + format conventions + talk-page directive contract.
- `plugins/whoami/CLAUDE.md`, `plugins/whoami/GEMINI.md`, `plugins/whoami/agents/editor.md` — add "after any page edit, run `wai check`" instruction.
- `evals/fixtures/examples/drift-prevention/case.json` — fixture stub for drift-prevention scoring (full eval implementation needs real vault structure; this lands the schema + description so future eval work has a starting point).

**Out of scope:**
- Real eval fixture vaults — those are user-personal data and live outside the repo.
- Eval grader for drift introduction rate — needs full fixture + run loop; deferred to a separate evals plan.
- Updating the spec to mark plan 7 as the final move (the spec is descriptive of what was built; it doesn't need a "complete" annotation).

## File structure

```
plugins/whoami/skills/editorial-guide/SKILL.md   MODIFY. Add Corrections + format conventions.
plugins/whoami/CLAUDE.md                         MODIFY. Add wai check post-edit step.
plugins/whoami/GEMINI.md                         MODIFY. Same content as CLAUDE.md.
plugins/whoami/agents/editor.md                  MODIFY. Add wai check to Phase 5 (Post-edit).
evals/fixtures/examples/drift-prevention/case.json  NEW. Fixture stub.
```

---

## Task 1: Editorial guide — add Corrections section + format conventions

**Files:**
- Modify: `plugins/whoami/skills/editorial-guide/SKILL.md`

The editorial guide is what the agent loads when writing pages. Today it covers page types, editorial standards, citations. Plan 7 adds the corrections workflow.

- [ ] **Step 1: Add a "Corrections" section**

In the editorial-guide skill file, find a sensible location (after "Citation system" or before "Talk page structure" — the implementer chooses based on the file's current organization). Add this section:

````markdown
## Corrections

When an external source contradicts a GEDCOM-derived value (cemetery records, Yad Vashem, family confirmation), record the correction in **two places**:

1. **Page narrative** — explain the reasoning, cite the source.
2. **Page frontmatter `corrections:` array** — machine-readable so the renderer can overlay the corrected value into the infobox.

**Never write a narrative-only correction.** The infobox keeps showing the wrong (GEDCOM) value if the frontmatter is silent. The two-place rule keeps the rendered page consistent with the prose.

### Frontmatter shape

```yaml
corrections:
  - field: death.date         # required: birth.date, birth.place, death.date, death.place, name
    value: "1989"             # the corrected value as a string
    source: "Find A Grave Memorial #209496149"   # provenance
    record: I372189255251     # OPTIONAL — defaults to this page's own gedcom.record
```

For corrections targeting a different individual (e.g. a family overview page correcting a parent's death year), spell out `record:` explicitly.

### Field whitelist (v1)

Only these fields are correctable via frontmatter today:

- `birth.date`, `birth.place`
- `death.date`, `death.place`
- `name`

Adding new relationships (parents, spouses, children) or new individuals is **not** a frontmatter correction — those require a direct GEDCOM edit. If the correction you want to make isn't in the whitelist, the right move is to edit `genealogy/barash-tree.ged` directly and run `wai sync-gedcom`.

### Promotion to GEDCOM

When you (or a human) decide the correction is durable enough to live in the GEDCOM itself, run:

```bash
wai promote-corrections --record I... --apply
```

This rewrites the relevant `1 BIRT` / `1 DEAT` block in `barash-tree.ged` (with a `2 NOTE` line citing your `source`) and removes the correction entry from the page. Provenance moves from the page to the GEDCOM. Run `wai sync-gedcom` afterwards to regenerate `derived/*.yml`.

Without `--apply` the command is dry-run and prints the planned changes only.

### Drift detection

`wai check` reports your corrections as one of:

- **active** — page value differs from raw derived value (the overlay is doing real work).
- **promotable** — page value matches raw derived value (correction is redundant; either drop it from the page or run `wai promote-corrections`).
- **conflict** — two pages target the same `(record, field)` with different values. Hard error; resolve before merging.
````

- [ ] **Step 2: Add a "Format conventions" subsection (under Editorial standards or similar)**

The editorial guide today probably doesn't have explicit date format guidance. Add:

````markdown
### Date formats

Dates everywhere — frontmatter, body prose, GEDCOM, derived YAMLs — use `D Mon YYYY`:

- `28 Feb 1970` — full date
- `Feb 1970` — month-only
- `1970` — year-only
- `Abt 1886`, `Bef 1900`, `Aft 1850` — qualified
- `Bet 1850 And 1860` — range

Title-case month abbreviations (`Jan`–`Dec`). Title-case qualifiers (`Abt`, not `ABT` or `abt.`). Single-digit days (`8`, not `08`). Day-month-year order (never `Mon D YYYY` or `M/D/YYYY`).

You don't have to enforce these manually — `wai write` and `wai check --fix` auto-normalize on save. But target the canonical form so commit diffs stay tight.
````

- [ ] **Step 3: Replace any older "Active gaps" / `## Open editorial questions` talk-page guidance with the implemented `::open` / `::closed` directive contract**

If the current SKILL.md has a "talk page structure" section that mentions `## Active gaps` or `## Open editorial questions` headers, update it to reference the implemented directive contract per `frontend/lib/citations.ts:countOpenGaps`. The wiki's actual rendering uses `::open` / `::closed` blocks, not section headers. Specifically:

```markdown
## Talk page structure

Talk pages live alongside main pages as `<slug>.talk.md`. They use a small set of directives the renderer recognizes:

- `::open` — an open editorial question, counted by `wai search`'s "open gaps" badge.
- `::closed` — a previously-open question that has been resolved.
- `::superseded` — a closed question whose resolution has since been replaced.

A talk page may interleave research notes (with `## Research notes` section header — see Editor agent spec) with directive blocks for editorial questions.

Do NOT use section headers like `## Active gaps` or `## Open editorial questions` — those don't render any UI affordance and aren't counted.
```

- [ ] **Step 4: Verify the file still parses cleanly**

The skill file is a Markdown file with YAML frontmatter. Verify the frontmatter delimiter `---` placement isn't broken by the additions:

```bash
head -10 /Users/nyetwork/dev/whoami/.worktrees/plan-7-agent-side/plugins/whoami/skills/editorial-guide/SKILL.md
```

Expected: `---` opener + `name:`/`description:` + `---` closer (untouched).

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-7-agent-side
git add plugins/whoami/skills/editorial-guide/SKILL.md
git commit -m "docs(plugin): editorial guide adds corrections workflow + date format + ::open contract"
```

---

## Task 2: Runtime prompts — `wai check` after edits

**Files:**
- Modify: `plugins/whoami/CLAUDE.md`
- Modify: `plugins/whoami/GEMINI.md`
- Modify: `plugins/whoami/agents/editor.md`

The runtime prompts are loaded by the user's CLI (Claude Code / Gemini CLI / etc.) when they're working in a wiki repo. Plan 7 adds a one-paragraph "after any page edit" instruction.

- [ ] **Step 1: Add a "Drift checks" section to CLAUDE.md**

In `plugins/whoami/CLAUDE.md`, add a new section near the bottom (before "Removed in the v2 markdown migration" or wherever the file ends):

````markdown
## Drift checks

After any page edit, run `wai check`. It scans for four categories of drift:

- **format** — date strings, frontmatter fields not in canonical form. Auto-fixable: `wai check --fix --only format`.
- **data** — corrections in page frontmatter that conflict, are redundant, or target unknown records.
- **schema** — pages with frontmatter that needs migration. Auto-fixable: `wai check --fix --only schema`.
- **coverage** — redlinks, unmapped places, derived records without pages. Suggestion-only.

Surface remaining findings in your turn summary. If you introduced new format/schema findings with your edit, run `wai check --fix --only format,schema` to clean them up before reporting back.

The user's data repo may have a pre-commit hook installed via `wai init` — that hook blocks commits with format/schema/data findings (coverage drift is non-blocking). If your edit triggers the hook, fix the underlying drift rather than bypassing the hook with `--no-verify`.
````

- [ ] **Step 2: Mirror to `plugins/whoami/GEMINI.md`**

Read `GEMINI.md` to see how it differs from `CLAUDE.md`. The two files are typically near-identical — Gemini variants of the same prompts. Add the same "Drift checks" section (verbatim or with minor tone adjustments to match the rest of the file).

- [ ] **Step 3: Update `plugins/whoami/agents/editor.md` Phase 5**

The editor agent has phased instructions (Phase 0: Context gathering, Phase 1: Source research, Phase 2: Drafting, Phase 3: Citations, Phase 4: Save, Phase 5: ...). Find the post-write phase and add a "Phase 5: Drift check" subsection (or extend the existing one):

````markdown
## Phase 5: Drift check

After saving the page, run `wai check` against the data repo:

```
wai check
```

Read the output. If you introduced any **format** or **schema** findings, run:

```
wai check --fix --only format,schema
```

This auto-fixes them. Re-run `wai check` to confirm zero findings in those categories.

For **data** findings (corrections that conflict or are redundant): read each finding and either drop the redundant correction from the page's frontmatter or run `wai promote-corrections --record I... --apply` to write the correction back to the GEDCOM permanently.

For **coverage** findings (redlinks, unmapped places, orphan derived records): these are suggestion-only. Note them in your turn summary if relevant to the user's request, but don't try to fix them all in one edit — coverage gaps accumulate over time.

The user's pre-commit hook (installed via `wai init`) will block any commit that has format/schema/data findings. Don't bypass with `--no-verify` — fix the drift instead.
````

- [ ] **Step 4: Commit (single commit covering all three files)**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-7-agent-side
git add plugins/whoami/CLAUDE.md plugins/whoami/GEMINI.md plugins/whoami/agents/editor.md
git commit -m "docs(plugin): runtime prompts add wai check post-edit step"
```

---

## Task 3: Eval fixture stub

**Files:**
- Create: `evals/fixtures/examples/drift-prevention/case.json`

Real eval fixtures need a vault structure (Instagram archive, WhatsApp dump, etc.) and aren't kept in the repo. Plan 7 lands a fixture STUB that documents the eval approach so a future evals plan can flesh it out without redesigning.

- [ ] **Step 1: Create the fixture stub**

Create `evals/fixtures/examples/drift-prevention/case.json`:

```json
{
  "id": "drift-prevention-001",
  "suite": "incremental",
  "description": "Score whether the agent introduces drift when editing an existing page. Pre-populate a vault and a person page; ask the agent to add a correction sourced from external evidence; verify (a) the correction appears in frontmatter, NOT just narrative, (b) wai check reports the correction as 'active' (not new format/schema findings), (c) any date strings the agent emits are in canonical D Mon YYYY form.",
  "pageType": "Person",
  "subject": "Sample Person",
  "checkpoints": [
    {
      "id": "add-correction",
      "description": "Read the person's page. The narrative says they died in 1990 (per GEDCOM). External evidence: a cemetery record (path provided in sources) shows 1989. Add a correction to the page's frontmatter so the infobox shows 1989. Update the narrative to cite the cemetery source. Run `wai check` and report findings.",
      "successCriteria": [
        "page frontmatter includes a `corrections:` block with `field: death.date`, `value: \"1989\"`, and a non-empty `source`",
        "narrative mentions the cemetery as the source of the corrected year",
        "`wai check --json` reports exactly one new `data` finding for this record (an 'active' correction)",
        "`wai check --json` reports zero new `format` findings introduced by the agent's edit",
        "`wai check --json` reports zero new `schema` findings"
      ]
    }
  ],
  "graders": [
    {
      "name": "drift-introduction",
      "description": "Compare wai check output before and after the agent's edit. Score: 1.0 if no NEW findings (other than the expected 'active' data finding); 0.0 if any new format/schema findings appeared."
    },
    {
      "name": "corrections-block-usage",
      "description": "Verify the agent updated frontmatter `corrections:` (not just narrative). Score binary: 1.0 if frontmatter was updated, 0.0 if narrative-only."
    },
    {
      "name": "format-conformance",
      "description": "Walk every date string the agent emitted. Score: fraction in canonical D Mon YYYY form."
    }
  ],
  "notes": "STUB — full eval implementation requires a vault directory layout and graders that compare wai check output before/after. The actual graders can run wai check --json from src/runner/e2e.ts and diff the findings list. Real fixtures live outside the repo per evals/AGENTS.md (.gitignored).",
  "todo": [
    "Implement `drift-introduction` grader in `src/graders/`",
    "Wire wai check into `src/runner/e2e.ts` pre/post-edit",
    "Create a real (non-stub) fixture vault and reference page in fixtures/ (gitignored)",
    "Add this fixture to the default eval batch"
  ]
}
```

- [ ] **Step 2: Verify it parses as JSON**

```bash
python3 -c "import json; json.load(open('/Users/nyetwork/dev/whoami/.worktrees/plan-7-agent-side/evals/fixtures/examples/drift-prevention/case.json'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-7-agent-side
git add evals/fixtures/examples/drift-prevention/case.json
git commit -m "docs(evals): drift-prevention fixture stub for future eval implementation"
```

---

## Self-review checklist

- ✓ Editorial guide explicitly forbids narrative-only corrections.
- ✓ Field whitelist matches the schema (5 fields).
- ✓ Date format conventions documented (`D Mon YYYY`, title-case qualifiers, single-digit days).
- ✓ Talk-page section uses the implemented `::open`/`::closed` directives, not the legacy "Active gaps" headers.
- ✓ CLAUDE.md, GEMINI.md, and editor.md all reference `wai check` post-edit.
- ✓ Eval fixture is a stub with explicit `todo:` list — implementation deferred to a separate evals plan.
- ✓ No code changes; pure documentation + test-fixture additions.

## What's done after plan 7

- Spec moves 1–7 all implemented.
- Drift detection covers all 4 categories.
- Corrections layer end-to-end: schema → render overlay → promote to GEDCOM → drift check.
- Pre-commit + CI templates installable via `wai init`.
- Editorial guide teaches the workflow; runtime prompts remind the agent to run `wai check` after every edit.
- Eval fixture stub gives the next evals plan a clear specification.

The spec's "Open questions" remain open by design (recommendations were given in the spec but not implemented as code):
- GEDCOM date casing — committed to title-case during implementation.
- Corrections lifecycle on page deletion — corrections are page-scoped; this matches the recommendation.
- Nullable correction values — out of scope for v1 (recommendation deferred).
