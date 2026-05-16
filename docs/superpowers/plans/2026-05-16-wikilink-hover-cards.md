# Wikilink Hover-Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the reader hovers a `[[wikilink]]` (or any link to an internal slug) in a rendered wiki page, a 200ms-delayed card pops next to the link showing portrait, title, dates, and a one-line lead. Wikipedia-style page-peek. Transforms in-text reading: no more context-switching to check who someone is.

**Architecture:** All hover-card data is precomputed at render time — no client-side fetch, no flicker. The page route builds a `Map<slug, HoverCardData>` from the page list and the cached derived-records map, threads it into `renderMarkdown`, and the renderer registers an `a` element override that swaps any anchor whose href matches a known slug for a `<WikilinkHoverCard>` client component. The card primitive is base-ui's `PreviewCard` (already in `@base-ui/react` as `preview-card`) — it handles hover delays, viewport-aware positioning via Floating UI, focus, keyboard (Esc), touch, and ARIA out of the box. Project wraps it in `components/ui/hover-card.tsx` following the same shadcn-on-base-ui pattern the existing `dialog.tsx` / `sheet.tsx` files use.

**Tech Stack:** Existing — React 19 RSC + client components, Next 16 App Router, `@base-ui/react/preview-card`, the markdown pipeline in `frontend/lib/render.tsx`, `tsx --test`. No new packages.

---

## Design decisions baked in

- **Trigger:** any rendered `<a>` whose href is `/<slug>` AND that slug appears in the precomputed hover-data map. Catches both `[[wikilink]]`-resolved links and any manually-written `[Title](/slug)` markdown. Cleaner than narrowing only to wikilinks — same data, same benefit.
- **No client fetch.** All card content (portrait, lead, dates, title) is precomputed at SSR. The client component is purely the hover/positioning logic + render. Eliminates loading flicker, network cost, and revealing-the-graph-via-prefetch.
- **Lead sentence extractor.** First non-blank, non-heading, non-directive, non-frontmatter line of the body. Markdown markup stripped. Truncated to ~160 chars.
- **Portrait or monogram.** If `page.meta.portrait` exists, use it. Otherwise fall back to the existing `AvatarMonogram` component (already used elsewhere).
- **Dates from derived.** When the page is joined to a GEDCOM record, pull birth/death years from the derived YAML. Render as `1880–1955` or `1880–` (living) or just `b. 1880` if no death and no living signal.
- **Self-link suppression.** If the hover-card's slug equals the page being viewed, render plain `<a>` (don't pop a card pointing at the page you're on).
- **One card open at a time.** Opening a new card closes any other open card. Prevents card spam during fast cursor sweeps.
- **Touch devices skipped.** `@media (hover: hover) and (pointer: fine)` gates the hover behavior. On touch, the link clicks normally — no card.
- **Position:** card appears below the link, left-aligned with the link's left edge, offset 8px down. If the card would overflow the viewport bottom, flip above. If it would overflow right, right-align instead. No floating-ui dependency — vanilla `getBoundingClientRect` + transforms.
- **Card stays on hover.** Mousing onto the card itself cancels the close timer. Mouseleave (from card OR trigger) starts a 150ms close timer.
- **Hover delay 200ms.** Matches Wikipedia. Fast enough to feel snappy, slow enough that casual cursor sweeps don't trigger.

---

## File structure

| File | Role |
|---|---|
| `frontend/lib/page-card-data.ts` (new) | Pure: `extractLeadSentence(body)` and `buildHoverDataBySlug(list, derivedBySlug, pageBodiesBySlug)`. Returns `Map<slug, HoverCardData>` with title/lead/portrait/born/died. |
| `frontend/lib/page-card-data.test.ts` (new) | Tests for the extractor (skips frontmatter / headings / directives / fences; truncates) and the builder. |
| `frontend/components/ui/hover-card.tsx` (new, client) | Thin shadcn-style wrapper around `@base-ui/react/preview-card`. Exposes `HoverCard`, `HoverCardTrigger`, `HoverCardContent`. Project styling baked into `HoverCardContent`. |
| `frontend/components/wikilink-hover-card.tsx` (new, client) | Composition: wraps the trigger anchor in `HoverCardTrigger` and the card body (portrait/title/lead/dates) in `HoverCardContent`. No primitive logic here — base-ui handles delays/positioning/focus/keyboard/touch. |
| `frontend/lib/render.tsx` (modify) | Add `hoverDataBySlug?: Map<string, HoverCardData>` option; register an `a` element override that swaps known-slug internal links for `<WikilinkHoverCard>`. |
| `frontend/app/[slug]/page.tsx` (modify) | Build `hoverDataBySlug` from the page list + derived map at request time; pass to `renderMarkdown`. |

