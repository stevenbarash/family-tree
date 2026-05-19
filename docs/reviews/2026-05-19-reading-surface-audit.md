---
title: whoami.wiki — Reading-Surface Audit
subtitle: Honest sit-down audit of the article, home, and family-tree pages
date: 2026-05-19
author: Claude Opus 4.7 (1M context)
---

# Reading-Surface Audit — 2026-05-19

**Scope:** the three pages a Tailscale visitor actually reads — the
home dashboard (`/[locale]`), the article page (`/[locale]/[slug]`),
and the family-tree page (`/[locale]/family/tree`). Sibling routes
(`/index`, `/family`, `/search`, `/redlinks`, `/changelog`, `/roadmap`)
are out of scope.

**Why now:** the [2026-05-07 platform review](./2026-05-07-platform-review.md)
plus 12 days of unplanned shipping have left the article page at 10+
visible blocks and the family-tree page at 10 sections. The ROADMAP
gates further Reading-track work on this audit:

> Honest sit-down audit of the article page, home page, and family-tree
> page after the May 2026 build-out. Identifies what's redundant,
> what's mis-prioritized, what should be cut vs. demoted. Gates
> everything below.

**Lens:** four categories per the ROADMAP brief — redundancy,
mis-prioritization, cut, demote. Bias toward information density
(the user's stated preference) but flag anything that *competes for
the eye* rather than *adds to the eye's catch*.

---

## TL;DR — six concrete moves

In recommended sequencing:

1. **Move the pedigree chart below the focal person's H1**, not above
   it (`/family/tree`). The page's identity is the person; the chart
   is content about them. Currently the chart pre-empts the H1.
2. **Drop the redundant "talk: N open" link from the article freshness
   strip when `TalkThreadsPanel` will render inline below.** Two
   surfaces for the same data on the same scroll.
3. **Demote the `CoverageSection` from a full section to one stat in
   `PersonHeaderSection`** ("N sources / N facts (P%)"). It earns its
   line, not its section.
4. **Cut `MediaSection` from `/family/tree` until E.2 lands.** Today
   it's a flat title list with no thumbnails; E.2 will give it a real
   render. Returning empty (which it does) doesn't reclaim the
   conceptual space.
5. **Cut the small uppercase type label above the article H1** ("person",
   "place", etc.). The H1 names the entity; the URL and breadcrumbs
   carry type. If the metadata is still wanted, fold it into the
   freshness strip.
6. **Localize the article page's English-hardcoded chrome.** Back link,
   type label, freshness strip, relationship strip, and notes panel
   all bypass `next-intl`. Breaks ru/uk/he. P2.9 may already cover
   the Link sweep; localization scope here is wider.

Everything else in this audit is supporting evidence for those six.

---

## Methodology

Read each of the three target pages end-to-end:

- `frontend/app/[locale]/page.tsx` (185 lines)
- `frontend/app/[locale]/[slug]/page.tsx` (269 lines)
- `frontend/app/[locale]/family/tree/page.tsx` (198 lines)

Read the visible children referenced from each page tree:
`relationship-strip.tsx`, `on-this-day-ribbon.tsx`,
`talk-threads/threads-panel.tsx`, `research-notes/panel.tsx`,
`dashboard/open-gaps-card.tsx`, `dashboard/redlinks-card.tsx`, the
ten `components/family/sections/*.tsx`. Pulled Vercel's Web Interface
Guidelines as a secondary rubric.

Did **not** read every directive (`components/directives/`), every
shadcn primitive, or any client-only interaction code beyond what the
sections compose. The audit is about *what is on screen*, not *how it
behaves under interaction*.

---

## Inventory: what is on each page

### Home dashboard — `/[locale]/page.tsx`

Eight visible blocks, top to bottom:

| # | Block | Conditional? |
|---|---|---|
| 1 | Header (registry label · `whoami.wiki` H1 · meta strip · 5-link nav) | always |
| 2 | Snapshot-stale warning | if `> 30 days` |
| 3 | `OnThisDayRibbon` (almanac for today) | if events `> 0` |
| 4 | "Continue research" frontier list (top 4) | if `frontier > 0` |
| 5 | `OpenGapsCard` (top-N articles by `::open`/`::gap` count) | if `rows > 0` |
| 6 | "Recently revised" list (top 6) | if `recent > 0` |
| 7 | `RedlinksCard` (top-5 unwritten pages) | if `entries > 0` |
| 8 | Footer (browse-all-articles / browse-all-talk) | always |

### Article — `/[locale]/[slug]/page.tsx`

Ten visible blocks, top to bottom (non-restricted path):

| # | Block | Conditional? |
|---|---|---|
| 1 | Back link "← Index" | always |
| 2 | `TranslationBanner` | when status ≠ `current` |
| 3 | Type label ("person", "place", …) | always |
| 4 | Title H1 | always |
| 5 | `RelationshipStrip` ("Your &lt;relation&gt;") | when joined to GEDCOM, non-talk |
| 6 | Categories pill row | when `categories.length > 0` |
| 7 | Freshness/attribution strip (created · author · editors · GEDCOM snap · N sources · talk: N) | when any field set |
| 8 | Article body (rendered markdown + directives + hover cards) | always |
| 9 | `TalkThreadsPanel` (`::open` / `::resolved` / `::superseded` collapsibles) | non-talk, when threads exist |
| 10 | `ResearchNotesPanel` (date-grouped notes + Add form) | non-talk |

Restricted-record path collapses to: back link, header, `RestrictedNotice`.

### Family tree — `/[locale]/family/tree/page.tsx`

**Sticky header**: back-to-family · registry label · "Me" button (conditional) · `CommandPalette`.
**Breadcrumb nav**: when `relationship.crumbs.length > 1`, abridged to 5 items with ellipsis.

**Body — 10 sections** + research notes, in the order rendered:

| # | Section | Returns null when… |
|---|---|---|
| 1 | `PedigreeSection` | (always renders the chart shell) |
| 2 | `PersonHeaderSection` | (always — folio, H1, dates, stats) |
| 3 | `FamilySection` | no parents/spouses/children/siblings/cousins |
| 4 | `ConflictsSection` | no `selectedConflicts` |
| 5 | `CoverageSection` | `coverage.knownTotal === 0` |
| 6 | `PlacesSection` | no place regions |
| 7 | `LifespansSection` | timeline empty or no range |
| 8 | `DescendantsSection` | `descendants.total === 0` |
| 9 | `MediaSection` | no `selectedMedia` |
| 10 | `LineageSection` | no ancestors at all |
| — | `ResearchNotesPanel` | when no `notesSlug` (rare) |

---

## Findings

### Redundancy

**R1. Pedigree chart vs Lineage section.**
`PedigreeSection` (section 1) and `LineageSection` (section 10) consume
the same `view.byGeneration` data — one as an interactive chart, one
as paternal/maternal text lists. The textual list predates P1.1; with
the chart now at the top of the page, the list is effectively the
fallback presentation but lives at the bottom. **Recommendation:**
keep `LineageSection` but reframe its `SectionHeader` to signal
"already shown above — full detail below," and collapse on mobile by
default following the `MobileDisclosure` pattern that
`DescendantsSection` and `LifespansSection` already use.

**R2. Article freshness "talk: N open" link vs `TalkThreadsPanel` inline.**
The freshness strip's `talk: N open / N gaps →` link routes to the
full talk page (`/family-foo.talk`). `TalkThreadsPanel` renders those
same threads inline on the article, below the body. Two surfaces for
identical data within one scroll. **Recommendation:** when the panel
will render (i.e., when threads exist), the strip link should anchor
in-page to `#talk-threads-heading` rather than route to the talk
page. The full-talk route is still reachable via the panel's
`viewFullTalk` link.

**R3. Home "Continue research" frontier vs chart frontier slots.**
Both surface the same `tree.coverage.frontier` data. This one is
*intentional* dual-surfacing — the dashboard answers "what should I
do today?" and the chart answers "what's the shape of what I know?"
— and the home links already route into the chart via
`/family/tree?person=…`. **Not a cut candidate; flag as
intentional duplication so future refactors don't collapse it.**

**R4. `PersonHeaderSection` H1 vs sticky-header registry label.**
Both communicate "this is the family-tree page for X." Less a
redundancy than a *which-wins* problem — see M2 below.

### Mis-prioritization

**M1. Article header visual weight.**
Order is `type → H1 → relationship → categories → freshness`. The
order is right, but the **visual weight** is inverted: categories
pills (rounded backgrounds) catch the eye more than the italic muted
relationship line. The relationship to self is the most reader-
anchoring fact after the title; pills should not outshout it.
**Recommendation:** bump `RelationshipStrip` to non-italic medium
weight at the same size; demote categories to a single muted line
("categories: people · jewish · soviet").

**M2. Family-tree page: chart precedes the focal person H1.**
`/family/tree` renders `PedigreeSection` (1), then
`PersonHeaderSection` (2). The page identity is the person, not the
chart of their ancestors. The chart should follow the H1 the same
way an infobox follows a wiki H1 — content *about* the entity, not
*before* it. **Recommendation:** swap the order in
`app/[locale]/family/tree/page.tsx:174-175`. Single-line fix.

**M3. Home nav: 5 links of equal weight.**
`Family · Tree · Search · Changelog · Roadmap` are visually peers.
The first three are content destinations; the last two are
meta-pages about the project. **Recommendation:** keep Family/Tree/
Search as the primary nav row; move Changelog/Roadmap to the page
footer alongside `browseAllArticles`. The footer is already a muted
mono row — natural home for meta links.

### Cut candidates

**C1. `MediaSection` on `/family/tree`.**
Currently a flat title list with a `[primary]` tag, no thumbnails,
no preview. Until E.2 (Contribution-track) lands and `MediaRef[]`
becomes a first-class renderable, the section is vertical real
estate without payoff. The component returns null when
`selectedMedia.length === 0` (often), so on most subjects the cut
is a no-op; on subjects *with* media, it underdelivers.
**Recommendation:** remove from page composition until E.2 ships;
reinstate then with a gallery render.

**C2. Article type label above H1.**
The H1 names the entity. URL and breadcrumbs (when on the family
tree) carry the type. The small uppercase "person" / "place" /
"event" label adds a line of chrome without disambiguating.
**Recommendation:** cut from the header. If the type metadata is
still wanted, fold it into the freshness strip as `type: person`
alongside `created 2026-04-…`.

**C3. `/[locale]/index` page header treatment.**
Not a cut from the audit's three pages, but called out: the home
dashboard footer links to `/[locale]/index` for "browse all N
articles," and that page currently has a full multi-line header
(registry label, H1, meta strip, nav). For a flat alphabetical
directory, the chrome is disproportionate. **Recommendation:**
collapse `/index`'s header to a single line (`"All articles · N
entries"`) on a follow-up pass — out of strict scope but cheap.

### Demote candidates

**D1. `CoverageSection` → stat in `PersonHeaderSection`.**
The coverage metric is important (the source-coverage % is the only
honest signal of how researched a person is), but it doesn't earn
a full section. **Recommendation:** render the same number as a
stat row entry in `PersonHeaderSection`: `Sources cited: 12 / 31
facts (39%)`. Remove the standalone section.

**D2. `ConflictsSection` → bottom of page, adjacent to `ResearchNotesPanel`.**
Conflicts are an *authoring* concern (the agent / human needs to
resolve them), not a *reading* concern (the visitor wants the
narrative). Today the section appears 4th, mid-page.
**Recommendation:** move to after `LineageSection`, adjacent to
`ResearchNotesPanel`, so it visually clusters with the other
"editorial workspace" surfaces.

**D3. Categories pills on article header → muted single line in freshness strip.**
Already noted in M1. Pills carry too much visual weight for
metadata that almost nobody scans. Single muted line, comma-
separated, in the freshness strip row.

---

## UI guideline findings (secondary)

Surfacing as a list for tracking; none are blockers, none warrant
breaking the strategic focus of this audit. File:line refs to make
them clickable.

### Localization gaps on the article page

- `app/[locale]/[slug]/page.tsx:143` — back link `← Index` hardcoded English.
- `app/[locale]/[slug]/page.tsx:154` — type label renders `{page.meta.type}` raw (no Title-Case, no translation).
- `app/[locale]/[slug]/page.tsx:172-193` — freshness strip strings (`created`, `author:`, `editors:`, `GEDCOM snapshot`, `sources cited`, `talk:`) all hardcoded English.
- `components/relationship-strip.tsx:16` — `Your ${label}` hardcoded English. Needs `useTranslations` + ICU `select` on the label.
- `components/research-notes/panel.tsx:30-44` — heading `Research notes` and helper copy hardcoded.

### `Link` import mixed: `next/link` vs `@/i18n/navigation`

Per `frontend/AGENTS.md`, **all** links must use `@/i18n/navigation`
to preserve active locale. Article page uses `next/link` (line 2);
home page (`app/[locale]/page.tsx:1`) and home-index
(`app/[locale]/index/page.tsx:1`) likewise. `TalkThreadsPanel` and
`OpenGapsCard` already import correctly from `@/i18n/navigation`.
P2.9 tracks this as a sweep — confirm the three top-level page files
are in the sweep's scope.

### Vercel Web Interface Guidelines hits

- **Skip-to-content link** — Vercel rule "headings hierarchical
  `<h1>`–`<h6>`; include skip link for main content." `frontend/`
  shipped a skip-to-content link as part of P2.5 (per CHANGELOG);
  verify it's mounted in `app/[locale]/layout.tsx` and present on
  all three target pages.
- **`scroll-margin-top` on heading anchors** — Vercel rule. The
  family-tree page has a sticky header; section anchors need
  `scroll-margin-top` (or `scroll-padding-top` on the scroll
  container) to avoid landing under the header. The article page
  doesn't have a sticky header so this only bites on `/family/tree`.
- **`<bdi>` on user-generated names** — `OnThisDayRibbon` does this
  (line 18, 22). `OpenGapsCard` does this (line 34). `RedlinksCard`
  does this (line 41). Confirm `PersonHeaderSection` and the family-
  tree sections do likewise — P2.10 tracks the sweep.
- **`tabular-nums` on year columns** — `OnThisDayRibbon` (line 27,
  30, 35) ✓. Verify `LifespansSection` and `LineageSection` likewise.

None of the above warrant a dedicated workstream; they slot into the
existing P2.5 / P2.9 / P2.10 entries.

---

## What this audit does NOT cover

Per scope:

- **Search page** (`/[locale]/search`) — has its own P1.4 entry on
  the ROADMAP for the next pass.
- **Family-line summary** (`/[locale]/family`) — pre-existing,
  unchanged by the May build-out.
- **Redlinks, changelog, roadmap** — utility pages; sufficient as is.
- **Directives** (`components/directives/`) — the infoboxes and
  inline blocks rendered *inside* article bodies. Distinct surface;
  worth its own audit if/when directive proliferation becomes a
  concern.
- **Interaction behavior** — focus traps, keyboard navigation,
  reduced-motion handling. Mostly governed by shadcn primitives;
  worth a dedicated accessibility pass before considering external
  users (out of current scope per `SCOPE.md`).

---

## Sequencing into the Reading track

After this audit, the natural next ROADMAP Reading-track items are
already enumerated (P1.4 search facets, Pedigree follow-ons T and D,
the various P2.x small fixes). This audit doesn't change those — it
adds a tier of **header / composition fixes** that should land
*before* the next section-level work:

| Order | Move | Files | Lift |
|---|---|---|---|
| 1 | Swap M2: chart below H1 | `app/[locale]/family/tree/page.tsx:174-175` | XS |
| 2 | Cut C2: type label | `app/[locale]/[slug]/page.tsx:152-155` | XS |
| 3 | Drop redundant R2 link when panel renders | `app/[locale]/[slug]/page.tsx:184-191` | XS |
| 4 | Demote D1: coverage into person header | `components/family/sections/person-header-section.tsx`, drop `CoverageSection` from page composition | S |
| 5 | Demote D2: move ConflictsSection to bottom | `app/[locale]/family/tree/page.tsx:174-183` | XS |
| 6 | Cut C1: remove MediaSection | `app/[locale]/family/tree/page.tsx:182` | XS |
| 7 | M1 visual-weight rebalance: relationship vs categories | `components/relationship-strip.tsx`, `app/[locale]/[slug]/page.tsx:162-170` | S |
| 8 | M3: demote Changelog/Roadmap nav to footer | `app/[locale]/page.tsx:89-95, 173-181` | XS |
| 9 | Localization pass on article-page chrome | `app/[locale]/[slug]/page.tsx`, `components/relationship-strip.tsx`, `components/research-notes/panel.tsx`, `messages/*.json` | M |

Items 1–8 are header/composition. Item 9 is a localization
debt-paydown that pairs naturally with P2.9 (Link sweep) and should
ship together. Total ≈ **1 day of focused work** for items 1–8, plus
the M-lift on 9.

After this, the Reading-track ROADMAP entries (Pedigree T → D, P1.4,
P2.3, P2.7, P2.11, P2.12) are unblocked to proceed in any order.

---

## See also

- [`docs/ROADMAP.md`](../ROADMAP.md) — Reading-track sequencing this audit gates
- [`docs/reviews/2026-05-07-platform-review.md`](./2026-05-07-platform-review.md) — the prior platform review
- [`frontend/AGENTS.md`](../../frontend/AGENTS.md) — `Link` import rule and information-density preference cited here
