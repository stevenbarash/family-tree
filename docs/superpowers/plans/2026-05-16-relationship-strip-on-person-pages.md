# Relationship Strip on Person Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every person page (`/[slug]`) shows a one-line relationship from the configured `SELF_RECORD` to the page's subject — e.g. "Your great-grandmother on your mother's side" — making every browse implicitly oriented to the reader without a click.

**Architecture:** A thin server-side join in `frontend/lib/family.ts` reuses the existing `computeRelationship` graph code from `core/family/relationship.ts` and the cached records map from `getCachedDerivedRecords()`. Renders as a dedicated subtitle line between the H1 and the categories row of the existing person-page header (`frontend/app/[slug]/page.tsx`). No new env vars, no new caches, no client-side JS — pure RSC render. Restricted pages, talk pages, and pages without a `gedcom.record` frontmatter get nothing.

**Tech Stack:** Existing — Next 16 App Router, `core/family/relationship.ts`, `frontend/lib/family.ts`, `tsx --test`.

---

## File structure

| File | Role |
|---|---|
| `frontend/lib/relationship-from-self.ts` (new) | One pure function `getRelationshipFromSelf(targetRecord)` that wraps `computeRelationship` against the cached records map; returns the label, path of `{record, name, slug}` crumbs, and degree, or null when there's no relationship (or target IS self). |
| `frontend/lib/relationship-from-self.test.ts` (new) | Unit tests for the wrapper. |
| `frontend/components/relationship-strip.tsx` (new) | Small RSC that renders the line + (in a follow-up) the hoverable trail. v1: label only as an italic muted-foreground paragraph. |
| `frontend/app/[slug]/page.tsx` (modify) | Compute relationship in the existing `Promise.all`, render the strip just below the H1 / before the categories row. Skip for `isTalkSlug`, `isRestricted`, and when `gedcom.record` is absent. |

---

## Task 1: Wrapper function returns null in the easy cases

**Files:**
- Create: `frontend/lib/relationship-from-self.ts`
- Create: `frontend/lib/relationship-from-self.test.ts`

- [ ] **Step 1: Write failing test for the null cases**

Create `frontend/lib/relationship-from-self.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRelationshipFromSelf } from './relationship-from-self';
import type { DerivedRecord } from '@core/gedcom/types.ts';

function rec(record: string, name: string, parents: { record: string; role: 'father' | 'mother' }[] = []): DerivedRecord {
  return {
    record,
    name,
    parents,
    spouses: [],
    children: [],
    siblings: [],
    media: [],
  } as unknown as DerivedRecord;
}

test('computeRelationshipFromSelf: returns null when target equals self', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec('@I1@', 'Me')],
  ]);
  const result = computeRelationshipFromSelf({
    selfRecord: '@I1@',
    targetRecord: '@I1@',
    records,
    findSlug: () => undefined,
  });
  assert.equal(result, null);
});

test('computeRelationshipFromSelf: returns null when target unreachable from self', () => {
  // Two disconnected islands — no LCA exists.
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec('@I1@', 'Me')],
    ['@I2@', rec('@I2@', 'Stranger')],
  ]);
  const result = computeRelationshipFromSelf({
    selfRecord: '@I1@',
    targetRecord: '@I2@',
    records,
    findSlug: () => undefined,
  });
  assert.equal(result, null);
});

test('computeRelationshipFromSelf: returns null when target record is missing from the map', () => {
  // A page might have `gedcom.record: @I99@` pointing at a record we
  // haven't synced yet. Don't throw, just render no strip.
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec('@I1@', 'Me')],
  ]);
  const result = computeRelationshipFromSelf({
    selfRecord: '@I1@',
    targetRecord: '@I99@',
    records,
    findSlug: () => undefined,
  });
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx tsx --test lib/relationship-from-self.test.ts
```

Expected: FAIL — `Cannot find module './relationship-from-self'`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/relationship-from-self.ts`:

```typescript
import { computeRelationship } from '@core/family/relationship.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';

