# Drift prevention for the whoami.wiki content/code boundary

> Spec for keeping the data repo (`~/whoami/`) in continuous sync with
> the code repo (`~/dev/whoami/`) — eliminating the four categories of
> drift currently observable in the family-tree wiki and shipping the
> tooling that prevents future drift across format, schema, coverage,
> and data dimensions.

## Context

whoami.wiki is split across two repos: a data repo (GEDCOM, derived
YAMLs, page markdown, places-coords) and a code repo (parsers, schema,
deriver, CLI, frontend renderer). The relationship between them is
defined by convention (page narratives reference derived data; the
deriver writes YAMLs from the GEDCOM; the frontmatter is Zod-validated)
but enforced by nothing.

A scour of the data repo on 2026-05-07 turned up four distinct drift
patterns:

1. **Format drift.** Date strings in the GEDCOM, derived YAML, page
   prose, and the hand-edited `barash-family-tree.md` DOT graph use at
   least seven different formats: `9/7/1997`, `Feb 28 1970`,
   `August 19, 2001`, `08 OCT 1790`, `abt 1882`, `Abt. 1929`,
   `D Mon YYYY` canonical. A normalization pass was started but is
   incomplete.
2. **Data drift.** Page narratives document corrections to GEDCOM
   facts (Sofia Krasnova died 1989 not 1990; Sofia Koffman died 1984
   not 21 Dec 1988; Kelman Ayzman died in Kiev) but the corrections
   have nowhere to go: editing the derived YAMLs is futile (next
   `wai sync-gedcom` overwrites), the GEDCOM is the only source of
   truth, and there is no overlay layer for non-place data.
3. **Schema drift.** Earlier agent generations produced page frontmatter
   patterns that don't match the current Zod schema or use older
   structure (free-form section headers vs. `::open` / `::closed`
   blocks). The migration system (`core/src/pages/migrations/`) is
   scaffolded but empty.
4. **Coverage drift.** `places-coords.yml` does not catch every place
   string emitted by the deriver (e.g. `Teofipol, Khmelnytskyi, Ukraine,
   Russian Empire` — soft-sign drift); 223 dead wikilinks span 57
   pages; some pages reference portraits that don't exist; some derived
   records have no corresponding page.

This spec addresses all four categories through three structural
changes (a corrections overlay, a format normalizer, a unified
`wai check`), three integration points (auto-fix at write time,
pre-commit hook, CI workflow), and three agent-side updates (editorial
guide, runtime prompts, eval cases). Approach: **C — full pipeline +
agent constraints** as selected in brainstorming.

## Non-goals

- **Replacing the GEDCOM as the source of truth.** The GEDCOM remains
  authoritative for genealogy facts. The corrections layer is overlay,
  not replacement.
- **Auto-applying data corrections.** Programmatic detection is in
  scope; programmatic application to the GEDCOM requires explicit
  human approval per `wai promote-corrections --apply`.
