# Article-authoring pipeline

> Spec for an end-to-end pipeline that turns three input streams —
> GEDCOM-derived relations, family-supplied historical narrative, and
> open-web historical context — into accurate, engaging articles on the
> whoami.wiki, with a per-phase git paper trail in the data repo.

## Context

The wiki today has 203 derived genealogy records (`genealogy/derived/*.yml`)
and 113 published pages (`pages/*.md`), leaving roughly 90 individuals on
the family tree without articles. New people arrive on the tree as the
GEDCOM grows; existing pages need extension as research surfaces new facts.

Producing an article today is an ad-hoc, conversational job: the user asks
the harness, the editor agent (`plugins/whoami/agents/editor.md`) kicks
off, research happens informally, and a page lands. The process is
serviceable for one-off authoring but unreliable when the user wants to
batch-fill cohorts (a whole branch, a generation), and it leaves a thin
paper trail — one git commit per page, no per-phase visibility into what
was researched, what was decided, or what was rejected.

This spec defines a three-stream input pipeline and a CLI orchestrator
(`wai author`) that produces articles, commits per phase to the data
repo, and exposes wiki-style undo via `wai revert` and `wai history`.

## Goals

1. Turn `derived/*.yml` + family-supplied narrative + open-web research
   into person and episode pages that meet the existing editorial guide.
2. Make every editorial decision visible and revertable through git.
3. Support both single-person ("write the page for Aidele") and batch
   ("fill in every missing page on the Ayzman line") modes from the same
   command.
4. Refuse to fabricate. A person we know nothing about does not get a
   hallucinated page; the pipeline exits and asks for evidence.
5. Keep the change small in scope: no new core data structures, no new
   storage backend, no schema migrations. Build on the existing CLI,
   skill, and commit conventions.

## Non-goals

- Replacing the existing `editor` sub-agent. The pipeline is a
  programmatic surface for the same job; ad-hoc authoring stays.
- Live-editor consistency warnings. The consistency check is an
  on-demand audit, not a real-time surface.
- A SQLite or other database layer. The data is small enough that a
  fact map built in memory is adequate; revisit if (a) a full
  consistency pass exceeds 5s, (b) live editor warnings are needed, or
  (c) two processes need shared fact state.
- A `--background` daemon mode. v1 is foreground only.

## Architecture

Three input streams feed a per-slug evidence drawer; one orchestrator
drives the phases; one output is articles plus a per-phase commit log
in the data repo.

```
                   ┌── genealogy/derived/<record>.yml ──┐
INPUTS             │   (already exists; relations)       │
                   ├── pages/<slug>.talk.md              │
                   │   └ ## Research notes (wai note)    │
                   ├── pages/<slug>.narrative.md (new)   │  evidence drawer
                   │   └ free-form family narrative      │  per <slug>
                   ├── assets/audio/<slug>/*.m4a (new)   │
                   │   └ → talk.md notes (wai transcribe)│
                   └── live web (during author run)       ─┘
                       └ open WebSearch + WebFetch, every
                         claim → footnote

ORCHESTRATION       wai author <slug>
                    ├─ phase 1: gather         (read evidence drawer)
                    ├─ phase 2: research       (web; commit research notes)
                    ├─ phase 3: outline        (decide hub + episodes)
                    ├─ phase 4: draft (person) (strict editorial guide)
                    ├─ phase 5: draft (episodes) (one commit per episode;
                    │                            relaxed narrative voice)
                    ├─ phase 6: verify         (wai check, incl. consistency)
                    └─ phase 7: log            (## Agent log entry)

OUTPUT              pages/<slug>.md            (person hub, strict voice)
                    pages/<slug>-and-<x>.md    (episode pages, narrative)
                    pages/<slug>.talk.md       (research notes + log)
                    git history in $WHOAMI_ROOT (one commit per phase)
```

### Code split

| Layer | Lives in | Responsibility |
| --- | --- | --- |
| Mechanical orchestration | `cli/src/commands/` (TypeScript) | Phase order, file I/O, git commits, drift checks, exit codes, batch loop. Deterministic. Unit-tested with `tsx --test`. |
| Editorial judgment | `plugins/whoami/skills/writing-articles/` | Research synthesis, episode-spinoff heuristic, prose conventions, citation discipline. Composes with `editorial-guide` (does not duplicate). |
| Reused primitives | `wai note`, `wai write`, `wai create`, `wai check`, `wai search` | Pipeline calls them rather than reimplementing. |

