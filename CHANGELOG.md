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
- **Prompt-drift smoke test** (`evals/test/prompt-drift.test.ts`)
  — closes platform-review P0.1 by failing the build if any agent
  prompt in `plugins/whoami/` references a v1-removed command or
  any unknown command. Parses `cli/src/index.ts` directly so the
  test stays in sync with the CLI surface. Caught one residual
  drift in `plugins/whoami/agents/editor.md` (`wai search source`
  → `wai search "source"`).
- **Plans index** at `docs/superpowers/plans/README.md` and project
  `SCOPE.md` / `ROADMAP.md`.

### Changed

- Family browser section components iterating: descendants, family,
  lifespans, infobox-shell.
- `plugins/whoami/CLAUDE.md` rewritten (in flight; resolves part of
  P0.1 — agent-prompt drift after v2 CLI surface change).

### Fixed

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
