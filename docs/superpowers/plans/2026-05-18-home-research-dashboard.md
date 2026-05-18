# Home Page → Research Dashboard (P1.3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out P1.3 by adding an editorial-gaps card and an unwritten-pages (redlinks) card to the home dashboard, relegating the A–Z and talk-pages grids to a new `/index` route, and adding a `/redlinks` listing.

**Architecture:** Pure aggregation helper in `core/src/pages/talk-threads.ts`; cached fan-out reader in `frontend/lib/server-services.ts`; two new RSC card components consumed by the existing home page; two thin new App-Router routes (`/[locale]/index` and `/[locale]/redlinks`). The redlinks data primitive (`getRedlinks()`) already exists — we wrap it in a cache and surface it. No new dependencies; no client JS.

**Tech Stack:** TypeScript, Next 16 App Router (RSC), `next-intl` v4, `tsx --test` + `node:assert/strict`, Tailwind utilities (logical-only, `ms-`/`me-`/etc.).

**Spec:** [`docs/superpowers/specs/2026-05-18-home-research-dashboard-design.md`](../specs/2026-05-18-home-research-dashboard-design.md)

---

## Design decisions baked in

- **Open-gaps definition:** unresolved threads = `::open` + `::gap` markers (the existing `countOpenThreads()` in `core/src/pages/talk-threads.ts:76` already encodes this; we delegate to it).
- **Top-N for both cards:** 5 rows. Below that the aggregate footer line + "all gaps →" / "all redlinks →" carries the rest.
- **Aggregate footers** use ICU plural for every count (English needs `one/other`, Slavic needs `one/few/many/other`, Hebrew needs `one/two/many/other`).
- **Both cards hide entirely when the global count is zero.** Match the on-this-day ribbon's pattern.
- **Caching:** `getCachedOpenGaps()` and a new cache wrapper around `getRedlinks()` both use the project-standard 2-second TTL and are invalidated by `invalidateListCache()`. Same shape as `getRecentlyRevised()`.
- **The "talk →" row link** on each gaps row jumps to `/{slug}#talk-threads-heading` (the `<h2 id="talk-threads-heading">` rendered by `TalkThreadsPanel` at `frontend/components/talk-threads/threads-panel.tsx:36`). Already in the DOM as of P1.9.
- **Redlinks row click** goes to `/redlinks` for now (no "create this page" wizard in this spec).
- **A–Z relegation target:** `/[locale]/index` route. Talk-pages section there gets an `#talk` anchor so the home footer link can deep-link.
- **Stat triple duplication:** the hero stats triple (`N ancestors · M articles · GEDCOM date`) is duplicated between home and `/index`. We don't extract a shared component yet (project pattern: avoid premature abstraction; cheap to extract if/when a third caller arrives).
- **No SSR regression:** every new page sets `setRequestLocale(locale)` before any next-intl call, per `frontend/AGENTS.md`. `force-dynamic` may be inherited from home; do NOT introduce new `force-dynamic` on the new routes (they're statically renderable).
- **i18n catalog parity:** `messages-parity.test.ts` enforces all four locales have identical key shapes. Every new key must be added to en, ru, uk, and he in the same commit.

---

## File structure

| File | Role |
|---|---|
| `core/src/pages/talk-threads.ts` (modify) | Add `aggregateOpenGaps()` pure helper. |
| `core/test/pages/aggregate-open-gaps.test.ts` (new) | Pure-function tests. |
| `frontend/lib/server-services.ts` (modify) | Add `getCachedOpenGaps()`; wrap `getRedlinks()` in a 2s TTL cache. |
| `frontend/components/dashboard/open-gaps-card.tsx` (new) | RSC: heading + rows + aggregate footer. Returns `null` on empty. |
| `frontend/components/dashboard/redlinks-card.tsx` (new) | RSC: same shape, redlink-styled targets. Returns `null` on empty. |
| `frontend/app/[locale]/page.tsx` (modify) | Remove A–Z + talk grids; add gaps card, redlinks card, footer browse-all links. |
| `frontend/app/[locale]/index/page.tsx` (new) | A–Z articles + talk-pages grids; stat header; `#talk` anchor. |
| `frontend/app/[locale]/redlinks/page.tsx` (new) | Full redlinks listing, target → list of source pages. |
| `frontend/messages/en.json` (modify) | New keys under `Page.Home`, `Page.Index`, `Page.Redlinks`. |
| `frontend/messages/ru.json` (modify) | Mirror new keys with Slavic plural categories. |
| `frontend/messages/uk.json` (modify) | Same as ru. |
| `frontend/messages/he.json` (modify) | Hebrew plural categories. |
| `docs/ROADMAP.md` (modify) | Flip P1.3 row to ✅ with shipped-summary. |
| `CHANGELOG.md` (modify) | Add entry naming `P1.3`. |
| `docs/superpowers/plans/README.md` (modify) | Add row for this plan; flip to ✅ when complete. |

---

## Task 1: Add `aggregateOpenGaps()` pure helper in core

**Files:**
- Modify: `core/src/pages/talk-threads.ts`
- Create: `core/test/pages/aggregate-open-gaps.test.ts`

---

- [ ] **Step 1.1: Write the failing tests**

Create `core/test/pages/aggregate-open-gaps.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOpenGaps } from '../../src/pages/talk-threads.ts';

const noThreads = '# Talk\n\nNothing here.\n';
const oneOpen = '## Thread A\n\n::open\n\nBody.\n';
const twoMixed = '## Thread A\n\n::open\n\nBody.\n\n## Thread B\n\n::gap\n\nBody.\n';
const oneClosed = '## Thread A\n\n::closed\n\nBody.\n';

test('aggregateOpenGaps: empty input returns []', () => {
  assert.deepEqual(aggregateOpenGaps([], 5), []);
});

test('aggregateOpenGaps: all-zero counts return []', () => {
  const result = aggregateOpenGaps(
    [
      { slug: 'a', title: 'A', talkBody: noThreads },
      { slug: 'b', title: 'B', talkBody: oneClosed },
    ],
    5,
  );
  assert.deepEqual(result, []);
});

test('aggregateOpenGaps: counts ::open and ::gap, drops ::closed', () => {
  const result = aggregateOpenGaps(
    [{ slug: 'a', title: 'A', talkBody: twoMixed }],
    5,
  );
  assert.deepEqual(result, [{ slug: 'a', title: 'A', count: 2 }]);
});

test('aggregateOpenGaps: sorts by count desc', () => {
  const result = aggregateOpenGaps(
    [
      { slug: 'a', title: 'A', talkBody: oneOpen },     // 1
      { slug: 'b', title: 'B', talkBody: twoMixed },    // 2
    ],
    5,
  );
  assert.deepEqual(result, [
    { slug: 'b', title: 'B', count: 2 },
    { slug: 'a', title: 'A', count: 1 },
  ]);
});

test('aggregateOpenGaps: ties broken by slug asc', () => {
  const result = aggregateOpenGaps(
    [
      { slug: 'zebra', title: 'Zebra', talkBody: oneOpen },
      { slug: 'apple', title: 'Apple', talkBody: oneOpen },
      { slug: 'mango', title: 'Mango', talkBody: oneOpen },
    ],
    5,
  );
  assert.deepEqual(result.map(r => r.slug), ['apple', 'mango', 'zebra']);
});

test('aggregateOpenGaps: truncates to top N', () => {
  const inputs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, i) => ({
    slug: s,
    title: s.toUpperCase(),
    // Generate 7-i open threads each so order is deterministic
    talkBody: Array.from({ length: 7 - i }, (_, k) => `## T${k}\n\n::open\n\nBody.\n`).join('\n'),
  }));
  const result = aggregateOpenGaps(inputs, 3);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(r => r.slug), ['a', 'b', 'c']);
});