---

## Task 1: Lead-sentence extractor

Pure helper. First "real" line of the body — strips frontmatter, fences, headings, directives, blank lines; truncates.

**Files:**
- Create: `frontend/lib/page-card-data.ts`
- Create: `frontend/lib/page-card-data.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/lib/page-card-data.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLeadSentence } from './page-card-data';

test('extractLeadSentence: returns the first non-blank prose line', () => {
  const body = 'Abby Rickelman was a milliner who arrived in Brooklyn in 1898.\n\nMore text here.';
  assert.equal(extractLeadSentence(body), 'Abby Rickelman was a milliner who arrived in Brooklyn in 1898.');
});

test('extractLeadSentence: skips opening frontmatter delimiter and content', () => {
  const body = '---\ntitle: Foo\n---\n\nLead line here.';
  assert.equal(extractLeadSentence(body), 'Lead line here.');
});

test('extractLeadSentence: skips H1/H2/H3 headings', () => {
  const body = '# A Heading\n\n## Subheading\n\nActual lead.';
  assert.equal(extractLeadSentence(body), 'Actual lead.');
});

test('extractLeadSentence: skips directive blocks (:::name … :::)', () => {
  const body = ':::infobox-person\nborn: 1880\n:::\n\nFirst prose line.';
  assert.equal(extractLeadSentence(body), 'First prose line.');
});

test('extractLeadSentence: skips fenced code blocks', () => {
  const body = '```\ncode here\n```\n\nFirst prose.';
  assert.equal(extractLeadSentence(body), 'First prose.');
});

test('extractLeadSentence: strips markdown emphasis and links', () => {
  const body = '**Boris** was a *teacher* in [[Brooklyn]] before 1946.';
  // Bold/italic markers stripped; wikilink reduced to its display text.
  assert.equal(extractLeadSentence(body), 'Boris was a teacher in Brooklyn before 1946.');
});

test('extractLeadSentence: truncates to ~160 chars with ellipsis', () => {
  const long = 'a'.repeat(250);
  const out = extractLeadSentence(long);
  assert.ok(out.length <= 161, `expected length ≤ 161, got ${out.length}`);
  assert.ok(out.endsWith('…'), `expected ellipsis, got "${out.slice(-3)}"`);
});

test('extractLeadSentence: returns null when nothing prose-like is found', () => {
  assert.equal(extractLeadSentence(''), null);
  assert.equal(extractLeadSentence('---\ntitle: Foo\n---\n'), null);
  assert.equal(extractLeadSentence('# Just a heading\n'), null);
});

test('extractLeadSentence: handles a list item as a lead (treat as prose, strip the bullet)', () => {
  const body = '- One thing happened.\n- Then another.';
  assert.equal(extractLeadSentence(body), 'One thing happened.');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx tsx --test lib/page-card-data.test.ts
```

Expected: FAIL — `Cannot find module './page-card-data'`.

- [ ] **Step 3: Implement extractor**

Create `frontend/lib/page-card-data.ts`:

```typescript
const MAX_LEAD = 160;

/**
 * Pull the first prose-like line from a page body, suitable as a one-line
 * lead in a hover-card preview. Skips frontmatter, fenced code, headings,
 * directive blocks (`:::name … :::`), and blank lines. Strips inline
 * markdown markup (bold/italic, wikilinks, regular links). Truncates to
 * MAX_LEAD chars with an ellipsis. Returns null when nothing prose-like
 * exists.
 */
export function extractLeadSentence(body: string): string | null {
  const lines = body.split('\n');
  let i = 0;
  // Skip opening frontmatter, if present.
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i]!.trim() !== '---') i++;
    if (i < lines.length) i++; // step past closing ---
  }
  let inCode = false;
  let inDirective = false;
  for (; i < lines.length; i++) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (t === '') continue;
    if (t.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (t.startsWith(':::')) {
      // Bare `:::` closes; anything else opens (single-line directives
      // also use `:::name{…}` — for v1, skip until the next `:::`).
      if (t === ':::') inDirective = false;
      else inDirective = true;
      continue;
    }
    if (inDirective) continue;
    if (t.startsWith('#')) continue; // headings
    if (t.startsWith('|')) continue; // table rows
    // Lead found — strip list marker if present, then markup, then truncate.
    const noBullet = t.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
    const clean = stripInlineMarkup(noBullet);
    if (!clean) continue;
    return clean.length > MAX_LEAD ? `${clean.slice(0, MAX_LEAD)}…` : clean;
  }
  return null;
}

function stripInlineMarkup(s: string): string {
  return s
    // Wikilinks: `[[Target|Label]]` → `Label`; `[[Target]]` → `Target`
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // Regular links: `[text](url)` → `text`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Bold/italic/code spans
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Collapse leftover whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd frontend && npx tsx --test lib/page-card-data.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/page-card-data.ts frontend/lib/page-card-data.test.ts
git commit -m "feat(frontend): add extractLeadSentence for hover-card previews"
```

