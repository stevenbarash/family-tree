---
title: whoami.wiki — Platform Review
subtitle: PM / UX / Genealogy Expert Assessment
date: 2026-05-07
author: Review prepared from a full-codebase walkthrough
---

# whoami.wiki — Platform Review

**Date:** 2026-05-07
**Scope:** code at `/Users/nyetwork/dev/whoami` and live data at `/Users/nyetwork/whoami`
**Lenses:** product management, UX, professional genealogy research

---

## Executive Summary

whoami.wiki is an architecturally confident project that punches well above its weight in three places: **GEDCOM parsing rigor**, **historical place-name handling**, and **prose quality** in finished articles. The pure-`core/` boundary, the LCA-based relationship calculator, and the recent edit-history reconstructor (`core/src/pages/research-notes-history.ts`) are the work of someone who knows what they are doing.

The platform's gaps fall into three buckets, ordered by severity:

1. **Correctness debt that will break the agent loop.** Agent prompts in `plugins/whoami/CLAUDE.md` and `plugins/whoami/agents/editor.md` instruct authors to use CLI commands (`wai task`, `wai source`, `wai snapshot`, `wai talk`) that the v2 markdown migration removed. Agents acting on those prompts will hard-fail. This is the single highest-value fix.
2. **Genealogy data model can't represent the messy realities of the family being documented.** No half/step/adoptive distinctions, no conflict-resolution schema, no living-person privacy gate, no source-strength model. For a Jewish Eastern European tree shaped by remarriage, evacuation, and lost archives, these are not edge cases — they are the median case.
3. **The reading and discovery surface understates the data underneath.** The route called `/family/tree` is a vertical list of cards; the home page is a bare directory; search is unfaceted; articles have no freshness, attribution, or "how was this written" surface; mobile is dense. None are blockers, but together they make the wiki feel like a draft of itself.

The recommendations below are organized by priority (P0–P3), each with a concrete observation, the impact, and the smallest action that would move it. Quick wins are flagged inline.

---

## What's Working Well

Worth naming explicitly so we don't refactor things that aren't broken:

- **`core/` boundary discipline.** Pure logic in `core/src/family/{relationship,cohort,dates,descendants,timeline,places}.ts`; tests pass `Map<string, DerivedRecord>` rather than reading files. This is unusually clean for a Next.js-adjacent codebase.
- **GEDCOM defensive parsing** in `core/src/gedcom/parser.ts` — UTF-8-only, version-gated to 5.5.x, fallback support for parse-gedcom 0.1.x and 2.x, twelve tags extracted with deterministic mapping.
- **Date qualifier parsing** in `core/src/family/dates.ts` correctly handles `BET/BETWEEN`, `ABT/ABOUT/EST/CIRCA`, `BEF/BEFORE`, `AFT/AFTER`. This is the part most hobbyist tools get wrong.
- **Place-name historical drift** in `/Users/nyetwork/whoami/genealogy/places-coords.yml` is professional-grade gazetteer work. The Krumbach commentary alone (three towns share the name) shows the curator thinking like an archivist.
- **Multi-alphabet name handling** in finished articles (Hebrew, Russian, Yiddish, Ukrainian variants for the same person) acknowledges that Soviet-era names have no single "correct" spelling.
- **Eval suite is mature** — nine graders, mix of rule-based and LLM-assisted, weighted across quality / content / mechanics.
- **Note edit-history reconstructor** is elegant: a pure function from a sequence of git versions to a per-note event log.
- **Privacy posture by infrastructure (Tailscale ACLs).** This is the right call for a single-user wiki and removes a whole class of auth bugs.

---

## Methodology

I read the AGENTS.md files for each package, walked the App Router routes, opened representative components for the article reader, infobox, tree, and search, traced the `wai` CLI surface, read the editorial guide and agent prompts, opened two finished articles end-to-end, and inspected a sample of derived records, the places-coords file, the research-plans directory, and the GEDCOM audit doc. The current GEDCOM contains 202 derived individuals with 114 wiki pages and four portrait images. Recent plans (last ~10) cluster around research-notes editing, schema migrations, search facets, family timeline/places/portraits, and the CLI-server contract.