export interface RelationshipFromSelfInput {
  selfRecord: string;
  targetRecord: string;
  records: Map<string, DerivedRecord>;
  /** Resolver: given a GEDCOM record id and the person's name, return the wiki slug if a page exists. */
  findSlug: (record: string, name: string) => string | undefined;
}

export interface RelationshipCrumb {
  record: string;
  name: string;
  slug?: string;
}

export interface RelationshipFromSelf {
  /** Human-readable relationship label, e.g. "great-grandmother on your mother's side". */
  label: string;
  /** Path of crumbs from self → LCA → target, both endpoints included. */
  crumbs: ReadonlyArray<RelationshipCrumb>;
  /** Total path length (number of hops). Useful for emphasis: degree===1 is parent/child/spouse. */
  degree: number;
}

export function computeRelationshipFromSelf(
  input: RelationshipFromSelfInput,
): RelationshipFromSelf | null {
  const { selfRecord, targetRecord, records, findSlug } = input;
  if (targetRecord === selfRecord) return null;
  if (!records.has(targetRecord)) return null;
  if (!records.has(selfRecord)) return null;
  const rel = computeRelationship({ records, fromRecord: selfRecord, toRecord: targetRecord });
  if (!rel) return null;
  const crumbs: RelationshipCrumb[] = rel.path.map((record) => {
    const rec = records.get(record);
    const name = rec?.name ?? record;
    return { record, name, slug: findSlug(record, name) };
  });
  return {
    label: rel.label,
    crumbs,
    degree: rel.path.length - 1,
  };
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
cd frontend && npx tsx --test lib/relationship-from-self.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/relationship-from-self.ts frontend/lib/relationship-from-self.test.ts
git commit -m "feat(frontend): add computeRelationshipFromSelf wrapper for relationship-strip"
```

---

## Task 2: Wrapper returns a populated relationship for a real chain

**Files:**
- Modify: `frontend/lib/relationship-from-self.test.ts`

- [ ] **Step 1: Add failing test for a populated relationship**

Append to `frontend/lib/relationship-from-self.test.ts`:

```typescript
test('computeRelationshipFromSelf: returns label, crumbs, and degree for a parent chain', () => {
  // Self -> father -> father's father. Target is grandfather: degree 2.
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec('@I1@', 'Me', [{ record: '@I2@', role: 'father' }])],
    ['@I2@', rec('@I2@', 'Dad', [{ record: '@I3@', role: 'father' }])],
    ['@I3@', rec('@I3@', 'Grandpa')],
  ]);
  const result = computeRelationshipFromSelf({
    selfRecord: '@I1@',
    targetRecord: '@I3@',
    records,
    findSlug: (record) => (record === '@I3@' ? 'grandpa' : undefined),
  });
  assert.ok(result);
  assert.match(result.label, /grandfather/i);
  assert.equal(result.degree, 2);
  // Crumbs walk self -> dad -> grandpa, in that order.
  assert.deepEqual(
    result.crumbs.map((c) => c.record),
    ['@I1@', '@I2@', '@I3@'],
  );
  // Grandpa's slug came through; the in-between records had no page.
  const last = result.crumbs[result.crumbs.length - 1];
  assert.equal(last?.slug, 'grandpa');
  const middle = result.crumbs[1];
  assert.equal(middle?.slug, undefined);
});
```

- [ ] **Step 2: Run test — should already pass**

```bash
cd frontend && npx tsx --test lib/relationship-from-self.test.ts
```

Expected: PASS (4 tests). The relationship calculator already handles this shape; the wrapper just decorates the result.

If it fails because the label doesn't match `/grandfather/i`, look at the label `computeRelationship` actually returned (`console.log(result.label)`). The relationship calculator's existing tests in `core/test/family/relationship.test.ts` use phrasings like "great-grandfather". If our regex is too strict, loosen to `/grand/i` and assert `/father/i` separately.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/relationship-from-self.test.ts
git commit -m "test(frontend): assert relationship-from-self returns crumbs and degree"
```

---

## Task 3: Render component (label-only v1)

**Files:**
- Create: `frontend/components/relationship-strip.tsx`