The CLI never trusts the harness to write directly to disk: it always
intermediates by parsing harness responses, writing files itself, then
committing. This is what makes per-phase commits deterministic.

### What does not change

- `core/` — no changes.
- `frontend/` — no changes; new pages render through existing renderers.
- `editorial-guide` skill — unchanged.
- `editor` agent — unchanged.

## Command contracts

Five new commands; existing commands the pipeline calls; consistent
git-commit policy across all of them.

### `wai interview <slug>`  *(new)*

Generate a targeted Q&A round for the named person, capture the user's
answers as research notes.

```
wai interview <slug>                # opens $EDITOR with prefilled Q&A
wai interview <slug> --json         # emit Q&A as JSON for harness use
wai interview <slug> --questions N  # cap question count (default: 8)
```

Reads `derived/<record>.yml` and existing talk notes, asks the harness to
generate questions about gaps the existing record can't fill ("How did
Aidele's family come to leave Teofipol?", not "When was she born?"). A
markdown Q&A buffer opens in `$EDITOR`. Blank answers are dropped. Each
answered pair becomes a `wai note <slug> --as-agent` entry on
`<slug>.talk.md` with `kind=interview`.

Commits: one commit, message `interview(<slug>): N questions answered`.
Exit codes: `0` success, `2` slug not found, `3` editor exited empty.

### `wai narrative <slug>`  *(new)*

Open the family narrative file for a person; create it if absent.

```
wai narrative <slug>           # opens pages/<slug>.narrative.md in $EDITOR
wai narrative <slug> --file F  # ingest existing file (copy in)
wai narrative <slug> --print   # cat to stdout
```

File: `pages/<slug>.narrative.md`. Frontmatter: `title`, `subject`
(slug), `created`, `updated`. Body: free-form prose.

The file is **never overwritten by the pipeline**. Only the user (or
`wai narrative --file`) writes it. `wai author` reads it but does not
modify it.

Commits: one commit on save, `narrative(<slug>): <update|create>`.
Exit codes: `0`, `2` slug not found.

### `wai transcribe <slug> <audio>`  *(new)*

Transcribe an audio file via OpenAI Whisper API; land transcript as a
research note and keep the audio in-repo.

```
wai transcribe <slug> path/to/voice.m4a
wai transcribe <slug> path/to/voice.m4a --speaker "Steven" --date 2026-05-08
wai transcribe <slug> path/to/voice.m4a --lang ru|en|he|auto
wai transcribe <slug> --dir incoming/   # batch all audio in a dir
```