---

## Task 2: HoverCardData type + builder

The map the renderer consumes. Each entry has the data the card needs to render with zero further I/O.

**Files:**
- Modify: `frontend/lib/page-card-data.ts` (append)
- Modify: `frontend/lib/page-card-data.test.ts` (append)

- [ ] **Step 1: Add failing test for the builder**

Append to `frontend/lib/page-card-data.test.ts`:

```typescript
import { buildHoverDataBySlug } from './page-card-data';
import type { PageMetaSummary } from '@core/pages/index.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';

function pmSummary(over: Partial<PageMetaSummary> & { slug: string; title: string }): PageMetaSummary {
  return {
    type: 'person',
    categories: [],
    aliases: [],
    isTalk: false,
    isArchived: false,
    ...over,
  };
}

function dRecord(over: Partial<DerivedRecord> & { record: string; name: string }): DerivedRecord {
  return {
    birth: null,
    death: null,
    parents: [],
    spouses: [],
    children: [],
    familyOfOrigin: [],
    marriages: [],
    residences: [],
    occupations: [],
    sources: [],
    media: [],
    privacy: { restricted: false, reason: 'none' },
    ...over,
  };
}

test('buildHoverDataBySlug: produces entries with title, lead, portrait, and dates', () => {
  const list: PageMetaSummary[] = [
    pmSummary({ slug: 'abby', title: 'Abby Rickelman', gedcomRecord: '@I1@', portrait: 'abby.jpg' }),
  ];
  const derived = new Map<string, DerivedRecord>([
    ['@I1@', dRecord({ record: '@I1@', name: 'Abby Rickelman', birth: { date: '1 Jan 1880', place: null }, death: { date: '5 Mar 1955', place: null } })],
  ]);
  const bodies = new Map<string, string>([
    ['abby', 'Abby Rickelman was a milliner who arrived in Brooklyn in 1898.'],
  ]);
  const cards = buildHoverDataBySlug(list, derived, bodies);
  const abby = cards.get('abby');
  assert.ok(abby);
  assert.equal(abby.title, 'Abby Rickelman');
  assert.equal(abby.lead, 'Abby Rickelman was a milliner who arrived in Brooklyn in 1898.');
  assert.equal(abby.portrait, 'abby.jpg');
  assert.equal(abby.born, '1880');
  assert.equal(abby.died, '1955');
});

test('buildHoverDataBySlug: skips talk and archived pages', () => {
  const list: PageMetaSummary[] = [
    pmSummary({ slug: 'abby.talk', title: 'Talk: Abby', isTalk: true }),
    pmSummary({ slug: 'abby-old', title: 'Abby (archived)', isArchived: true }),
    pmSummary({ slug: 'abby', title: 'Abby' }),
  ];
  const cards = buildHoverDataBySlug(list, new Map(), new Map());
  assert.equal(cards.size, 1);
  assert.ok(cards.has('abby'));
});

test('buildHoverDataBySlug: lead is null when no body is provided for the slug', () => {
  const list: PageMetaSummary[] = [pmSummary({ slug: 'abby', title: 'Abby' })];
  const cards = buildHoverDataBySlug(list, new Map(), new Map());
  assert.equal(cards.get('abby')?.lead, null);
});

test('buildHoverDataBySlug: dates omitted when no derived record is joined', () => {
  const list: PageMetaSummary[] = [pmSummary({ slug: 'someplace', title: 'A Place', type: 'place' })];
  const cards = buildHoverDataBySlug(list, new Map(), new Map());
  const e = cards.get('someplace');
  assert.ok(e);
  assert.equal(e.born, undefined);
  assert.equal(e.died, undefined);
});

test('buildHoverDataBySlug: living person (birth, no death) renders as "1990–"', () => {
  const list: PageMetaSummary[] = [pmSummary({ slug: 'boris', title: 'Boris', gedcomRecord: '@I1@' })];
  const derived = new Map<string, DerivedRecord>([
    ['@I1@', dRecord({ record: '@I1@', name: 'Boris', birth: { date: '15 Jun 1990', place: null }, death: { date: null, place: null } })],
  ]);
  const cards = buildHoverDataBySlug(list, derived, new Map());
  const boris = cards.get('boris');
  assert.equal(boris?.born, '1990');
  assert.equal(boris?.died, undefined);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx tsx --test lib/page-card-data.test.ts
```

