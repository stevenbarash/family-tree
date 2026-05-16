# Implementation plans

Each plan in this directory is a self-contained implementation
document for a feature, refactor, or infrastructure change. Plans are
the unit of work the agent runs through `superpowers:executing-plans`
or `superpowers:subagent-driven-development`.

This file is the **status index**. The roadmap (`docs/ROADMAP.md`)
sequences these into waves; this index just tells you, at a glance,
which plans are alive, which are done, and which are bookmarked.

**When you add a plan**, also add a row here. When you ship one,
update its status here. If the two disagree, treat this index as the
planning source of truth and the plan body as the implementation
source of truth — fix whichever is stale.

---

## Status legend

| Icon | Status | Meaning |
|---|---|---|
| ✅ | **shipped** | Implementation merged. Plan is historical record. |
| 🚧 | **in-progress** | Actively being worked. At least one task done, at least one unfinished. |
| 📝 | **sketch** | Written-down idea, deferred. Has an explicit triggering signal — reopen when it fires, not before. |
| 🗂 | **index** | Meta-plan that sequences other plans (e.g., the family-explorer roadmap). |
| 📦 | **abandoned** | Superseded, deleted, or no longer relevant. |

---

## Plans

| Status | Filename | Title | Summary |
|---|---|---|---|
| ✅ | [`2026-05-16-this-day-in-family-history-ribbon.md`](./2026-05-16-this-day-in-family-history-ribbon.md) | "This day in family history" ribbon | Home-page almanac listing today's births, deaths, marriages from the GEDCOM tree, sorted oldest-first. |
| ✅ | [`2026-05-16-relationship-strip-on-person-pages.md`](./2026-05-16-relationship-strip-on-person-pages.md) | Relationship strip on person pages | One-line "Your <relation>" subtitle below the H1 of every person page, computed server-side from SELF_RECORD. |
| 🚧 | [`2026-05-10-article-pipeline-plan-1-foundation.md`](./2026-05-10-article-pipeline-plan-1-foundation.md) | Article pipeline — Plan 1: Foundation | Evidence-drawer commands (`wai narrative`, `wai transcribe`, `wai interview`), `wai note --kind` extension, harness adapter, `writing-articles` skill scaffold. Sequenced before Plans 2 and 3. |
| 🚧 | [`2026-05-10-article-pipeline-plan-2-author-core.md`](./2026-05-10-article-pipeline-plan-2-author-core.md) | Article pipeline — Plan 2: Authoring core | `wai author <slug>` single-slug orchestrator (gather → research → outline → draft → verify → log), `wai check --include consistency`, renderer/search filters for narrative files, four authoring prompt templates. Sequenced after Plan 1; before Plan 3. |
| 🚧 | [`2026-05-10-article-pipeline-plan-3-cohort-review.md`](./2026-05-10-article-pipeline-plan-3-cohort-review.md) | Article pipeline — Plan 3: Cohort + review | `wai author --cohort missing\|file:`, `wai revert` (wiki-style undo), `wai history`. Final plan in the article-pipeline series. |
| 🗂 | [`2026-05-02-family-explorer-roadmap.md`](./2026-05-02-family-explorer-roadmap.md) | Family Explorer Roadmap | Sequences nine family-browser features (#1–#9). All shipped 2026-05-02 / 2026-05-03. |
| ✅ | [`2026-05-02-family-siblings-cousins.md`](./2026-05-02-family-siblings-cousins.md) | Siblings & cousins on person view | Cohort view with paternal/maternal split. (Family-explorer #1.) |
| ✅ | [`2026-05-02-family-descendants.md`](./2026-05-02-family-descendants.md) | Descendants view | Recursive children-walker with depth limit. (Family-explorer #2.) |
| ✅ | [`2026-05-02-family-relationship-calculator.md`](./2026-05-02-family-relationship-calculator.md) | Relationship calculator | BFS+LCA with sibling/cousin/aunt term generation. (Family-explorer #3.) |
| ✅ | [`2026-05-03-family-coverage.md`](./2026-05-03-family-coverage.md) | Coverage prompts | Surface tree gaps as research frontier. (Family-explorer #4.) |
| ✅ | [`2026-05-03-family-timeline.md`](./2026-05-03-family-timeline.md) | Lifespan timeline | Horizontal bars; GEDCOM-date year parser. (Family-explorer #5.) |
| ✅ | [`2026-05-03-family-portraits.md`](./2026-05-03-family-portraits.md) | Portraits & monogram avatars | Initials fallback; portrait field in `PageMeta`. (Family-explorer #6.) |
| ✅ | [`2026-05-03-search-facets.md`](./2026-05-03-search-facets.md) | Search type facets | Type-only facets shipped; surname/decade/place follow-on tracked in roadmap Wave 4. |
| ✅ | [`2026-05-03-family-places.md`](./2026-05-03-family-places.md) | Places panel & map | Curated `places-coords.yml`, Leaflet map, unmapped fallback. (Family-explorer #8.) |
| ✅ | [`2026-05-02-cli-rewrite.md`](./2026-05-02-cli-rewrite.md) | CLI rewrite (Plan G) | Replace MediaWiki-coupled CLI with HTTP client to markdown server. |
| ✅ | [`2026-05-02-server-skeleton-pages-auth.md`](./2026-05-02-server-skeleton-pages-auth.md) | Server skeleton & auth removal (Plan C) | Next.js API skeleton with page CRUD; auth removed in `309619a`. |
| ✅ | [`2026-05-02-gedcom-module.md`](./2026-05-02-gedcom-module.md) | GEDCOM module (Plan D) | Derive person records from `.ged` to YAML; reconciliation pipeline. |
| ✅ | [`2026-05-02-search.md`](./2026-05-02-search.md) | Search (Plan E) | FlexSearch index across pages + GEDCOM derived data; `/search` UI; `wai search`. |
| ✅ | [`2026-05-03-search-index-rebuild.md`](./2026-05-03-search-index-rebuild.md) | Search index rebuild | Explicit rebuild contract; `wai rebuild-search`; dev-mode auto-rebuild + staleness probe. |
| ✅ | [`2026-05-04-schema-migrations.md`](./2026-05-04-schema-migrations.md) | Schema migrations (implementation) | `wai migrate`, `peekSchemaVersion`, `runMigrateOnDisk`, `parsePage` migration chain. |
| ✅ | [`2026-05-06-research-notes-edits.md`](./2026-05-06-research-notes-edits.md) | Research-notes edits, authorship, soft-delete | Trailer-based per-note metadata, edit/delete/restore, structured panel UI. Largely shipped over weeks of 2026-04-23 to 2026-05-07; final polish in `1e1ac7b`. |
| 🚧 | [`2026-05-02-frontend-directives.md`](./2026-05-02-frontend-directives.md) | Frontend directive components (Plan F1) | shadcn-based React components for citation/infobox directives. Some directives shipped; review the task list for remaining items. |
| 🚧 | [`2026-05-02-eval-foundation.md`](./2026-05-02-eval-foundation.md) | Eval foundation (Plan H2a) | Markdown-aware eval suite foundation: skills migration + harness. |
| 🚧 | [`2026-05-02-eval-graders-and-runner.md`](./2026-05-02-eval-graders-and-runner.md) | Eval graders + runner (Plan H2b) | Grader rewrites + integration tests to make the eval suite functional end-to-end. |
| 📝 | [`2026-05-01-wikitext-to-md-converter.md`](./2026-05-01-wikitext-to-md-converter.md) | Wikitext → Markdown converter (Plan B) | MediaWiki-markup-to-markdown spec with directives; implementation deferred. |
| 📝 | [`2026-05-03-cli-server-contract.md`](./2026-05-03-cli-server-contract.md) | Typed CLI/server HTTP contract | Zod schemas to prevent contract drift. **Trigger:** first contract-drift bug that costs > 30 min. |
| 📝 | [`2026-05-03-narrative-to-gedcom.md`](./2026-05-03-narrative-to-gedcom.md) | Narrative ↔ GEDCOM round-trip | Paste raw text → fact extraction → unified GEDCOM diff. **Trigger:** user wants paste-to-vault flow. |
| 📝 | [`2026-05-03-schema-migrations.md`](./2026-05-03-schema-migrations.md) | Schema migrations (sketch) | Original deferral note. **Superseded** by [`2026-05-04-schema-migrations.md`](./2026-05-04-schema-migrations.md); recommend renaming this to `*-design-notes.md` or deleting (see ROADMAP cut #2). |
| ✅ | [`2026-05-09-wai-doctor.md`](./2026-05-09-wai-doctor.md) | `wai doctor` + actionable connection errors | Single command for dev-env diagnostics; `ConnectionError` with port-probe hint replaces `fetch failed`. Surfaced from P0.2 verification papercuts. |

**Total: 27 plans** — 17 shipped (✅), 4 in-progress (🚧), 5 sketches (📝), 1 index (🗂).

---

## Conventions

- **Filename:** `YYYY-MM-DD-<feature-name>.md`. The date is when the
  plan was written, not shipped.
- **Frontmatter or H1:** Either is fine; the H1 is what shows in the
  table above.
- **Sketch deferral:** A sketch should state its triggering signal in
  the first paragraph (e.g., "Spawn a fresh session driven by this
  plan when X happens"). If the trigger never fires, the sketch is
  effectively `📦 abandoned` after a year — review and remove.
- **Inline status tags:** When a plan ships, you can also annotate
  inside the body (e.g., `(SHIPPED 2026-05-02)` next to a sub-feature)
  — this is what `family-explorer-roadmap.md` does and is the local
  convention.

---

## See also

- [`../../SCOPE.md`](../../SCOPE.md) — what's in/out of scope for the project
- [`../../ROADMAP.md`](../../ROADMAP.md) — sequenced waves consuming this index
- [`../../reviews/`](../../reviews/) — assessments that produce future plans