test('aggregateOpenGaps: pages with no talkBody are silently ignored', () => {
  const result = aggregateOpenGaps(
    [
      { slug: 'a', title: 'A', talkBody: '' },
      { slug: 'b', title: 'B', talkBody: oneOpen },
    ],
    5,
  );
  assert.deepEqual(result, [{ slug: 'b', title: 'B', count: 1 }]);
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `cd core && npx tsx --test test/pages/aggregate-open-gaps.test.ts`
Expected: FAIL — `Cannot find module 'aggregateOpenGaps'` or similar.

- [ ] **Step 1.3: Add the helper to `core/src/pages/talk-threads.ts`**

Append to the bottom of `core/src/pages/talk-threads.ts`:

```typescript
export interface OpenGapsRow {
  slug: string;
  title: string;
  count: number;
}

/**
 * Aggregate unresolved-thread counts across many talk pages and return
 * the top `limit` rows, sorted by count descending then slug ascending.
 * Rows with zero open threads are omitted. Empty `talkBody` is treated
 * as zero (no allocation, no parse).
 */
export function aggregateOpenGaps(
  pages: ReadonlyArray<{ slug: string; title: string; talkBody: string }>,
  limit: number,
): OpenGapsRow[] {
  const rows: OpenGapsRow[] = [];
  for (const p of pages) {
    if (!p.talkBody) continue;
    const count = countOpenThreads(p.talkBody);
    if (count > 0) rows.push({ slug: p.slug, title: p.title, count });
  }
  rows.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  return rows.slice(0, limit);
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `cd core && npx tsx --test test/pages/aggregate-open-gaps.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 1.5: Run the full core test suite (no regressions)**

Run: `cd core && npm test`
Expected: PASS (full suite).

- [ ] **Step 1.6: Commit**

```bash
git add core/src/pages/talk-threads.ts core/test/pages/aggregate-open-gaps.test.ts
git commit -m "feat: aggregateOpenGaps helper for editorial-gaps dashboard card

Pure top-N aggregator over talk-page bodies. Reused by frontend's
getCachedOpenGaps to power the home-page editorial-gaps card.

Addresses P1.3."
```

(Note: this is a partial-close for P1.3 so we use `addresses`, not
`closes`. Final close lands in Task 8.)

---

## Task 2: Add `getCachedOpenGaps()` and cache wrap `getRedlinks()`

**Files:**
- Modify: `frontend/lib/server-services.ts`

---

- [ ] **Step 2.1: Find the existing `getRedlinks` function (already in `server-services.ts:183-199`) and the recent-cache block (around line 109-136)**

Open `frontend/lib/server-services.ts` for editing. Confirm:
- `_recentCache` declared near line 112
- `getRecentlyRevised()` at line 118
- `getRedlinks()` at line 183
- `readTalkBody()` at line 471
- `invalidateListCache()` at line 92
- `import { parseTalkThreads, ... } from '@core/pages/talk-threads.ts';` at line 26

If any line number drifts, search for the symbol — they're stable identifiers.

- [ ] **Step 2.2: Add the new import**

Find this import line in `frontend/lib/server-services.ts`:

```typescript
import { parseTalkThreads, type ThreadMarker } from '@core/pages/talk-threads.ts';
```

Replace with:

```typescript
import { parseTalkThreads, aggregateOpenGaps, type ThreadMarker, type OpenGapsRow } from '@core/pages/talk-threads.ts';
```

- [ ] **Step 2.3: Add `getCachedOpenGaps()` and cache the redlinks call**

Find the existing recent-cache block in `frontend/lib/server-services.ts` (the block starting with the comment `// Recently-revised articles by file mtime.`). Immediately *after* the closing `}` of `getRecentlyRevised`, insert:

```typescript
// Editorial-gaps top-N for the home dashboard. Walks every live page's
// talk body (~50 reads today, ~500 at scale). 2s TTL collapses repeated
// renders; invalidated whenever the list cache is invalidated (any page
// write).
let _gapsCache: { rows: OpenGapsRow[]; total: number; articles: number; expiresAt: number } | null = null;

export interface OpenGapsView {
  rows: OpenGapsRow[];
  /** Total unresolved threads across the whole wiki. */
  total: number;
  /** Number of articles that have at least one unresolved thread. */
  articles: number;
}

export async function getCachedOpenGaps(limit: number): Promise<OpenGapsView> {
  const now = Date.now();
  if (_gapsCache && _gapsCache.expiresAt > now) {
    return { rows: _gapsCache.rows.slice(0, limit), total: _gapsCache.total, articles: _gapsCache.articles };
  }
  const { list } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);

  // Read every live page's talk body in parallel (silent on missing).
  const withTalk = await Promise.all(
    live.map(async p => ({
      slug: p.slug,
      title: p.title,
      talkBody: await readTalkBody(toTalkSlug(p.slug)),
    })),
  );

  // Full-list aggregate (for the footer) computed off the same data,
  // then slice to `limit` for display.
  const fullRows = aggregateOpenGaps(withTalk, Number.POSITIVE_INFINITY);
  const total = fullRows.reduce((s, r) => s + r.count, 0);
  const articles = fullRows.length;

  _gapsCache = { rows: fullRows, total, articles, expiresAt: now + LIST_TTL_MS };
  return { rows: fullRows.slice(0, limit), total, articles };
}
```

Then find the existing `getRedlinks` function (currently at `frontend/lib/server-services.ts:183-199`). Replace its body with a cached version. Replace:

```typescript
// Talk + archived pages are skipped: notes and tombstones shouldn't
// grow the want-list of articles to write.
export async function getRedlinks(): Promise<RedlinkEntry[]> {
  const { list, index } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);
  const store = getPageStore();
  const pages = await Promise.all(
    live.map(async p => {
      try {
        const page = await store.read(p.slug);
        return { slug: p.slug, body: page.body };
      } catch (err) {
        console.warn(`getRedlinks: skipping ${p.slug}: ${(err as Error).message}`);
        return { slug: p.slug, body: '' };
      }
    }),
  );
  return findRedlinks(pages, new Set(index.byCanonical.keys()));
}
```

with:

```typescript
// Talk + archived pages are skipped: notes and tombstones shouldn't
// grow the want-list of articles to write. Cached because the
// fan-out read across every page body is the same cost as the gaps
// walk; invalidated whenever any page is written.
let _redlinksCache: { entries: RedlinkEntry[]; expiresAt: number } | null = null;

export async function getRedlinks(): Promise<RedlinkEntry[]> {
  const now = Date.now();
  if (_redlinksCache && _redlinksCache.expiresAt > now) return _redlinksCache.entries;
  const { list, index } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);
  const store = getPageStore();
  const pages = await Promise.all(
    live.map(async p => {
      try {
        const page = await store.read(p.slug);
        return { slug: p.slug, body: page.body };
      } catch (err) {
        console.warn(`getRedlinks: skipping ${p.slug}: ${(err as Error).message}`);
        return { slug: p.slug, body: '' };
      }
    }),
  );
  const entries = findRedlinks(pages, new Set(index.byCanonical.keys()));
  _redlinksCache = { entries, expiresAt: now + LIST_TTL_MS };
  return entries;
}
```

- [ ] **Step 2.4: Extend `invalidateListCache()` to clear the new caches**

Find the existing `invalidateListCache` function in `frontend/lib/server-services.ts:92-94`:

```typescript
export function invalidateListCache(): void {
  _listCache = null;
}
```

Replace with:

```typescript
export function invalidateListCache(): void {
  _listCache = null;
  _recentCache = null;
  _gapsCache = null;
  _redlinksCache = null;
}
```

(`_recentCache` was previously not invalidated. The bug — recent-revised stayed stale after a page write for up to 2s longer than necessary — is harmless but cheap to fix while we're here. The other two new caches need invalidation by the same write path.)

- [ ] **Step 2.5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 2.6: Run frontend tests (smoke — make sure server-services still compiles + the dependency-injection tests pass)**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 2.7: Commit**

```bash
git add frontend/lib/server-services.ts
git commit -m "feat: cache redlinks + add getCachedOpenGaps fan-out

Wraps getRedlinks() in the project-standard 2s TTL cache (same shape
as getRecentlyRevised) and adds getCachedOpenGaps() to support the
upcoming editorial-gaps card. Both caches invalidate alongside the
page list whenever a page is written.

Addresses P1.3."
```

---

## Task 3: Add `OpenGapsCard` RSC + i18n keys + insert into home

**Files:**
- Create: `frontend/components/dashboard/open-gaps-card.tsx`
- Modify: `frontend/messages/en.json` (add keys only — translations land in Task 7)
- Modify: `frontend/app/[locale]/page.tsx`

---

- [ ] **Step 3.1: Add the i18n keys to `messages/en.json`**

Open `frontend/messages/en.json`. Find the existing `Page.Home` block. The current shape ends with:

```json
      "recentlyRevised": "Recently revised",
      "allArticles": "All articles ({count})",
      "talkPages": "Talk pages ({count})"
    },
```

Replace those three lines with:

```json
      "recentlyRevised": "Recently revised",
      "editorialGapsHeading": "Editorial gaps",
      "editorialGapsRow": "<a>{title}</a> {count, plural, one {# open} other {# open}} · <talk>talk →</talk>",
      "editorialGapsAggregate": "{threads, plural, one {# open} other {# open}} across {articles, plural, one {# article} other {# articles}}",
      "unwrittenPagesHeading": "Unwritten pages",
      "unwrittenPagesRow": "<a>[[ {target} ]]</a> {count, plural, one {# ref} other {# refs}}",
      "unwrittenPagesAggregate": "{targets, plural, one {# unwritten page} other {# unwritten pages}} · {refs, plural, one {# reference} other {# references}} · <a>all redlinks →</a>",
      "browseAllArticles": "Browse all {count, plural, one {# article} other {# articles}} →",
      "browseAllTalkPages": "{count, plural, one {# talk page} other {# talk pages}} →"
    },
```

(`allArticles` and `talkPages` keys are removed from `Page.Home` — they're no longer used on the home page. They will be re-added under `Page.Index` in Task 5.)

- [ ] **Step 3.2: Create the `OpenGapsCard` component**

Create `frontend/components/dashboard/open-gaps-card.tsx`:

```typescript
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { OpenGapsView } from '@/lib/server-services';

interface Props {
  view: OpenGapsView;
}

/**
 * Editorial-gaps dashboard card. Renders top-N articles by unresolved
 * thread count (`::open` + `::gap`) with a global aggregate footer.
 * Returns null when the wiki has no open gaps.
 */
export function OpenGapsCard({ view }: Props) {
  const t = useTranslations('Page.Home');
  if (view.rows.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
        {t('editorialGapsHeading')}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {view.rows.map(r => (
          <li key={r.slug} className="text-sm">
            {t.rich('editorialGapsRow', {
              title: r.title,
              count: r.count,
              a: chunks => (
                <Link
                  href={`/${r.slug}`}
                  className="font-medium underline-offset-4 hover:text-foreground hover:underline"
                >
                  {chunks}
                </Link>
              ),
              talk: chunks => (
                <Link
                  href={`/${r.slug}#talk-threads-heading`}
                  className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
            <span className="ms-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80">
              {/* count + "open" + talk arrow are inlined via the ICU rich template above */}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/70">
        {t('editorialGapsAggregate', { threads: view.total, articles: view.articles })}
      </p>
    </section>
  );
}
```

(Note: The empty `<span>` after the row's `t.rich(...)` exists as a layout breakpoint placeholder — remove if visually unnecessary after the home-page render check in Step 3.5. The ICU template already inlines count + "talk →"; the wrapper span is a safety net while iterating, not load-bearing.)

- [ ] **Step 3.3: Wire the card into the home page**

Open `frontend/app/[locale]/page.tsx`. Find these existing imports near the top:

```typescript
import { getCachedList, getCachedSnapshots, getRecentlyRevised } from '@/lib/server-services';
```

Replace with:

```typescript
import { getCachedList, getCachedSnapshots, getRecentlyRevised, getCachedOpenGaps } from '@/lib/server-services';
```

And add after the existing `OnThisDayRibbon` import:

```typescript
import { OpenGapsCard } from '@/components/dashboard/open-gaps-card';
```

Find the existing `const FRONTIER_LIMIT = 4;` line. Immediately after it, add:

```typescript
const GAPS_LIMIT = 5;
```

Find the existing parallel-fetch block:

```typescript
  const [tree, recent, snapshots] = await Promise.all([
    getFamilyTree(SELF_RECORD, null),
    getRecentlyRevised(PAGES_DIR, RECENT_LIMIT),
    getCachedSnapshots(GENEALOGY_DIR),
  ]);
```

Replace with:

```typescript
  const [tree, recent, snapshots, gaps] = await Promise.all([
    getFamilyTree(SELF_RECORD, null),
    getRecentlyRevised(PAGES_DIR, RECENT_LIMIT),
    getCachedSnapshots(GENEALOGY_DIR),
    getCachedOpenGaps(GAPS_LIMIT),
  ]);
```

Find the existing `<OnThisDayRibbon events={todayEvents} dayLabel={dayLabel} />` line. Immediately after the closing `</section>` of the `frontier.length > 0 ? (...)` block, insert:

```tsx
      <OpenGapsCard view={gaps} />
```

So the section order becomes: ribbon → frontier → **open-gaps** → recently-revised.

- [ ] **Step 3.4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3.5: Render-check the home page in the dev server**

Start (or confirm running) the dev server: `cd frontend && PORT=3001 npm run dev`
(Per the user's preference: frontend is pinned to :3001 because `wai` defaults to that URL.)

Visit `http://localhost:3001/en` in a browser. Confirm:
- Editorial-gaps section appears between Continue research and Recently revised.
- Rows show "{title} N open · talk →" with article and talk-anchor links.
- Aggregate footer reads "N open across M articles".
- Hovering a "talk →" link previews the target as `/{slug}#talk-threads-heading`.

If the safety-net `<span>` from Step 3.2 looks redundant in the DOM, remove it (delete the empty span and its surrounding `{/* ... */}` comment).

- [ ] **Step 3.6: Run all locale tests**

Run: `cd frontend && npm test`
Expected: PASS — including `messages-parity.test.ts` which will **fail** because ru/uk/he don't yet have the new keys. **Acceptable:** stop here, run Task 7 (translations) before the next commit, OR commit and accept a temporarily-broken parity test. Recommendation: defer the commit until Task 7 lands too, since en + translations are one logical unit.

**However**, to keep tasks independently-committable, the next step temporarily adds *placeholder* keys to the other three locales so the parity test stays green. Task 7 replaces them with real translations.

- [ ] **Step 3.7: Add placeholder keys to ru/uk/he to keep parity green**

Open `frontend/messages/ru.json`. Find the `Page.Home` block that ends with the same `recentlyRevised / allArticles / talkPages` triple. Apply the same shape replacement, but use English strings as placeholders:

```json
      "recentlyRevised": "Недавно отредактированные",
      "editorialGapsHeading": "Editorial gaps",
      "editorialGapsRow": "<a>{title}</a> {count, plural, one {# open} few {# open} many {# open} other {# open}} · <talk>talk →</talk>",
      "editorialGapsAggregate": "{threads, plural, one {# open} few {# open} many {# open} other {# open}} across {articles, plural, one {# article} few {# articles} many {# articles} other {# articles}}",
      "unwrittenPagesHeading": "Unwritten pages",
      "unwrittenPagesRow": "<a>[[ {target} ]]</a> {count, plural, one {# ref} few {# refs} many {# refs} other {# refs}}",
      "unwrittenPagesAggregate": "{targets, plural, one {# unwritten page} few {# unwritten pages} many {# unwritten pages} other {# unwritten pages}} · {refs, plural, one {# reference} few {# references} many {# references} other {# references}} · <a>all redlinks →</a>",
      "browseAllArticles": "Browse all {count, plural, one {# article} few {# articles} many {# articles} other {# articles}} →",
      "browseAllTalkPages": "{count, plural, one {# talk page} few {# talk pages} many {# talk pages} other {# talk pages}} →"
    },
```

Repeat for `frontend/messages/uk.json` (same Slavic categories — placeholders are English copy; real translation lands in Task 7).

For `frontend/messages/he.json`, the plural categories Hebrew requires are `one / two / many / other`:

```json
      "recentlyRevised": "נערכו לאחרונה",
      "editorialGapsHeading": "Editorial gaps",
      "editorialGapsRow": "<a>{title}</a> {count, plural, one {# open} two {# open} many {# open} other {# open}} · <talk>talk →</talk>",
      "editorialGapsAggregate": "{threads, plural, one {# open} two {# open} many {# open} other {# open}} across {articles, plural, one {# article} two {# articles} many {# articles} other {# articles}}",
      "unwrittenPagesHeading": "Unwritten pages",
      "unwrittenPagesRow": "<a>[[ {target} ]]</a> {count, plural, one {# ref} two {# refs} many {# refs} other {# refs}}",
      "unwrittenPagesAggregate": "{targets, plural, one {# unwritten page} two {# unwritten pages} many {# unwritten pages} other {# unwritten pages}} · {refs, plural, one {# reference} two {# references} many {# references} other {# references}} · <a>all redlinks →</a>",
      "browseAllArticles": "Browse all {count, plural, one {# article} two {# articles} many {# articles} other {# articles}} →",
      "browseAllTalkPages": "{count, plural, one {# talk page} two {# talk pages} many {# talk pages} other {# talk pages}} →"
    },
```

(Yes — the recently-revised key was already translated in each locale; preserve those existing translations and only insert the new keys + remove the now-obsolete `allArticles` / `talkPages` keys.)

- [ ] **Step 3.8: Re-run frontend tests**

Run: `cd frontend && npm test`
Expected: PASS — parity test green again.

- [ ] **Step 3.9: Commit**

```bash
git add frontend/components/dashboard/open-gaps-card.tsx frontend/app/[locale]/page.tsx frontend/messages/en.json frontend/messages/ru.json frontend/messages/uk.json frontend/messages/he.json
git commit -m "feat: editorial-gaps card on home dashboard

Adds OpenGapsCard RSC showing the top 5 articles by unresolved
::open + ::gap thread count, with a global aggregate footer. Hides
when the wiki has zero open gaps. Placeholder translations for
ru/uk/he land in this commit (real translations follow).

Addresses P1.3."
```

---

## Task 4: Add `RedlinksCard` RSC + insert into home

**Files:**
- Create: `frontend/components/dashboard/redlinks-card.tsx`
- Modify: `frontend/app/[locale]/page.tsx`

---

- [ ] **Step 4.1: Create the `RedlinksCard` component**

Create `frontend/components/dashboard/redlinks-card.tsx`:

```typescript
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { RedlinkEntry } from '@core/pages/redlinks.ts';

interface Props {
  entries: ReadonlyArray<RedlinkEntry>;
  /** How many top rows to display in the card. The aggregate footer
   *  spans the full list, so this is a display-only slice. */
  rowLimit: number;
}

/**
 * Unwritten-pages (redlinks) dashboard card. Renders top-N wikilink
 * targets that don't yet resolve to an article, with a global
 * aggregate footer. Returns null on an empty redlinks list.
 */
export function RedlinksCard({ entries, rowLimit }: Props) {
  const t = useTranslations('Page.Home');
  if (entries.length === 0) return null;

  const rows = entries.slice(0, rowLimit);
  const totalRefs = entries.reduce((s, e) => s + e.count, 0);

  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
        {t('unwrittenPagesHeading')}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {rows.map(r => (
          <li key={r.canonical} className="text-sm">
            {t.rich('unwrittenPagesRow', {
              target: r.target,
              count: r.count,
              a: chunks => (
                <Link
                  href="/redlinks"
                  className="redlink underline-offset-4 hover:no-underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/70">
        {t.rich('unwrittenPagesAggregate', {
          targets: entries.length,
          refs: totalRefs,
          a: chunks => (
            <Link
              href="/redlinks"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
```

- [ ] **Step 4.2: Wire into home page**

Open `frontend/app/[locale]/page.tsx`. Replace this import:

```typescript
import { getCachedList, getCachedSnapshots, getRecentlyRevised, getCachedOpenGaps } from '@/lib/server-services';
```

with:

```typescript
import { getCachedList, getCachedSnapshots, getRecentlyRevised, getCachedOpenGaps, getRedlinks } from '@/lib/server-services';
```

Add after the existing `OpenGapsCard` import:

```typescript
import { RedlinksCard } from '@/components/dashboard/redlinks-card';
```

Find the `const GAPS_LIMIT = 5;` line. Immediately after it, add:

```typescript
const REDLINKS_LIMIT = 5;
```

Find the parallel-fetch `Promise.all` block (updated in Task 3) and add `getRedlinks()` to it:

```typescript
  const [tree, recent, snapshots, gaps, redlinks] = await Promise.all([
    getFamilyTree(SELF_RECORD, null),
    getRecentlyRevised(PAGES_DIR, RECENT_LIMIT),
    getCachedSnapshots(GENEALOGY_DIR),
    getCachedOpenGaps(GAPS_LIMIT),
    getRedlinks(),
  ]);
```

Find the "Recently revised" section JSX — the block starting `{recent.length > 0 ? (`. Immediately after that block's closing `) : null}`, insert:

```tsx
      <RedlinksCard entries={redlinks} rowLimit={REDLINKS_LIMIT} />
```

So the section order becomes: ribbon → frontier → gaps → recently-revised → **redlinks** → (existing A–Z grid — removed in Task 5).

- [ ] **Step 4.3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4.4: Render-check the home page**

Visit `http://localhost:3001/en`. Confirm:
- Unwritten pages section appears below Recently revised.
- Up to 5 redlink targets shown as `[[ target ]] N refs` in red.
- Aggregate footer reads "N unwritten pages · M references · all redlinks →".
- "all redlinks →" link goes to `/en/redlinks` (404 until Task 6 — expected).

- [ ] **Step 4.5: Run tests**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add frontend/components/dashboard/redlinks-card.tsx frontend/app/[locale]/page.tsx
git commit -m "feat: unwritten-pages (redlinks) card on home dashboard

Adds RedlinksCard RSC showing the top 5 wikilink targets with no
resolving article, plus a global aggregate footer linking to the
full /redlinks listing (added in the next commit). Hides when zero.

Addresses P1.3."
```

---

## Task 5: Add `/[locale]/index` route + lift A–Z + talk grids + home browse-all footer

**Files:**
- Create: `frontend/app/[locale]/index/page.tsx`
- Modify: `frontend/app/[locale]/page.tsx`
- Modify: `frontend/messages/en.json`, `ru.json`, `uk.json`, `he.json` (re-add `allArticles` and `talkPages` keys under a new `Page.Index` namespace)

---

- [ ] **Step 5.1: Add `Page.Index` namespace to `messages/en.json`**

Open `frontend/messages/en.json`. Find the closing `},` of the `Page.Home` block. After it (but still inside the outer `Page` object), add a new `Index` namespace:

```json
    "Index": {
      "registry": "The Registry",
      "navHome": "← Home",
      "ancestorsAcrossGenerations": "{ancestors, plural, one {# ancestor} other {# ancestors}} across {generations, plural, one {# generation} other {# generations}}",
      "articlesCount": "{count, plural, one {# article} other {# articles}}",
      "gedcomSync": "GEDCOM {date}",
      "allArticlesHeading": "All articles ({count})",
      "talkPagesHeading": "Talk pages ({count})",
      "emptyArticles": "No articles yet.",
      "emptyTalkPages": "No talk pages yet."
    },
```

(Several keys duplicate `Page.Home` — that's the stat-triple duplication baked into the spec. Two callers; abstraction not yet warranted.)

- [ ] **Step 5.2: Add the same namespace shape to ru/uk/he (placeholder copies)**

For `frontend/messages/ru.json`, `uk.json`, and `he.json`, add the `Page.Index` block with the same key shape. Use the locale's existing translation of `registry` if present; for new keys, use English placeholders that Task 7 will replace.

ru.json `Page.Index` block (use the Slavic-plural form):

```json
    "Index": {
      "registry": "Реестр",
      "navHome": "← Home",
      "ancestorsAcrossGenerations": "{ancestors, plural, one {# ancestor} few {# ancestors} many {# ancestors} other {# ancestors}} across {generations, plural, one {# generation} few {# generations} many {# generations} other {# generations}}",
      "articlesCount": "{count, plural, one {# article} few {# articles} many {# articles} other {# articles}}",
      "gedcomSync": "GEDCOM {date}",
      "allArticlesHeading": "All articles ({count})",
      "talkPagesHeading": "Talk pages ({count})",
      "emptyArticles": "No articles yet.",
      "emptyTalkPages": "No talk pages yet."
    },
```

Mirror to `uk.json` (same Slavic categories).

he.json (Hebrew plural categories `one/two/many/other`):

```json
    "Index": {
      "registry": "המרשם",
      "navHome": "← Home",
      "ancestorsAcrossGenerations": "{ancestors, plural, one {# ancestor} two {# ancestors} many {# ancestors} other {# ancestors}} across {generations, plural, one {# generation} two {# generations} many {# generations} other {# generations}}",
      "articlesCount": "{count, plural, one {# article} two {# articles} many {# articles} other {# articles}}",
      "gedcomSync": "GEDCOM {date}",
      "allArticlesHeading": "All articles ({count})",
      "talkPagesHeading": "Talk pages ({count})",
      "emptyArticles": "No articles yet.",
      "emptyTalkPages": "No talk pages yet."
    },
```

- [ ] **Step 5.3: Create the index route**

Create `frontend/app/[locale]/index/page.tsx`:

```typescript
import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { getCachedList, getCachedSnapshots } from '@/lib/server-services';
import { getFamilyTree } from '@/lib/family';
import { GENEALOGY_DIR, SELF_RECORD } from '@/lib/env';
import { joinMeta } from '@/components/family/sections/shared';

export const dynamic = 'force-dynamic';

export default async function IndexPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Page.Index' });

  const { list } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);
  const talk = list.filter(p => p.isTalk && !p.isArchived);

  const [tree, snapshots] = await Promise.all([
    getFamilyTree(SELF_RECORD, null),
    getCachedSnapshots(GENEALOGY_DIR),
  ]);

  const latestSnap = snapshots[snapshots.length - 1];
  const snapDate = latestSnap?.date?.slice(0, 10) ?? null;
  const generations = tree
    ? tree.byGeneration.filter(g => g.paternal.length + g.maternal.length > 0).length
    : 0;
  const ancestors = tree
    ? tree.byGeneration.reduce((s, g) => s + g.paternal.length + g.maternal.length, 0)
    : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-10 border-b pb-7">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
          {t('registry')}
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
          Index
        </h1>
        <p className="mt-3 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground/85">
          {joinMeta([
            ancestors > 0 ? t('ancestorsAcrossGenerations', { ancestors, generations }) : null,
            t('articlesCount', { count: live.length }),
            snapDate ? t('gedcomSync', { date: snapDate }) : null,
          ])}
        </p>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t('navHome')}
          </Link>
        </nav>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
          {t('allArticlesHeading', { count: String(live.length) })}
        </h2>
        {live.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyArticles')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {live.map(p => (
              <li key={p.slug}>
                <Link href={`/${p.slug}`} className="underline-offset-4 hover:text-foreground hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="talk">
        <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
          {t('talkPagesHeading', { count: String(talk.length) })}
        </h2>
        {talk.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyTalkPages')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {talk.map(p => (
              <li key={p.slug}>
                <Link href={`/${p.slug}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 5.4: Remove the A–Z and talk-pages sections from the home page**

Open `frontend/app/[locale]/page.tsx`. Find the current "All articles" and "Talk pages" sections at the bottom of the JSX (the two `<section>` blocks starting with `<h2>... {t('allArticles', ...)}` and `<h2>... {t('talkPages', ...)}`). Delete both sections entirely.

Replace them with a single browse-all footer block (insert in the same spot):

```tsx
      <footer className="mt-12 flex flex-col gap-1 border-t pt-6 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground">
        <Link href="/index" className="hover:text-foreground hover:underline">
          {t('browseAllArticles', { count: live.length })}
        </Link>
        {talk.length > 0 ? (
          <Link href="/index#talk" className="hover:text-foreground hover:underline">
            {t('browseAllTalkPages', { count: talk.length })}
          </Link>
        ) : null}
      </footer>
```

- [ ] **Step 5.5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors. If tsc complains that `Page.Index` is not a known namespace path, run `cd frontend && npm run build` once (or restart `next dev`) to regenerate `messages/en.d.json.ts` — per `frontend/AGENTS.md`, the declaration file is auto-generated and occasionally needs a rebuild after adding namespaces.

- [ ] **Step 5.6: Render-check both routes**

Visit `http://localhost:3001/en`:
- Home no longer shows A–Z grid or talk-pages grid.
- Footer shows "Browse all N articles →" and "M talk pages →" links.

Visit `http://localhost:3001/en/index`:
- Stat header.
- A–Z articles grid (2-column on sm+).
- Talk-pages grid below.
- Hash link `/en/index#talk` jumps to the talk-pages section.

- [ ] **Step 5.7: Run tests**

Run: `cd frontend && npm test`
Expected: PASS — including `messages-parity.test.ts`.

- [ ] **Step 5.8: Commit**

```bash
git add frontend/app/[locale]/index/page.tsx frontend/app/[locale]/page.tsx frontend/messages/en.json frontend/messages/ru.json frontend/messages/uk.json frontend/messages/he.json
git commit -m "feat: move A-Z grid and talk-pages grid to /index route

Home page now ends with a two-line browse-all footer; the full
directory of articles + talk pages lives at /[locale]/index. Frees
the home page to be a true research dashboard.

Addresses P1.3."
```

---

## Task 6: Add `/[locale]/redlinks` listing route

**Files:**
- Create: `frontend/app/[locale]/redlinks/page.tsx`
- Modify: `frontend/messages/en.json`, `ru.json`, `uk.json`, `he.json` (add `Page.Redlinks` namespace)

---

- [ ] **Step 6.1: Add the `Page.Redlinks` namespace to en.json**

Open `frontend/messages/en.json`. After the closing `},` of the `Page.Index` block (still inside the outer `Page` object), add:

```json
    "Redlinks": {
      "registry": "The Registry",
      "navHome": "← Home",
      "title": "Unwritten pages",
      "summary": "{targets, plural, one {# unwritten target} other {# unwritten targets}} · {refs, plural, one {# reference} other {# references}}",
      "empty": "No redlinks yet — every wikilink resolves.",
      "linkedFrom": "Linked from:",
      "refCount": "{count, plural, one {# ref} other {# refs}}"
    },
```

- [ ] **Step 6.2: Mirror the namespace to ru/uk/he**

For ru.json and uk.json (Slavic categories):

```json
    "Redlinks": {
      "registry": "Реестр",
      "navHome": "← Home",
      "title": "Unwritten pages",
      "summary": "{targets, plural, one {# unwritten target} few {# unwritten targets} many {# unwritten targets} other {# unwritten targets}} · {refs, plural, one {# reference} few {# references} many {# references} other {# references}}",
      "empty": "No redlinks yet — every wikilink resolves.",
      "linkedFrom": "Linked from:",
      "refCount": "{count, plural, one {# ref} few {# refs} many {# refs} other {# refs}}"
    },
```

(Use the locale's existing translation of `registry` if present in the other places it appears.)

For he.json (Hebrew categories `one/two/many/other`):

```json
    "Redlinks": {
      "registry": "המרשם",
      "navHome": "← Home",
      "title": "Unwritten pages",
      "summary": "{targets, plural, one {# unwritten target} two {# unwritten targets} many {# unwritten targets} other {# unwritten targets}} · {refs, plural, one {# reference} two {# references} many {# references} other {# references}}",
      "empty": "No redlinks yet — every wikilink resolves.",
      "linkedFrom": "Linked from:",
      "refCount": "{count, plural, one {# ref} two {# refs} many {# refs} other {# refs}}"
    },
```

- [ ] **Step 6.3: Create the redlinks route**

Create `frontend/app/[locale]/redlinks/page.tsx`:

```typescript
import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { getRedlinks } from '@/lib/server-services';

export const dynamic = 'force-dynamic';

export default async function RedlinksPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Page.Redlinks' });

  const entries = await getRedlinks();
  const totalRefs = entries.reduce((s, e) => s + e.count, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-10 border-b pb-7">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
          {t('registry')}
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-3 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground/85">
          {t('summary', { targets: entries.length, refs: totalRefs })}
        </p>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t('navHome')}
          </Link>
        </nav>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {entries.map(r => (
            <li key={r.canonical}>
              <h2 className="text-lg font-medium">
                <span className="redlink">[[ {r.target} ]]</span>
                <span className="ms-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80">
                  {t('refCount', { count: r.count })}
                </span>
              </h2>
              <p className="mt-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                {t('linkedFrom')}
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {r.sources.map(s => (
                  <li key={s}>
                    <Link href={`/${s}`} className="underline-offset-4 hover:text-foreground hover:underline">
                      {s}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 6.4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6.5: Render-check**

Visit `http://localhost:3001/en/redlinks`. Confirm:
- Hero with title + summary count + back-to-home link.
- Each redlink target shown as `[[ target ]]` (red) + ref count.
- Source list expands per target.
- Source page links work.
- Visit `http://localhost:3001/en` and click "all redlinks →" — should land on `/en/redlinks`.

- [ ] **Step 6.6: Run tests**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 6.7: Commit**

```bash
git add frontend/app/[locale]/redlinks/page.tsx frontend/messages/en.json frontend/messages/ru.json frontend/messages/uk.json frontend/messages/he.json
git commit -m "feat: /redlinks listing route

Surfaces the full want-list of unwritten wikilink targets, sorted by
reference count, with the list of source pages expanded under each
target. Reachable from the home dashboard's unwritten-pages card.

Addresses P1.3."
```

---

## Task 7: Real translations for ru/uk/he

**Files:**
- Modify: `frontend/messages/ru.json`, `uk.json`, `he.json`

---

- [ ] **Step 7.1: Replace placeholder English strings in `ru.json`**

In `frontend/messages/ru.json`, replace the placeholders added in Tasks 3, 5, and 6 with actual Russian translations. The key shape must remain identical to en.json (don't add or remove keys). Categories: `one/few/many/other`.

For the `Page.Home` block — replace English placeholders with:

```json
      "editorialGapsHeading": "Редакторские пробелы",
      "editorialGapsRow": "<a>{title}</a> {count, plural, one {# открытый} few {# открытых} many {# открытых} other {# открытых}} · <talk>обсуждение →</talk>",
      "editorialGapsAggregate": "{threads, plural, one {# открытый} few {# открытых} many {# открытых} other {# открытых}} в {articles, plural, one {# статье} few {# статьях} many {# статьях} other {# статьях}}",
      "unwrittenPagesHeading": "Ненаписанные страницы",
      "unwrittenPagesRow": "<a>[[ {target} ]]</a> {count, plural, one {# ссылка} few {# ссылки} many {# ссылок} other {# ссылок}}",
      "unwrittenPagesAggregate": "{targets, plural, one {# ненаписанная страница} few {# ненаписанные страницы} many {# ненаписанных страниц} other {# ненаписанных страниц}} · {refs, plural, one {# ссылка} few {# ссылки} many {# ссылок} other {# ссылок}} · <a>все красные ссылки →</a>",
      "browseAllArticles": "Все {count, plural, one {# статья} few {# статьи} many {# статей} other {# статей}} →",
      "browseAllTalkPages": "{count, plural, one {# страница обсуждения} few {# страницы обсуждения} many {# страниц обсуждения} other {# страниц обсуждения}} →"
```

For `Page.Index`:

```json
      "navHome": "← На главную",
      "allArticlesHeading": "Все статьи ({count})",
      "talkPagesHeading": "Страницы обсуждения ({count})",
      "emptyArticles": "Пока нет статей.",
      "emptyTalkPages": "Пока нет страниц обсуждения."
```

For `Page.Redlinks`:

```json
      "navHome": "← На главную",
      "title": "Ненаписанные страницы",
      "summary": "{targets, plural, one {# ненаписанная цель} few {# ненаписанные цели} many {# ненаписанных целей} other {# ненаписанных целей}} · {refs, plural, one {# ссылка} few {# ссылки} many {# ссылок} other {# ссылок}}",
      "empty": "Красных ссылок нет — все вики-ссылки разрешаются.",
      "linkedFrom": "Источники:",
      "refCount": "{count, plural, one {# ссылка} few {# ссылки} many {# ссылок} other {# ссылок}}"
```

- [ ] **Step 7.2: Replace placeholders in `uk.json`**

Same shape; Ukrainian translations. Categories `one/few/many/other`.

For `Page.Home`:

```json
      "editorialGapsHeading": "Редакційні прогалини",
      "editorialGapsRow": "<a>{title}</a> {count, plural, one {# відкритий} few {# відкритих} many {# відкритих} other {# відкритих}} · <talk>обговорення →</talk>",
      "editorialGapsAggregate": "{threads, plural, one {# відкритий} few {# відкритих} many {# відкритих} other {# відкритих}} у {articles, plural, one {# статті} few {# статтях} many {# статтях} other {# статтях}}",
      "unwrittenPagesHeading": "Ненаписані сторінки",
      "unwrittenPagesRow": "<a>[[ {target} ]]</a> {count, plural, one {# посилання} few {# посилання} many {# посилань} other {# посилань}}",
      "unwrittenPagesAggregate": "{targets, plural, one {# ненаписана сторінка} few {# ненаписані сторінки} many {# ненаписаних сторінок} other {# ненаписаних сторінок}} · {refs, plural, one {# посилання} few {# посилання} many {# посилань} other {# посилань}} · <a>усі червоні посилання →</a>",
      "browseAllArticles": "Усі {count, plural, one {# стаття} few {# статті} many {# статей} other {# статей}} →",
      "browseAllTalkPages": "{count, plural, one {# сторінка обговорення} few {# сторінки обговорення} many {# сторінок обговорення} other {# сторінок обговорення}} →"
```

For `Page.Index`:

```json
      "navHome": "← На головну",
      "allArticlesHeading": "Усі статті ({count})",
      "talkPagesHeading": "Сторінки обговорення ({count})",
      "emptyArticles": "Поки немає статей.",
      "emptyTalkPages": "Поки немає сторінок обговорення."
```

For `Page.Redlinks`:

```json
      "navHome": "← На головну",
      "title": "Ненаписані сторінки",
      "summary": "{targets, plural, one {# ненаписана ціль} few {# ненаписані цілі} many {# ненаписаних цілей} other {# ненаписаних цілей}} · {refs, plural, one {# посилання} few {# посилання} many {# посилань} other {# посилань}}",
      "empty": "Червоних посилань немає — усі вікі-посилання вирішуються.",
      "linkedFrom": "Джерела:",
      "refCount": "{count, plural, one {# посилання} few {# посилання} many {# посилань} other {# посилань}}"
```

- [ ] **Step 7.3: Replace placeholders in `he.json`**

Same shape; Hebrew translations. Categories `one/two/many/other`. Note that this catalog is RTL.

For `Page.Home`:

```json
      "editorialGapsHeading": "פערים עריכתיים",
      "editorialGapsRow": "<a>{title}</a> {count, plural, one {# פתוח} two {# פתוחים} many {# פתוחים} other {# פתוחים}} · <talk>שיחה →</talk>",
      "editorialGapsAggregate": "{threads, plural, one {# פתוח} two {# פתוחים} many {# פתוחים} other {# פתוחים}} ב־{articles, plural, one {# מאמר} two {# מאמרים} many {# מאמרים} other {# מאמרים}}",
      "unwrittenPagesHeading": "דפים שלא נכתבו",
      "unwrittenPagesRow": "<a>[[ {target} ]]</a> {count, plural, one {# הפניה} two {# הפניות} many {# הפניות} other {# הפניות}}",
      "unwrittenPagesAggregate": "{targets, plural, one {# דף שלא נכתב} two {# דפים שלא נכתבו} many {# דפים שלא נכתבו} other {# דפים שלא נכתבו}} · {refs, plural, one {# הפניה} two {# הפניות} many {# הפניות} other {# הפניות}} · <a>כל הקישורים האדומים →</a>",
      "browseAllArticles": "כל {count, plural, one {# מאמר} two {# המאמרים} many {# המאמרים} other {# המאמרים}} →",
      "browseAllTalkPages": "{count, plural, one {# דף שיחה} two {# דפי שיחה} many {# דפי שיחה} other {# דפי שיחה}} →"
```

For `Page.Index`:

```json
      "navHome": "← לדף הבית",
      "allArticlesHeading": "כל המאמרים ({count})",
      "talkPagesHeading": "דפי שיחה ({count})",
      "emptyArticles": "אין מאמרים עדיין.",
      "emptyTalkPages": "אין דפי שיחה עדיין."
```

For `Page.Redlinks`:

```json
      "navHome": "← לדף הבית",
      "title": "דפים שלא נכתבו",
      "summary": "{targets, plural, one {# יעד לא־כתוב} two {# יעדים לא־כתובים} many {# יעדים לא־כתובים} other {# יעדים לא־כתובים}} · {refs, plural, one {# הפניה} two {# הפניות} many {# הפניות} other {# הפניות}}",
      "empty": "אין קישורים אדומים — כל קישורי הוויקי נפתרים.",
      "linkedFrom": "מקושר מ:",
      "refCount": "{count, plural, one {# הפניה} two {# הפניות} many {# הפניות} other {# הפניות}}"
```

- [ ] **Step 7.4: Run all tests including parity**

Run: `cd frontend && npm test`
Expected: PASS. Critical: `messages-parity.test.ts` must remain green.

- [ ] **Step 7.5: Render-check each locale**

Visit:
- `http://localhost:3001/ru` — confirm Russian strings render in the gaps/redlinks/browse-all blocks
- `http://localhost:3001/uk` — confirm Ukrainian strings
- `http://localhost:3001/he` — confirm Hebrew strings and that the dashboard renders RTL (logical-property layout was used throughout, so no manual flip needed; spot-check that the bullet list reads right-to-left)

For Hebrew specifically — confirm that the `<bdi>` wrappers around any Latin titles (talk-thread headings, redlink targets) prevent direction bleed. If a row's mixed-script title looks scrambled, wrap the title rendering in the affected card in `<bdi>{title}</bdi>` and re-render.

- [ ] **Step 7.6: Commit**

```bash
git add frontend/messages/ru.json frontend/messages/uk.json frontend/messages/he.json
git commit -m "i18n: translate home dashboard new strings to ru/uk/he

Real translations for the editorial-gaps, unwritten-pages, index,
and redlinks namespaces. Pluralization follows the language's CLDR
category set (Slavic one/few/many/other, Hebrew one/two/many/other).

Addresses P1.3."
```

---

## Task 8: Update roadmap, CHANGELOG, plan-index

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

---

- [ ] **Step 8.1: Update `docs/ROADMAP.md`**

Open `docs/ROADMAP.md`. Find the Wave 3 row for P1.3 (currently around line 116, starting with `| ⏳ ready | **P1.3** Home page → research dashboard`). Replace that table row with:

```markdown
| ✅ shipped | **P1.3** Home page → research dashboard (frontier, recently revised, editorial gaps, unwritten pages, A–Z relegated to `/index`) | S | [Review §P1.3](./reviews/2026-05-07-platform-review.md#p13--home-page-is-a-bare-directory-listing) — *Shipped 2026-05-18. Home page is now a five-card dashboard: hero stats, on-this-day ribbon (added 2026-05-16), continue-research frontier, editorial gaps (top 5 articles by unresolved `::open` + `::gap` thread count), recently revised, unwritten pages (top 5 redlink targets). A–Z articles + talk-pages grids moved to `/index`; full redlinks listing at `/redlinks`. Pure aggregator in [`core/src/pages/talk-threads.ts`](../core/src/pages/talk-threads.ts) (`aggregateOpenGaps`); cached fan-out readers in [`frontend/lib/server-services.ts`](../frontend/lib/server-services.ts). Spec: [`2026-05-18-home-research-dashboard-design.md`](./superpowers/specs/2026-05-18-home-research-dashboard-design.md). Plan: [`2026-05-18-home-research-dashboard.md`](./superpowers/plans/2026-05-18-home-research-dashboard.md).* |
```

Also check if any "Risks & sequencing" or summary section earlier in the file references P1.3 as "partial" or "wave 3 next" — if so, update the wording to reflect that it's now shipped.

- [ ] **Step 8.2: Add a CHANGELOG entry**

Open `CHANGELOG.md`. Under the `## [Unreleased]` heading, add an entry that names P1.3. Match the prevailing tone of recent `feat:` entries:

```markdown
- **feat(frontend):** home page reworked into a research dashboard — adds an editorial-gaps card (top 5 articles by unresolved `::open`/`::gap` thread count) and an unwritten-pages card (top 5 redlink targets). The A–Z articles and talk-pages grids move to `/index`; a full redlinks listing lands at `/redlinks`. Closes P1.3.
```

(Note: uses `Closes P1.3` because this is the final-close commit. The `roadmap-drift` test requires the P-ID and the verb match the ✅ row flip.)

- [ ] **Step 8.3: Update the plan-index README**

Open `docs/superpowers/plans/README.md`. Add a new row for this plan in chronological position (just before the `2026-05-17` rows). Use the project's row format — match the style of an existing row (the closest model is the `2026-05-16-this-day-in-family-history-ribbon.md` row).

The row should mark the plan as ✅ shipped (since this is the same commit set that flips the roadmap row).

If the plan-index README has a `**Total: N plans**` footer line, increment N by 1.

- [ ] **Step 8.4: Run the drift tests**

Run: `cd cli && npx tsx --test test/roadmap-drift.test.ts test/plan-index-drift.test.ts`
Expected: PASS.

If `roadmap-drift` fails, the diff is almost always (a) the P-ID isn't named in the CHANGELOG entry with one of `closes`/`completes`/`ships`, or (b) the row isn't actually flipped to ✅ — re-read the test output.

If `plan-index-drift` fails, the diff is typically (a) the new row doesn't reference an existing file on disk, (b) the `**Total: N plans**` footer count doesn't match, or (c) the plan's `Create:` files listed in this plan don't all exist — but since all our `Create:` files are now in place, that should be fine.

- [ ] **Step 8.5: Run the full project test suite as a final pre-commit gate**

Run: `cd core && npm test && cd ../frontend && npm test && cd ../cli && npm test`
Expected: PASS in all three.

- [ ] **Step 8.6: Commit**

```bash
git add docs/ROADMAP.md CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "feat: ship P1.3 home research dashboard

Closes P1.3. Updates roadmap row to ✅ shipped, adds CHANGELOG
entry, and flips the plan-index row.
"
```

---

## Self-review

Spec coverage map:

| Spec section / requirement | Task(s) |
|---|---|
| Editorial-gaps card RSC | Task 3 |
| Open-gaps top-N aggregation pure helper | Task 1 |
| Open-gaps fan-out + caching wrapper | Task 2 |
| Open-gaps aggregate footer (informational, no link — spec updated to match) | Task 3 |
| Redlinks card RSC | Task 4 |
| Redlinks caching | Task 2 |
| `/[locale]/index` route | Task 5 |
| `/[locale]/redlinks` route | Task 6 |
| Home A–Z + talk grid removal + browse-all footer | Task 5 |
| i18n keys (en) | Tasks 3, 5, 6 |
| Translations (ru/uk/he) | Tasks 3.7 (placeholders), 5.2 (placeholders), 6.2 (placeholders), 7 (real) |
| Roadmap row flip + CHANGELOG | Task 8 |
| Plan-index update | Task 8 |
| Tests: pure-function tests | Task 1 |
| Tests: parity + drift gates green | Tasks 3.8, 5.7, 7.4, 8.4 |
| Render check in dev server | Tasks 3.5, 4.4, 5.6, 6.5, 7.5 |

No open items. Spec and plan are aligned on the editorial-gaps aggregate being informational text (no anchor) — the per-row "talk →" link is the only editor-entry CTA. A future `/gaps` listing can add the "all gaps →" anchor when it ships.