Expected: FAIL — `buildHoverDataBySlug` is not exported.

- [ ] **Step 3: Implement the builder**

Append to `frontend/lib/page-card-data.ts`:

```typescript
import type { PageMetaSummary } from '@core/pages/index.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import { parseGedcomYear } from '@core/family/dates.ts';

export interface HoverCardData {
  title: string;
  /** One-line prose preview; null if no body is available for the slug. */
  lead: string | null;
  /** Portrait filename relative to `/portraits/`, if the page has one. */
  portrait?: string;
  /** Birth year as a string, e.g. "1880". Omitted when unknown. */
  born?: string;
  /** Death year as a string. Omitted when unknown or person is living. */
  died?: string;
}

/**
 * Build the precomputed hover-card map keyed by wiki slug. The map is
 * threaded into `renderMarkdown` so the renderer can swap any matched
 * internal anchor for a `<WikilinkHoverCard>` without a client-side fetch.
 *
 * Skips talk and archived pages — they're not link targets in practice and
 * shouldn't preview alongside live pages.
 *
 * @param list Live page summaries from `getCachedList().list`.
 * @param derivedByRecord Cached derived-records map (from `getCachedDerivedRecords()`).
 * @param bodiesBySlug Pre-read page bodies, slug → markdown body. Caller decides
 *   the scope (typically just the pages linked from the current page; fetching
 *   every page body is too expensive for the request path).
 */
export function buildHoverDataBySlug(
  list: ReadonlyArray<PageMetaSummary>,
  derivedByRecord: ReadonlyMap<string, DerivedRecord>,
  bodiesBySlug: ReadonlyMap<string, string>,
): Map<string, HoverCardData> {
  const out = new Map<string, HoverCardData>();
  for (const p of list) {
    if (p.isTalk || p.isArchived) continue;
    const body = bodiesBySlug.get(p.slug);
    const lead = body ? extractLeadSentence(body) : null;
    const card: HoverCardData = { title: p.title, lead };
    if (p.portrait) card.portrait = p.portrait;
    if (p.gedcomRecord) {
      const d = derivedByRecord.get(p.gedcomRecord);
      const birthYear = parseGedcomYear(d?.birth?.date ?? null);
      const deathYear = parseGedcomYear(d?.death?.date ?? null);
      if (birthYear) card.born = String(birthYear.year);
      if (deathYear) card.died = String(deathYear.year);
    }
    out.set(p.slug, card);
  }
  return out;
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
cd frontend && npx tsx --test lib/page-card-data.test.ts
cd frontend && npx tsc --noEmit
```

Expected: PASS (14 tests = 9 from Task 1 + 5 here). Typecheck clean.

If `parseGedcomYear`'s import path is wrong, find it via: `grep -rn "export function parseGedcomYear" core/src`. The plan assumes it lives at `core/src/family/dates.ts`.