---

## P0 — Critical (Correctness, Privacy, Loop Integrity)

### P0.1 — Agent prompts reference removed CLI commands

**Observation.** `plugins/whoami/CLAUDE.md` and `plugins/whoami/agents/editor.md` repeatedly instruct agents to use `wai task`, `wai source list`, `wai search source`, `wai snapshot`, and `wai talk`. The CLI in `cli/src/index.ts` lists exactly these commands as removed in the v2 markdown migration with the message "not yet supported."

**Impact.** This is the agent loop's primary failure mode. Any agent that follows the editor prompt will issue commands the CLI explicitly rejects. The eval suite's tool-usage grader will penalize the agent for "wrong" usage that the prompt itself directed. From a PM lens this is a credibility-on-fire bug — the editorial onboarding teaches agents the wrong CLI.

**Recommendation.** Treat this as a hotfix:
1. Strip removed-command references from `plugins/whoami/CLAUDE.md` and `agents/editor.md` (the source/task/snapshot/talk workflows). Replace with the v2 surface: `read`, `write`, `create`, `edit`, `note`, `search`, `sync-gedcom`, `recite`.
2. Update the editor's "post intent to talk page before starting" instruction to use `wai note <slug>.talk --as-agent --kind intent` (or whatever the actual flag set is — the README and editor.md disagree about whether `intent` is a kind).
3. Add a CLI smoke test in evals that fails the build if any prompt references a removed command name.

**Quick win:** the prompts can be edited in one sitting; the smoke test is ~30 lines.

### P0.2 — No living-person privacy gate

**Observation.** No GEDCOM `RESN` (restriction notice) parsing in `core/src/gedcom/parser.ts`. The 12 tags it derives do not include privacy markers. Steven Barash (b. 1998, age 27) and family appear with full birthplaces, parents, siblings, and even an iMessage archive summary on the mother's page.

**Impact.** The wiki is private *by deployment* (Tailscale ACLs, local-first). But the **derived YAML, the GEDCOM, the search index, and the assets folder are all data-at-rest with no living-person flag**. If any of them is shared, exported, backed up to a third party, or accidentally pushed to a public repo, the entire living roster goes with it. The "stranger test" in `AGENTS.md` is the right framing; the data does not pass it for living persons.

**Recommendation.**
1. Parse `RESN` and a `living: true|false` heuristic (no death record + birth within ~110 years) in the derive pipeline. Surface as `derived.privacy: { restricted: bool, reason: string }`.
2. In `core/src/search/index.ts` and the `cli/src/commands/search.ts` path, default to filtering restricted records unless an explicit `--include-living` flag is passed.
3. Add an "export safety" command (`wai export --redact-living`) that emits a copy of the data tree with restricted records reduced to `{ name initials, birth year only, parents redacted }`.
4. In the article renderer, gate the infobox and prose if frontmatter has `living: true`. The current `frontmatter.deletedAt` slot in `core/src/pages/schema.ts` is the right precedent — add `restricted: boolean`.

This is a gate that will pay back the moment any kind of sharing or off-site backup becomes real (Plan A in the bookmarked plans).

### P0.3 — Slash-date ambiguity is unresolved

**Observation.** The audit document `/Users/nyetwork/whoami/research-plans/gedcom-audit-2026-05-03.md` (lines 79–92) flags records containing `17/09/1923` and `9/7/1997` whose interpretation depends on locale (DD/MM vs MM/DD). Date parsing in `core/src/family/dates.ts` reduces to year only, so the bug is hidden today, but as soon as month/day precision is added (and it should be added — see P1.7) the wrong dates will surface.

**Impact.** Silent data corruption with no diagnostic. Family events documented as "Sept 17" become "July 9" or vice versa without the reader ever seeing a flag.

