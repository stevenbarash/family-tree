# Roadmap

> Strategic sequencing for whoami.wiki. Sourced from the
> [May 2026 platform review](./reviews/2026-05-07-platform-review.md)
> and the in-flight work in the current working tree.

**Last updated:** 2026-05-18 (P2.1 citation-directive contrast, closes Wave 1)
**Cadence:** revisit at the end of each completed band, or when a new
review document lands. Status lines are the source of truth — keep
them honest.

This roadmap is organized in four bands:

- **Now** — actively in motion in the working tree this week.
- **Next** — committed for the post-review sprint (≈ 6 weeks).
- **Later** — accepted but unscheduled. P2 polish and P3 strategic bets.
- **Parking lot** — explicitly bookmarked, not on the path. Reopen
  with a triggering signal.

Each row links to a plan or review section. The `lift` column matches
the platform review's `S / M / L` shorthand (sittings, days, weeks).

---

## Now (working tree clean as of 2026-05-18)

The working tree is empty. Every theme that was open on 2026-05-07
has either landed (conflicts, redlinks, sex-aware translation,
family-section refactor) or been superseded by a larger piece of
work (GEDCOM normalize → full 5.5.1 → 7.0.18 upgrade). See
[Shipped outside the plan-of-record](#shipped-outside-the-plan-of-record-since-2026-05-07)
below for the full list.

Wave 1 is now closed (P0.1 ✅, P0.3 ✅, P2.1 ✅, P2.2 ✅, P2.5 🔧
partial — `lang=` follow-on deferred). Next pull should be from
**Wave 2 (remaining: P0.4)** or, if a low-effort visible win is
preferred, the Wave 3 reading-surface item **P1.10** (empty/error/loading states, S-lift). **P1.3** (home page research dashboard) shipped 2026-05-18. The 2026-05-07 PM call to reduce WIP from four themes to one
was satisfied by 2026-05-15.

---

## Shipped outside the plan-of-record (since 2026-05-07)

These landed in the 11 days after the platform review but were not on
the roadmap's wave plan. Listed for honest accounting (Rule 12) and
because several materially change what's left to do in the planned
waves — most notably, P3.4 (document evidence as first-class object)
is now substantially groundwork-complete via the article pipeline,
and Wave 3's P1.3 / P1.9 reading-surface work has unplanned overlap
with the home-page ribbon, hover-cards, and relationship strip.

| Item | Plan | Notes |
|---|---|---|
| **GEDCOM 5.5.1 → 7.0.18 upgrade** | [plan](./superpowers/plans/2026-05-17-gedcom-7-upgrade.md) | Parser swap to vendored `js-gedcom`; v7 EXID + DATE.PHRASE conventions. Superseded the pre-emptive `GEDCOM normalize layer` row from the old Now band. Unblocks P3.4 features that need richer source/event metadata. |
| **Multilingual support — Plans 1, 2, 3** | [1](./superpowers/plans/2026-05-17-multilingual-support-plan-1-foundation.md) · [2](./superpowers/plans/2026-05-17-multilingual-support-plan-2-chrome-translations.md) · [3](./superpowers/plans/2026-05-17-multilingual-support-plan-3-translation-pipeline.md) | `next-intl` + `[locale]` routing + ru/uk/he chrome translations + per-locale article pipeline (`wai i18n status` / `wai i18n sync`, translation banner). Hebrew renders RTL. **Implication:** the deferred `lang=` work in P2.5 is now a natural follow-on with real surface to attach to. |
| **Sex-aware translation pipeline** | (no standalone plan) | `sex` field on every `DerivedRecord` threaded through `wai i18n sync` so translations use gendered past-tense forms. Was the last item in the old Now band; merged as PR #10. |
| **Author/attribution frontmatter** | (no standalone plan; PR #11) | New `author:` PageMeta field for LLM model name. Made `editors[]` optional. Closes the data-model half of P1.2. |
| **Article pipeline — Plans 1, 2, 3** | [1](./superpowers/plans/2026-05-10-article-pipeline-plan-1-foundation.md) · [2](./superpowers/plans/2026-05-10-article-pipeline-plan-2-author-core.md) · [3](./superpowers/plans/2026-05-10-article-pipeline-plan-3-cohort-review.md) | Evidence-drawer commands (`wai narrative`, `wai transcribe`, `wai interview`), `wai author <slug>` orchestrator, `wai author --cohort`, `wai revert`, `wai history`. Materially advances P3.4 (document evidence) and reframes how P3.1 (research frontier) would be operationalized. |
| **Quality checks Pass 2** | [plan](./superpowers/plans/2026-05-18-quality-checks-pass-2.md) | 4 new `wai check` detectors (NameTranDrift, StaleCanonicalSha — surfaced 534 real stale translations on first run, InfoboxNameDrift, PipelineFrontmatterDrift). + DerivedRecord schema at write boundary + 5-layer frontmatter-drift defense. |
| **Cross-page consistency detector** | [plan](./superpowers/plans/2026-05-16-cross-page-consistency-detector.md) | Talk-page-vs-live-page quoted-claim drift detector — catches the Boris/Kelman mix-up class of error. |
| **Wikilink hover-cards** | [plan](./superpowers/plans/2026-05-16-wikilink-hover-cards.md) | 200ms-delayed page preview on hover; portrait + dates + lead, precomputed at SSR. Overlaps P1.3 / P1.9 reading-surface work. |
| **"This day in family history" ribbon** | [plan](./superpowers/plans/2026-05-16-this-day-in-family-history-ribbon.md) | Home-page almanac — today's births / deaths / marriages from the tree. Partial overlap with P1.3. |
| **Relationship strip on person pages** | [plan](./superpowers/plans/2026-05-16-relationship-strip-on-person-pages.md) | "Your <relation>" subtitle below every person-page H1, computed server-side from SELF_RECORD. |
| **`wai doctor` + actionable connection errors** | [plan](./superpowers/plans/2026-05-09-wai-doctor.md) | Single command for dev-env diagnostics; `ConnectionError` with port-probe hint replaces `fetch failed`. Surfaced from P0.2 verification papercuts. |
| **Conflict-resolution schema** | (no standalone plan) | Listed for completeness — fully tracked as P1.5 ✅ in Wave 2 below. |
| **Red-links flow** | (no standalone plan) | Listed for completeness — fully tracked as P2.2 ✅ in Wave 1 above. |
| **Commit-slicing pass** | [plan](./superpowers/plans/2026-05-16-commit-slicing.md) | One-off slicing of ~49 uncommitted files into 13 focused commits. Led directly to CLAUDE.md Rule 13 (commit at logical units). |

> **PM read on the unplanned work:** the bulk of it is content/quality
> infrastructure (article pipeline, multilingual, drift detectors,
> GEDCOM 7) — not new reader-facing features. The reader-facing
> exceptions (hover-cards, relationship strip, ribbon) are small
> drive-bys, not strategy shifts. The plan-of-record's overall
> sequencing (Waves 3–5 next) is still the right call; the unplanned
> work strengthens the foundation those waves sit on rather than
> redirecting them.

---

## Next (post-review sprint, ≈ 6 weeks)

Endorses the platform review's [Suggested Sequencing](./reviews/2026-05-07-platform-review.md#suggested-sequencing).
The order below is the plan-of-record; deviations should be argued in
the talk page of the relevant plan, not silently re-ordered.

### Wave 1 — Hotfixes (week 1)

| Status | Item | Lift | Source |
|---|---|---|---|
| ✅ shipped | **P0.1** Strip removed CLI commands from `plugins/whoami/CLAUDE.md` and `agents/editor.md`; add eval smoke test for prompt/CLI drift | S | [Review §P0.1](./reviews/2026-05-07-platform-review.md#p01--agent-prompts-reference-removed-cli-commands) — *Shipped 2026-05-17. Prompts now document the full agent-facing surface (added `author`, `narrative`, `transcribe`, `interview`, `grep-claims`, `redlinks`, `delete`, `note --kind`); pre-existing stale `--include` flag references in editorial-guide also fixed; smoke test at `cli/test/prompt-drift.test.ts` extracts every `wai <cmd>` and `--flag` from the prompts and asserts each is a live CLI surface element.* |
| ✅ shipped | **P0.3** Flag slash-date ambiguity in `core/src/family/dates.ts`; add `wai audit dates`; render `?` glyph in infobox | S | [Review §P0.3](./reviews/2026-05-07-platform-review.md#p03--slash-date-ambiguity-is-unresolved) — *Shipped 2026-05-17. Detection already existed in `core/src/format/dates.ts` (`normalizeDate` returns `{ ambiguous: true }` for m/d/y vs d/m/y when both ≤ 12) and the infobox `?` glyph at `frontend/components/directives/infobox-person.tsx:180-196` was already wired; this PR closed the remaining gap by adding the **`wai audit dates`** CLI command — a pure `core/src/checks/ambiguous-dates.ts` scanner over the GEDCOM source, derived YAMLs, and page prose, plus a thin CLI wrapper that groups hits by source and exits non-zero on any find. Current user data has zero hits, so the command lands as a forward-looking guardrail for the next batch of raw input.* |
| ✅ shipped | **P2.1** Move citation directives to design tokens; verify dark-mode contrast | S | [Review §P2.1](./reviews/2026-05-07-platform-review.md#p21--citation-directives-are-visually-disconnected-and-dark-mode-broken) — *Shipped 2026-05-18. The strict "move citation directives off hardcoded `text-slate-600` / `bg-slate-50` / `border-blue-300`" half had already landed in commit `3f300e0` (`bg-muted` + `text-muted-foreground` + `border-s-border` / `border-s-primary` on `cite-vault.tsx` and `cite-message.tsx`); the roadmap row was never flipped. This PR closes the "verify dark-mode contrast" half (`text-muted-foreground` on `bg-muted` ≈ 6.5:1 against `--card` in dark mode — passes WCAG AA) and adds `dark:[&>svg]:text-{yellow,green,red,amber}-400` variants to `admonition.tsx` — the `-600` light-mode hues were borderline (3.9–4.7:1) on the dark card background. Adjacent violet quote-accent borders in `blockquote` / `dialogue` are mid-luminance and pass in both modes — left alone. Closes Wave 1.* |
| 🔧 partial | **P2.5** Accessibility hotfix bundle: skip-to-content, alt text on portraits/avatars, `lang=` on multilingual name spans | S | [Review §P2.5](./reviews/2026-05-07-platform-review.md#p25--accessibility-gaps) — *Skip-to-content link landed 2026-05-15 (`frontend/app/layout.tsx`); alt text was already correct via `AvatarMonogram`'s `alt=""` + `aria-hidden`. `lang=` on multilingual name spans still deferred — natural follow-on now that the multilingual pipeline (Plans 1–3) is live and per-locale name renders exist.* |
| ✅ shipped | **P2.2** Red-links flow (`wai redlinks` + `/api/redlinks` + `core/src/pages/redlinks.ts`) | S | [Review §P2.2](./reviews/2026-05-07-platform-review.md#p22--red-links-exist-but-offer-no-creation-flow) — *Shipped 2026-05-09 in commit `839a714`. Surfaces the want-list of unwritten articles for `wai author --cohort missing` and for human selection of the next page to write.* |

> **Wave 1 status (2026-05-18):** closed. P0.1, P0.3, P2.1, P2.2 all
> ✅; P2.5 🔧 partial (skip-to-content + alt text shipped; per-locale
> `lang=` deferred as a natural follow-on now that the multilingual
> pipeline is live). Pull from Wave 2 (**P0.4**) next.

### Wave 2 — Privacy & schema groundwork (weeks 2–3)

| Status | Item | Lift | Source |
|---|---|---|---|
| ✅ shipped | **P0.2** Living-person privacy gate (`RESN` parsing, age heuristic, `derived.privacy`, search default-filter, `wai export --redact-living`, frontmatter `restricted: bool`) | M | [Review §P0.2](./reviews/2026-05-07-platform-review.md#p02--no-living-person-privacy-gate) — *Shipped 2026-05-15 across four sub-items: (1) deriver `Privacy { restricted, reason }` from RESN + 110-year living heuristic; (2) `wai search` privacy filter with `--include-living` opt-in; (3) `wai export --redact-living` standalone; (4) frontend `RestrictedNotice` gating in the renderer. Pages-export and `lang=` opt-back-in deferred. Gate is currently disabled by default via `WHOAMI_PRIVACY_GATE` env flag for development; user will re-enable.* |
| ✅ shipped | **P1.5** Conflict-resolution schema (focal-person view) | M | [Review §P1.5](./reviews/2026-05-07-platform-review.md#p15--no-conflict-resolution-schema-in-the-data-model) — *Shipped 2026-05-09 in commit `a8ff233`. `core/src/family/conflicts.ts` + `frontend/components/family/sections/conflicts-section.tsx` surface disagreeing sources on the focal person. Gates P3.2 (source-criticism mode); unblocks remaining P1 data-model items.* |
| ✅ shipped | **P0.4** Resolve Ancestry `_APID` codes to source titles; surface `sources_unresolved`; add source-coverage metric to Coverage section | M | [Review §P0.4](./reviews/2026-05-07-platform-review.md#p04--source-coverage-in-derived-records-is-sparse) — *Partial close 2026-05-19. The v7 upgrade (May 2026) made recommendations #1 and #2 moot: `_APID` → standard `EXID` in v7, all 18 top-level SOUR records in the corpus already carry `TITL`, and an empirical audit found 0 individuals with nested-only sources (the deriver isn't missing any joinable citations). What ships now is recommendation #3 — the source-coverage metric: `frontend/lib/family.ts` gains a `sourceCoverage: { cited, total }` field on `CoverageView`, computed by counting ancestors whose `DerivedRecord.sources` is non-empty against `knownTotal` (no extra I/O — uses the already-loaded records map). `CoverageSection` renders a sibling line under `knownOfPossible`: e.g. "29 / 126 known" + "8 / 29 cited (28%)" — same visual density. i18n in all 4 locales. Surfaces the genuine 77% (158/203) uncited gap in the data so it becomes actionable instead of invisible.* |

### Wave 3 — Reading & discovery surface (weeks 3–4)

| Status | Item | Lift | Source |
|---|---|---|---|
| ✅ shipped | **P1.2** Article freshness/attribution metadata strip | S | [Review §P1.2](./reviews/2026-05-07-platform-review.md#p12--no-article-freshness-or-agent-attribution) — *Shipped iteratively across 2026-05-07 → 2026-05-17. `frontend/app/[locale]/[slug]/page.tsx:131-180` renders a uppercase mono strip below the title with `created`, `author:` (LLM model name from PR #11 `author-attribution`), `editors:`, `GEDCOM snapshot`, source count, live note count, and open-gap count — exactly the seven facts the review asked for. Closes the "core epistemic question" identified in the review.* |
| ✅ shipped | **P1.3** Home page → research dashboard (frontier, recently revised, editorial gaps, unwritten pages, A–Z relegated to `/index`) | S | [Review §P1.3](./reviews/2026-05-07-platform-review.md#p13--home-page-is-a-bare-directory-listing) — *Shipped 2026-05-18. Home page is now a five-card dashboard: hero stats, on-this-day ribbon (added 2026-05-16), continue-research frontier, editorial gaps (top 5 articles by unresolved `::open` + `::gap` thread count), recently revised, unwritten pages (top 5 redlink targets). A–Z articles + talk-pages grids moved to `/index`; full redlinks listing at `/redlinks`. Pure aggregator in [`core/src/pages/talk-threads.ts`](../core/src/pages/talk-threads.ts) (`aggregateOpenGaps`); cached fan-out readers in [`frontend/lib/server-services.ts`](../frontend/lib/server-services.ts). Spec: [`2026-05-18-home-research-dashboard-design.md`](./superpowers/specs/2026-05-18-home-research-dashboard-design.md). Plan: [`2026-05-18-home-research-dashboard.md`](./superpowers/plans/2026-05-18-home-research-dashboard.md).* |
| ✅ shipped | **P1.9** Talk-page surfacing in article header | S | [Review §P1.9](./reviews/2026-05-07-platform-review.md#p19--talk-pages-are-invisible-to-readers) — *Shipped 2026-05-18. Editorial `::open`/`::closed`/`::superseded`/`::gap` threads from the talk page now render inline as collapsible cards in a new "Editorial discussion" section beneath the article body (open default-expanded, resolved default-collapsed). Pure parser in `core/src/pages/talk-threads.ts`; `frontend/components/talk-threads/threads-panel.tsx` renders as a server component with i18n in all 4 locales. The freshness-strip `countOpenGaps` now delegates to the shared parser, fixing a level-3-heading undercount the legacy regex had (`wartime-catastrophe` now reports 43 open gaps instead of 0). Talk page itself, restricted pages, and pages with no threads correctly skip the panel.* |
| ⏳ ready | **P1.10** Empty / error / loading states (skeletons, custom 404, GEDCOM-stale banner) | S | [Review §P1.10](./reviews/2026-05-07-platform-review.md#p110--empty--error--loading-states-are-bare) |

### Wave 4 — The tree itself (weeks 4–5)

| Status | Item | Lift | Source |
|---|---|---|---|
| ✅ shipped | **P1.1** Pedigree chart on `/family/tree` | M | [Review §P1.1](./reviews/2026-05-07-platform-review.md#p11--familytree-is-a-list-not-a-tree) — *Shipped 2026-05-18. Interactive ancestor chart at the top of `/family/tree`, replacing the list-only layout. Pure layout function in `core/src/family/pedigree-layout.ts` (~95 lines, no `d3-hierarchy` dep) feeds React Flow (`@xyflow/react` v12.10.2); mobile falls back to a stacked generations list. The "tree, with directories below it" reframing the review asked for. Plan deviates from review's "use SVG, not a heavy lib" recommendation; the trade-off is React Flow's built-in pan/zoom/keyboard/touch in exchange for ~80 KB gzipped on a route-level chunk.* |
| ⏳ ready | **P1.8** Breadcrumbs from relationship-calc path | S | [Review §P1.8](./reviews/2026-05-07-platform-review.md#p18--no-breadcrumbs-or-wayfinding-inside-the-tree) |
| ⏳ ready | **P1.4** Search facets (place + decade); promote [`search-facets` plan](./superpowers/plans/2026-05-03-search-facets.md) follow-on | M | [Review §P1.4](./reviews/2026-05-07-platform-review.md#p14--search-lacks-faceting-and-reads-as-flat) |

### Wave 5 — Schema reach (week 6)

| Status | Item | Lift | Source |
|---|---|---|---|
| ⏳ ready | **P1.6** Half/step/adoptive distinctions (`PEDI`/`ADOP` parsing; `relation` field on parent/child entries; relationship-label generator updates) | M | [Review §P1.6](./reviews/2026-05-07-platform-review.md#p16--no-halfstepadoptive-distinction) |
| ⏳ ready | **P1.7** Media as first-class object (`media[]` schema, evidence infobox section, restore `@O24@`-style import) | M | [Review §P1.7](./reviews/2026-05-07-platform-review.md#p17--photo--document-evidence-are-decoupled-from-records) |

---

## Later (accepted, unscheduled)

### P2 polish (six P2 items remain after Wave 1)

| Item | Lift | Source |
|---|---|---|
| **P2.3** Merge overlapping residence/occupation intervals in derive | S | [Review §P2.3](./reviews/2026-05-07-platform-review.md#p23--place-residence-overlaps-not-deduplicated) |
| **P2.4** Decide CLI `--help` policy on the 13 removed v1 commands (revive on a date or move to `/docs/cli-v1-to-v2.md`) | S | [Review §P2.4](./reviews/2026-05-07-platform-review.md#p24--cli-help-carries-13-removed-commands-forever) |
| **P2.6** `wai recite --strict` warning mode for source typos and trailing-comma noise | S | [Review §P2.6](./reviews/2026-05-07-platform-review.md#p26--gedcom-source-typos--trailing-commas) |
| **P2.7** Mobile density on `/family/tree` (collapse Lifespans/Descendants by default `< sm`) | S | [Review §P2.7](./reviews/2026-05-07-platform-review.md#p27--mobile-density-on-the-tree-page) |
| **P2.8** Exercise the schema-migration registry with the first non-trivial migration (likely the `media[]` field from P1.7) | S | [Review §P2.8](./reviews/2026-05-07-platform-review.md#p28--schema-migrations-infrastructure-is-shipped-but-empty) |
| **P2.9** Sweep `frontend/` to swap `import Link from 'next/link'` → `import { Link } from '@/i18n/navigation'` per `frontend/AGENTS.md` hard rule. 17 of 19 components currently use plain `next/link`; the i18n wrapper preserves the active locale prefix and is the documented convention. Flagged during P1.3 cross-cutting review. | S | docs/superpowers/specs/2026-05-18-home-research-dashboard-design.md (P1.3 close-out notes) |
| **P2.10** Wrap dynamic Latin-script content (person names, slugs, GEDCOM IDs) in `<bdi>` across home-page sections and family-tree components. Per `frontend/AGENTS.md` RTL conventions, mixed-script inline text needs `<bdi>` isolation; in Hebrew (`/he`) the frontier card, recently-revised list, and several family-tree components render unisolated. P1.3's new gaps + redlinks cards were fixed; pre-existing sections remain. | S | docs/superpowers/specs/2026-05-18-home-research-dashboard-design.md (P1.3 close-out notes) |
| **P2.11** Hide the home-page browse-all footer's "Browse all N articles →" link when `live.length === 0` (mirror the existing pattern on the talk-pages link). Cosmetic; only triggers in an empty wiki. | XS | docs/superpowers/specs/2026-05-18-home-research-dashboard-design.md (P1.3 close-out notes) |
| **P2.12** Add `/[locale]/gaps` listing route (parallel to `/redlinks`) — full per-article unresolved-thread list sorted by count, with each `::open`/`::gap` thread heading rendered inline. Close the home-page asymmetry: the redlinks card's aggregate footer links to `/redlinks` but the gaps card's aggregate is informational-only because no listing exists yet. | S | docs/superpowers/specs/2026-05-18-home-research-dashboard-design.md (P1.3 close-out notes) |
| **P2.13** Strengthen `frontend/test/messages-parity.test.ts` to catch leftover English in non-English locale strings. The test currently checks only key shape; the P1.3 work shipped English placeholders in `Page.Index.ancestorsAcrossGenerations` + `articlesCount` to ru/uk/he that were caught only by manual cross-cutting review. Heuristics worth trying: flag plural blocks where every category arm is byte-identical; flag strings in a non-Latin-script locale that match `^[A-Za-z0-9 {}#,.]*$`. | S | docs/superpowers/specs/2026-05-18-home-research-dashboard-design.md (P1.3 close-out notes) |
| **P2.16** Bulk-backfill translated talk pages: 101 EN talk pages × 3 locales (ru, uk, he) = 303 `wai i18n sync` calls. Each call burns one `translate` + one `translate-talk` model invocation. Cost-estimate first against a 5-page sample; if affordable, run as a batch script. Re-syncs are idempotent (the `existingTalkTranslation` field on the request lets the agent preserve human edits), so re-running is safe. Depends on **P2.15** (now shipped, see below). | M | CHANGELOG B.2 entry — deployment step for the B.1/B.2 pipeline |

### Talk-page i18n track (Phase B — shipped outside the wave plan)

| Status | Item | Lift | Source |
|---|---|---|---|
| ✅ shipped | **P2.15** Make `frontend/lib/server-services.ts:readTalkBody` locale-aware (B.3 of the talk-page i18n pipeline) | S | CHANGELOG B.3 entry — *Shipped 2026-05-19. `readTalkBody(talkSlug, locale)` now reads `pages/{locale}/<slug>.talk.md` first and falls back to `pages/en/<slug>.talk.md` when missing. Call sites at `frontend/app/[locale]/[slug]/page.tsx` and `frontend/app/[locale]/family/tree/page.tsx` pass route locale; the inline Editorial-discussion panel on `/<locale>/<slug>` now reads the localized talk page. The `getCachedOpenGaps` home-page fan-out intentionally stays at EN since `::open` counts are structural and locale-invariant. New `readTalkBodyWithStore` DI export; 4 unit tests (locale=en, locale-hit, locale-miss→EN-fallback, neither-exists→empty). Closes P2.15.* |

### Pedigree-chart follow-ons (extends P1.1)

The pedigree chart shipped 2026-05-18 ([P1.1](#wave-4--the-tree-itself-weeks-45)).
Manual testing surfaced three follow-on sub-projects that together
deliver the "gap-as-frontier with talk-page candidate matching" idea —
foundational groundwork for [P3.1](#p3-strategic-bets-12-month-horizon)
(research frontier as central UI metaphor). Each ships independently;
F → T → D is the recommended order.

| Status | Item | Lift | Spec | Notes |
|---|---|---|---|---|
| ✅ shipped | **F** Chart frontier slots | S | [`pedigree-frontier-slots-design`](./superpowers/specs/2026-05-18-pedigree-frontier-slots-design.md) | *Shipped 2026-05-18 — recursive-midpoint layout now treats frontier slots as full leaves so asymmetric branches with detectable gaps spread spatially. Kinship labels in all 4 locales. Click navigates to descendant's tree; the research drawer (sub-project D) will later intercept the same click.* |
| ⏳ ready | **T** Talk-page candidates format + parser | M | (spec TBD when picked up) | `## Candidates` section convention in talk files; parser in `core/`; CLI surface (`wai candidates list <slug>`). Standalone data utility — no chart change required. **Ship second.** |
| ⏳ ready | **D** Research drawer | M | (spec TBD when picked up) | Side-panel Sheet opened on click of any chart node (present or frontier). Shows kinship, parsed candidates from T if shipped, action buttons (search wiki, note this as a question, open talk page). **Ship third — depends on F + benefits from T.** |

> **PM call:** F alone is a contained visual win that addresses the
> gap-as-frontier UX hole directly. T standalone provides a useful
> CLI surface for agents working on research backlog. D is where the
> three become more than the sum — the chart node becomes the entry
> point for active research, not just a view of state.

### P3 strategic bets (12-month horizon)

These are *reframings*, not improvements. **PM call: do not start any
P3 work before P0/P1 are largely closed.** Each one expands surface
area; surface area amplifies the gaps below it.

| Item | Lift | Source |
|---|---|---|
| **P3.1** Make the "research frontier" the central UI metaphor; agents evaluated on frontier reduction | L | [Review §P3.1](./reviews/2026-05-07-platform-review.md#p31--make-the-research-frontier-the-central-ui-metaphor) |
| **P3.2** Source-criticism mode (strength + confidence per fact); requires P1.5 + P1.7 | L | [Review §P3.2](./reviews/2026-05-07-platform-review.md#p32--source-criticism-mode) |
| **P3.3** Global navigable timeline (1850–2026 scrubber driving map + births/deaths/marriages) | L | [Review §P3.3](./reviews/2026-05-07-platform-review.md#p33--timeline-as-a-navigable-axis) |
| **P3.4** Document evidence as first-class object (`/evidence` route, OCR/transcription seam) | L | [Review §P3.4](./reviews/2026-05-07-platform-review.md#p34--document-evidence-as-a-first-class-object) |
| **P3.5** Cross-tree linking (signed-link reference between trees) | L | [Review §P3.5](./reviews/2026-05-07-platform-review.md#p35--cross-tree-linking) |
| **P3.6** Story spine per person (chronological event timeline alongside prose) | M | [Review §P3.6](./reviews/2026-05-07-platform-review.md#p36--story-spine-per-person) |
| **P3.7** DNA reconciliation slot (cM totals, common-ancestor projections) | M | [Review §P3.7](./reviews/2026-05-07-platform-review.md#p37--dna-reconciliation-slot) |
| **P3.8** Federation / encrypted off-site backup + selective sharing | L | [Review §P3.8](./reviews/2026-05-07-platform-review.md#p38--federation--remote-vault) |

---

## Parking lot

Bookmarked, not on the path. Each has an explicit triggering signal —
when that signal fires, the item moves to **Next**, not before.

| Item | Trigger | Source |
|---|---|---|
| Narrative ↔ GEDCOM round-trip (paste-to-vault flow) | User says "I want to paste raw research text and have it weave into the wiki" | [`narrative-to-gedcom`](./superpowers/plans/2026-05-03-narrative-to-gedcom.md) |
| Typed CLI/server contract module (Zod) | First contract-drift bug that costs > 30 min of debugging | [`cli-server-contract`](./superpowers/plans/2026-05-03-cli-server-contract.md) |
| Off-site backup ("Plan A") | After P0.2 ships — privacy gate is the prerequisite | (no plan file yet) |
| Re-add app-layer auth | Decision to share read-only access outside Tailscale | (no plan file yet; would change scope) |
| Wikitext → Markdown converter polish (Plan B) | If old MediaWiki content needs migrating again | [`wikitext-to-md-converter`](./superpowers/plans/2026-05-01-wikitext-to-md-converter.md) |

---

## Opinionated cuts (PM call, 2026-05-07)

These are deferrals or reductions I'd recommend on top of the platform
review's sequencing.

1. ~~**Reduce in-flight WIP from 4 themes to 1 by end of week.**~~
   **✅ Done 2026-05-15.** Conflicts and redlinks landed as separate
   commits (`a8ff233`, `839a714`); the GEDCOM normalize layer was
   absorbed into the full GEDCOM 7 upgrade; sex-aware translation
   shipped as PR #10; family-section refactor landed. P0.1 was then
   tackled on a clean tree and shipped 2026-05-17. The discipline
   of "land themes as separable commits" became CLAUDE.md Rule 13
   (commit at logical units).

2. **Reconcile the schema-migrations plan duplicate.** There are two
   files: `2026-05-03-schema-migrations.md` (sketch, "deferred") and
   `2026-05-04-schema-migrations.md` (the implementation that
   shipped). Delete the sketch or rename it to `*-design-notes.md`
   so there's no ambiguity about which is authoritative.

3. **Defer P3 entirely until at least Wave 4 ships.** Each P3 bet
   amplifies the surface area; doing them before P1.1 (a real tree)
   and P1.5 (conflict schema) means building on a base that will
   change underneath them.

4. **Promote `search-facets` follow-on to the same plan-of-record.**
   The current plan shipped *type* facets only; surname/decade/place
   are deferred. Wave 4 P1.4 absorbs that follow-on rather than
   spawning a new plan; update the existing plan in place.

5. **Don't write CLI v1 → v2 migration docs (P2.4) until something
   actually breaks for an external user.** This is solo-project; the
   13 removed-command stubs are technical debt with zero current
   readers. Move to Parking lot, not Later.

---

## Cadence and updates

- **Wave boundaries trigger an update.** When a wave completes,
  promote the next wave's items into closer-term review and update
  status icons across the doc.
- **Status icons:** ⏳ ready · 🚧 in flight · 🔧 closing · ✅ shipped · ❌ cancelled · 🅿️ parked.
- **Authority:** if this doc and an individual plan's status disagree,
  this doc is the planning source of truth and the plan is the
  implementation source of truth — fix whichever is stale.
- **Reviews:** treat `docs/reviews/YYYY-MM-DD-platform-review.md` as
  scheduled punctuation. The next one is due when Wave 4 closes or
  when the user senses drift.

---

## See also

- [`SCOPE.md`](./SCOPE.md) — what whoami.wiki is and isn't
- [`reviews/2026-05-07-platform-review.md`](./reviews/2026-05-07-platform-review.md) — the assessment this roadmap consumes
- [`superpowers/plans/README.md`](./superpowers/plans/README.md) — index of all plans, by status
- [`/CHANGELOG.md`](../CHANGELOG.md) — what has shipped and when
