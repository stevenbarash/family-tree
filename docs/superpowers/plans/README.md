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
| ✅ | [`2026-05-18-pedigree-chart.md`](./2026-05-18-pedigree-chart.md) | Pedigree chart on `/family/tree` | React Flow + pure layout function in `core/src/family/pedigree-layout.ts`. Ancestor chart (focal at bottom, ancestors above, 5 generations) renders above the existing sections; mobile (`< md`) falls back to a vertical list. Closes platform-review P1.1. |
| ✅ | [`2026-05-18-pedigree-frontier-slots.md`](./2026-05-18-pedigree-frontier-slots.md) | Pedigree frontier slots | Dashed-border placeholder nodes in `/family/tree` for missing parents of present ancestors up to MAX_GENERATION. Sub-project F (of 3) in the gap-as-frontier feature — see [spec](../specs/2026-05-18-pedigree-frontier-slots-design.md). |
| ✅ | [`2026-05-18-quality-checks-pass-2.md`](./2026-05-18-quality-checks-pass-2.md) | Quality checks Pass 2 | 4 new `wai check` detectors: `detectNameTranDrift` (data, NAME.TRAN↔translation title), `detectStaleCanonicalSha` (data, translation `canonical_sha` vs canonical EN HEAD — surfaced 534 real stale translations on first run), `detectInfoboxNameDrift` (consistency, gated, title↔infobox `name:` with richer-form subsequence tolerance), `detectPipelineFrontmatterDrift` (schema, full pipeline field set on per-locale pages). New `RepoState.canonicalHeadSha` field populated by `load.ts` (bounded git cost). Fix along the way: load.ts now applies `normalizeTranslationKeys` (parsePage chain). 33 new tests; core 531/531 + cli 303/303 green. |
| ✅ | [`2026-05-17-gedcom-7-upgrade.md`](./2026-05-17-gedcom-7-upgrade.md) | GEDCOM 5.5.1 → 7.0.18 upgrade | Source `barash-tree.ged` converted via `gedcom7code/c-converter`; parser swapped from `parse-gedcom@2.0.1` to vendored `gedcom7code/js-gedcom` (single-file at `core/src/gedcom/vendor/gedcstruct.mjs`, public domain — `gedcom-ts` npm pivot rejected as supply-chain risk). Derive layer updated for v7's EXID + DATE.PHRASE conventions. YAML re-sync was cosmetic-only. Backup at `genealogy/barash-tree.ged.5.5.1-backup-20260517-190228`. |
| ✅ | [`2026-05-17-multilingual-support-plan-3-translation-pipeline.md`](./2026-05-17-multilingual-support-plan-3-translation-pipeline.md) | Multilingual support — Plan 3: Translation pipeline | Per-locale PageStore reads, translation frontmatter (`translation_of` / `canonical_sha` / `translated_at`), computed status (current/stale/review/missing), `wai i18n status` + `wai i18n sync` CLI, agent translator via harness adapter (`writing-articles` / `translate` template; `--stub` for offline), translation banner component, missing-translation fallback to canonical EN. Places + cite-vault + Collator deferred to Plan 3.5. |
| ✅ | [`2026-05-17-multilingual-support-plan-2-chrome-translations.md`](./2026-05-17-multilingual-support-plan-2-chrome-translations.md) | Multilingual support — Plan 2: Chrome translations + RTL | LLM-drafted ru/uk/he message files (Slavic and Hebrew ICU plural categories), Tailwind directional-class sweep to logical properties, family-tree RTL mirroring, `<bdi>` patterns on person-name renders, language switcher mounted in layout. Shipped on `feat/multilingual-chrome-translations` (~14 commits). Site chrome reads in all four languages; Hebrew renders RTL. |
| ✅ | [`2026-05-17-multilingual-support-plan-1-foundation.md`](./2026-05-17-multilingual-support-plan-1-foundation.md) | Multilingual support — Plan 1: Foundation | `next-intl` install, `[locale]` routing, `proxy.ts` middleware, UI-string extraction to `messages/en.json`, content migration to `pages/en/`. Site stays English-only in content but architecturally multilingual. First of four plans toward en/ru/uk/he support. Shipped on `feat/multilingual-foundation` (26 commits). Static-rendering test skipped pending `force-dynamic` removal. |
| ✅ | [`2026-05-16-cross-page-consistency-detector.md`](./2026-05-16-cross-page-consistency-detector.md) | Cross-page consistency detector | Talk-page-vs-live-page quoted-claim drift detector in `consistency-drift.ts`; catches the Boris/Kelman mix-up class. |
| ✅ | [`2026-05-16-wikilink-hover-cards.md`](./2026-05-16-wikilink-hover-cards.md) | Wikilink hover-cards | 200ms-delayed page preview on hover over any internal link; portrait + dates + lead, all precomputed at SSR. |
| ✅ | [`2026-05-16-this-day-in-family-history-ribbon.md`](./2026-05-16-this-day-in-family-history-ribbon.md) | "This day in family history" ribbon | Home-page almanac listing today's births, deaths, marriages from the GEDCOM tree, sorted oldest-first. |
| ✅ | [`2026-05-16-relationship-strip-on-person-pages.md`](./2026-05-16-relationship-strip-on-person-pages.md) | Relationship strip on person pages | One-line "Your <relation>" subtitle below the H1 of every person page, computed server-side from SELF_RECORD. |
| ✅ | [`2026-05-10-article-pipeline-plan-1-foundation.md`](./2026-05-10-article-pipeline-plan-1-foundation.md) | Article pipeline — Plan 1: Foundation | Evidence-drawer commands (`wai narrative`, `wai transcribe`, `wai interview`), `wai note --kind` extension, harness adapter, `writing-articles` skill scaffold. Shipped May 2026 — commands live in `cli/src/commands/{narrative,transcribe,interview}.ts`. |
| ✅ | [`2026-05-10-article-pipeline-plan-2-author-core.md`](./2026-05-10-article-pipeline-plan-2-author-core.md) | Article pipeline — Plan 2: Authoring core | `wai author <slug>` single-slug orchestrator (gather → research → outline → draft → verify → log), `wai check --only consistency` opt-in detector, renderer/search filters for narrative files, four authoring prompt templates. Shipped May 2026 — runtime under `cli/src/commands/author/`. |
| ✅ | [`2026-05-10-article-pipeline-plan-3-cohort-review.md`](./2026-05-10-article-pipeline-plan-3-cohort-review.md) | Article pipeline — Plan 3: Cohort + review | `wai author --cohort missing\|file:`, `wai revert` (wiki-style undo), `wai history`. All shipped — `cli/src/commands/{author/cohort.ts,revert.ts,history.ts}` are live. |
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
| ✅ | [`2026-05-02-frontend-directives.md`](./2026-05-02-frontend-directives.md) | Frontend directive components (Plan F1) | shadcn-based React components for citation/infobox directives. All 12 Create files shipped (`components/directives/*`); follow-on polish lands as ordinary feat commits, not plan revivals. |
| ✅ | [`2026-05-02-eval-foundation.md`](./2026-05-02-eval-foundation.md) | Eval foundation (Plan H2a) | Markdown-aware eval suite foundation: skills migration + harness. All 3 Create files shipped under `evals/`. |
| ✅ | [`2026-05-02-eval-graders-and-runner.md`](./2026-05-02-eval-graders-and-runner.md) | Eval graders + runner (Plan H2b) | Grader rewrites + integration tests to make the eval suite functional end-to-end. All 5 Create files shipped under `evals/`. |
| ✅ | [`2026-05-07-drift-prevention-plan-1-format-normalizer.md`](./2026-05-07-drift-prevention-plan-1-format-normalizer.md) | Drift prevention — Plan 1 of 7: format normalizer + `wai check` shell | `core/src/format/dates.ts` + `core/src/checks/format-drift.ts` + the `wai check` CLI shell. Shipped; first of the seven-plan drift-prevention series. |
| ✅ | [`2026-05-07-drift-prevention-plan-2-corrections-schema.md`](./2026-05-07-drift-prevention-plan-2-corrections-schema.md) | Drift prevention — Plan 2 of 7: corrections schema + overlay | Page-frontmatter `corrections:` block + `applyCorrections` overlay (`core/src/corrections/`). Shipped. |
| ✅ | [`2026-05-07-drift-prevention-plan-3-render-overlay.md`](./2026-05-07-drift-prevention-plan-3-render-overlay.md) | Drift prevention — Plan 3 of 7: render overlay (data path) | Frontend joins corrections through to the render layer so infobox/lifespan reflect overrides. Shipped. |
| ✅ | [`2026-05-07-drift-prevention-plan-4-promote-corrections.md`](./2026-05-07-drift-prevention-plan-4-promote-corrections.md) | Drift prevention — Plan 4 of 7: `wai promote-corrections` | CLI command that promotes a page-level correction into the GEDCOM with a `2 NOTE source: ...` audit line. Shipped. |
| ✅ | [`2026-05-08-drift-prevention-plan-5-detectors.md`](./2026-05-08-drift-prevention-plan-5-detectors.md) | Drift prevention — Plan 5 of 7: data/schema/coverage detectors | Three drift detectors (`data-drift.ts`, `schema-drift.ts`, `coverage-drift.ts`) wired into `wai check`. Shipped. |
| ✅ | [`2026-05-08-drift-prevention-plan-6-wai-init.md`](./2026-05-08-drift-prevention-plan-6-wai-init.md) | Drift prevention — Plan 6 of 7: `wai init` + hook/CI templates | Installs the pre-commit hook + GitHub Actions workflow into the data repo. Shipped. |
| ✅ | [`2026-05-08-drift-prevention-plan-7-agent-side.md`](./2026-05-08-drift-prevention-plan-7-agent-side.md) | Drift prevention — Plan 7 of 7: agent-side prevention | Editorial-guide section on how to handle drift surfaced during an edit (don't bypass the hook, fix at the source). Shipped. |
| ✅ | [`2026-05-16-commit-slicing.md`](./2026-05-16-commit-slicing.md) | Working-tree commit-slicing pass | One-off plan to slice ~49 uncommitted files from the article-pipeline marathon session into 13 focused commits. Shipped 2026-05-16; led directly to CLAUDE.md Rule 13 (commit at logical units). |
| 📝 | [`2026-05-01-wikitext-to-md-converter.md`](./2026-05-01-wikitext-to-md-converter.md) | Wikitext → Markdown converter (Plan B) | MediaWiki-markup-to-markdown spec with directives; implementation deferred. |
| 📝 | [`2026-05-03-cli-server-contract.md`](./2026-05-03-cli-server-contract.md) | Typed CLI/server HTTP contract | Zod schemas to prevent contract drift. **Trigger:** first contract-drift bug that costs > 30 min. |
| 📝 | [`2026-05-03-narrative-to-gedcom.md`](./2026-05-03-narrative-to-gedcom.md) | Narrative ↔ GEDCOM round-trip | Paste raw text → fact extraction → unified GEDCOM diff. **Trigger:** user wants paste-to-vault flow. |
| 📝 | [`2026-05-03-schema-migrations.md`](./2026-05-03-schema-migrations.md) | Schema migrations (sketch) | Original deferral note. **Superseded** by [`2026-05-04-schema-migrations.md`](./2026-05-04-schema-migrations.md); recommend renaming this to `*-design-notes.md` or deleting (see ROADMAP cut #2). |
| ✅ | [`2026-05-09-wai-doctor.md`](./2026-05-09-wai-doctor.md) | `wai doctor` + actionable connection errors | Single command for dev-env diagnostics; `ConnectionError` with port-probe hint replaces `fetch failed`. Surfaced from P0.2 verification papercuts. |

**Total: 46 plans** — 41 shipped (✅), 0 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).

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