**Recommendation.**
1. In `core/src/family/dates.ts`, treat any `DD/MM/YYYY`-looking date with both fields ≤12 as ambiguous; emit `{ year, month: null, day: null, ambiguous: true, sourceText }` rather than guessing.
2. Add a `wai audit dates` command that lists all ambiguous dates with their pages, so the user can disambiguate manually and patch the GEDCOM source.
3. Display ambiguous dates in the infobox with a small `?` glyph and a tooltip ("Date ambiguous — could be Sept 17 or July 9").

### P0.4 — Source coverage in derived records is sparse

**Observation.** Of 202 derived records, ~157 have empty `sources: []`. Articles like `clara-barash.md` cite Yad Vashem record 9809589 in prose; the Barash family page cites Pamyat Naroda — but the derived layer carries the Ancestry `_APID` opaque identifiers without human labels. The eval suite has a citations grader and a source-criticism grader, both of which see thin material.

**Impact.** From a genealogy-research perspective, 78% un-cited individuals is not a finished tree — it is a draft tree with an excellent prose layer hiding the gap. From an eval perspective, citation density scores will plateau because the source pool is shallow.

**Recommendation.**
1. Resolve Ancestry `_APID` codes to human-readable source titles during derivation. The GEDCOM has these — they're just not joined.
2. Add a `sources_unresolved: ['@S1438116790@']` field so unresolved citations are visible (and gradeable) rather than discarded.
3. Surface a "source coverage" metric in the `/family/tree` Coverage section alongside the existing generation/frontier counts. People will fix what they can see.

---

## P1 — High (Workflow, Discovery, Reading)

### P1.1 — `/family/tree` is a list, not a tree

**Observation.** `frontend/app/family/tree/page.tsx` composes seven sections (header, family, coverage, places, lifespans, descendants, lineage). Every section is a vertical DOM list. There is no graph visualization — no horizontal pedigree chart, no descendant tree, no fan chart. The map and lifespan bars are visualizations; the relationships themselves are not.

**Impact.** The route name promises a tree; the page renders a directory. New visitors will read the page expecting to see structure and instead see prose. Existing users navigate by clicking person rows — which is fine for browsing, but the spatial intuition that a tree gives ("where is this person in the family?") is missing. This is the single biggest UX gap.

**Recommendation.** Pick *one* graph view to ship and resist the temptation to ship three:
- **Pedigree chart** (ancestors of the current person, 4–6 generations, fan or rectangular). This is what most readers reach for.
- Use SVG, not a heavy lib. The chart is a fixed shape; D3 hierarchy + SVG is ~200 lines.
- Click a node = navigate to that person's tree page; long-press / right-click = open article.
- On mobile, collapse to a vertical list — keep what works.

A pedigree chart above the existing sections re-frames the page from "directory" to "tree, with directories below it." Same data, dramatically different mental model.

### P1.2 — No article freshness or agent attribution

**Observation.** Articles render through `frontend/lib/render.tsx` with no metadata strip. There is no "last updated," no "edited by Claude Code on 2026-05-04," no schema version, no source-document count. The frontmatter has `editors[]`, `created`, and `gedcom.snapshot` fields (`core/src/pages/schema.ts`), but the renderer doesn't surface them.

**Impact.** A reader cannot tell whether the article is two days old or two months old, whether the agent that wrote it had access to the current GEDCOM snapshot, or whether the prose is grounded in 30 sources or three. For an agent-authored wiki this is the *core epistemic question*. From a PM lens: this is the difference between "Wikipedia-ish thing" and "research instrument."

**Recommendation.** Add a thin metadata strip below the title:

```
Last revised by claude-opus-4-7 · 2026-05-04 · GEDCOM snapshot 2026-05-02 · 14 sources cited · talk page (3 open gaps)
```

Each token is a link or affordance. "Talk page (3 open gaps)" is the one that compounds — it makes the talk-page system *visible* rather than hidden behind a naming convention.

### P1.3 — Home page is a bare directory listing

**Observation.** `frontend/app/page.tsx` is a 2-column grid of all pages with title + count, split into main and talk. No featured articles, no tree entry, no recent activity, no "research frontier."

**Impact.** First-time experience is "list of 114 files." For a single-user wiki this is fine for the user's working memory, but it actively wastes the wiki's narrative gravity. A returning user does not see "what changed since I was last here." A guest (over Tailscale) does not see "where to start reading."