- Audio copied to `assets/audio/<slug>/<original-filename>`.
- Transcript stored in the **original language**; the research-note
  trailer carries `lang=<iso>`. The author phase translates inline when
  the article needs the content in English (the wiki's prose language)
  and quotes the original where it's load-bearing.
- Whisper API key read from `OPENAI_API_KEY`. Missing key exits 4 with
  a clear message; no local fallback in v1.
- Hebrew (RTL) needs no special file-level handling — Markdown is
  Unicode and the renderer already handles bidi.

Commits: one commit per audio file, `transcribe(<slug>): <filename>`,
staging both the audio file and the talk-page edit. `--dir` produces
one commit per file in the directory; failures on individual files do
not abort the rest. Exit codes: `0`, `2` slug not found, `3` audio
missing, `4` API key missing, `5` API failure (any file failed in
`--dir` mode produces exit 5 after the rest complete).

### `wai author <slug>`  *(new — main orchestrator)*

Run the full pipeline for one person.

```
wai author <slug>
wai author <slug> --no-web        # skip web research; use only local evidence
wai author <slug> --skip-episodes # only draft the person hub
wai author <slug> --resume        # continue from last completed phase commit
wai author <slug> --dry-run       # plan phases & print, no commits
wai author <slug> --allow-stub    # permit GEDCOM-only stub when web yields nothing
wai author <slug> --branch <name> # explicit branch (rare)
```

| # | Phase | Reads | Writes | Commit message |
| --- | --- | --- | --- | --- |
| 1 | Gather | derived/yml, talk.md, narrative.md, transcripts | nothing | (no commit) |
| 2 | Research | gather + web | research notes appended to talk.md | `research(<slug>): N sources, M claims kept` |
| 3 | Outline | gather + research | drafting plan appended to talk.md | `outline(<slug>): person + N episode(s)` |
| 4 | Draft (person) | all of above | `pages/<slug>.md` | `draft(<slug>): person page` |
| 5 | Draft (episode) | all of above | `pages/<episode-slug>.md`, one per | `draft(<episode-slug>): episode page` (per page) |
| 6 | Verify | written pages | format/schema/consistency fixes via `wai check --fix` | `verify(<slug>): N format, M schema, K consistency fixes` (skipped if none) |
| 7 | Log | all | `## Agent log` entry on talk.md | `log(<slug>): pipeline complete` |

Idempotent on `--resume`: reads the embedded trailer key
(`pipeline-run=<uuid> phase=<n>`) from `git log` and resumes from the
next phase. If a phase produces no changes, no commit is created and
the pipeline proceeds.

Exit codes:
- `0` success
- `2` slug not found
- `3` evidence drawer empty (nothing to research; passed `--no-web`)
- `4` web research returned zero usable sources, no local evidence,
  `--allow-stub` not passed (refuse-to-fabricate)
- `5` consistency findings not auto-resolvable
- `6` external API failure after one retry
- `7` `$WHOAMI_ROOT` has uncommitted changes (pre-flight)
- `8` `$WHOAMI_ROOT` is not a git repo (pre-flight)
- `9` `wai check` pre-commit hook failed twice

### `wai author --cohort <selector>`  *(batch mode)*

```
wai author --cohort missing                    # all derived records without a page
wai author --cohort branch:ayzman              # all individuals tagged to a family
wai author --cohort generation:great-grandparents
wai author --cohort file:slugs.txt             # one slug per line
wai author --cohort since:2026-04-01           # changed since a date
wai author --cohort redlinks                   # dead [[wikilinks]]

wai author --cohort missing --parallel 3       # default: 1; cap: 3
wai author --cohort missing --order chronological  # default
wai author --cohort missing --resume <run-id>
```

Selectors print the resolved slug list and ask `proceed? [y/N]` unless
`--yes` or `--auto` is passed. Cohort-size warnings: >25 prompts; >100
hard-requires `--yes`.

**Default order is chronological by birth date** (falls back to GEDCOM
record order for unknown dates). Alternatives:
`--order ancestors-first`, `--order alphabetical`, `--order file`.

**Parallelism cap of 3.** Worker pool runs gather→research→outline in
parallel; draft→verify→log are serialized through a single committer
that holds the git repo lock. This keeps `git log` linear.

**Failure isolation.** A failure on one slug never aborts the cohort.
Each batch run writes a journal at
`$WHOAMI_ROOT/data/author-runs/<run-id>.jsonl` (gitignored — `data/` is
runtime state). Failed slugs are written to a sibling
`<run-id>-failed.txt` for one-command retry.

### `wai revert`  *(new — wiki-style undo)*

```
wai revert <slug>                # undo most recent pipeline run for this slug
wai revert <slug> --run <uuid>   # undo a specific run
wai revert <slug> --phase draft  # undo just one phase of the most recent run
wai revert --last                # undo most recent pipeline activity, any slug
wai revert <slug> --list         # show runs for this slug with summaries
wai revert <slug> --dry-run      # show what would be reverted
```

Each revert produces a single `revert(<slug>): <what>` commit, with a
trailer linking to the original `pipeline-run` uuid. Reverts are
themselves first-class history; revert-of-revert works.

### `wai history <slug>`  *(new — page changelog)*

```
wai history <slug>          # markdown table by default
wai history <slug> --json   # for tooling
```

Renders pipeline-relevant commits for a page. Filters under the hood:
`git log --grep="slug: <slug>"` on the data repo, parse trailers,
render. Read-only.

### Existing commands the pipeline calls

| Command | Used for |
| --- | --- |
| `wai note <slug> --as-agent` | All research-note appends |
| `wai create <slug> --file F` / `wai write <slug> --file F` | Page creation/overwrite (always with `--summary`) |
| `wai check --fix --only format,schema` | Phase 6 auto-fix |
| `wai check --only consistency` | Phase 6 audit |
| `wai search` | Pipeline's internal lookups during research synthesis |

The pipeline never calls `wai promote-corrections` autonomously — that
remains a deliberate human step.

### Git policy across all new commands

- Every commit happens in `$WHOAMI_ROOT`, never in the code repo.
- Always stage explicit paths. Never `git add -A`, `-u`, or `.`.
- Every commit body ends with the trailer:
  ```
  pipeline-run: <uuid>
  phase: <n>
  slug: <slug>
  inputs: derived,talk,narrative
  sources: 12
  fabrication-guard: pass
  ```
- If the data repo has uncommitted changes when the pipeline starts,
  abort with exit 7. Never sweep user's in-progress work into a commit.
- The pipeline never passes `--no-verify` to git commit. Hook failures
  are addressed; not bypassed.

## Skill structure

A new skill at `plugins/whoami/skills/writing-articles/`. Loaded by the
harness when it runs the LLM-driven steps inside `wai author`.

```
plugins/whoami/skills/writing-articles/
├── SKILL.md                  # phase guide + episode heuristic
├── research-synthesis.md     # detailed reference for phase 2
├── episode-spinoff.md        # heuristic for what becomes its own page
└── prompt-templates/
    ├── interview.md
    ├── research-questions.md
    └── outline.md
```

### What the skill carries

1. **Preconditions.** Evidence drawer is gathered (provided by CLI).
   Web access is available. `editorial-guide` is loaded.
2. **Phase 2: research synthesis.** Generate 5–15 web queries from gaps
   in the evidence drawer. For each result, extract claims; reject when
   the source isn't traceable. Defaults treated as reliable: Yad Vashem,
   JewishGen, archive.org, official municipal records, peer-reviewed
   history, primary documents (census, ship manifests, military
   records). Every retained claim becomes a candidate footnote with URL
   and access date. No claim survives without one.
3. **Phase 3: outline.** Episode-spinoff heuristic: 3+ research notes /
   voice notes / narrative paragraphs telling a connected story; OR an
   event with a clear arc that needs more than two paragraphs to tell;
   OR a wartime/migration/persecution event warranting its own page on
   accuracy grounds. Person-hub outline: lead, sections, references,
   bibliography, see-also.
4. **Phases 4–5: drafting.**
   - **Person page**: strict editorial guide. Lead is identity →
     relationship → arc, three sentences, no editorial framing. Episode
     references summarized in one sentence + wikilink.
   - **Episode page**: relaxed narrative voice. Still third-person,
     still factual, still footnoted — but allowed scene-setting,
     sequencing for tension, longer arcs. Reference passages drawn from
     `aidele.md` and `wartime-catastrophe-in-the-barash-family-tree.md`.
   - **Three-stream weaving rule**: every paragraph should be reachable
     from at least one input stream (relations / narrative / external
     research). Paragraphs reachable from none are speculation and must
     be cut.
5. **Forbidden, even on episode pages.**
   - Inventing details to dress up data ("the cold November wind…").
   - Period color the records don't license.
   - Filling silences with plausible guesses. Silences go on the talk
     page as `::open` threads.
   - First-person family voice. The wiki is third-person across all
     kinds.
6. **Self-check before saving each page.** Every claim has a footnote,
   OR is GEDCOM-derived, OR is from the evidence drawer with the source
   identifiable. No words from `editorial-guide/words-to-watch.md`
   survived. All wikilinks resolve to existing pages or are intentional
   redlinks (latter logged on the talk page). Every footnote definition
   appears under `## References`; every `::cite-vault` under
   `## Bibliography`.

### What the skill does not carry

Imported by reference from `editorial-guide`:

- Prose conventions (third-person, words-to-watch).
- Citation directive shapes.
- Date format normalization, frontmatter shape.
- Talk-page directive vocabulary (`::open`, `::closed`, `::superseded`).

SKILL.md begins with: *"This skill assumes you have already loaded
`editorial-guide`. It adds: how to research, how to decide
person-vs-episode, and how to weave the three input streams into prose."*

### Composition with the runtime

`wai author` shells out to the harness three times:

1. After phase 1 gather → harness reads SKILL.md +
   `research-questions.md` → emits research-note candidates.
2. After phase 2 research → harness reads SKILL.md + `outline.md` →
   emits drafting plan.
3. After phase 3 outline → harness reads SKILL.md + `editorial-guide` →
   emits each page.

Each harness call is a single-turn structured prompt. The CLI parses
the response, writes to disk, and commits.

### Eval coverage

New fixtures in `evals/` to add:

- A multi-stream evidence-drawer fixture (talk notes + narrative file +
  transcript stub) to score weaving.
- A "thin web evidence" fixture to score refuse-to-fabricate.
- An episode-spinoff fixture to score the heuristic.
- A consistency fixture with a deliberately seeded contradiction.

Don't ship plugin changes without an eval pass.

## Commit policy and paper trail

**Default behavior: in-place commits on the current branch (typically
`main`).** The data repo behaves like a wiki's edit history: every
pipeline phase is an edit on mainline. Branch mode is opt-in via
`--branch`, used for staging risky runs.

### Commit subject format

```
research(aidele): 12 sources, 9 claims kept, 3 dropped
outline(aidele): person + 1 episode (aidele-and-the-bazaliya-road)
draft(aidele): person page (5.4kB)
draft(aidele-and-the-bazaliya-road): episode page (8.1kB)
verify(aidele): 2 format fixes, 0 schema fixes
log(aidele): pipeline complete (run 7c4a)
```

Subjects use a `phase(slug)` head so the data repo's history shows
pipeline activity at a glance. The data repo doesn't ship release tags,
so it doesn't need strict conventional-commits.

### Commit body trailer

```
pipeline-run: 7c4a3f81-…
phase: 4
slug: aidele
inputs: derived,talk,narrative
sources: 12
fabrication-guard: pass
```

`--resume` reads `pipeline-run` and `phase` from the most recent commit.
Other fields are for human readability and future automation.

The `inputs:` field is a comma-separated list of contributing streams,
drawn from the fixed vocabulary: `derived` (GEDCOM data, always
present), `talk` (research notes), `narrative` (`<slug>.narrative.md`),
`audio` (transcripts in talk notes), `web` (web research). Order
follows the same enumeration; absent streams omitted.

### Pre-flight checks

Before phase 1, the pipeline aborts cleanly if:

- `$WHOAMI_ROOT` is not a git repo (exit 8).
- `$WHOAMI_ROOT` has uncommitted changes (exit 7).
- `wai healthz` fails (warn; proceed).

### Stage what, when

| Phase | `git add` paths |
| --- | --- |
| 2 research | `pages/<slug>.talk.md` |
| 3 outline | `pages/<slug>.talk.md` |
| 4 draft (person) | `pages/<slug>.md` |
| 5 draft (episode) | `pages/<episode-slug>.md` (one commit per episode) |
| 6 verify | only files `wai check --fix` actually touched |
| 7 log | `pages/<slug>.talk.md` |

For `wai transcribe`: `assets/audio/<slug>/<file>` and
`pages/<slug>.talk.md` in one commit. For `wai narrative`:
`pages/<slug>.narrative.md`. For `wai interview`: `pages/<slug>.talk.md`.

### Hooks interaction

The data repo may have a `wai check` pre-commit hook installed via
`wai init`. The pipeline's verify phase feeds clean output, so commits
should pass naturally. The pipeline never passes `--no-verify`. If the
hook fails:

- Format/schema findings: re-run `wai check --fix --only format,schema`,
  retry the commit. **Up to 1 retry**, then exit 9.
- Data findings (corrections conflict): exit 5 with the finding text;
  user resolves manually; branch survives.
- Coverage findings are non-blocking.

### Reverting

Three granularities, all wrapped by `wai revert` (above) or available
via stock git:

```bash
# Single phase
git -C ~/whoami revert <draft-commit-sha>

# A whole pipeline run for a slug
git -C ~/whoami log --grep="slug: aidele" --grep="pipeline-run: 7c4a" \
  --all-match --format=%H | xargs git -C ~/whoami revert --no-commit
git -C ~/whoami commit -m "revert(aidele): pipeline-run 7c4a"
```

`wai revert` exists for ergonomics; stock git is always the fallback.

## Consistency check (extension to `wai check`)

Adds a fifth category to `wai check`: `consistency`. Heavier than the
other four, so opt-in (not run by the pre-commit hook).

```
wai check --only consistency               # standalone audit
wai check --only consistency --slug aidele # narrow to one slug
wai check                                  # default: format,data,schema,coverage
wai check --include consistency            # all five
```

| Finding | Example | Severity |
| --- | --- | --- |
| Self-contradiction within a page | Lead says "born 1881"; infobox says "born 1887"; no `corrections:` entry | error |
| Cross-page contradiction | `aidele.md` says son Yankel died 1943; `yankel-ayzman.md` says 1942 | warn |
| Footnote↔claim mismatch | Page asserts "she was a hatter" with `[^src]`, but `[^src]`'s `note` describes a seamstress census entry | warn |
| GEDCOM↔page mismatch | Page narrative gives a death date that differs from `derived/<rec>.yml` and no `corrections:` entry covers it | error |
| Bibliography↔inline mismatch | Inline `::cite-vault` directive used but no matching entry in `## Bibliography`, or vice versa | info |
| Orphaned footnote | `[^id]` referenced in body but no `[^id]:` definition; or definition with no reference | error |

### Implementation strategy

Parse all pages once into an in-memory fact map, walk it for the
findings above. At today's scale (~110 pages) this completes in
sub-second time. Cache the fact map at `data/consistency-cache.json`
(gitignored), invalidate by mtime.

The pipeline's Phase 6 (verify) calls
`wai check --only format,schema,consistency` after drafts. Format and
schema get auto-fixed; consistency findings of severity `error` either
auto-resolve (when one source clearly outranks another, e.g. footnoted
external source vs. unfootnoted assertion) or stop the run with exit 5.

### Why not SQLite

Rejected for v1. Costs (schema, migrations, query layer, backup story)
are real. Benefits (real-time queries, multi-process state) are not yet
needed. Revisit when:

- A full consistency pass exceeds 5s.
- Live editor warnings are needed.
- Two processes need shared fact state.

## Error handling

| Code | Failure | Pipeline behavior | Recovery |
| --- | --- | --- | --- |
| 0 | Success | Final commit, exit 0 | — |
| 1 | Generic / unexpected | Stack trace, journal entry | File a bug |
| 2 | Slug or record not found | Print closest matches; no commits | User picks the right slug |
| 3 | Empty evidence drawer + `--no-web` | "Nothing to author from"; no commits | Drop `--no-web` or add evidence |
| 4 | Web research returned zero usable sources for unknown person; no local evidence | Refuse to fabricate; commit "no usable sources" agent note; exit 4 | Add evidence and `--resume`, or pass `--allow-stub` |
| 5 | Consistency findings not auto-resolvable | Stop after verify; print findings | User resolves; `--resume` |
| 6 | External API failure (Whisper / WebSearch) | Retry once with backoff; on second failure, exit 6 | Retry later via `--resume` |
| 7 | `$WHOAMI_ROOT` has uncommitted changes | Pre-flight abort | User commits or stashes |
| 8 | `$WHOAMI_ROOT` is not a git repo | Pre-flight abort | User runs `git init` |
| 9 | `wai check` pre-commit hook failed twice | Final draft retains; commit not made | User addresses findings; `--resume` |

### Mid-phase crash safety

Every phase that mutates the data repo follows the same pattern:

1. Read inputs.
2. Compute output (in memory or temp file under
   `$WHOAMI_ROOT/data/author-runs/<run-id>/`).
3. Write final output file(s).
4. `git add <explicit-paths>`.
5. `git commit` with phase trailer.
6. Append `phase-completed` entry to journal.

If the process dies between 3 and 4, on resume the pipeline detects
unstaged changes and refuses to proceed (exit 7). User can `git
restore` or `git diff` to inspect. If it dies between 4 and 5, resume
sees a staged-but-uncommitted state and refuses with a clear message.
The pipeline never auto-cleans potentially-real changes.

If it dies between 5 and 6, the journal is out of sync but the commit
exists. Resume reads `git log` (not just the journal) for the source
of truth on what's done. **Git history is authoritative; the journal is
advisory.**

### Web research failure modes

- **Zero results for every query**: exit 4 (refuse to fabricate). A
  person we know nothing about does not get a hallucinated page.
- **Some results, all unreliable** (random ancestry forums, blogs with
  no provenance): the LLM drops them and adds a research-note saying
  "no reliable sources found." If the evidence pool is empty, exit 4.
- **Contradictory results**: do not pick one; record both in research
  notes with `::open` threads on the talk page. Phase 4 phrases the
  fact tentatively or omits it.
- **Rate-limited or transient network failure**: retry once with 5s
  backoff; on second failure exit 6 for this slug.

### Observability

- Single status line per phase by default (`[3/7] outline … done`).
- Journal at `data/author-runs/<run-id>.jsonl`.
- `--verbose` adds per-LLM-call summaries.
- `--debug` saves raw harness prompts/responses to
  `data/author-runs/<run-id>/debug/` (gitignored).
- Errors print one-line summary plus the journal path.

## Testing

### CLI unit tests (`cli/test/`)

- One `*.test.ts` per command. Mock `$WHOAMI_ROOT` with a temp git repo
  + tiny fixture GEDCOM and 2–3 derived YAMLs.
- Each command: success path, every documented exit-code path,
  idempotency (re-run produces no diff if nothing changed).
- `wai author` tests stub the harness call layer with a fake returning
  canned responses; verify the CLI commits at the right phase
  boundaries with the right paths and trailers.
- `wai author --resume` test: kill mid-run by faking a phase failure,
  resume, verify pickup.

### Skill correctness via the eval suite (`evals/`)

- New fixtures in the existing `evals/` system, scored by re-running
  through Claude Code / Codex.
- Multi-stream evidence-drawer fixture: talk notes + narrative file +
  transcript stub; score weaving.
- Thin web evidence fixture: GEDCOM-only person, web returns nothing
  useful; score refuse-to-fabricate (agent emits exit-4-equivalent
  rather than a stub article).
- Episode-spinoff fixture: 5+ research notes telling a clear story;
  score that an episode page is created.
- Consistency fixture with a seeded contradiction; score that the check
  flags it.

### Cross-command integration tests (`cli/test/`)

- Happy-path end-to-end on a fixture:
  `wai narrative → wai interview → wai author → wai history → wai
  revert`. Verify final state matches expectations.
- Batch with one deliberate failure mid-run: verify cohort completes,
  failed slug journaled, retry file written.
- Tests run against a fixture data repo, never `$WHOAMI_ROOT`.

### Stubs

- **No live web in tests.** Web research is stubbed at the
  WebSearch/WebFetch shim layer. Real web behavior is exercised by
  manual smoke tests during development and by the eval suite (which
  calls real LLMs against a graded fixture set).
- **Whisper API stubbed**: `wai transcribe` tests use a fake
  transcriber returning a fixed transcript. Real Whisper coverage is
  one manual smoke test in dev.

## Open questions / deferred decisions

| Decision | Status | Revisit when |
| --- | --- | --- |
| SQLite for the consistency fact map | Deferred | Full pass exceeds 5s, OR live editor warnings needed, OR multi-process state |
| `--background` daemon mode | Deferred | User wants long-running batch jobs to detach |
| Local Whisper (`whisper.cpp`) fallback | Deferred | API rate limits or cost become an issue |
| Difficulty-based cohort ordering | Deferred | Chronological order produces unhelpful run orders in practice |
| Auto-merging `wai revert` UI in the frontend | Deferred | Browser-side wiki-history view becomes a priority |

## Affected files / packages

- `cli/src/commands/` — new files for `interview`, `narrative`,
  `transcribe`, `author`, `revert`, `history`. Updates to `check.ts`
  for the consistency category.
- `cli/test/` — corresponding test files.
- `plugins/whoami/skills/writing-articles/` — new skill bundle.
- `evals/fixtures/` — new fixtures for the four eval scenarios above.
- `CHANGELOG.md` — entries under `## [Unreleased]` per command landed.
- `docs/superpowers/plans/` — implementation plan to follow this spec.
- `docs/superpowers/plans/README.md` — plan-status row added.
- `docs/ROADMAP.md` — roadmap band updated when work begins.

The data repo (`$WHOAMI_ROOT`) gains new file conventions
(`pages/<slug>.narrative.md`, `assets/audio/<slug>/`) but no schema
changes that require migration.
