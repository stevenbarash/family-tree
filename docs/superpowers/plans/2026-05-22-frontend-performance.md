# Frontend Performance — Route Caching + Image Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the two hot routes (`[slug]` articles, `family/tree`) from recomputing everything on every request — serve articles from an on-demand ISR cache and cache the family-tree computation, with write-triggered invalidation for instant freshness.

**Architecture:** `[slug]` drops `force-dynamic` and becomes on-demand ISR (`revalidate = 60`, `generateStaticParams` returns `[]`). The shared `getFamilyTree` computation moves behind `unstable_cache` (tag `gedcom`, 60s window). Page / note / GEDCOM write API routes call `revalidatePath` / `revalidateTag` so browser writes are reflected immediately; the 60s window is the backstop for background git-sync pulls. Portrait `<img>` tags become `next/image`. No `cacheComponents` migration.

**Tech Stack:** Next.js 16.2.6 (App Router), `unstable_cache` / `revalidatePath` / `revalidateTag` from `next/cache`, `next/image`, `node:test` via `tsx --test`, TypeScript 6.

**Spec:** [`docs/superpowers/specs/2026-05-22-frontend-performance-design.md`](../specs/2026-05-22-frontend-performance-design.md)

**Branch:** implement on a feature branch (e.g. `perf/route-caching`), not `main`.