**Recommendation.** Make the home page the dashboard:
1. **Hero**: "Steven's family tree — 202 individuals across 7 generations, 114 articles, 56% covered."
2. **Continue research**: top 3 entries from the Coverage frontier (missing-parent alerts) with one-line context. Already computed in `core/src/family/coverage.ts`.
3. **Recently revised**: last 5 articles by `frontmatter.editors[].at` or git mtime.
4. **Open gaps**: count of unresolved questions from talk pages (active gaps section per the editorial guide).
5. The full A–Z list moves below the fold or to `/index`.

This converts the home page from a phone book into a research console.

### P1.4 — Search lacks faceting and reads as flat

**Observation.** `frontend/app/search/page.tsx` returns up to 200 results with type tabs (person/family/event/tree/meta) and no other filters. The command palette is capped at 10 results. There is no autocomplete, no date filter, no place filter, no "people born between 1900 and 1950 in Ukraine."

**Impact.** Search is a discovery channel as well as a lookup channel. For a genealogy wiki, the user's queries are temporal and geographic by nature ("everyone in the Ostrów line," "deaths between 1941–1945"). A flat search forces the user to know the right name before searching.

**Recommendation.**
- Faceting plan already exists (`docs/superpowers/plans/2026-05-03-search-facets.md` — proposed). Promote it.
- Two facets that pay back fastest: **place** (with the existing places-coords gazetteer driving the dropdown) and **decade** (10-year buckets across birth/death dates).
- Command palette: lift the cap to 25 with "see all in /search."
- Add a `wai search --place "Kyiv" --born 1900..1950` CLI mirror for agent reuse.

### P1.5 — No conflict-resolution schema in the data model

**Observation.** The audit document flags Ann B Seplowitz with two birth dates (Apr 24 vs Apr 25, 1938) sourced to two different documents. The resolution path is "decision needed." Nothing in `core/src/gedcom/types.ts` or the derived YAML schema can hold "Source A says X, Source B says Y, current best estimate is Z."

**Impact.** Every genealogy researcher hits this within a month of starting. If the platform cannot represent conflict, the only place conflict can live is talk-page prose — invisible to the eval graders, invisible to search, invisible to the infobox, and invisible to whatever tool comes next.

**Recommendation.** Enrich the derived record's date/place/event slots with an evidence array:

```yaml
birth:
  best: { year: 1938, month: 4, day: 24, qualifier: null }
  evidence:
    - { value: "1938-04-24", source: "1950 US Census", weight: 0.7 }
    - { value: "1938-04-25", source: "Newspaper birth notice", weight: 0.6 }
  conflicts: true
```

Then: render a small "conflict — 2 sources disagree" indicator in the infobox; surface it in the Coverage frontier; let the article generation prompt cite the conflict explicitly. The data model change is small; the downstream payoff is large.

### P1.6 — No half/step/adoptive distinction

**Observation.** `core/src/family/cohort.ts` distinguishes full vs half siblings via "shared parents ≥2 → full, else half," but the *result* doesn't propagate to the derived record schema or the infobox. There is no place to record adopted-in, adopted-out, step-, foster, or godparent relationships. The GEDCOM has `PEDI` and `ADOP` tags that the parser ignores.

**Impact.** For Eastern European Jewish genealogy specifically — pogroms, the Shoah, Soviet evacuations, postwar remarriage — blended families are the rule, not the exception. The system as built renders second wives' children indistinguishable from first wives' children.

**Recommendation.**
1. Parse `PEDI` (birth, adopted, foster, sealing) and `ADOP` (adoption events) in `core/src/gedcom/parser.ts`.
2. Add `relation: 'birth' | 'adopted' | 'step' | 'foster' | 'godchild'` to parent/child entries in `DerivedRecord`.
3. In the infobox, render half-siblings as "half-sister (mother's side)" rather than the same word as full siblings.
4. The relationship label generator (`core/src/family/relationship.ts`) should produce "step-grandmother," "half-aunt twice removed," etc.