- **Adding new individuals or relationships via corrections.** The
  corrections overlay handles value-overrides on existing records only.
  Adding individuals (e.g. Zus Krasnov's father Shaya), creating new
  family records, or restructuring relationships still requires direct
  GEDCOM edits.
- **Constraining page-body markdown to a stricter schema.** Page bodies
  remain free-form prose. Drift is caught by lint (`wai check`), not
  by parser rejection.
- **Defeating `git commit --no-verify`.** The pre-commit hook is
  bypassable per standard git convention. CI is the unbypassable gate.
- **Reworking citation directives.** `[^foot]` and `::cite-vault`
  continue to coexist per the existing
  `frontend/lib/citations.ts:countCitations` contract.

## Architecture

### Data flow with corrections overlay

```
barash-tree.ged ──┐
                  ├─ deriveAll(ast, corrections) ─▶ patched DerivedRecord ─▶ infobox
pages/*.md ─────▶ │   (overlay applied here)        (page narrative + infobox now agree)
  corrections[]   │
                  └─ wai check compares both sides ─▶ report (+ optional --fix)
```

**Invariant.** Every fact about a person on a page is either in the
GEDCOM or in that page's `corrections[]`. The infobox renders both,
transparently. Drift becomes structurally impossible — there is
nowhere for a "page says X, infobox says Y" state to exist.

### Module map

```
core/src/
├── checks/                       NEW. Pure detector modules (no I/O).
│   ├── format-drift.ts
│   ├── data-drift.ts
│   ├── schema-drift.ts
│   ├── coverage-drift.ts
│   └── index.ts                  (registers detectors, RepoState type)
├── format/                       NEW. Pure format normalizers.
│   └── dates.ts
├── corrections/                  NEW. Overlay logic.
│   ├── overlay.ts                (pure: apply corrections to a record)
│   ├── promote.ts                (BOUNDARY: rewrite GEDCOM event block)
│   └── index.ts
├── pages/
│   └── schema.ts                 UPDATE. Add corrections[] field.
└── gedcom/
    └── derive.ts                 UPDATE. deriveAll accepts corrections map.

cli/src/
├── commands/
│   ├── check.ts                  NEW.
│   ├── promote-corrections.ts    NEW.
│   ├── init.ts                   NEW.
│   ├── sync-gedcom.ts            UPDATE. Format-normalize pre-derive.
│   └── write.ts                  UPDATE. Format-normalize pre-save.
└── templates/                    NEW.
    ├── pre-commit.sh
    └── check.yml

frontend/lib/
└── family.ts                     UPDATE. Apply corrections in buildPageJoin.

plugins/whoami/
├── CLAUDE.md                     UPDATE. Document `wai check` workflow.
├── GEMINI.md                     UPDATE. Same.
├── agents/editor.md              UPDATE. Run `wai check` after edits.
└── skills/editorial-guide/
    └── SKILL.md                  UPDATE. Corrections section + format std.

evals/
└── fixtures/                     NEW cases for drift-prevention scoring.
```

### Pure vs boundary modules

Following `core/AGENTS.md`:

- **Pure** (no I/O): `checks/*`, `format/dates.ts`, `corrections/overlay.ts`,
  the existing schema/migration modules. All take `RepoState` or
  fixture data, return findings or transformed values.
- **Boundary**: `corrections/promote.ts` (writes the GEDCOM),
  `cli/commands/check.ts` (loads `RepoState` from disk, passes it to
  pure detectors), `cli/commands/init.ts` (writes templates). Each
  appears in the boundary table in `core/AGENTS.md` once added.

## Components

### Corrections overlay

**Schema** (`core/src/pages/schema.ts`):

```typescript
const CorrectionSchema = z.object({
  record: z.string().regex(/^I\d+$/).optional(),
  field: z.enum([
    'birth.date', 'birth.place',
    'death.date', 'death.place',
    'name',
  ]),
  value: z.string().min(1),
  source: z.string().min(1),
});
// PageMetaSchema gains: corrections: z.array(CorrectionSchema).default([])
```

`record:` is optional — defaults to the page's own `gedcom.record`.
Family pages or topic pages that reference multiple individuals spell
the record id out explicitly.

The field is added with `.default([])` so existing v1 pages parse
unchanged (Zod fills the default at parse time). No schema migration
is required for this addition; per `pages/migrations/index.ts`, the
migration framework is reserved for breaking changes (rename, type
change, removal, required field).

**Field whitelist** is intentionally narrow at v1: scalar fields on
birth/death events plus `name`. Adding new fields (e.g. occupation,
residence date ranges) is a follow-up that requires extending the
overlay's dotted-path resolver. Anything outside the whitelist fails
Zod validation at page write.

**Page authoring example** (`pages/sofia-krasnova.md`):

```yaml
---
title: Sofia Krasnova
gedcom: { file: barash-tree.ged, record: I372189255251, snapshot: ... }
corrections:
  - field: death.date
    value: "1989"
    source: "Find A Grave Memorial #209496149"
---
```

**Overlay function** (`core/src/corrections/overlay.ts`, pure):

```typescript
export function applyCorrections(
  derived: DerivedRecord,
  corrections: PageCorrection[],
): DerivedRecord
```

Returns a deep-merged copy by dotted-path resolution. Pure; tested
inline with fixture inputs per `core/AGENTS.md` testing convention.
Idempotent (applying twice is a no-op).

**Render integration** (`frontend/lib/family.ts`): the existing
`buildPageJoin` pairs each page with its derived record. After this
change, it also collects corrections from all pages, builds a
`Map<recordId, PageCorrection[]>`, and overlays before returning. The
infobox shows a small "corrected — see source" affordance on any
overlaid field; the source string from the correction surfaces on
hover.

**Detection** (`core/src/checks/data-drift.ts`):

| State | Meaning | Suggested action |
|---|---|---|
| Active | Page correction differs from derived value | Either keep as overlay, or `wai promote-corrections --record I... --apply` |
| Promotable | Page correction equals derived value | Drop the correction (redundant) — or auto-handled by promote |
| Conflict | Two pages give different corrections for the same `(record, field)` | Hard error, fail `wai check` exit 1 |

### Format normalizer

**Module** (`core/src/format/dates.ts`, pure):

```typescript
export function normalizeDate(raw: string): string
```

Canonical form: `D Mon YYYY`. Title-case three-letter months (`Jan`–`Dec`),
single-digit days (`8`, not `08`), title-case qualifiers
(`Abt`, `Bef`, `Aft`). Range form `Bet YYYY And YYYY` is preserved
canonically. Returns the input unchanged if already canonical.
Idempotent.

Reuses `core/src/family/dates.ts:parseGedcomYear` for qualifier
recognition rather than rolling new regex.

**Apply at three sites**:

1. **`gedcom/derive.ts`** when reading any `DATE` value from the AST,
   normalize before writing to derived YAML. Also rewrites
   `barash-tree.ged`'s own `2 DATE` lines in place during
   `wai sync-gedcom` so the canonical form propagates to the source.
2. **`pages/store.ts`** when `wai write` saves a page, run a body-pass
   over the markdown that normalizes free-form date strings.
   Conservative regex — only matches dates next to whitespace or
   punctuation, leaves untouched anything inside fenced code blocks
   or wikilinks.
3. **The hand-edited DOT block** in `pages/barash-family-tree.md` is
   covered by the body-pass in (2). The graph stops drifting once
   page-level normalization is in place at every save.

**Detection** (`core/src/checks/format-drift.ts`): walks GEDCOM `DATE`
values plus page bodies, runs `normalizeDate` on each, flags any
`input ≠ output`. `wai check --fix` writes the canonical form back.

**Frontmatter** is already shape-validated by Zod. The detector adds
one extra check for empty `aliases: []` / `editors: []` consistency
across all pages — both fields are required by the current schema and
universally empty, making them migration candidates for v3.

**Citations**: no normalization. The detector verifies that every
`[^x]` footnote has a definition and every `::cite-vault` directive
has its required attributes. Mixing styles is fine per
`frontend/lib/citations.ts`.

### `wai check`

One CLI entry point. Boundary module that walks the data repo, calls
each pure detector, aggregates results, prints/exits.

**Surface**:

```bash
wai check                            # all detectors, human-readable, exit 0/1
wai check --json                     # machine-readable for CI
wai check --fix                      # apply safe auto-fixes (format + schema)
wai check --only format,schema       # subset
wai check --since HEAD~10            # only files changed since revision (for hooks)
wai check --fail-on format,schema,data    # exit 1 only on these categories
```

**Detectors** (each is pure `(state: RepoState) => Finding[]`):

| Detector | Auto-fixable? |
|---|---|
| `format-drift` | yes (rewrites canonical form) |
| `schema-drift` | yes (runs migration registry) |
| `data-drift` | no — reports only |
| `coverage-drift` | no — suggestions only |

**`coverage-drift`** subsumes existing `wai redlinks` by importing
`core/src/pages/redlinks.ts:findRedlinks`, plus adds an unmapped-places
check (places emitted by the deriver that don't resolve in
`joinCoords`), an orphan-derived check (records without pages), and a
missing-portrait check (pages where `assets/portraits/<slug>.jpg`
exists but `portrait:` isn't set in frontmatter). `wai redlinks` stays
as a focused command but its core logic isn't duplicated.

**State loader** (the only file-I/O the boundary does): reads
`barash-tree.ged` → AST, `pages/**/*.md` → frontmatter+body,
`places-coords.yml` → coords array, `derived/*.yml` → records map.
Hands the assembled `RepoState` to each detector. Tests pass fixture
states inline.

**Output (human-readable)**:

```
format-drift     [ 23 findings, 23 fixable ]
  pages/barash-family-tree.md:182  "08 OCT 1790"  →  "8 Oct 1790"
  genealogy/barash-tree.ged:1607   "Sep 1941"     →  "30 Sep 1941"  (skipped — needs day)
  …

data-drift       [ 4 findings ]
  pages/sofia-krasnova.md  active     death.date: "1989" overlays GEDCOM "1990"
  pages/sofia-koffman.md   active     death.date: "1984" overlays GEDCOM "21 Dec 1988"
  pages/zus-krasnov.md     promotable death.date: GEDCOM and page now agree

coverage-drift   [ 17 findings ]
  unmapped place  "Krumbach, Amberg, Bavaria, Germany"  → add alias or new entry
  redlink         [[Tzal Koffman]]  referenced by 5 pages
  …

3 categories, 44 findings, 24 fixable.  Run `wai check --fix` to apply.
exit 1
```

**Exit codes**: `0` clean; `1` findings present (or, with `--fail-on`,
findings in the listed categories); `2` invocation error.

### `wai promote-corrections`

The single human-gated step that writes a page correction back to the
GEDCOM.

```bash
wai promote-corrections --record I372189255251           # show planned diff
wai promote-corrections --record I372189255251 --apply   # write GEDCOM, drop from page
wai promote-corrections --all --apply                    # promote every active correction
```

With `--apply`:

1. Reads the page's `corrections[]` entry.
2. Edits the corresponding `1 BIRT` / `1 DEAT` block in
   `barash-tree.ged`: updates `2 DATE` / `2 PLAC`, appends a
   `2 NOTE` line citing the `source` field.
3. Removes the correction entry from the page's frontmatter.
4. Calls `wai sync-gedcom` so derived YAMLs regenerate immediately.

Without `--apply`, just prints the planned diff — no changes written.

Provenance moves from the page to the GEDCOM (the `2 NOTE` line is the
durable audit trail). Once promoted, the correction is gone from the
page; the GEDCOM and the page agree natively.

### `wai init`

Scaffolds the integration into a fresh data repo.

```bash
cd ~/whoami
wai init                  # installs hook + workflow, refuses to clobber
wai init --hook-only      # just the pre-commit hook
wai init --ci-only        # just the workflow
wai init --force          # overwrite existing files
```

Reads templates from `cli/src/templates/pre-commit.sh` and
`cli/src/templates/check.yml`. Detects existing files with the same
names and refuses to clobber without `--force`.

This command is also the right home for the **one-time format-drift
cleanup pass**: on first install in a repo with legacy drift, prompts
the user to run `wai check --fix --all` before the new pre-commit
hook starts rejecting commits.

## Integration points

### Auto-fix at write/sync time

- **`wai write <slug>`** runs `wai check --fix --only format --since-page <slug>`
  before saving. Format drift normalized silently; the user's
  `--summary` commit captures the canonical form.
- **`wai sync-gedcom`** runs format normalization across the GEDCOM
  file pre-derive, then runs the full `wai check` post-derive
  (reports schema/data/coverage findings to stderr but does not
  block).

### Pre-commit hook

`~/whoami/.git/hooks/pre-commit` (installed by `wai init`):

```sh
#!/bin/sh
exec wai check --since HEAD --fail-on format,schema,data
```

Coverage drift is non-blocking by default. Bypassable with
`--no-verify` per git convention.

### CI workflow

`~/whoami/.github/workflows/check.yml` (installed by `wai init`):

```yaml
name: Check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install -g @whoami/wai
      - run: wai check --json
```

Maps `wai check` exit code to CI red/green. Unbypassable.

## Agent-side updates

### Editorial guide skill

`plugins/whoami/skills/editorial-guide/SKILL.md` gains a Corrections
section:

- Don't write narrative-only corrections without also adding a
  `corrections[]` entry to frontmatter. Narrative + frontmatter
  together; never narrative alone.
- Date conventions: `D Mon YYYY` (`28 Feb 1970`); qualifiers are
  title-case `Abt`, `Bef`, `Aft`. The agent doesn't need to enforce
  these manually — `wai write` auto-normalizes — but should target
  them so diffs stay tight.
- The `wai promote-corrections` workflow: agents *propose* corrections
  in frontmatter; humans *promote* to GEDCOM. Agents never edit
  `barash-tree.ged` directly.

The older "Active gaps / Resolved" wikitext-era talk-page structure is
removed and replaced with the actual `::open` / `::closed` directive
contract per `frontend/lib/citations.ts:countOpenGaps`.

### Runtime prompts

`plugins/whoami/CLAUDE.md`, `GEMINI.md`, and `agents/editor.md` each
add: "After any page edit, run `wai check`. Fix what `--fix` can
fix; surface remaining findings in your turn summary."

### Eval suite

`evals/fixtures/` gains drift-prevention cases:

- **Drift introduction rate**: agent edits a page, run `wai check`,
  count new findings. Target = 0.
- **Corrections-block usage**: when agent claims a correction in
  narrative, did they also add a `corrections[]` entry? Target = 100%.
- **Format conformance**: dates emitted by the agent match canonical
  form. Target = 100%.

These run against the existing harness. The check-rate score becomes a
regression guard for prompt changes.

## Error handling

- **Page corrections referencing an unknown record id** → Zod
  validation fails at page write. Agent gets a clear error pointing at
  the bad `record:` field.
- **Conflicting corrections (two pages, same record+field)** → hard
  error in `data-drift` detector. `wai check` exits 1; both pages
  named in the report.
- **`wai promote-corrections` on a record whose GEDCOM block can't be
  located** → exits 2 with a clear message. No partial writes.
- **`wai check --fix` on read-only files (e.g. archived pages)** →
  skipped with a warning, not a hard failure.
- **Pre-commit hook on a partial commit (some files staged, some
  not)** → operates only on staged content via `--since`. Unstaged
  drift is not the hook's concern.
- **Schema migration failure** mid-walk → existing `migrate-runner`
  contract preserved (writes per-page, commits per page; one bad
  page doesn't block the rest).

## Testing

- **`core/test/checks/*`** — each detector tested with fixture
  `RepoState` values in inline test files. Asserts `Finding[]` shape
  and counts. Per `core/AGENTS.md`: "the test fixture builds the
  input inline in the test file."
- **`core/test/format/dates.test.ts`** — `normalizeDate` tested with
  the inventory of forms found during the 2026-05-07 audit (slash
  dates, all-caps months, full month names, `Abt.` variants, range
  notations). Idempotency assertion.
- **`core/test/corrections/overlay.test.ts`** — `applyCorrections`
  tested with single, multiple, and conflicting corrections. Deep
  immutability assertion.
- **`cli/test/commands/check.test.ts`** — boundary test with a small
  fixture data tree. Asserts JSON shape, exit code mapping,
  `--fail-on` filtering.
- **`evals/`** — three new fixtures listed above. Run pre-merge on
  prompt changes.

## Migration plan

Independently shippable in this order, each its own plan under
`docs/superpowers/plans/`:

1. **`wai check` shell + format-drift detector + `--fix`.**
   `core/src/format/dates.ts` (pure), `core/src/checks/format-drift.ts`
   (pure), `cli/src/commands/check.ts` (boundary), `RepoState`
   loader. Lowest-risk, mechanical. Cleans up the existing format
   drift audit found. The check command exists from this move
   forward; later moves register additional detectors.
2. **Corrections schema (Zod field + overlay function).**
   `core/src/pages/schema.ts` adds the `corrections[]` field,
   `core/src/corrections/overlay.ts` provides `applyCorrections`.
   No behavior change at render yet.
3. **Overlay application in `frontend/lib/family.ts` + render-side
   "corrected" affordance.** Page corrections now visible.
4. **`wai promote-corrections` command.** First human-gated GEDCOM
   writeback path.
5. **Add `data-drift` + `schema-drift` + `coverage-drift` detectors
   to `wai check`.** Subsumes existing `wai redlinks` core logic.
6. **`wai init` + templates + integration into `wai write` /
   `wai sync-gedcom`.** Pre-commit + CI deployable.
7. **Plugin updates: editorial guide, runtime prompts, eval
   fixtures.** Agent-side prevention.

Each plan can be executed and reviewed independently. The format
normalizer (move 1) is independently valuable even if the rest stalls.

## Open questions

- Should `wai check --fix` rewrite the GEDCOM date format from
  GEDCOM-canonical `D MON YYYY` (all-caps) toward project-canonical
  `D Mon YYYY` (title-case)? The existing in-progress normalization
  uses title-case. Recommendation: yes, consistent with existing
  practice.
- Should corrections survive page deletion (e.g. into a separate
  `corrections.yml`)? Recommendation: no — corrections are
  page-scoped claims; if the page goes, the claim goes. The GEDCOM
  is unaffected. Audit trail lives in promoted GEDCOM `2 NOTE`
  lines.
- Should the corrections schema allow nullable values (e.g. clearing
  a value rather than overriding it)? Recommendation: out of scope
  for v1; revisit if a real use case appears.