**Working directory:** all commands run from `frontend/` unless stated otherwise. Stage files explicitly — never `git add -u` (it would sweep the user's in-progress data work into the commit).

---

## Task 1: Pure locale-path helper for cache invalidation

A dependency-free helper that builds the `revalidatePath` arguments. Isolated and unit-tested so the locale-path form is pinned (a wrong path makes `revalidatePath` silently no-op).

**Files:**
- Create: `frontend/lib/revalidation-paths.ts`
- Test: `frontend/lib/revalidation-paths.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/revalidation-paths.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localePathsForSlug } from './revalidation-paths';
import { routing } from '../i18n/routing';

test('localePathsForSlug builds one /<locale>/<slug> path per locale', () => {
  assert.deepEqual(
    localePathsForSlug('moshe-margolis', ['en', 'ru', 'uk', 'he']),
    [
      '/en/moshe-margolis',
      '/ru/moshe-margolis',
      '/uk/moshe-margolis',
      '/he/moshe-margolis',
    ],
  );
});

test('localePathsForSlug covers every configured locale with a prefixed path', () => {
  // localePrefix is "always" (i18n/routing.ts) — every locale, including
  // the default, is prefixed. If that ever changes this assertion breaks.
  const paths = localePathsForSlug('x', routing.locales);
  assert.equal(paths.length, routing.locales.length);
  for (const locale of routing.locales) {
    assert.ok(paths.includes(`/${locale}/x`), `expected a /${locale}/x path`);
  }
});

test('localePathsForSlug returns nothing for an empty locale list', () => {
  assert.deepEqual(localePathsForSlug('x', []), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx tsx --test lib/revalidation-paths.test.ts`
Expected: FAIL — `Cannot find module './revalidation-paths'`.

- [ ] **Step 3: Create the helper**

Create `frontend/lib/revalidation-paths.ts`:

```ts
/**
 * Locale-prefixed route paths for a page slug, for use as `revalidatePath`
 * arguments. `i18n/routing.ts` sets `localePrefix: "always"`, so every
 * article and talk page lives at `/<locale>/<slug>` — there is no
 * unprefixed default-locale form to special-case.
 *
 * Pure and dependency-free: the caller passes the locale list (normally
 * `routing.locales`) so this stays unit-testable without importing the
 * next-intl routing module. A wrong path here makes `revalidatePath` a
 * silent no-op, so the path form is pinned by revalidation-paths.test.ts.
 */
export function localePathsForSlug(
  slug: string,
  locales: readonly string[],
): string[] {
  return locales.map((locale) => `/${locale}/${slug}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx tsx --test lib/revalidation-paths.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/revalidation-paths.ts frontend/lib/revalidation-paths.test.ts
git commit -m "chore: add locale-path helper for cache revalidation"
```

---

## Task 2: Cache the family-tree computation behind `unstable_cache`

`getFamilyTree` runs the family-graph traversal + GEDCOM file joins. It is called by three routes (home, index, `/family/tree`) and is identical for every reader of a given `(rootRecord, perspective)` pair. Move it behind `unstable_cache`.

**Files:**
- Modify: `frontend/lib/family.ts` (the `getFamilyTree` export, ~line 271)

Verified: `FamilyTreeView` is composed entirely of plain objects, arrays, strings, numbers, and `null` — no `Map`, `Set`, `Date`, or class instances — so it is safe to serialize through `unstable_cache`. `lib/family.test.ts` imports only `loadDerivedRecordsForTree`, so this change does not affect the test suite.

- [ ] **Step 1: Add the `next/cache` import**

In `frontend/lib/family.ts`, add to the import block at the top of the file:

```ts
import { unstable_cache } from 'next/cache';
```

- [ ] **Step 2: Rename the implementation to `computeFamilyTree`**

In `frontend/lib/family.ts`, change the function declaration (currently at ~line 271):

```ts
export async function getFamilyTree(
```

to (drop `export`, rename):

```ts
async function computeFamilyTree(
```

Leave the entire function body unchanged.

- [ ] **Step 3: Add the cached wrapper**

Immediately after the closing brace of `computeFamilyTree` (before the `type RelationEnricher` declaration), add:

```ts
/**
 * Cached wrapper around `computeFamilyTree`. The family-graph traversal +
 * GEDCOM file joins are expensive and identical for every reader of a
 * given (rootRecord, perspective) pair, so the result is memoised across
 * requests. Invalidated by the `gedcom` tag — GEDCOM-mutating API routes
 * call `revalidateTag('gedcom')` — and, as a backstop for background
 * git-sync pulls, after `revalidate` seconds. 60s ≈ the sync cadence.
 */
export const getFamilyTree = unstable_cache(
  computeFamilyTree,
  ['family-tree'],
  { tags: ['gedcom'], revalidate: 60 },
);
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean (no errors). The three callers (`app/[locale]/page.tsx`, `app/[locale]/index/page.tsx`, `app/[locale]/family/tree/page.tsx`) `import { getFamilyTree }` — still valid; the export is now a `const` with an identical call signature.

- [ ] **Step 5: Run the family test to confirm no regression**

Run: `cd frontend && npx tsx --test lib/family.test.ts`
Expected: PASS. (No new unit test: `unstable_cache` has no Next runtime under `tsx --test`, so caching behavior cannot be meaningfully unit-tested here — it is exercised by the build + manual smoke test in Task 6. The computation itself is unchanged code.)

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/family.ts
git commit -m "chore: cache the family-tree compute behind unstable_cache"
```

---

## Task 3: Wire write-route cache invalidation

Page, note, and GEDCOM write routes must invalidate the affected caches so browser writes are reflected immediately. The note routes currently invalidate nothing.

**Files:**
- Modify: `frontend/app/api/pages/[slug]/route.ts`
- Modify: `frontend/app/api/notes/[slug]/route.ts`
- Modify: `frontend/app/api/notes/[slug]/[id]/route.ts`
- Modify: `frontend/app/api/gedcom/recite/route.ts`
- Modify: `frontend/app/api/gedcom/sync/route.ts`

- [ ] **Step 1: `api/pages/[slug]/route.ts` — add imports**

Add to the import block:

```ts
import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { localePathsForSlug } from '@/lib/revalidation-paths';
```

- [ ] **Step 2: `api/pages/[slug]/route.ts` — revalidate after PUT and DELETE**

In `PUT`, immediately after `invalidateListCache();` (and before `return NextResponse.json({ ok: true });`), add:

```ts
  for (const path of localePathsForSlug(slug, routing.locales)) revalidatePath(path);
```

In `DELETE`, immediately after `invalidateListCache();` (and before `return NextResponse.json({ ok: true });`), add the identical line:

```ts
  for (const path of localePathsForSlug(slug, routing.locales)) revalidatePath(path);
```

- [ ] **Step 3: `api/notes/[slug]/route.ts` — add imports**

Add to the import block (`toTalkSlug` is already imported in this file):

```ts
import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { localePathsForSlug } from '@/lib/revalidation-paths';
```

- [ ] **Step 4: `api/notes/[slug]/route.ts` — revalidate after POST**

In `POST`, between the `const { date, id } = await withLock(...)` block and the `return NextResponse.json({ slug: toTalkSlug(slug), date, id });` line, add:

```ts
    // A note renders both inline on the article page and on the talk
    // page — revalidate both, every locale.
    for (const path of localePathsForSlug(slug, routing.locales)) revalidatePath(path);
    for (const path of localePathsForSlug(toTalkSlug(slug), routing.locales)) revalidatePath(path);
```

- [ ] **Step 5: `api/notes/[slug]/[id]/route.ts` — add imports**

Add to the import block (`toTalkSlug` is already imported):

```ts
import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { localePathsForSlug } from '@/lib/revalidation-paths';
```

- [ ] **Step 6: `api/notes/[slug]/[id]/route.ts` — revalidate after PATCH and DELETE**

In `PATCH`, between the `const result = await withLock(...)` block and the `return NextResponse.json({ slug: toTalkSlug(slug), id: result.id, editedAt: result.editedAt });` line, add:

```ts
    for (const path of localePathsForSlug(slug, routing.locales)) revalidatePath(path);
    for (const path of localePathsForSlug(toTalkSlug(slug), routing.locales)) revalidatePath(path);
```

In `DELETE`, between the `const result = await withLock(...)` block and the `return NextResponse.json({ slug: toTalkSlug(slug), id: result.id, deletedAt: result.deletedAt });` line, add the identical two lines:

```ts
    for (const path of localePathsForSlug(slug, routing.locales)) revalidatePath(path);
    for (const path of localePathsForSlug(toTalkSlug(slug), routing.locales)) revalidatePath(path);
```

- [ ] **Step 7: `api/gedcom/recite/route.ts` — add import and revalidate**

Add to the import block:

```ts
import { revalidatePath, revalidateTag } from 'next/cache';
```

In `POST`, immediately after `invalidateListCache();` (and before the `return NextResponse.json({ updated });` line / its comment), add:

```ts
  // GEDCOM-derived data changed: drop the family-tree cache and let every
  // ISR-cached article page (infoboxes read derived records) regenerate.
  revalidateTag('gedcom', 'max');
  revalidatePath('/[locale]/[slug]', 'page');
```

- [ ] **Step 8: `api/gedcom/sync/route.ts` — add import and revalidate**

Add to the import block:

```ts
import { revalidatePath, revalidateTag } from 'next/cache';
```

In `POST`, immediately after `await rebuildSearchIndexFromDisk();` (and before `return NextResponse.json(result);`), add:

```ts
    revalidateTag('gedcom', 'max');
    revalidatePath('/[locale]/[slug]', 'page');
```

- [ ] **Step 9: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 10: Run the helper test (still green) and lint**

Run: `cd frontend && npx tsx --test lib/revalidation-paths.test.ts && npm run lint`
Expected: tests PASS, lint clean.

- [ ] **Step 11: Commit**

```bash
git add frontend/app/api/pages/[slug]/route.ts frontend/app/api/notes/[slug]/route.ts frontend/app/api/notes/[slug]/[id]/route.ts frontend/app/api/gedcom/recite/route.ts frontend/app/api/gedcom/sync/route.ts
git commit -m "chore: revalidate page caches on page, note, and gedcom writes"
```

---

## Task 4: `[slug]` → on-demand ISR (the user-reachable change)

Remove `force-dynamic` from `[slug]`, make it ISR, drop the now-redundant `force-dynamic` from `family/tree`, and rewrite the rendering-strategy canary test. This is the commit where caching becomes user-visible — it carries the CHANGELOG entry.

**Files:**
- Modify: `frontend/test/static-rendering.test.ts` (full rewrite)
- Modify: `frontend/app/[locale]/[slug]/page.tsx`
- Modify: `frontend/app/[locale]/family/tree/page.tsx`
- Modify: `CHANGELOG.md` (repo root)

- [ ] **Step 1: Rewrite the canary test (failing first)**

Replace the **entire contents** of `frontend/test/static-rendering.test.ts` with:

```ts
// Rendering-strategy verification for the two hot [locale]/* routes.
//
// The 2026-05-22 frontend-performance work moved article pages off
// `force-dynamic` onto on-demand ISR (`export const revalidate`), and
// dropped the now-redundant `force-dynamic` from `family/tree` (it is
// dynamic regardless — it reads searchParams). These source-level
// assertions are the canary: they fail loudly if `force-dynamic` is
// reintroduced on `[slug]`, which would silently un-cache every article.
//
// Source inspection (not prerender-manifest inspection) is deliberate:
// it runs in `npm test` with no build step and pins the exact intent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', '[locale]');
const read = (rel: string): string => readFileSync(join(appDir, rel), 'utf8');

test('[slug] article route is ISR, not force-dynamic', () => {
  const src = read(join('[slug]', 'page.tsx'));
  assert.doesNotMatch(
    src,
    /dynamic\s*=\s*['"]force-dynamic['"]/,
    '[slug]/page.tsx must not be force-dynamic — it should serve from the ISR cache',
  );
  assert.match(
    src,
    /export const revalidate\s*=\s*\d+/,
    '[slug]/page.tsx must export a numeric `revalidate` (the ISR window)',
  );
});

test('family/tree carries no redundant force-dynamic', () => {
  const src = read(join('family', 'tree', 'page.tsx'));
  assert.doesNotMatch(
    src,
    /dynamic\s*=\s*['"]force-dynamic['"]/,
    'family/tree is dynamic via searchParams; the explicit force-dynamic was removed',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx tsx --test test/static-rendering.test.ts`
Expected: FAIL — both tests fail; `[slug]/page.tsx` and `family/tree/page.tsx` still contain `dynamic = 'force-dynamic'`.

- [ ] **Step 3: Convert `[slug]/page.tsx` to ISR**

In `frontend/app/[locale]/[slug]/page.tsx`:

(a) Replace the line `export const dynamic = 'force-dynamic';` (~line 33) with:

```ts
// On-demand ISR: render each (locale, slug) once, cache it, regenerate on
// demand. Page and note writes call `revalidatePath` for immediate
// freshness; this 60s window is the backstop for background git-sync
// pulls (≈ the sync cadence). `next dev` ignores ISR and always renders
// fresh. Replaces the former `force-dynamic`.
export const revalidate = 60;
```

(b) Replace the entire `generateStaticParams` function (the `export async function generateStaticParams() { ... }` block at the end of the file) with:

```ts
/**
 * No build-time prerender. On a Render build the data repo is not yet on
 * disk (instrumentation.ts clones it at server startup), and the
 * 2026-05-22 performance design chose pure on-demand ISR — every
 * (locale, slug) renders on first request and is then cached. Returning
 * an empty list keeps local and Render builds identical.
 */
export function generateStaticParams() {
  return [];
}
```

(c) Remove the now-unused import. Delete the line:

```ts
import { routing } from '@/i18n/routing';
```

Keep `import type { Locale } from '@/i18n/routing';` (still used by the `PageRoute` props type). `getPageStore` stays imported — it is still used by `readBodiesForSlugs`.

- [ ] **Step 4: Drop `force-dynamic` from `family/tree/page.tsx`**

In `frontend/app/[locale]/family/tree/page.tsx`, delete the line:

```ts
export const dynamic = 'force-dynamic';
```

The route stays dynamic — it reads `searchParams` (`?person=`, `?from=`). This removal is cosmetic.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx tsx --test test/static-rendering.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean. (If `tsc` reports `routing` is undefined, a usage was missed in Step 3c; if it reports `routing` unused was *not* removed, ESLint will catch it in Task 6 — remove it.)

- [ ] **Step 7: Add the CHANGELOG entry**

In `CHANGELOG.md` (repo root), under `## [Unreleased] — v2 development`, add a `### Changed` subsection **above** the existing `### Fixed` subsection:

```markdown
### Changed

- **Article pages now serve from an on-demand ISR cache (`frontend`)** — `/[locale]/[slug]` carried `export const dynamic = 'force-dynamic'`, so every request re-read the page file, re-read every linked page's body to build hover-card data, reloaded GEDCOM-derived records, and re-ran the full markdown pipeline. The route is now incremental-static: rendered once per `(locale, slug)`, cached, and regenerated either on demand — a page or note write `revalidatePath`s the affected article and its talk page immediately — or after a 60-second window, the backstop for background git-sync pulls. The shared family-tree computation (`getFamilyTree`, used by the home, index, and `/family/tree` routes) moved behind `unstable_cache` with the same 60-second window and a `gedcom` invalidation tag. `next dev` is unaffected — development always renders on demand. Net effect: repeat page loads skip all per-request file I/O and rendering.
```

- [ ] **Step 8: Commit (CHANGELOG must be in this commit)**

The `changelog-nudge.sh` hook blocks a `feat:` commit with no staged `CHANGELOG.md`.

```bash
git add frontend/test/static-rendering.test.ts frontend/app/[locale]/[slug]/page.tsx frontend/app/[locale]/family/tree/page.tsx CHANGELOG.md
git commit -m "feat: serve article pages from an on-demand ISR cache"
```

- [ ] **Step 9: Push the batch**

```bash
git push
```

(If the feature branch has no upstream yet: `git push -u origin perf/route-caching`.)

---

## Task 5: `next/image` for portrait images

Convert the three portrait `<img>` sites to `next/image` for lazy-loading and format/size optimization. Portraits are same-origin (`/assets/...`) so the default loader needs no `next.config` change.

**Files:**
- Modify: `frontend/components/directives/infobox-person.tsx`
- Modify: `frontend/components/family/avatar-monogram.tsx`
- Modify: `frontend/components/wikilink-hover-card.tsx`

- [ ] **Step 1: `infobox-person.tsx` — import and convert**

Add at the top of the import block:

```ts
import Image from 'next/image';
```

Replace the `avatar={...}` portrait branch — the comment and `<img>` (currently the `// A plain <img> rather than <AvatarImage>...` comment plus the `<img src={portrait} ... />` element) — with:

```tsx
        avatar={
          // next/image (not base-ui's <AvatarImage>): base-ui's avatar
          // image is client-load-state driven and renders nothing during
          // SSR; next/image emits a real <img> in the SSR HTML and adds
          // size/format optimization on top.
          portrait ? (
            <Image
              src={portrait}
              alt=""
              aria-hidden
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-full object-cover ring-2 ring-infobox-border/60"
            />
          ) : (
            <Avatar size="lg" className="ring-2 ring-infobox-border/60">
              <AvatarFallback className="bg-infobox-border/30 font-heading text-sm text-infobox-foreground">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
          )
        }
```

- [ ] **Step 2: `avatar-monogram.tsx` — import and convert**

Add at the top:

```ts
import Image from 'next/image';
```

Replace the `<img>` element (the `if (portrait) { return <img ... /> }` branch) with:

```tsx
  if (portrait) {
    return (
      <Image
        src={portrait}
        alt=""
        aria-hidden
        className="shrink-0 rounded-full object-cover ring-1 ring-foreground/10"
        width={px}
        height={px}
        style={{ width: px, height: px }}
      />
    );
  }
```

- [ ] **Step 3: `wikilink-hover-card.tsx` — import and convert**

Add to the import block (after the other imports):

```ts
import Image from 'next/image';
```

Replace the `data.portrait` `<img>` branch — including its `// eslint-disable-next-line @next/next/no-img-element` comment, which is no longer needed — with:

```tsx
            {data.portrait ? (
              <Image
                src={data.portrait}
                alt=""
                aria-hidden
                width={AVATAR_PX}
                height={AVATAR_PX}
                className="rounded-full object-cover ring-1 ring-foreground/10"
                style={{ width: AVATAR_PX, height: AVATAR_PX }}
              />
            ) : (
```

- [ ] **Step 4: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: both clean. (Lint should no longer warn `@next/next/no-img-element` for these files.)

- [ ] **Step 5: Verify the optimizer works at runtime**

Run: `cd frontend && npm run build && npm run start` (port 3001), then load — over `localhost`, not Tailscale — an article page that has a portrait and `/en/family/tree`. In the browser Network tab, confirm portrait requests go to `/_next/image?url=...` and return `200`.

**Contingency — if `/_next/image` requests fail** (the optimizer cannot reach the `/assets` route handler, or the request is blocked browsing over Tailscale): revert each `<Image>` back to a plain `<img>` but keep the lazy-loading win — for each of the three files, use `<img>` with the original attributes plus `loading="lazy" decoding="async"`, drop the `next/image` import, and restore the `eslint-disable` comment in `wikilink-hover-card.tsx`. Example for `avatar-monogram.tsx`:

```tsx
  if (portrait) {
    return (
      <img
        src={portrait}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="shrink-0 rounded-full object-cover ring-1 ring-foreground/10"
        width={px}
        height={px}
        style={{ width: px, height: px }}
      />
    );
  }
```

- [ ] **Step 6: Commit**

```bash
git add frontend/components/directives/infobox-person.tsx frontend/components/family/avatar-monogram.tsx frontend/components/wikilink-hover-card.tsx
git commit -m "chore: optimize portrait images with next/image"
```

---

## Task 6: Full verification and measurement

No code changes unless a check fails. Confirm the whole change is correct and capture the proof.

- [ ] **Step 1: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `cd frontend && npm test`
Expected: all pass — including `lib/revalidation-paths.test.ts`, `lib/family.test.ts`, `lib/e2e.test.ts`, and `test/static-rendering.test.ts`.

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: clean.

- [ ] **Step 4: Production build — confirm the route-type flip**

Run: `cd frontend && npm run build`
Expected: build succeeds. In the printed route table, `/[locale]/[slug]` is **no longer** marked `ƒ (Dynamic)` — it appears as ISR / static-with-revalidate. `/[locale]/family/tree` remains `ƒ (Dynamic)` (expected — it reads `searchParams`). This route-type flip is the primary proof of the change; record the relevant route-table lines in the PR description. First Load JS should be unchanged within noise (no client-bundle change beyond `next/image`, already part of Next).

- [ ] **Step 5: Manual smoke test**

With `npm run start` running (port 3001), verify over `localhost`:
1. Load an article page twice — the second load is served from cache (fast, no skeleton).
2. Add a research note via the UI — it appears on reload (write-triggered `revalidatePath` works).
3. Load `/en/family/tree` and the home page — both render correctly (the `unstable_cache`d `getFamilyTree` view renders with no missing fields — confirms serializability).

- [ ] **Step 6: Confirm no ROADMAP triad is needed**

`docs/ROADMAP.md` has no `P#.#` row for `force-dynamic` removal / ISR / static rendering (P2.19 is a separate service-worker item). No ROADMAP edit, no `P#.#` language in the CHANGELOG — the `roadmap-drift` test stays satisfied. No action; this step is a confirmation.

- [ ] **Step 7: Final push**

```bash
git push
```

---

## Self-review notes

- **Spec coverage:** `[slug]` ISR (Task 4), `family/tree` compute caching (Task 2), write-route invalidation (Task 3), `next/image` (Task 5), `revalidation-paths` helper + test (Task 1), `static-rendering.test.ts` rewrite (Task 4), full verification + measurement (Task 6). All spec sections mapped.
- **Open risks from the spec:** (1) `FamilyTreeView` serializability — resolved, verified plain data (Task 2 preamble + Task 6 Step 5). (2) `revalidatePath` path form — pinned by `revalidation-paths.test.ts` (Task 1); `localePrefix: "always"` confirmed in `i18n/routing.ts`. (3) `next/image` × `/assets` × Tailscale — Task 5 Step 5 contingency. (4) hidden request-time APIs in `[slug]` — `static-rendering.test.ts` + the Task 6 build are the detectors.
- **Type consistency:** `localePathsForSlug(slug, locales)` — same signature in Task 1 (definition) and Task 3 (all five call sites). `getFamilyTree` keeps its callable signature after the `unstable_cache` wrap (Task 2) — three callers unchanged.