### P1.7 — Photo & document evidence are decoupled from records

**Observation.** Four portraits exist for 202 individuals (~2% coverage). The derived record schema has no `photos: []`, no `documents: []`, no `source_images: []`. The GEDCOM contains an orphaned media object `@O24@` ("Lenya_Ayzman") that did not survive ingestion. The infobox renders an avatar with initials when no portrait is present.

**Impact.** "Here is the 1942 Soviet evacuation list naming the Barash family; it proves X" is the canonical genealogy artifact. The platform has no place to put it. Agents cannot cite a scan; readers cannot see one. The portrait gap is the user-visible part of a deeper schema gap.

**Recommendation.**
1. Add `media: [{ kind: 'portrait'|'document'|'scan'|'audio', path, captured?, description, sources?: [] }]` to `DerivedRecord` and to the page frontmatter.
2. Wire into the article renderer as a "Documents & evidence" infobox section.
3. Restore the `@O24@`-style media import in the GEDCOM ingestor.
4. The portrait-coverage gap is then a first-class metric in the Coverage section and a frontier the user can chip away at.

This connects to citations (P0.4) — a citation can point to a `media` entry rather than just a string.

### P1.8 — No breadcrumbs or wayfinding inside the tree

**Observation.** Once on `/family/tree?person=X&from=Y` the user is in a graph with no spatial trail. The sticky header has back, "me," and command palette — no breadcrumb showing "Me → father → grandfather → you-are-here."

**Impact.** Genealogy navigation is depth-y; the user holds the path in their head. The platform should hold it for them.

**Recommendation.** A breadcrumb computed from the relationship calculator's path (`relationship.ts` already returns the path array). Cap at five hops with an ellipsis. Render below the sticky header. Click a crumb to jump back. This is one component and one query-param hand-off.

### P1.9 — Talk pages are invisible to readers

**Observation.** Talk pages exist at `<slug>.talk` and the editorial guide treats them as the working memory of the agent — active gaps, resolved questions, decisions, agent log, research notes. They are not linked from the article reader; only the research-notes panel below the article (driven by the same talk file) is visible. The home page lists talk pages as a separate column.

**Impact.** Talk pages are where the wiki's research voice lives. Hiding them makes the platform feel finished when it is, by design, in motion. From a PM lens this is the single feature most likely to make a guest think "oh, this is alive."

**Recommendation.** A "Talk page (N entries · M open gaps)" link in the article header next to the freshness strip (P1.2). Open gaps and decisions render as collapsible cards inline; full talk page on a separate route.

### P1.10 — Empty / error / loading states are bare

**Observation.** `/[slug]` shows a custom error when the page schema is out of date; otherwise the app uses Next.js defaults. No skeleton loaders, no "data stale — re-sync?" prompts, no retry UI. Map placeholder is a static 420px gray block.

**Impact.** Polish, mostly. But the "future schema mismatch" error is the model — it's specific and actionable. The other states should learn from it.

**Recommendation.** Two skeletons (article, tree section), one custom 404 with "search for the name instead," and a "GEDCOM snapshot is N days old — re-sync?" banner driven off the snapshot date. Quick wins, all of them.

---

## P2 — Medium (Polish, Consistency, Accessibility)

### P2.1 — Citation directives are visually disconnected and dark-mode-broken

`frontend/components/directives/index.tsx` cite-vault and cite-message blocks use hardcoded `text-slate-600`, `bg-slate-50`, `border-blue-300`. The rest of the app uses oklch design tokens. Result: contrast-failing in dark mode and stylistically off-key. Move to `bg-muted`, `text-muted-foreground`, `border-border` or define `--cite-*` tokens in `globals.css` alongside the infobox tokens.

### P2.2 — Red links exist but offer no creation flow

`frontend/lib/render.tsx` resolves wikilinks; unresolved ones get the `redlink` class. There is no tooltip, no "create this page" affordance, no list of all redlinks (a classic Wikipedia want-list). Add a `wai redlinks` CLI command and a sidebar on the home page dashboard: "23 unwritten pages people have linked to."

