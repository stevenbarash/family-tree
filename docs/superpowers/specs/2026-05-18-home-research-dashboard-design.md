# Home Page → Research Dashboard (P1.3) — Design

**Status:** approved, ready for implementation plan.
**Roadmap row:** [P1.3](../../ROADMAP.md) (Wave 3 — reading & discovery surface).
**Source review:** [Platform review §P1.3](../../reviews/2026-05-07-platform-review.md#p13--home-page-is-a-bare-directory-listing) and §P1.10 sidebar mention (line 240).
**Lift:** S.

---

## Background

The home page (`frontend/app/[locale]/page.tsx`) is partway through the
P1.3 transformation already. The review asked for a 5-card dashboard
(hero, frontier, recently-revised, open-gaps, A–Z below the fold); four
of the five cards plus an extra "this day in family history" ribbon are
shipped. The roadmap row's wording — *"Frontier / recently-revised /
open-gaps cards still to come"* — is stale: only the open-gaps card is
truly missing.

This spec closes the remaining gap and also picks up a closely related
suggestion from review §P1.10 / line 240 — the redlinks "want-list"
sidebar — because the data primitive already exists (`getRedlinks()`
in `lib/server-services.ts`) and the surface (home dashboard) is the
same one being edited. Bundling avoids re-touching the same file twice.

## Scope

**In scope:**

1. **Editorial-gaps card** — top 5 articles by unresolved
   `::open` + `::gap` thread count across their talk pages. Aggregate
   footer with global counts. Card hides when global count is zero.
2. **Unwritten-pages (redlinks) card** — top 5 most-linked-to redlink
   targets across all live articles. Aggregate footer. Card hides
   when zero.
3. **A–Z relegation** — move the current full-articles grid and
   talk-pages grid off the home page to a new `/[locale]/index` route.
   Home gets a two-line footer linking to that route.
4. **`/[locale]/redlinks` route** — full redlinks listing with source
   pages per target. Mirrors the existing `wai redlinks` CLI output.
5. **Roadmap + CHANGELOG + plan-index updates** — flip the P1.3 row to
   ✅ shipped with a brief summary; CHANGELOG entry names the P-ID;
   add a plan row to the plans README.

**Out of scope (own roadmap items, do not touch in this work):**

- Wikilink hover-cards (separate plan `2026-05-16-wikilink-hover-cards.md`)
- Pedigree chart on `/family/tree` (P1.1, shipped)
- Breadcrumbs (P1.8)
- Search facets (P1.4)
- Empty-state / 404 polish (P1.10)
- "Create this page" affordance from redlinks click (P1.10 territory;
  in this spec, redlink rows link to `/redlinks` only)
- Privacy/restricted handling: redlinks and gaps respect the existing
  `live` filter (`!isTalk && !isArchived`). No new gating logic.

## Architecture

**Pure logic in `core/`:** a new `aggregateOpenGaps()` helper in
`core/src/pages/talk-threads.ts`. Takes an array of
`{ slug, title, talkBody }` and returns the top-N
`{ slug, title, count }` sorted desc by count then asc by slug, with
zero-count entries dropped. Pure function, no I/O, fully unit-testable.

**Frontend wrapper in `lib/server-services.ts`:**
`getCachedOpenGaps(limit: number)` does the file walk:

- get the cached page list
- filter to live articles
- for each, read its `<slug>.talk.md` body (skip if no talk page exists)
- call `aggregateOpenGaps(...)`
- cache with a 2-second TTL, invalidated by `invalidateListCache()`

This mirrors the existing `getRecentlyRevised()` cache pattern exactly.
Cold-walk cost is N talk-page reads (~50 today, ~500 at scale, <100ms
at scale). Hot is a map lookup.

**`getRedlinks()` caching:** the function already exists but reads
every live page body on every call (the same O(N) cost). Wrap with the
same 2-second TTL cache. Invalidated by `invalidateListCache()`.

**Two new RSC components:**
- `frontend/components/dashboard/open-gaps-card.tsx`
- `frontend/components/dashboard/redlinks-card.tsx`

Each is a thin server component that takes view data (no fetching) and
renders the heading + rows + aggregate footer. Returns `null` when
input is empty so the page can render them unconditionally. Mirrors the
shape of `OnThisDayRibbon`.

**New routes:**
- `/[locale]/index/page.tsx` — the A–Z grid + talk-pages grid lifted
  from the current home page, with the same stat header. Anchor
  `#talk` for the home→talk-section link.
- `/[locale]/redlinks/page.tsx` — full redlinks listing with source
  pages expanded per target.

**Home page reshape:**

| Section | Status |
|---|---|
| Hero (title + stats + nav) | keep |
| Stale-snapshot banner (conditional) | keep |
| On-this-day ribbon (conditional) | keep |
| Continue research (frontier) | keep |
| **Editorial gaps** | **new** |
| Recently revised | keep |
| **Unwritten pages (redlinks)** | **new** |
| Two-line footer: `Browse all N articles → /index` · `Talk pages (M) → /index#talk` | **new (replaces A–Z + talk grids)** |

## Components

### Editorial-gaps card

Layout (max-width `3xl`, matches existing card width):

```
EDITORIAL GAPS
Wartime catastrophe       43 open · talk →
Polya Maistrach           7 open · talk →
Ann B Seplowitz           4 open · talk →
Lenya Ayzman              2 open · talk →
Barash family             2 open · talk →

156 open across 32 articles
```

- Row title links to the article (`/{slug}`).
- "talk →" links to the article's editorial-discussion section
  (`/{slug}#talk-threads-heading` — the `id` on the `<h2>` rendered by
  P1.9's `TalkThreadsPanel` in `frontend/components/talk-threads/threads-panel.tsx:36`).
- Aggregate footer is informational only (no link target). The per-row
  "talk →" links are the actual editor-entry CTAs. A dedicated `/gaps`
  listing is out of scope for this spec; if added later, the aggregate
  line gains an "all gaps →" anchor at that time.
- Typography matches existing cards: heading `font-display text-xs
  uppercase tracking-[0.32em] text-muted-foreground`; rows
  `text-sm`; meta `font-mono text-[0.7rem] uppercase tracking-[0.08em]
  text-muted-foreground/80`.

### Redlinks card

```
UNWRITTEN PAGES
[[ Grandmother Polya ]]      4 refs
[[ Treblinka ]]              3 refs
[[ Soviet evacuation 1941 ]] 3 refs
[[ Pogrom of 1905 ]]         2 refs
[[ Aunt Sonya ]]             2 refs

23 unwritten pages · 67 references · all redlinks →
```

- Each row shows the target wrapped in literal `[[ ]]` brackets,
  styled with the existing `.redlink` class so it appears in the
  redlink color (consistent with how unresolved wikilinks render in
  prose).
- Row click goes to `/redlinks` for now (no "create this page" wizard
  yet).
- Same typography as gaps card.

### `/[locale]/index/page.tsx`

- Same hero stats triple as home (`ancestors / articles / gedcom sync`)
  for orientation when navigating directly.
- A–Z grid of live articles (2 cols on `sm:`) — lifted unchanged from
  the current home page.
- Talk-pages grid below an `#talk` anchor — lifted unchanged.
- No on-this-day, no cards. Purely the phonebook.

### `/[locale]/redlinks/page.tsx`

- Hero with global counts (`N unwritten pages · M references`).
- Sorted list, target as heading + a small bullet list of source
  pages per target. Use the existing `RedlinkEntry.sources` array.

## Data flow

```
getCachedList()  ──┬──> live filter ──> getCachedOpenGaps()
                   │                     └─> aggregateOpenGaps()
                   │                         └─> countOpenThreads()
                   │
                   └──> live filter ──> getRedlinks() (cached)
                                         └─> findRedlinks()
```

All paths re-use existing primitives. Only two new things:
`aggregateOpenGaps()` (pure) and the two cache wrappers.

## i18n

**New keys** added to `messages/en.json` under `Page.Home`:

- `editorialGapsHeading` — `"Editorial gaps"`
- `editorialGapsRowMeta` — ICU plural:
  `"{count, plural, one {# open} other {# open}} · talk →"`
- `editorialGapsAggregate` — ICU plural over two vars (count of
  unresolved threads × count of articles):
  `"{threads, plural, one {# open} other {# open}} across {articles, plural, one {# article} other {# articles}}"`
- `unwrittenPagesHeading` — `"Unwritten pages"`
- `unwrittenPagesRowMeta` — ICU plural:
  `"{count, plural, one {# ref} other {# refs}}"`
- `unwrittenPagesAggregate` — ICU plural over two vars (targets × refs):
  `"{targets, plural, one {# unwritten page} other {# unwritten pages}} · {refs, plural, one {# reference} other {# references}} · all redlinks →"`
- `browseAllArticles` — ICU plural: `"Browse all {count, plural, one {# article} other {# articles}} →"`
- `browseAllTalkPages` — ICU plural: `"Talk pages ({count}) →"`

A new namespace `Page.Index` for the relocated A–Z page and `Page.Redlinks`
for the redlinks listing. Both can reuse existing strings where overlap
exists (the stat triple already lives in `Page.Home`; lift to `Page.Common`
or duplicate — see [open question 1](#open-questions) below).

**Translations:**
- `ru` and `uk` need full `one/few/many/other` plural categories.
- `he` needs `one/two/many/other`.
- Per `frontend/AGENTS.md`: "ICU `plural` for counts. Don't use the
  `_plural`/`_zero` suffix style." All categories the language requires.

## Caching

| Cache | Pattern |
|---|---|
| `getCachedOpenGaps()` | 2s TTL, invalidated by `invalidateListCache()` |
| `getRedlinks()` (new cache wrapper) | 2s TTL, invalidated by `invalidateListCache()` |

The 2s TTL is the same value used by `getCachedList()`,
`getCachedSnapshots()`, and `getRecentlyRevised()`. The justification
in the existing code (`server-services.ts:73-76`) — recent edits stay
visible quickly, repeated reads share parsed output — applies
identically here.

## Tests

**New pure-function tests** — `core/test/pages/aggregate-open-gaps.test.ts`:

- empty input → `[]`
- all-zero counts → `[]` (zero entries filtered)
- single non-zero → 1-entry result
- ties broken by slug ascending
- count descending
- top-N truncation (N=5 with 8 entries)
- mixed `::open` and `::gap` markers both count (delegated to
  `countOpenThreads()`)

**RSC integration tests** — `frontend/test/dashboard.test.ts` (new file
or extend if a suitable existing one is found):

- home page renders gaps card when data present
- home page omits gaps card when global count is 0
- home page renders redlinks card when data present
- home page omits redlinks card when global count is 0
- footer "Browse all N articles" link present and links to `/index`
- footer "Talk pages (M)" link present and points to `/index#talk`
- `/index` route renders A–Z grid + talk grid with stat header

**Existing tests that must keep passing:**

- `frontend/test/rtl-tailwind-sweep.test.ts` — no `ml-`/`mr-`/etc. in
  new components
- `frontend/test/static-rendering.test.ts` — home and `/index` must
  remain SSR-clean (`setRequestLocale` called before any next-intl
  call, no `force-dynamic` regression)
- `cli/test/roadmap-drift.test.ts` — P1.3 row flipped to ✅ ↔
  CHANGELOG entry naming P1.3 must both land

## Files changed

| File | Change |
|---|---|
| `core/src/pages/talk-threads.ts` | + `aggregateOpenGaps()` pure helper |
| `core/test/pages/aggregate-open-gaps.test.ts` | new |
| `frontend/lib/server-services.ts` | + `getCachedOpenGaps()`; wrap `getRedlinks()` in a cache |
| `frontend/components/dashboard/open-gaps-card.tsx` | new RSC |
| `frontend/components/dashboard/redlinks-card.tsx` | new RSC |
| `frontend/app/[locale]/page.tsx` | remove A–Z + talk grids; insert gaps + redlinks cards; add browse-all footer |
| `frontend/app/[locale]/index/page.tsx` | new — A–Z + talk grids + stat header |
| `frontend/app/[locale]/redlinks/page.tsx` | new — full redlinks listing |
| `frontend/test/dashboard.test.ts` | new RSC tests |
| `frontend/messages/en.json` | new strings under `Page.Home`, `Page.Index`, `Page.Redlinks` |
| `frontend/messages/ru.json`, `uk.json`, `he.json` | mirror new strings with correct plural categories |
| `docs/ROADMAP.md` | flip P1.3 row to ✅ shipped with brief summary |
| `CHANGELOG.md` | entry naming P1.3 |
| `docs/superpowers/plans/README.md` | add row for the implementation plan |

## Error handling

- Missing talk page → `getCachedOpenGaps()` treats as zero gaps (skip
  silently). The existing `readTalkBody()` already returns `''` on
  `PageNotFoundError`.
- Malformed talk-page body → `parseTalkThreads()` already tolerates
  arbitrary markdown; thread count is 0 if no `::open`/`::gap` markers
  parse.
- Empty wiki (zero live pages) → all three new cards render `null`;
  home shows hero + footer only. Acceptable; matches the "first-run"
  state.
- `/index` and `/redlinks` with empty wiki → render hero + an empty-
  state message ("No articles yet" / "No redlinks yet"). Matches the
  P1.10 empty-states style without anticipating that plan's specifics.

## Open questions

1. **Stat-triple duplication.** The hero stats (`ancestors / articles /
   gedcom sync`) appear on home, and would appear on `/index`. Worth
   extracting to a shared `<StatTriple>` component, or just duplicate
   the ~15 lines? **Recommendation:** duplicate for now — extraction
   is cheap to do later if we add a third caller, and premature
   abstraction is the project's anti-pattern.

2. **Redlinks row click target.** Spec says links go to `/redlinks` for
   now. Alternative: link directly to the first source page. **Going
   with `/redlinks`** — discoverability of the want-list is the point;
   first-source-link buries it.

3. ~~**`#editorial-discussion` anchor.**~~ Resolved during spec self-review:
   the actual anchor is `#talk-threads-heading` (the `id` on the `<h2>`
   in `frontend/components/talk-threads/threads-panel.tsx:36`). Spec
   text updated.

---

## Implementation order (for the plan)

The plan should sequence so each step is independently shippable:

1. `aggregateOpenGaps()` + tests (pure, no UI)
2. `getCachedOpenGaps()` + cache wrapper for `getRedlinks()`
3. `OpenGapsCard` RSC + i18n strings + insert into home
4. `RedlinksCard` RSC + i18n strings + insert into home
5. `/[locale]/index` route + lift A–Z + talk grids + home footer link
6. `/[locale]/redlinks` route
7. Translations (ru/uk/he)
8. Roadmap + CHANGELOG + plan-index drift updates

Each step can be its own commit and is testable on its own.