If a test fails because `parseGedcomYear` returns `null` for `'1 Jan 1880'` (it might require a `ParsedYear` object with the `year` key directly available), inspect the return shape: it should be `{ year: 1880, ... }` or similar. Adjust the access (`birthYear?.year`).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/page-card-data.ts frontend/lib/page-card-data.test.ts
git commit -m "feat(frontend): add buildHoverDataBySlug for wikilink previews"
```

---

## Task 3: HoverCard UI primitive (shadcn-style wrap of base-ui PreviewCard)

Thin wrapper around `@base-ui/react/preview-card` that follows the project's existing pattern (compare `frontend/components/ui/dialog.tsx`). Exposes `HoverCard`, `HoverCardTrigger`, `HoverCardContent` with project styling baked in. Base-ui handles delays, positioning (via Floating UI), focus, keyboard (Esc to close), touch, and ARIA — we just provide the styled surface.

**Files:**
- Create: `frontend/components/ui/hover-card.tsx`

- [ ] **Step 1: Check the existing dialog.tsx wrapper for the pattern to mirror**

```bash
sed -n '1,30p' frontend/components/ui/dialog.tsx
```

Confirm the import shape, the `'use client'` directive, the `cn` helper usage, and the `data-slot` pattern.

- [ ] **Step 2: Implement the wrapper**

Create `frontend/components/ui/hover-card.tsx`:

```tsx
'use client';

import * as React from 'react';
import { PreviewCard as PreviewCardPrimitive } from '@base-ui/react/preview-card';
import { cn } from '@/lib/utils';