### P2.3 — Place residence overlaps not deduplicated

The Svetlana Burmenko derived record has three overlapping Pittsburgh residence entries (1996–2019, 1998–2002, 2000–2019). The derive step is union-without-merge. Add an interval-merging pass at the end of `core/src/gedcom/derive.ts` for residence/occupation arrays that share the same place or title.

### P2.4 — CLI help carries 13 removed commands forever

`cli/src/index.ts` lists removed commands with a "not yet supported in markdown migration" message. After eight months these will look like vapor rather than a roadmap. Decide: either bring them back on a date or quietly remove them from `--help` and link to a single "v1 → v2" migration page.

### P2.5 — Accessibility gaps

No skip-to-content links. Avatar initials and portraits have no `alt` attributes. Color contrast in dark mode is unverified against WCAG AA (oklch tokens make this easy to test — actually do it). No `lang="he"` / `lang="ru"` hints on multilingual name spans, which hurts screen readers and search.

### P2.6 — GEDCOM source typos & trailing commas

The audit doc flags "Unkown" for "Unknown," trailing commas in place strings, extra spaces before surname delimiters. Add a `wai recite --strict` mode that emits these as warnings to a side file rather than fixing them silently. This keeps user data sacred while making the noise visible.

### P2.7 — Mobile density on the tree page

`/family/tree` sections are dense on phone. Two cheap wins: collapse Lifespans and Descendants behind disclosure summaries by default on `< sm`, and shorten the header back-button area to give content more vertical room. The PersonRow component already reflows reasonably; the page chrome is what eats the viewport.

### P2.8 — Schema migrations infrastructure is shipped but empty

`docs/superpowers/plans/2026-05-04-schema-migrations.md` describes the v1 baseline plus `validateRegistry()`. This is the right moment to add the first non-trivial migration target (e.g., the `media[]` field from P1.7) so the system gets exercised before a forced migration arrives.

---

## P3 — Strategic Bets (12-month horizon)

These are not improvements to existing features; they are reframings. Listed roughly in order of how I'd prioritize them.

### P3.1 — Make the "research frontier" the central UI metaphor

Genealogy research is *not* the act of reading the tree. It's the act of pushing the tree's edges outward. The current platform has the data for this — `core/src/family/coverage.ts` already surfaces missing parents — but the UI treats it as one card among seven on the tree page. Promote it. The home page leads with frontier; the tree page surfaces frontier per-section; agents are evaluated on whether they reduce frontier per session. This is the metric that aligns the agent-authored loop with the user's actual goal.

### P3.2 — Source-criticism mode

Genealogy is downstream of evidence. Every fact in the wiki should have a strength label (primary / secondary / tertiary / oral / inference) and a confidence score. The eval suite already has a source-criticism grader; the data model has nowhere to put what it grades. Once the conflict schema (P1.5) and media schema (P1.7) are in, layer source-strength on top. The infobox can then tell the reader at a glance "Born 1938 (4 sources, 1 primary)."

### P3.3 — Timeline as a navigable axis

Lifespans already render per-person; what's missing is a single global timeline (1850–2026) where the user scrubs and the wiki state — births, deaths, marriages, places lit on the map — moves with the playhead. This is the "story of the family" view that no tree-as-list can substitute for. SVG, no library, ~400 lines, two query-params (`from`, `to`).

### P3.4 — Document evidence as a first-class object

Pair with P1.7. Once media exists, add an `/evidence` route — every scan, every photo, every audio file, with the records it cites. This is also the entry point for OCR, transcription, and (later) inferring GEDCOM facts from text — see plan `2026-05-03-narrative-to-gedcom.md`.

### P3.5 — Cross-tree linking

A user's grandmother's brother's children are someone else's cousins. The platform is single-user today, but the data model could be extended to allow signed-link references between trees ("this individual in my tree is the same person as that individual in your tree"). This is the network-effect bet. Far away, but the place-coords gazetteer is already a step toward shared infrastructure.

### P3.6 — Story spine per person