- [ ] **Step 1: Write the component (no test — it's a pure RSC of one prop into one paragraph; tested through the page-route integration in Task 4)**

Create `frontend/components/relationship-strip.tsx`:

```tsx
import type { RelationshipFromSelf } from '@/lib/relationship-from-self';

interface Props {
  relationship: RelationshipFromSelf;
}

/**
 * One-line "Your <relation>" subtitle rendered between the H1 and the
 * categories row on a person page. Italic, body-size, muted-foreground —
 * orienting but not loud. v1 renders the label only; a follow-up will
 * add a hoverable trail of avatar crumbs from self → target.
 */
export function RelationshipStrip({ relationship }: Props) {
  return (
    <p className="mt-3 text-base italic text-muted-foreground/90">
      Your {relationship.label}.
    </p>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/relationship-strip.tsx
git commit -m "feat(frontend): add RelationshipStrip subtitle component"
```

---

## Task 4: Wire the strip into the person-page route

**Files:**
- Modify: `frontend/app/[slug]/page.tsx`

- [ ] **Step 1: Read the file to confirm current shape**

```bash
sed -n '1,30p' frontend/app/[slug]/page.tsx
```

Expected: imports at top including `loadDerivedRecord`, `SELF_RECORD`, the `Promise.all` block around line 55, and the header block around lines 90–128.

- [ ] **Step 2: Add the imports**

At the top of `frontend/app/[slug]/page.tsx`, inside the existing import block, add:

```typescript
import { getCachedDerivedRecords } from '@/lib/family';
import { computeRelationshipFromSelf } from '@/lib/relationship-from-self';
import { SELF_RECORD } from '@/lib/env';
import { RelationshipStrip } from '@/components/relationship-strip';
```

(If `SELF_RECORD` is already in scope through another import path, skip its line.)

- [ ] **Step 3: Compute the relationship after the existing `Promise.all`**

`getCachedList()` returns `{ list: PageMetaSummary[], index: SlugIndex }`. The `index` is keyed by canonical *name* (`byCanonical: Map<string, string>`), not by GEDCOM record id, so it can't resolve `record → slug` directly. Instead, build the record→slug map once from `list` (each `PageMetaSummary` has a flat `gedcomRecord?: string`).

Find this destructure (currently around line 60):

```typescript
  const [{ index }, derived, talkBody, snapshots] = await Promise.all([
    indexPromise,
    derivedPromise,
    talkBodyPromise,
    snapshotsPromise,
  ]);
```

Replace it with:

```typescript
  const [{ list, index }, derived, talkBody, snapshots] = await Promise.all([
    indexPromise,
    derivedPromise,
    talkBodyPromise,
    snapshotsPromise,
  ]);

  // Compute the relationship from the configured SELF_RECORD to this
  // page's subject, when the page is joined to a GEDCOM record. Skip
  // entirely for talk pages, restricted pages, or pages without a
  // gedcom.record — the conditions are folded into the render guard
  // below; here we just keep the compute cheap when it's unused.
  const targetRecord = page.meta.gedcom?.record ?? null;
  const relationship =
    targetRecord && !isTalkSlug(slug)
      ? (() => {
          // Build record → slug once from the page list. PageMetaSummary
          // carries a flat `gedcomRecord` field; the SlugIndex (keyed by
          // canonical title) can't answer this question on its own.
          const recordToSlug = new Map<string, string>();
          for (const p of list) {
            if (p.gedcomRecord && !p.isTalk && !p.isArchived) {
              recordToSlug.set(p.gedcomRecord, p.slug);
            }
          }
          return computeRelationshipFromSelf({
            selfRecord: SELF_RECORD,
            targetRecord,
            records: getCachedDerivedRecords(),
            findSlug: (record) => recordToSlug.get(record),
          });
        })()
      : null;
```

Note: the rest of the file uses `index` (not `list`); re-destructuring both is required for this compute. If TypeScript complains that `list` is unused elsewhere, that's fine — it's used inside the IIFE.

- [ ] **Step 4: Render the strip in the header**

Find this block in the header (lines 94–105 currently):

```tsx
        <h1 className="text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
          {page.meta.title}
        </h1>
        {!isRestricted && page.meta.categories.length > 0 ? (
```

Insert between the H1 and the categories conditional:

```tsx
        {!isRestricted && relationship ? (
          <RelationshipStrip relationship={relationship} />
        ) : null}
```

Final order in the header: type label → H1 → relationship strip → categories chips → metadata strip.

- [ ] **Step 5: Run frontend tests**

```bash
cd frontend && npm test
```

Expected: 52 tests pass (same as before, plus the 4 new ones from Tasks 1–2 — total 56). No regressions.

- [ ] **Step 6: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Smoke-test in the browser**

```bash
cd frontend && npm run dev
```

Then visit:
- `/[some-ancestor-slug]` (e.g., `/galina-ayzman`) — expect a line like *"Your maternal grandmother."* below the H1.
- `/[self-slug]` (your own page) — expect NO strip (target === self).
- `/[unrelated-person-slug]` (a spouse-by-marriage from another tree) — expect NO strip (no LCA).
- `/[place-page-slug]` (a page without `gedcom.record`) — expect NO strip.
- `/[any-talk-page]` (e.g., `/galina-ayzman.talk`) — expect NO strip.

If a person page shows the wrong relationship (e.g., grandpa rendered as "uncle"), the bug is in `core/family/relationship.ts` — not this plan. Open an issue and the relationship-calculator tests need updating.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/[slug]/page.tsx
git commit -m "feat(frontend): show relationship-from-self strip on person pages"
```

---

## Task 5: CHANGELOG entry + plan-index update

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add the changelog entry**

Under `## [Unreleased] — v2 development` → `### Added`, insert near the top:

```markdown
- **Relationship strip on person pages** *(2026-05-16)*. Every person
  page now shows a one-liner below the H1 — "Your great-grandmother on
  your mother's side", "Your second cousin once removed" — computed
  from the configured `SELF_RECORD` via the existing
  `core/family/relationship.ts` calculator. Restricted pages, talk
  pages, and pages without a `gedcom.record` frontmatter render no
  strip. Pure server-side render; no new client JS. New
  `frontend/lib/relationship-from-self.ts` wrapper + a 3-line
  `RelationshipStrip` component. Follow-up will add a hoverable trail
  of avatar crumbs from self → target.
```

- [ ] **Step 2: Add row to the plan index**

In `docs/superpowers/plans/README.md`, add (in the appropriate chronological place):

```markdown
| ✅ | [`2026-05-16-relationship-strip-on-person-pages.md`](./2026-05-16-relationship-strip-on-person-pages.md) | Relationship strip on person pages | One-line "Your <relation>" subtitle below the H1 of every person page, computed server-side from SELF_RECORD. |
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "docs: changelog + plan-index entry for relationship strip"
```

---

## Verification checklist (run after Task 4)

- [ ] `cd frontend && npm test` — all tests green
- [ ] `cd frontend && npx tsc --noEmit` — no errors
- [ ] `/galina-ayzman` (or equivalent) shows a relationship strip
- [ ] `/[self-slug]` shows NO strip
- [ ] `/[a-place-page]` shows NO strip
- [ ] `/galina-ayzman.talk` shows NO strip
- [ ] No console errors in dev tools when navigating between person pages
- [ ] Strip text wraps gracefully on narrow viewports (try 320px width)

---

## Out of scope (deferred to a follow-up)

- **Hoverable avatar crumb trail** below the strip ("Me → Mom → Grandma"). The wrapper already returns `crumbs` with slugs; v2 of the component will render them as small monogram chips.
- **Reverse perspective** ("Galina's relationship to you" from her descendants' pages, when `SELF_RECORD` is also among her descendants). The current strip is always self → target; if both directions exist they're semantically identical.
- **Cohort-aware rendering** (suppress strip for the "siblings" link rows on the family tree — they already have explicit role labels). The strip lives on `/[slug]` only; tree pages aren't touched.
- **i18n of relationship labels**. The calculator emits English labels; localization is a separate concern across the whole UI.