function HoverCard({ ...props }: PreviewCardPrimitive.Root.Props) {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({ ...props }: PreviewCardPrimitive.Trigger.Props) {
  return <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

/**
 * Styled portal + positioner + popup. Default placement: below the trigger,
 * 8px offset. Width capped at 320px (cards vary in content density). Base-ui
 * handles viewport-flip when there's no room.
 */
function HoverCardContent({
  className,
  sideOffset = 8,
  side = 'bottom',
  align = 'start',
  ...props
}: Omit<PreviewCardPrimitive.Popup.Props, 'side' | 'align'> & {
  sideOffset?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner sideOffset={sideOffset} side={side} align={align}>
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            'z-50 w-[320px] rounded-md border bg-popover text-popover-foreground shadow-lg p-3 outline-none',
            'data-[open]:animate-in data-[closed]:animate-out data-[open]:fade-in-0 data-[closed]:fade-out-0',
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
```

If `cn` lives at a different path, mirror the imports from `frontend/components/ui/dialog.tsx`. If `data-[open]` / `data-[closed]` animation utility classes aren't configured in this project's Tailwind, drop them — base-ui ships closed without animation by default and that's fine for v1.

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. If the prop types from `PreviewCardPrimitive.Popup.Props` don't have `side` / `align` (they live on `Positioner` instead), restructure: keep the wrapper accepting `sideOffset` / `side` / `align` and pass them to `Positioner`, pass everything else to `Popup`. The exact prop split varies slightly across base-ui versions — match the version installed here.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ui/hover-card.tsx
git commit -m "feat(frontend): add HoverCard UI primitive (base-ui PreviewCard wrap)"
```

---

## Task 3b: WikilinkHoverCard composed component

The wiki-specific composition: takes a slug + precomputed `HoverCardData`, renders the trigger as a Next `<Link>` and the card body as portrait/title/dates/lead. All primitive behavior (hover delay, positioning, dismiss) comes from the Task 3 wrapper.

**Files:**
- Create: `frontend/components/wikilink-hover-card.tsx`

- [ ] **Step 1: Implement the component**

Create `frontend/components/wikilink-hover-card.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { AvatarMonogram } from '@/components/family/avatar-monogram';
import type { HoverCardData } from '@/lib/page-card-data';

interface Props {
  slug: string;
  data: HoverCardData;
  /** The anchor's inner content (usually the resolved title text). */
  children: ReactNode;
  /** Pass-through className for the anchor. */
  className?: string;
}

/**
 * Inline link that pops a preview card on hover. Card content is fully
 * precomputed at SSR — no client-side fetch, no loading flicker. Base-ui's
 * PreviewCard primitive handles the hover delay (default ~200ms), viewport
 * positioning, focus, keyboard (Esc closes), and touch (no card on touch
 * devices).
 */
export function WikilinkHoverCard({ slug, data, children, className }: Props) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Link href={`/${slug}`} className={className}>
            {children}
          </Link>
        }
      />
      <HoverCardContent>
        <div className="flex gap-3">
          <div className="shrink-0">
            {data.portrait ? (
              <img
                src={`/portraits/${data.portrait}`}
                alt=""
                width={48}
                height={48}
                className="rounded-full object-cover h-12 w-12"
              />
            ) : (
              <AvatarMonogram name={data.title} size={48} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground truncate">{data.title}</div>
            {data.born || data.died ? (
              <div className="font-mono text-xs text-muted-foreground tabular-nums">
                {data.born ?? '?'}–{data.died ?? ''}
              </div>
            ) : null}
            {data.lead ? (
              <p className="mt-1 text-xs text-muted-foreground leading-snug line-clamp-3">{data.lead}</p>
            ) : null}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
```

Notes for the implementer:

- **`render` prop on `HoverCardTrigger`**: base-ui uses a render-prop pattern to let a parent component (here `Link`) become the trigger element. If the installed version uses `asChild` instead (older base-ui style), swap to `<HoverCardTrigger asChild><Link …>{children}</Link></HoverCardTrigger>`. Check what `dialog.tsx` does — mirror that.
- **`AvatarMonogram` size prop**: if it doesn't accept a numeric `size`, check its signature (`grep -A5 "export function AvatarMonogram" frontend/components/family/avatar-monogram.tsx`) and adapt — most likely pass `className="h-12 w-12"` instead.
- **`<img>` vs `next/image`**: portraits are user-uploaded files in `~/whoami/assets/portraits/`. The existing person-header rendering pattern (check `frontend/components/family/sections/person-header-section.tsx`) is the right reference. If it uses `next/image`, mirror that; otherwise a plain `<img>` like above is fine.

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/wikilink-hover-card.tsx
git commit -m "feat(frontend): add WikilinkHoverCard composed component"
```

---

## Task 4: Renderer integration — swap matched anchors

Extend `renderMarkdown` to accept a `hoverDataBySlug` map and register an `a` component override in the JSX runtime that swaps known-slug internal links for `<WikilinkHoverCard>`.

**Files:**
- Modify: `frontend/lib/render.tsx`

- [ ] **Step 1: Read the current render entry to find the components-map injection point**

```bash
sed -n '95,140p' frontend/lib/render.tsx
```

Confirm the `renderMarkdown` function signature and the `components` map assembly.

- [ ] **Step 2: Add the option, import, and `a` override**

In `frontend/lib/render.tsx`:

1. Add the import at the top:

```typescript
import { WikilinkHoverCard } from '@/components/wikilink-hover-card';
import type { HoverCardData } from './page-card-data';
```

2. Extend the `RenderContext` interface to include the optional map and the current-page slug (used for self-link suppression):

```typescript
interface RenderContext {
  derived?: DerivedRecord | null;
  hoverDataBySlug?: ReadonlyMap<string, HoverCardData>;
  /** Slug of the page being rendered — links pointing at it skip the hover-card. */
  currentSlug?: string;
}
```

3. In the `renderMarkdown` function, after the existing `for (const [name, dir] of Object.entries(directives))` block that adds derived-needing directive components, add an `a` override:

```typescript
  // Wikilink hover-cards: swap internal `<a href="/<slug>">` for the
  // hover-card component when the slug has precomputed card data. External
  // links, fragment-only links, and self-page links pass through as plain
  // anchors. The card itself is purely client-side; SSR renders the link.
  if (context.hoverDataBySlug && context.hoverDataBySlug.size > 0) {
    const dataMap = context.hoverDataBySlug;
    const selfSlug = context.currentSlug;
    components['a'] = (p: HastProps) => {
      const href = typeof p.href === 'string' ? p.href : '';
      const className = typeof p.className === 'string' ? p.className : undefined;
      const children = p.children as ReactNode;
      // Internal slug? Strip leading `/`, drop any anchor/query.
      if (href.startsWith('/') && !href.startsWith('//')) {
        const slugAndRest = href.slice(1);
        const slug = slugAndRest.split(/[#?]/)[0] ?? '';
        if (slug && slug !== selfSlug) {
          const data = dataMap.get(slug);
          if (data) {
            return <WikilinkHoverCard slug={slug} data={data} className={className}>{children}</WikilinkHoverCard>;
          }
        }
      }
      // Fallback: plain anchor.
      return <a href={href} className={className}>{children}</a>;
    };
  }
```

The exact insertion point: just before the `return toJsxRuntime(...)` call, so the override is in `components` when the runtime resolves anchors.

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. If the `a` override's TypeScript complaints about `HastProps`/`ReactNode` are noisy, mirror the casts already used for directive wrappers in the same function.

- [ ] **Step 4: Run the existing wikilinks tests to confirm no regression**

```bash
cd frontend && npm test 2>&1 | tail -10
```

Expected: same test count, all green. The renderer's existing tests don't pass `hoverDataBySlug`, so the new branch is dormant for them.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/render.tsx
git commit -m "feat(frontend): wire WikilinkHoverCard into the markdown renderer"
```

---

## Task 5: Wire into the person-page route

Build `hoverDataBySlug` at request time, then pass into `renderMarkdown` along with the current slug. For v1, only build cards for slugs the page actually links to — fetching every page body in the wiki on every render is too expensive. Identify linked slugs with a single regex pass over the page body.

**Files:**
- Modify: `frontend/app/[slug]/page.tsx`

- [ ] **Step 1: Read the current render call**

```bash
grep -n "renderMarkdown\|getCachedList" "frontend/app/[slug]/page.tsx"
```

Confirm the existing `renderMarkdown(page.body, index, { derived })` call.

- [ ] **Step 2: Add the imports**

In `frontend/app/[slug]/page.tsx`, add to the existing imports:

```typescript
import { buildHoverDataBySlug } from '@/lib/page-card-data';
import { getPageStore } from '@/lib/server-services';
```

(If `getPageStore` is already in scope, skip its line.)

- [ ] **Step 3: Build hoverDataBySlug just before `renderMarkdown` is called**

The render call currently looks like:

```typescript
  const [tree, notes] = isRestricted
    ? [null, []]
    : await Promise.all([
        renderMarkdown(page.body, index, { derived }),
        buildNotesView(talkBody, index),
      ]);
```

Replace that block with:

```typescript
  // Hover-card data: identify which slugs this page links to, fetch their
  // bodies in parallel, and precompute card content. Limiting to linked
  // slugs (vs. all pages) keeps the request path cheap on dense pages.
  const linkedSlugs = isRestricted ? new Set<string>() : extractLinkedSlugs(page.body, list);
  const bodiesBySlug = isRestricted
    ? new Map<string, string>()
    : await readBodiesForSlugs(getPageStore(), linkedSlugs);
  const hoverDataBySlug = buildHoverDataBySlug(list, getCachedDerivedRecords(), bodiesBySlug);

  const [tree, notes] = isRestricted
    ? [null, []]
    : await Promise.all([
        renderMarkdown(page.body, index, { derived, hoverDataBySlug, currentSlug: slug }),
        buildNotesView(talkBody, index),
      ]);
```

Add these two helpers at the bottom of `frontend/app/[slug]/page.tsx` (after the route function):

```typescript
/**
 * Scan a page body for `[Text](/<slug>)` links and `[[Title]]` wikilinks,
 * return the set of internal slugs referenced. Used to bound the per-render
 * hover-card data build to just the pages this page actually links to.
 */
function extractLinkedSlugs(body: string, list: ReadonlyArray<{ slug: string; title: string; aliases: string[]; isTalk: boolean; isArchived: boolean }>): Set<string> {
  const out = new Set<string>();
  // Direct `/<slug>` links from already-resolved markdown.
  for (const m of body.matchAll(/\]\(\/([a-z0-9-]+)(?:[#?][^)]*)?\)/g)) {
    out.add(m[1]!);
  }
  // Unresolved wikilinks — match against title/alias (case-insensitive).
  const byCanonical = new Map<string, string>();
  for (const p of list) {
    if (p.isTalk || p.isArchived) continue;
    byCanonical.set(p.title.toLowerCase(), p.slug);
    for (const a of p.aliases) byCanonical.set(a.toLowerCase(), p.slug);
  }
  for (const m of body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    const target = m[1]!.trim().toLowerCase();
    const slug = byCanonical.get(target);
    if (slug) out.add(slug);
  }
  return out;
}

/**
 * Read page bodies for the given slugs in parallel. Errors (missing pages,
 * permission issues) are swallowed — a missing body just yields no lead.
 */
async function readBodiesForSlugs(
  store: ReturnType<typeof getPageStore>,
  slugs: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    [...slugs].map(async (slug): Promise<[string, string] | null> => {
      try {
        const page = await store.read(slug);
        return [slug, page.body];
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((e): e is [string, string] => e !== null));
}
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. If `getPageStore` returns a different shape than expected, look at how `readTalkBody` in `lib/server-services.ts` uses it and mirror.

- [ ] **Step 5: Run frontend tests**

```bash
cd frontend && npm test
```

Expected: tests still pass (no new tests in this task).

- [ ] **Step 6: Smoke-test in the browser — DEFER TO CONTROLLER**

Don't start a dev server. Controller will smoke-test.

- [ ] **Step 7: Commit**

```bash
git add "frontend/app/[slug]/page.tsx"
git commit -m "feat(frontend): wire wikilink hover-cards into person-page render"
```

---

## Task 6: CHANGELOG + plan-index

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add the changelog entry**

Under `## [Unreleased] — v2 development` → `### Added`, insert at the top:

```markdown
- **Wikilink hover-cards** *(2026-05-16)*. Hovering any internal link in
  a wiki page body now pops a 200ms-delayed preview card next to the
  link with the target's portrait (or monogram), title, dates, and a
  one-line lead. Card content is fully precomputed at SSR — no
  client-side fetch, no loading flicker. Touch devices fall through to
  plain links via `(hover: hover) and (pointer: fine)` (the hover events
  simply don't fire). Self-links suppress the card. One card open at a
  time; opening a second closes the first. New
  `frontend/lib/page-card-data.ts` (lead extractor + card builder),
  `frontend/components/wikilink-hover-card.tsx` (client primitive +
  card body), renderer hook in `frontend/lib/render.tsx`, request-time
  data build in `frontend/app/[slug]/page.tsx` limited to slugs the
  current page actually links to (so dense pages don't slow the
  request).
```

- [ ] **Step 2: Add row to the plan index**

In `docs/superpowers/plans/README.md`, add (clustered with the other 2026-05-16 rows, newest first):

```markdown
| ✅ | [`2026-05-16-wikilink-hover-cards.md`](./2026-05-16-wikilink-hover-cards.md) | Wikilink hover-cards | 200ms-delayed page preview on hover over any internal link; portrait + dates + lead, all precomputed at SSR. |
```

Bump the totals footer counts (+1 plans, +1 shipped).

- [ ] **Step 3: Commit**

The working tree's `CHANGELOG.md` may have unrelated edits from prior tasks. Stage only your hunk + the README row. If staging the whole file would sweep in unrelated edits, use `git stash push CHANGELOG.md`, re-apply your Step 1 edit to the clean HEAD state, commit, then `git stash pop` and accept your HEAD version of any conflict in the wikilink-hover-cards block.

```bash
git add CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "docs: changelog + plan-index for wikilink hover-cards"
```

NEVER use `git add -u`, `git add .`, or `git add -A`.

---

## Verification checklist (run after Task 5)

- [ ] `cd frontend && npm test` — all tests green (+14)
- [ ] `cd frontend && npx tsc --noEmit` — no errors
- [ ] Visit `/[some-person-slug]` in dev (`npm run dev`)
- [ ] Hover any internal link in the body — card appears after ~200ms with portrait, dates, lead
- [ ] Sweep cursor quickly across multiple links — only one card shows at a time
- [ ] Hover over the card itself — it stays open
- [ ] Move cursor off — card disappears after ~150ms
- [ ] Hover an internal link to the page you're currently on — NO card appears
- [ ] On a touch device or with a touch-emulator — no card; link works normally
- [ ] Resize browser narrow — card flips position (right-align or up) rather than overflowing
- [ ] No console errors when hover-trigger / unmount / navigation

---

## Out of scope (deferred follow-ups)

- **Card content for non-person pages** (places, events): currently lead + title work; portraits and dates are optional and just omit. May want a special "place" card with the map snippet later.
- **Keyboard navigation through cards** (Tab into trigger pops card; Esc closes). Focus already triggers; Esc-to-close is a small follow-up.
- **Animation polish.** Cards currently snap in/out. A 100ms fade would be nicer; defer to a CSS pass.
- **Card content for talk-page links.** Talk pages are intentionally skipped by the builder; if a body links to one, the link renders as a plain anchor. Probably correct — talk-page previews aren't useful.
- **Linked-slugs cache.** Per-render `extractLinkedSlugs` is O(body length). If pages get very long or hover-card lookups dominate render time, memoize the extracted set by page hash. Not worth it until measured.
- **Hover-card on the home-page lists.** Currently only wired into rendered page bodies. The "Recently revised" / "Continue research" lists could benefit too, but they're already very compact and the benefit is smaller. Defer.
- **External link previews.** Out of scope — no OpenGraph fetching, no `<iframe>` previews. Internal-only.