Articles today are good prose. They are not chronological event timelines. Add a structured event list to each person's frontmatter (or derive from the GEDCOM events + article citations) and render a vertical timeline alongside the prose. This is what most readers reach for first when they land on a long biographical article.

### P3.7 — DNA reconciliation slot

Even if the platform never imports raw DNA, leave a place to record cM totals, common-ancestor projections, and matched testers per individual. Researchers will paste this data in regardless; better to have a schema than to scatter it across talk pages.

### P3.8 — Federation / remote vault

Plan A in the bookmarked plans is off-site backup. Once living-person privacy (P0.2) is in place, the next bet is encrypted off-site with selective sharing — invite a sibling to read just the great-grandmother's branch.

---

## By Lens — Quick Reference

### Product-Management lens

| Issue | Priority | Lift |
|---|---|---|
| Editor prompt teaches removed CLI commands | P0.1 | S |
| No living-person privacy gate before sharing/backup features | P0.2 | M |
| 78% of records have no resolved sources | P0.4 | M |
| Home page is not a dashboard | P1.3 | S |
| No article freshness / attribution surface | P1.2 | S |
| No conflict schema → cannot represent the audit's open questions | P1.5 | M |
| Research frontier should be the central metaphor | P3.1 | L |

### UX lens

| Issue | Priority | Lift |
|---|---|---|
| `/family/tree` route is a list, not a tree | P1.1 | M |
| No breadcrumbs in tree navigation | P1.8 | S |
| Search is unfaceted, command palette caps at 10 | P1.4 | M |
| Talk pages are invisible to readers | P1.9 | S |
| Empty / error / loading states are bare | P1.10 | S |
| Citation block colors break dark mode | P2.1 | S |
| Mobile density on tree page | P2.7 | S |
| Accessibility: skip links, alt text, lang hints | P2.5 | S |

### Genealogy-research lens

| Issue | Priority | Lift |
|---|---|---|
| No living-person privacy gate (RESN, age heuristic) | P0.2 | M |
| Slash-date ambiguity silently year-truncated | P0.3 | S |
| No conflict-resolution schema for disagreeing sources | P1.5 | M |
| No half/step/adoptive distinctions in the data model | P1.6 | M |
| Photo/document evidence not first-class objects | P1.7 | M |
| Residence/occupation overlaps not merged | P2.3 | S |
| Source-criticism mode (strength + confidence) | P3.2 | L |
| Document-evidence first-class with OCR/transcription | P3.4 | L |

---

## Suggested Sequencing

If treating this as a six-week sprint plan rather than a backlog:

**Week 1 — Hotfixes.** P0.1 (agent-prompt cleanup + smoke test), P0.3 (date-ambiguity flag), P2.1 (citation tokens), P2.5 (alt text + skip links).

**Week 2–3 — Privacy & schema groundwork.** P0.2 (living-person gate), P1.5 (conflict schema), P0.4 (Ancestry source resolution). These three move the platform from "private narrative archive" toward "professional-grade research instrument."

**Week 3–4 — Reading & discovery.** P1.2 (freshness strip), P1.3 (dashboard home), P1.9 (talk-page surfacing), P1.10 (empty states). All small, all compounding.

**Week 4–5 — The tree.** P1.1 (a real pedigree chart), P1.8 (breadcrumbs), P1.4 (faceted search). This is where the platform starts to feel like the thing it claims to be.

**Week 6 — Schema reach.** P1.6 (half/step/adoptive), P1.7 (media as first-class). With the conflict schema in place, these are extension rather than re-architecture.

The P3 strategic bets follow naturally once the underlying schema can hold them.

---

## Closing Note

The strongest signal in the codebase is the gap between the rigor of `core/` and the unfinished feel of the surface around it. The hard work — relationship calculation, place gazetteer, edit-history reconstruction, eval suite — is done well. The work that remains is mostly *connecting* that rigor to a reader and to an agent that can see what it produced. Most P0 and P1 items are 100–500 lines each; the P3 bets are six-month conversations.

For a single-author, agent-collaborative wiki, this is a healthy place to be. The recommendations above are not "what's wrong" — they are "what becomes available next."
