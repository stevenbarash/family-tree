# Roadmap

> Strategic sequencing for whoami.wiki. Sourced from the
> [May 2026 platform review](./reviews/2026-05-07-platform-review.md)
> and the in-flight work in the current working tree.

**Last updated:** 2026-05-07
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

## Now (in working tree, week of 2026-05-04)

The current working tree has four overlapping themes. The PM read is
that this is **above healthy WIP** and the closing move should be to
land each theme as its own commit boundary, not a single mega-merge.

| Status | Item | Lift | Source | Notes |
|---|---|---|---|---|
| 🔧 closing | Note edit-history polish (byline spacing, dead branches) | S | [`research-notes-edits`](./superpowers/plans/2026-05-06-research-notes-edits.md) | Implementation has shipped over 2 weeks; closing the last fixes (commit `1e1ac7b`). **Recommend: tag and call done.** |
| 🚧 in flight | **P1.5** Conflict-resolution schema | M | [Review §P1.5](./reviews/2026-05-07-platform-review.md#p15--no-conflict-resolution-schema-in-the-data-model) | New: `core/src/family/conflicts.ts`, `frontend/components/family/sections/conflicts-section.tsx`. Land this first — it gates every other P1 data-model item. |
| 🚧 in flight | **P2.2** Red-links flow | S | [Review §P2.2](./reviews/2026-05-07-platform-review.md#p22--red-links-exist-but-offer-no-creation-flow) | New: `cli/src/commands/redlinks.ts`, `frontend/app/api/redlinks/`, `core/src/pages/redlinks.ts`. Self-contained; can ship as its own PR after conflicts. |
| 🚧 in flight | GEDCOM normalize layer | S | n/a (pre-emptive) | New: `core/src/gedcom/normalize.ts`, `core/test/gedcom/normalize.test.ts`. Likely the foundation for P0.3 (date ambiguity) and P2.3 (residence overlap merge). **Recommend: write a one-paragraph plan in `plans/` before merging — what is this for?** |
| 🚧 in flight | Family-section refactor (descendants, family, lifespans, infobox-shell) | S–M | n/a | Multiple frontend section components touched. Looks like UX iteration; **recommend bundling into a single `feat: refactor family sections` commit and noting motivation in the message** so it isn't archaeology later. |
| 🚧 in flight | **Sex-aware translation pipeline** | S | n/a (sub-item of multilingual support) | Pipeline shipped on `feat/sex-aware-translation`: `sex` field exposed on every `DerivedRecord` from the GEDCOM `SEX` tag, threaded through `wai i18n sync` to the translator prompt so future translations pick gendered past-tense verbs correctly (`родилась`/`נפטרה` for female subjects instead of masculine-default). **What remains:** (a) 2 GEDCOM SEX-tag duplicates in `barash-tree.ged` need dedupe (lines 142, 294 — explicit user authorization required); (b) the 23 already-translated articles need re-sync to pick up the new gendered forms (`wai i18n sync <slug> <locale>` for each); (c) consider Sex-aware ICU `select` on `messages/*.json` strings that currently default masculine. |

> **PM call:** WIP is the single biggest risk in the current branch.
> Land conflicts → redlinks → normalize → family-sections as separable
> commits this week. Do **not** start a new theme until the working
> tree is empty.

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
| ⏳ ready | **P2.1** Move citation directives to design tokens; verify dark-mode contrast | S | [Review §P2.1](./reviews/2026-05-07-platform-review.md#p21--citation-directives-are-visually-disconnected-and-dark-mode-broken) |
| ⏳ ready | **P2.5** Accessibility hotfix bundle: skip-to-content, alt text on portraits/avatars, `lang=` on multilingual name spans | S | [Review §P2.5](./reviews/2026-05-07-platform-review.md#p25--accessibility-gaps) |

> **P0.1 is the highest-priority single item in the project.** The
> agent loop is the user's primary loop; it is currently broken. Do
> this before anything else, including landing the in-flight WIP.

### Wave 2 — Privacy & schema groundwork (weeks 2–3)

| Status | Item | Lift | Source |
|---|---|---|---|
| ✅ shipped | **P0.2** Living-person privacy gate (`RESN` parsing, age heuristic, `derived.privacy`, search default-filter, `wai export --redact-living`, frontmatter `restricted: bool`) | M | [Review §P0.2](./reviews/2026-05-07-platform-review.md#p02--no-living-person-privacy-gate) — *Shipped 2026-05-15 across four sub-items: (1) deriver `Privacy { restricted, reason }` from RESN + 110-year living heuristic; (2) `wai search` privacy filter with `--include-living` opt-in; (3) `wai export --redact-living` standalone; (4) frontend `RestrictedNotice` gating in the renderer. Pages-export and `lang=` opt-back-in deferred. Gate is currently disabled by default via `WHOAMI_PRIVACY_GATE` env flag for development; user will re-enable.* |
| 🚧 carry-over | **P1.5** Conflict-resolution schema (continues from Now) | M | [Review §P1.5](./reviews/2026-05-07-platform-review.md#p15--no-conflict-resolution-schema-in-the-data-model) |
| ⏳ ready | **P0.4** Resolve Ancestry `_APID` codes to source titles; surface `sources_unresolved`; add source-coverage metric to Coverage section | M | [Review §P0.4](./reviews/2026-05-07-platform-review.md#p04--source-coverage-in-derived-records-is-sparse) |

### Wave 3 — Reading & discovery surface (weeks 3–4)

| Status | Item | Lift | Source |
|---|---|---|---|
| ⏳ ready | **P1.2** Article freshness/attribution metadata strip | S | [Review §P1.2](./reviews/2026-05-07-platform-review.md#p12--no-article-freshness-or-agent-attribution) |
| ⏳ ready | **P1.3** Home page → research dashboard (frontier, recently revised, open gaps) | S | [Review §P1.3](./reviews/2026-05-07-platform-review.md#p13--home-page-is-a-bare-directory-listing) |
| ⏳ ready | **P1.9** Talk-page surfacing in article header | S | [Review §P1.9](./reviews/2026-05-07-platform-review.md#p19--talk-pages-are-invisible-to-readers) |
| ⏳ ready | **P1.10** Empty / error / loading states (skeletons, custom 404, GEDCOM-stale banner) | S | [Review §P1.10](./reviews/2026-05-07-platform-review.md#p110--empty--error--loading-states-are-bare) |

### Wave 4 — The tree itself (weeks 4–5)

| Status | Item | Lift | Source |
|---|---|---|---|
| ⏳ ready | **P1.1** Pedigree chart on `/family/tree` (SVG, ~200 lines) | M | [Review §P1.1](./reviews/2026-05-07-platform-review.md#p11--familytree-is-a-list-not-a-tree) |
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

1. **Reduce in-flight WIP from 4 themes to 1 by end of week.** Land
   conflicts, redlinks, normalize, and family-sections as separate
   commits. Don't start P0.1 until the tree is clean — even though
   P0.1 is the highest-priority single item, doing it on top of an
   already-busy tree turns the hotfix into a merge problem.

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
