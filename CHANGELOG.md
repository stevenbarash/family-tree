# Changelog

All notable changes to whoami.wiki are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
For the versioning policy (what gets versioned and what doesn't), see
[`AGENTS.md`](./AGENTS.md#versioning).

This is a project-level changelog. The wiki is a multi-package repo;
when a change affects only one package (e.g., a CLI release), the
section is marked with the package name. The project as a whole is
in **v2 development** following the May 2026 markdown migration; the
last tagged production release was [`cli-v1.2.1`](https://github.com/anthropics/whoami/releases/tag/cli-v1.2.1)
(2026-03-26), which predates the v2 architecture.

> **Going forward:** every PR adds a line under `## [Unreleased]`.
> When a release is cut, the unreleased entries are renamed under the
> new version heading.

---

## [Unreleased] — v2 development

### Added

- **`runDetectors` helper** *(2026-05-11)* extracted from
  `wai check` into `cli/src/commands/check/run-detectors.ts`. Runs
  the requested detectors against a `RepoState`, optionally applies
  format/schema fixes and reloads, returns structured
  `{ findings, fixedCount }`. Shared between the standalone `wai
  check` command and the author orchestrator's Phase 6 verify
  wiring. The author's verify phase now actually surfaces consistency
  findings against the live data repo instead of a no-op stub.

### Fixed

- **Pipeline-run trailers actually land in commit messages** *(2026-05-11)*.
  Phase commits go through the frontend API (`client.write`,
  `client.note`), which commits server-side using the `summary`
  argument as the commit message. The orchestrator was producing
  trailer commits via a separate `maybeCommit` call that always
  found a clean working tree (API already committed) and silently
  did nothing — so trailers never landed and `wai history`/`wai
  revert`'s `--grep` filters found nothing. The fix bakes
  `pipeline-run`/`phase`/`slug` trailers into the API's `summary`
  argument for phases 3/4/5/7. Phase 2 (research) writes N notes
  via `client.note` and then emits a single `git commit
  --allow-empty` marker commit carrying the trailer. Phase 6
  (verify) writes directly to disk via `runDetectors` and commits
  with explicit paths via a focused `commitDirectChanges` helper.
- **`wai author` Phase 6 verify no longer a no-op** *(2026-05-11)*.
  The verify phase is now wired to the real detector pipeline via
  the extracted `runDetectors` helper. Surfaces the 39 real
  consistency findings (and counting) the existing data already has.

### Changed

- **Web research is performed by the harness, not the orchestrator**
  *(2026-05-11)*. Phase 2 used to take `webSearch`/`webFetch`
  callbacks that defaulted to no-ops. The `research-questions`
  prompt template now instructs the harness to use its own
  `WebSearch`/`WebFetch` tools and return structured `claims` with
  source URLs. `webSearch`/`webFetch` fields removed from
  `AuthorOptions`. The reliable-source allowlist (Yad Vashem,
  JewishGen, archive.org, etc.) moved from JS code into the prompt
  where the model evaluates it.

- **`wai author --cohort`** *(2026-05-11)*. Batch mode for the
  article pipeline. v1 selectors: `missing` (all derived records
  without a page) and `file:<path>` (one slug per line; `#` inline
  comments dropped). Writes per-run journal at
  `data/author-runs/<run-id>.jsonl` and `<run-id>-failed.txt` for
  one-command retry. `--resume-run <run-id>` skips completed slugs
  and picks up partial ones at their last completed phase via the
  existing pipeline-run trailer. >25 slugs prompts for `--yes`;
  >100 hard-requires `--yes`. `--parallel N` is parsed but ignored
  in v1 (sequential only; worker-pool optimization deferred).
  `--order chronological|alphabetical|file`.
- **`wai revert`** *(2026-05-11)*. Wiki-style undo built on `git
  revert` filtered by the `pipeline-run` trailer. Modes:
  `wai revert <slug>` (most recent run), `--run <uuid>` (specific
  run), `--phase <p>` (single phase: research/outline/draft/verify/
  log; `draft` matches phases 4 and 5), `wai revert --last` (most
  recent pipeline activity, any slug), `--list` (show runs for slug
  with summaries), `--dry-run`. Produces a single
  `revert(<slug>): <what>` commit per invocation.
- **`wai history <slug>`** *(2026-05-11)*. Render the
  pipeline-related commit log for a page as a markdown table by
  default or JSON via `--json`. Filters: `--no-pipeline` (manual
  edits only), `--pipeline-only` (default). `wai history --recent N`
  shows the last N pipeline commits across all slugs (default 50).
- **`wai author <slug>`** *(2026-05-11)*. Single-slug article-authoring
  orchestrator. Drives seven phases (gather → research → outline →
  draft person → draft episodes → verify → log) via the harness
  adapter, with the pipeline-run trailer baked into each phase's
  commit message in `$WHOAMI_ROOT`. Flags: `--no-web`,
  `--skip-episodes`, `--resume`, `--dry-run`, `--branch`. Pre-flight
  checks reject non-git repos (exit 8), uncommitted changes (7),
  unreachable frontend (14), unsupported `WHOAMI_HARNESS` (11).
  Refuses to fabricate when no usable evidence exists (exit 4). Web
  research is performed by the harness using its own WebSearch/
  WebFetch tools; the orchestrator no longer takes injected
  `webSearch`/`webFetch` deps. Phase 6 (verify) runs the real
  `runDetectors` against the data repo and exits 5 when consistency
  findings remain after format/schema auto-fix.
- **`wai check --include consistency`** *(2026-05-11)*. Fifth detector
  category. v1 covers orphaned footnotes (referenced not defined or
  vice versa), bibliography↔inline cite-vault mismatches, and
  GEDCOM↔page infobox mismatches (born/died/birthplace differing
  from derived YAML and no `corrections:` entry). Self-contradiction
  within a page, cross-page contradictions, and footnote↔claim
  mismatches deferred (`TODO(consistency-v2)` markers in the
  detector). Smoke against the current data repo surfaced 39 real
  findings, most of them GEDCOM birthplace mismatches.
- **Renderer + search filter** *(2026-05-11)*: `pages/<slug>.narrative.md`
  is excluded from `core/src/pages/store.ts:list()` and from
  `core/src/search/rebuild.ts`. The narrative file is an authoring
  input only; it never appears at a URL or in search results.
- **Four prompt templates** added to `writing-articles`:
  `research-questions`, `outline`, `draft-person`, `draft-episode`.
  Together with the `interview` template from Plan 1, all five
  templates referenced by the harness contract are now implemented.
  Smoke verified the harness adapter loads each at ~4–5 KB of
  prepended system-prompt content.
- **Harness adapter — template routing** *(2026-05-11)*: the adapter
  now reads `<skillsDir>/<skill>/SKILL.md` plus
  `prompt-templates/<template>.md` from disk and concatenates them
  via `--append-system-prompt`. Resolves the Plan 1 limitation that
  was passing the literal skill-name string. Fence-stripping handles
  Claude's ```json-wrapped JSON responses.
- **Pipeline-run trailers** *(2026-05-11)*: every phase commit
  carries a structured trailer (`pipeline-run`, `phase`, `slug`,
  `inputs`, optional `sources`, `fabrication-guard`). `--resume`
  reads the trailer from `git log` to skip already-completed phases;
  cold-start (no prior trailer) is treated as a fresh run.
- **`wai narrative <slug>`** *(2026-05-10)*. Edit, ingest (`--file F`),
  or print (`--print`) the per-slug family-narrative file at
  `pages/<slug>.narrative.md`. Each save commits in `$WHOAMI_ROOT`.
  Aborts with exit 7 if the data repo has uncommitted changes; never
  overwritten by the pipeline.
- **`wai transcribe <slug> <audio>`** *(2026-05-10)*. Transcribe via
  the OpenAI Whisper API, copy audio under `assets/audio/<slug>/`,
  append the transcript as a `kind=transcript` research note, commit.
  `--lang en|ru|he|auto` (default auto). `--dir` batch mode processes
  every audio file in a directory; per-file failures journal to
  `data/transcribe-runs/<run-id>-failed.txt` and the command exits 5.
  Requires `OPENAI_API_KEY`; missing key exits 4.
- **`wai interview <slug>`** *(2026-05-10)*. Harness-driven Q&A round.
  Generates targeted questions from gaps in the evidence drawer
  (derived YAML, talk page, narrative file), opens `$EDITOR` with a
  fillable buffer, posts each answered pair as a `kind=interview`
  note. First user of the harness adapter; selectable via
  `WHOAMI_HARNESS` (v1 supports `claude-code`).
- **`wai note --kind <k>`** *(2026-05-10)* accepts new sub-kinds for
  agent-authored notes: `interview`, `research`, `transcript`. The
  existing `human` and `agent` values continue to work.
- **Harness adapter** *(2026-05-10)* — the new LLM-driver class of
  CLI command at `cli/src/harness/`. Defined by an `invoke` contract
  (request → `{ ok, result | error, retryable }`) with response
  validation against a per-template `outputSchema`. v1 ships the
  Claude Code adapter; Codex and OpenCode return exit 11 ("not yet
  supported in v1; use claude-code").
- **`writing-articles` skill** *(2026-05-10)* at
  `plugins/whoami/skills/writing-articles/`. Plan-1 scope ships
  `SKILL.md` (composes with `editorial-guide`, sets the three-stream
  weaving rule and forbidden-prose list) plus the `interview` prompt
  template with a typed `outputSchema`. The remaining four templates
  (`research-questions`, `outline`, `draft-person`, `draft-episode`)
  land alongside `wai author` in Plan 2.
- **`wai doctor`** command and actionable connection errors. Replaces
  `fetch failed` with a probe-based hint that names the alive port and
  the exact `wai config server` command to run; `wai doctor` runs the
  same checks proactively (server reachability, workspace presence,
  CLI/frontend version skew) and `--fix` writes the discovered URL into
  `~/.whoami/config.json`. New `/api/version` route on the frontend.
  (`cli/src/probe.ts`, `cli/src/api-client.ts`,
  `cli/src/commands/doctor.ts`, `cli/src/index.ts`,
  `frontend/app/api/version/route.ts`.)
- **Conflict-resolution schema** for disagreeing sources, addressing
  platform-review P1.5 (`core/src/family/conflicts.ts`,
  `frontend/components/family/sections/conflicts-section.tsx`).
  *In progress.*
- **Red-links flow:** `wai redlinks` CLI command, `/api/redlinks`
  route, `core/src/pages/redlinks.ts`. Addresses P2.2. *In progress.*
- **GEDCOM normalize layer** (`core/src/gedcom/normalize.ts`) for
  cleaner derive output. *In progress.*
- **Places-drift detector** (`core/src/checks/places-drift.ts`,
  `core/test/checks/places-drift.test.ts`, wired into `wai check`)
  — emits `schema` (lat/lon range, alias collisions), `coverage`
  (dead aliases that match no GEDCOM PLAC string), and `data`
  (anachronistic place/date pairs: Soviet Union pre-1922 / post-1991,
  Russian Empire post-1917, Prussia post-1947) findings.
- **Editorial guide: genealogy data quality** section added to
  `plugins/whoami/skills/editorial-guide/SKILL.md` — keeps prose
  consistent with the regime/anachronism rules `wai check` enforces.
- **Prompt-drift smoke test** (`evals/test/prompt-drift.test.ts`)
  — closes platform-review P0.1 by failing the build if any agent
  prompt in `plugins/whoami/` references a v1-removed command or
  any unknown command. Parses `cli/src/index.ts` directly so the
  test stays in sync with the CLI surface. Caught one residual
  drift in `plugins/whoami/agents/editor.md` (`wai search source`
  → `wai search "source"`).
- **Ambiguous-date `?` glyph** in person infobox
  (`frontend/components/directives/infobox-person.tsx`) — when a slash
  date can't be unambiguously canonicalized (`m/d/y` vs `d/m/y`, both
  numbers ≤ 12), the rendered date gets a `?` indicator with a tooltip
  explaining the ambiguity. Closes platform-review P0.3 (the underlying
  `normalizeDate` ambiguity flag and `wai check` audit were already in
  place; this surfaces the signal to the reader).
- **Privacy gate — frontend article gating:** when a person page's
  joined derived record has `privacy.restricted`, the renderer skips
  the body, infobox, categories chips, and info strip; instead it
  shows a `RestrictedNotice` with initials + birth year and a one-line
  unlock recipe. Closes the fourth and final P0.2 sub-item. The skip
  happens before `renderMarkdown` runs so directives like
  `:::infobox-person` can't interpolate from `derived` and leak
  fields.
- **Privacy gate — `wai export --redact-living`:** new standalone
  CLI command (third P0.2 sub-item). Walks `genealogy/derived/` and
  emits a copy under `--out <dir>` where restricted records are
  reduced to `{ initials, birth-year-only }` with all relations and
  events dropped. Pure logic in `core/src/export/redact.ts`,
  file-I/O orchestration in `core/src/export/run.ts` (boundary).
  Pages export is intentionally out of scope for this iteration —
  narrative content can't be safely auto-redacted; a future module
  can drop pages whose joined record is restricted.
  - Drive-by: `export` removed from the v1 REMOVED set since this
    is its v2 reintroduction with a different shape.
- **Privacy gate — search filter:** `wai search` now hides
  restricted records by default. `--include-living` flag (and
  `?include_living=1` API param) opt back in. Filtering happens
  query-time in the `SearchIndex` wrapper; restricted slugs are
  tracked in a side set that round-trips through persist/load via
  a sentinel key. `searchAndJoin` and the `/api/pages/[slug]` PUT
  upsert path both pass the privacy flag through. Closes the second
  of four P0.2 sub-items.
- **Privacy gate (foundation)** for living-person records, addressing
  platform-review P0.2. Adds `Privacy { restricted, reason }` to
  `DerivedRecord` populated by the deriver from the GEDCOM `RESN`
  tag (privacy/confidential/locked) and a "no death + latest possible
  birth year within 110 of today" living-person heuristic. Bounds-aware
  for `BET … AND …` and `AFT` dates so a record like `Bet 1900 And 1925`
  is restricted via the upper bound. Older YAMLs without a `privacy`
  field default to unrestricted via `normalizeDerivedRecord`. Search
  filtering, export-redact command, and frontend gating are upcoming
  follow-on commits.
- **Skip-to-content link** in the root layout
  (`frontend/app/layout.tsx`) — visually-hidden anchor that becomes
  visible on focus and jumps past nav to the page's main content.
  Partial close on platform-review P2.5 (alt text was already correct
  via `AvatarMonogram`'s `alt=""` + `aria-hidden`; `lang=` on
  multilingual name spans deferred — no rendering surface yet).
- **Plans index** at `docs/superpowers/plans/README.md` and project
  `SCOPE.md` / `ROADMAP.md`.

### Changed

- **`RegistryCard` and `GenerationHeader` extracted** from the family-
  tree section files. Six call sites that hand-rolled
  `<Card className="gap-0 overflow-hidden p-0 py-0 shadow-none ring-foreground/12">`
  now wrap a single primitive (`components/family/registry-card.tsx`),
  and the in-card `roman + heading + count` flex header duplicated
  between `DescendantsBlock` and `GenerationBlock` collapses to one
  component in `components/family/sections/shared.tsx`. `GroupedList`
  also routes through `RegistryCard` so the wrapper style has one
  source of truth.
- Family browser section components iterating: descendants, family,
  lifespans, infobox-shell.
- `plugins/whoami/CLAUDE.md` rewritten (in flight; resolves part of
  P0.1 — agent-prompt drift after v2 CLI surface change).
- **Frontend perf pass against Vercel React rules.** Parallelized
  `buildNotesView` (was awaiting `renderMarkdown` per note in series)
  and the family-tree page's slug/talk-body/notes resolution; both
  were serial waterfalls on the render hot path.
  (`frontend/lib/server-services.ts`,
  `frontend/app/family/tree/page.tsx`.)
- **Command palette deferred via `next/dynamic`.** The cmdk-backed
  dialog body now ships in a chunk loaded on first open instead of in
  every page's client bundle; the header button + ⌘K listener stay in
  the main bundle. New `frontend/components/command-palette-dialog.tsx`.
- **`AddNoteForm` author persistence on blur** instead of every
  keystroke. (`frontend/components/research-notes/add-note-form.tsx`.)
- **Misc loop/regex cleanups.** `lib/changelog.ts` no longer parses
  each version H3 twice; `lib/family.ts` merges two passes over the
  page list and hoists the year regex to module scope.

### Fixed

- **`wai sync-gedcom --force` no longer 500s when the deriver output
  is byte-identical.** After a deriver-code update that doesn't move
  the bits (or a re-run after a successful sync), `git commit` was
  failing with "no changes added to commit" and the route returned
  `HTTP 500: sync-failed`. Sync now detects the empty-staging case
  before invoking commit and returns `{ kind: 'no-op', reason:
  'no-output-changes' }`. (`core/src/gedcom/sync.ts`.)
- **CLI surfaces server-side `detail` field in error messages.** The
  frontend's `errorResponse` has been emitting useful `detail` strings
  for a while; the CLI was dropping them, so `wai sync-gedcom` printed
  `HTTP 500: sync-failed` instead of `HTTP 500: sync-failed: nothing
  to commit on working tree`. Same papercut applied to every API
  command. (`cli/src/api-client.ts`.)
- **Note edit-history:** byline spacing and dead empty-events branch
  in note history reconstruction (`1e1ac7b`).

---

## [v2.0.0-pre] — 2026-05-01 to 2026-05-07

The v2 markdown migration. A fundamental rewrite of the platform from
MediaWiki-coupled architecture to a markdown-first, local-file system.
Not yet tagged; current `package.json` versions are placeholders
(`core: 0.1.0`, `frontend: 0.1.0`, `cli: 0.1.0`, `evals: 2.0.0-pre.0`).

### Added — platform foundations

- **Markdown page store** (`core/src/pages/`) — `PageStore.read/write/list/softDelete`
  backed by the filesystem, with `simple-git` wrapping
  add/commit/history/restore, atomic temp+rename writes, and a
  per-slug async mutex that serializes concurrent writes
  (`716d9e9`, `1435938`, `b8b9dc9`, `886e081`).
- **Page types and zod-validated frontmatter schema** — `Page`,
  `PageMeta`, slug regex/assert helper, gray-matter parse + serialize
  round-trip (`b2453a2`).
- **Soft-delete semantics** — `PageStore.softDelete` moves pages to
  `_archived/` with a `deletedAt` timestamp, leaving git history
  intact.
- **Atomic-write rollback** — failed git commits restore the file to
  last-good state and surface the error end-to-end.
- **Next.js 16 App Router frontend** — fresh scaffold with Tailwind v4,
  shadcn/ui (button/card/alert), `@core/*` tsconfig path alias, and
  `allowedDevOrigins` config so dynamic chunks load through Tailscale
  (`40fa96e`, `8484d4d`, `2a52a32`).
- **Index page and `[slug]` RSC route** — full-list home, server-rendered
  article pages via `core/pages` + remark, Tailwind typography for prose.
- **Wikilink resolver** with title + alias index.
- **Markdown-to-HTML pipeline** — directives, sanitizer,
  `hast-util-to-jsx-runtime` React rendering, derived-data merge for
  infoboxes.
- **HTTP API surface** — `GET/PUT/DELETE /api/pages/[slug]` (PUT is
  upsert with default frontmatter), `POST /api/login` /
  `POST /api/logout` (later removed), `POST /api/gedcom/sync`,
  `GET/POST /api/gedcom/recite`, `POST /api/notes/...`,
  `POST /api/migrate`, `POST /api/search/rebuild`, `/healthz`.
- **`wai` CLI rewritten as a pure HTTP client** — `toSlug` canonicalizer,
  fetch-based `ApiClient` with typed error mapping, server URL config
  chain (env → `~/.whoami/config.json` → default), body-input helpers
  (file / stdin / `$EDITOR`), commands `read`, `write`, `create`,
  `edit`, `delete`, `recite`, `sync-gedcom`, `healthz`, and a new
  dispatcher.
- **Schema-migrations runtime** — `schemaVersion` field added to
  `PageMeta` and zod schema; `peekSchemaVersion` helper; `parsePage`
  owns the migration chain and composes a registry of per-version
  migrations; strict write rule rejects stale or future versions in
  the page store; `runMigrateOnDisk` orchestration; `POST /api/migrate`
  route; `wai migrate` command; 409 responses surface stale/future
  writes with `slug + onDisk + current`; SSR error page when reading a
  future-schema-version file (`cf815fe`, `f502170`, `4a512e3`,
  `a65abc5`, `b232a17`, `38582a6`, `b66241c`, `bf5f730`, `47db2f1`,
  `b5cabce`, `46ed278`).
- **Command palette + UI primitives** — `cmd+k` palette; badge, roman
  util, command/dialog/input-group/input/textarea shadcn primitives.

### Added — family graph

- **GEDCOM module** (`core/src/gedcom/`) — strict UTF-8 5.5.x parser
  that rejects ANSEL; derives name, birth, death, parents (FAMC),
  spouses & children (FAMS), residences, occupations, source citations
  into one YAML record per individual.
- **`syncGedcom` pipeline** — parse + derive + diff + commit + append
  snapshot manifest (no-op on duplicate hash); `writeDerivedYaml` and
  `hashGedcomFile` helpers; backfills `derived/` when a Plan B snapshot
  exists but `derived/` is empty.
- **Recite drift detection** — `reciteDrift` walks pages and diffs
  cited-vs-current sources via git; `applyRecite` advances stale
  snapshot pointers with a regex pass.
- **`wai sync-gedcom`, `wai recite`** — CLI front-ends for the GEDCOM
  and recite endpoints.
- **Family browser #1 — siblings & cousins** — cohort module computing
  full siblings, half-siblings, and first cousins with paternal/maternal
  split; surfaced on the family tree view (`5d21828`).
- **Family browser #2 — descendants** — descendants walker with depth,
  multi-generation, missing-record, and cycle handling; rendered as
  descendants panel.
- **Family browser #3 — relationship calculator** — BFS+LCA with human
  labels for parent/child, grandparent, sibling, aunt/uncle, first
  cousin, removed cousins, missing-record cases; shown in the person
  header (`41326f8`).
- **Family browser #4 — coverage prompts** — lineage coverage and
  research-frontier panel surfacing tree gaps.
- **Family browser #5 — lifespan timeline** — GEDCOM year parser
  handling `ABT`, `BEF`, `AFT`, `BET ... AND ...` qualifiers;
  horizontal lifespan bars on the family tree page.
- **Family browser #6 — portraits & monogram avatars** — initials
  helper, avatar monogram component, portrait paths threaded through
  `PageMeta` and family view; monogram fallback on tiles, rows, and
  lifespan bars.
- **Family browser #7 — search type facets** — person/family/event/
  tree/meta facet filters on `/search`.
- **Family browser #8 — places & map** — birthplace grouping by region;
  Leaflet map joined with curated `genealogy/places-coords.yml`;
  unmapped fallback list.
- **Family browser #9 — shareable relationship links** — `?perspective=`
  / `?from=&to=` query params drive the relationship calculator from
  URL; ancestor gender derived from the last hop (not the first) for
  correct labels (`d854942`).
- **Family tree spine & polish** — initial browseable tree, hardening,
  and refactor splitting `/family/tree` into per-section components.

### Added — search & discovery

- **FlexSearch index** — doc-builder flattens `Page` + `DerivedRecord`
  into searchable fields with weighted scoring; persisted as JSON via
  atomic write; lazy-loaded singleton with rebuild fallback.
- **Index freshness** — search index updates on every page write/delete
  and GEDCOM mutation; `searchAndJoin` extracted as the shared query
  path.
- **`/search` UI and API** — `GET /api/search?q=&limit=` returning
  ranked slugs joined with summaries; search form + result list page.
- **`wai search`** CLI command hitting `/api/search`.
- **Search index rebuild system** — `isSearchIndexStale` probe,
  `rebuildSearchIndexFromDisk` returning `{pages, ms}`, dev-mode
  auto-rebuild on stale state, `POST /api/search/rebuild`,
  `ApiClient.rebuildSearch`, and `wai rebuild-search` command.

### Added — research notes

- **Talk-page research notes** with stable per-note identity and full
  lifecycle, stored as trailing HTML comments on `## Research notes`
  bullets:
  - `parseResearchNotes` parser, note types & error classes, with
    section-boundary and round-trip coverage (`5c2640e`).
  - `appendResearchNote` writes a trailer with `id` / `by` / `kind` /
    `at`; id generator emits `n_` + 8 base32.
  - `editResearchNote` records a last-edit timestamp; `softDelete`
    and `restore` round-trip cleanly.
  - On-disk wrappers `appendNoteOnDisk` (returns id), `editNoteOnDisk`,
    `softDeleteNoteOnDisk`, `restoreNoteOnDisk`; wire-error mapping.
  - HTTP endpoints — `POST /api/notes`, `PATCH/DELETE /api/notes/[slug]/[id]`,
    `POST /api/notes/[slug]/[id]/restore`.
  - CLI — `wai note --edit/--delete/--restore/--list/--as-agent` and
    matching `ApiClient` methods.
  - Structured panel UI — `buildNotesView`, `NoteItem`,
    `EditNoteForm`, relative-time formatter for bylines, full
    edit/delete/restore controls.
- **Per-note edit-history modal** — core reconstructor walks each
  note's git versions to produce an audit trail; modal renders the
  full per-note history (`73f33aa`, `0219687`).

### Added — agent surface

- **Frontend directive components** (shadcn-based, derived-data aware)
  — admonition (Open / Closed / Superseded), blockquote, cite-vault,
  cite-message, dialogue, columns-list, infobox-company (structured
  fields), infobox-person (merges `genealogy/derived/<record>.yml`);
  replaces wikitext-era CSS classes.
- **`tools/wikitext-to-md` converter** — one-shot MediaWiki migration
  tool: reads post-cutoff pages from legacy MediaWiki SQLite,
  slugifies titles, renders `PageMeta` as YAML frontmatter, transforms
  `[[Category:X]]`, `#REDIRECT`, `<ref>` footnotes, wikitables (with
  HTML fallback for merged cells), bold/italic, ATX headings, h1, and
  every wiki template (`Cite vault`, `Cite message`, `Infobox
  person/company`, `Dialogue`, `Blockquote`, `Open/Closed/Superseded`,
  `Gap`, `Columns-list`) into markdown directives; pipeline composed
  in `convertPage`; CLI orchestrates db read → conversion → redirect
  rewrite → on-disk write.
- **`tools/wiki-preview`** — local renderer for migrated pages.
- **GEDCOM hash + snapshots manifest** — `.ged` file content is hashed
  and appended to the snapshots manifest on every import.
- **Editor-agent prompt updates** — drops dead `wai` commands, switches
  examples to markdown directives, adds note-trailer + retraction
  guidance; editorial guide rewritten end-to-end.
- **Eval harness rebuilt for the markdown world** — `parsePageContent`
  extracts directives / headings / wikilinks; harness runs against
  Next.js + a temp git repo; reference, accuracy, completeness,
  citation, and citation-resolver graders all consume markdown
  directives; runner and agent prompts rewritten for the new `wai`
  surface.

### Changed

- **Auth removed** — bcrypt password hashing, `users.json`,
  sqlite-backed sessions, CSRF, sliding-window rate limiter, and
  `AuthService` were built out for Plan C, then removed within hours
  of shipping when the project committed to Tailscale ACLs as the
  only access layer (`309619a`).
- **Frontend rewritten as RSC** — article pages and index render
  through React Server Components against the `PageStore`, replacing
  the MediaWiki-era client architecture.
- **CLI rewritten as a thin HTTP client** — MediaWiki client and 14
  legacy commands removed; CLI now speaks only to the local Next.js
  server (`0830803`).
- **Per-package `AGENTS.md` adopted**, with `CLAUDE.md` aliasing via
  `@import`; the "stranger test" for user-data vs. project-data added
  to root `AGENTS.md`.

### Removed

- **MediaWiki-based desktop app** — entire `desktop/` package retired;
  doc references swept (`b33b9fb`, `c4af8e2`).
- **Marketing site** (`web/`) (`4dd7ddd`).
- **App-layer auth** — bcrypt + sqlite-session machinery removed
  shortly after it shipped; Tailscale ACLs are the access layer
  (`309619a`). Re-adding auth is bookmarked, not scheduled.
- **MediaWiki-coupled CLI commands** — `task`, `source`, `snapshot`,
  `talk`, `auth`, `archive`, `vault`, `update`, and the rest of the
  v1 surface deleted along with the old wiki client; v2 surfaces only
  the HTTP-client commands listed above (`0830803`).
- **Legacy `.directive-*` CSS** — directives now own their styling via
  React components.

### Fixed

- **Page-title underscore normalization** when matching redirects in
  the wikitext-to-md CLI.
- **Wikitext h1 (`= text =`)** correctly handled in body content;
  body-less directives emit as leaf (`::name`) rather than container
  (`:::name:::`).
- **Footnote placement** — `<ref>` definitions now anchor to
  `<references />` location and empty headings are pruned.
- **Atomic write surfaces git commit failures** end-to-end instead of
  silently rolling back.
- **Ancestor gender** in relationship-label rendering is derived from
  the last hop (not the first), fixing wrong gendered labels on
  multi-hop ancestors (`d854942`).
- **Tailscale dev origin** allowed so dynamic chunks load through
  Tailscale; default restored after a regression.
- **GEDCOM derived backfill** — `derived/` is repopulated when a
  Plan B snapshot already exists but the directory is empty.
- **409 responses on schema-version writes** include
  `slug + onDisk + current` so the CLI can show actionable errors
  (`b5cabce`).
- **Note edit-history** — byline spacing and dead empty-events branch
  in history reconstruction (`1e1ac7b`).

### Notes

- The v2.0.0 tag has not been cut. When it is, every package version
  in `package.json` should be reconciled — see `AGENTS.md` versioning
  policy. Current values are placeholders.

---

## CLI v1.x — pre-v2 (Feb–Mar 2026)

Tagged releases of the MediaWiki-coupled CLI. These predate the v2
markdown migration; the commands listed in their changelogs no longer
exist in the v2 CLI surface.

### [cli-v1.2.1] — 2026-03-26

- Improved CLI auth messages (#112).

### [cli-v1.2.0] — 2026-03-24

- Unified `credentials.json` between desktop and CLI (#106).
- Obfuscated password input; skip server prompt in `wai auth login` (#105).

### [cli-v1.1.2] — 2026-02-22

- Suppressed `DEP0169` deprecation warning from `proxy-from-env` (#61).

### [cli-v1.1.1] — 2026-02 (skipped public release notes)

- `tough-cookie` upgrade to v5.1.0; outdated type definitions removed (#54).

### [cli-v1.1.0] — 2026-02-16

- Glossary page added to `/docs` (#42).
- Renamed `archive` to `vault` (#43).
- Fixed silent `wai snapshot` write failures (#39).
- Moved CLI archive to Application Support and included in backup (#37).
- Replaced XML export/import with full wiki backup (#32).
- Hardened `write` command and improved CLI error reporting (#30).

### [cli-v1.0.6] — 2026-02

- Fixed CLI install and auto-update (#26).

### [cli-v1.0.5] — 2026-02

- Task-queue system supported in CLI and wiki (#25).

### [cli-v1.0.4] — 2026-02

- Improved `snapshot` command (#22).
- `gh`-based CLI auto-update (#18).
- Improved import/export CLI (#20).

### [cli-v1.0.3] — 2026-02

- Updated `source list` CLI command (#17).

### [cli-v1.0.2] — 2026-02

- CLI release logic + skill (#10).

### [cli-v1.0.1] — 2026-02-08

- Initial public release of the `wai` CLI.

---

## Desktop v1.x — retired

The MediaWiki-based desktop app shipped tags `desktop-v1.1.0` through
`desktop-v1.2.4` (2026-02 through 2026-04). Removed in `b33b9fb`
(May 2026) when the platform moved to a markdown-first architecture.
Tags are kept as historical record; the code is not in the tree.

---

## See also

- [`docs/SCOPE.md`](./docs/SCOPE.md) — what's in/out of scope
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — what's next
- [`docs/superpowers/plans/README.md`](./docs/superpowers/plans/README.md) — implementation plan index
- [`docs/reviews/`](./docs/reviews/) — platform reviews
