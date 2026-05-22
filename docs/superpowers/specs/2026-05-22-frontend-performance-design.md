# Frontend Performance — Route Caching + Image Optimization — Design

**Status:** approved, ready for implementation plan.
**Roadmap row:** TBD at plan time — `frontend/AGENTS.md` calls `force-dynamic`
removal the "Plan 1 follow-up"; check `docs/ROADMAP.md` for an existing
`P#.#` covering static rendering. If one exists, the Rule 14
ROADMAP–CHANGELOG triad applies; otherwise this ships as a plain
`[Unreleased]` CHANGELOG entry.
**Lift:** M — single package (`frontend/`): two route files, one `lib/`
function, four API routes, three components, one new pure helper + test,
one rewritten test.

---

## Background

This work was prompted by a performance review against the article
*"How is Linear so fast — a technical breakdown"*. Linear is a
client-heavy, local-first SPA; whoami.wiki is a **server-rendered
content wiki**. So the article's headline ideas — IndexedDB as the
read database, MobX granular observables, optimistic updates — are
SPA-architecture moves that do **not** transfer. The lessons that *do*
transfer are the rendering-strategy ones: cache aggressively, split
code, serve from cache instead of recomputing. This spec applies those.

The wiki's two hot routes both carry `export const dynamic =
'force-dynamic'`:

- **`app/[locale]/[slug]/page.tsx`** (articles) — every request reads
  the page file, reads **every linked page's body** to build hover-card
  data (`readBodiesForSlugs`), loads GEDCOM-derived records, and runs
  the full markdown → React pipeline. None of it cached beyond a 2-second
  in-process TTL.
- **`app/[locale]/family/tree/page.tsx`** — every request re-runs the
  whole family-graph traversal (`getFamilyTree`) joining GEDCOM-derived
  records, plus file reads.

The codebase is already well-optimized on the usual quick-win surfaces:
`next/font` auto-applies `display: swap` + preloading, the heavy client
islands (Leaflet map, pedigree chart, command palette) are already
`next/dynamic`-split, and `lucide-react` icons tree-shake. The only
quick win left is images. The real lever is the two `force-dynamic`
routes.

`frontend/AGENTS.md` already names removing `force-dynamic` as a known
"Plan 1 follow-up", and `frontend/test/static-rendering.test.ts` is a
(currently skipped) canary scaffolded for exactly this change.

## Scope

**In scope:**

1. `[slug]` → on-demand ISR (remove `force-dynamic`, add `revalidate`).
2. `family/tree` → stays dynamic; its expensive compute (`getFamilyTree`)
   moves behind `unstable_cache`.
3. Write-route cache invalidation — `revalidatePath` / `revalidateTag`
   in the page, note, and GEDCOM API routes, so browser writes are
   reflected immediately.
4. `next/image` for the three portrait `<img>` sites.
5. Test updates — a new pure invalidation-path helper + unit test; a
   rewrite of the `static-rendering.test.ts` canary.

**Explicit non-goals:**

- **`cacheComponents` / `use cache` migration** (the considered
  "Approach B"). It is an app-wide rendering-model flag requiring a
  Suspense-boundary audit across all nine routes and changing client
  navigation semantics — too large a blast radius for a two-route
  problem. Deferred; this design leaves a clean upgrade path to it.
- Local-first / IndexedDB, optimistic UI, aggressive `<Link>`
  hover-prefetch — out of the agreed scope ("big lever + quick wins",
  not "full pass").
- `core/`, the family-graph algorithms, search, auth, i18n, and the
  `lib/sync.ts` background scheduler — untouched.
- Fonts (already optimal) and the 600 ms `registry-rise` entrance
  keyframe (a deliberate flourish, not an interaction delay — CLAUDE.md
  Rule 3).

## Decisions

Settled during brainstorming:

| Question | Decision |
| --- | --- |
| Depth | Big lever (`force-dynamic` removal) + quick wins. |
| Freshness model | **Writes instant, sync bounded** — browser writes invalidate immediately; upstream git-sync edits may be up to one `revalidate` window stale. |
| Caching mechanism | **Approach A** — `unstable_cache` + ISR. Not `cacheComponents`. |
| Build prerender | `generateStaticParams` returns `[]` **always** — pure on-demand ISR. Local and Render builds behave identically. |

`revalidate` window: **60 seconds** — a static literal in the route
file (Next requires `revalidate` be statically analyzable), chosen to
roughly track the git-sync cadence. Tunable.

## Architecture

### `[slug]` → on-demand ISR

In `app/[locale]/[slug]/page.tsx`:

- **Remove** `export const dynamic = 'force-dynamic'`.
- **Add** `export const revalidate = 60`.
- `generateStaticParams` returns `[]` unconditionally (drop the
  `store.list()` call and its try/catch). With the default
  `dynamicParams: true`, every `(locale, slug)` renders on first request
  and is then cached.

Result: the route's HTML + RSC payload is cached per `(locale, slug)`.
The per-request cost — page read, `readBodiesForSlugs` over every linked
page, derived-record load, markdown pipeline — runs **only on
regeneration** (every 60 s, or on demand via `revalidatePath`).

The route reads `params` only — no `searchParams`, `cookies()`, or
`headers()` — so it is statically renderable. `setRequestLocale(locale)`
is already called (required for next-intl static rendering). A
`notFound()` or schema-error result is cached the same way; acceptable
under bounded staleness, and a later page-create `revalidatePath` clears
a cached 404.

Auth is unaffected: `proxy.ts` middleware runs per-request *before* the
cached payload is served. The page renders **no per-user content** (the
account menu is a client component in the layout), so one cached copy
per `(locale, slug)` is correct for all users.

### `family/tree` → dynamic with cached compute

`family/tree` reads `searchParams` (`?person=`, `?from=`), so it stays
dynamic. Drop its now-redundant `export const dynamic = 'force-dynamic'`
for tidiness — the route is dynamic regardless once it reads
`searchParams`; this is cosmetic, not functional. The lever here is the
*compute*, not the route shell.

In `lib/family.ts`, wrap the family-tree computation in `unstable_cache`.
Rename the current `getFamilyTree` implementation to `computeFamilyTree`,
then re-export the cached wrapper under the **same** `getFamilyTree`
name, so its single caller (`family/tree/page.tsx`) is unchanged:

```ts
import { unstable_cache } from 'next/cache';

export const getFamilyTree = unstable_cache(
  computeFamilyTree,                 // the renamed raw implementation
  ['family-tree'],                   // key prefix; record + from auto-append
  { tags: ['gedcom'], revalidate: 60 },
);
```

The graph traversal + GEDCOM file joins stop re-running per request;
the dynamic route render becomes a cheap render of cached view data.
`renderMarkdown` needs no separate cache — ISR on `[slug]` already
amortizes it. The tree's own talk-notes read stays uncached (small;
caching it would add invalidation surface for little gain).

### Write-route cache invalidation

This is the "writes instant" half. A new **pure helper** keeps the
locale-path construction testable (the codebase convention — split pure
logic from runtime shells; see `frontend/AGENTS.md`):

```ts
// lib/revalidation-paths.ts  (pure, dependency-free)
// localePrefix is "always" (i18n/routing.ts) → every path is /<locale>/<slug>.
export function articlePaths(slug: string, locales: readonly string[]): string[]
export function talkPaths(slug: string, locales: readonly string[]): string[]
```

Route shells call `revalidatePath` over those paths:

| API route | Mutation | Invalidation |
| --- | --- | --- |
| `api/pages/[slug]` | page write | `revalidatePath` each `articlePaths(slug)` |
| `api/notes/[slug]` | note create | `revalidatePath` each `articlePaths` + `talkPaths` |
| `api/notes/[slug]/[id]` | note edit / delete | same as above |
| `api/gedcom/recite`, `api/gedcom/sync` | GEDCOM change | `revalidateTag('gedcom')` + `revalidatePath('/[locale]/[slug]', 'page')` (broad — GEDCOM ripples into article infoboxes) |

`lib/sync.ts` (the background pull scheduler) is **unchanged** — the
`revalidate: 60` window covers upstream-sync staleness, so no
revalidation is needed from the non-request `setInterval` context. This
is the reason "writes instant, sync bounded" was the clean requirement
to pick.

### Image optimization

Convert the three portrait `<img>` sites to `next/image`:
`components/directives/infobox-person.tsx`,
`components/family/avatar-monogram.tsx`,
`components/wikilink-hover-card.tsx`. Gains AVIF/WebP, responsive
sizing, and lazy-loading (the hover-card portraits especially — usually
never displayed). Portraits are same-origin (`/assets/...`, served by
`app/assets/[...path]/route.ts`), so the default loader needs no
`next.config` change. Explicit `width`/`height` (or `fill` in a sized
wrapper) is required — portraits are runtime files with no static
dimensions.

The `frontend/AGENTS.md` note about a plain `<img>` in
`infobox-person.tsx` concerns *base-ui's `AvatarImage`*, not
`next/image` — so this is not blocked.

**Contingency:** if the `/_next/image` optimizer fails against the
custom `/assets` route handler, or is blocked browsing over Tailscale
(the same class of cross-origin dev-asset failure that
`allowedDevOrigins` exists to fix), fall back to
`<img loading="lazy" decoding="async">`. That still captures the
lazy-loading win with zero optimizer dependency.

## Freshness model

| Change event | Invalidation | Max staleness |
| --- | --- | --- |
| Browser note create / edit / delete | `revalidatePath` (article + talk) | immediate |
| Browser / CLI page write | `revalidatePath` (article) | immediate |
| GEDCOM change via API | `revalidateTag` + broad `revalidatePath` | immediate |
| Upstream git-sync pull (background) | time-based `revalidate` | ≤ 60 s |

Note: `next dev` bypasses ISR entirely (pages always render on-demand in
development). The local editing workflow on `:3001` sees **no behavior
change** — caching only affects `next build` / `next start` (the Render
replica).

## Tests

- **`lib/revalidation-paths.test.ts`** (new) — pins the locale-path
  form (`/en/<slug>`, `/ru/<slug>`, …) for all four locales and the
  talk-slug variant. This directly de-risks the silent-no-op failure
  mode of a wrong `revalidatePath` argument.
- **`test/static-rendering.test.ts`** (rewrite) — the current file has
  two skipped tests scaffolded for a *prerender-everything* model. Test
  2 ("> 100 articles prerendered per locale") **contradicts** the
  chosen `generateStaticParams → []` design and cannot pass. Rewrite the
  canary to assert what this design produces: after `next build`, the
  `[locale]/[slug]` route registers as **ISR** (a `dynamicRoutes` entry
  in `.next/prerender-manifest.json` carrying a `revalidate` value) and
  is no longer `force-dynamic`. Update the file header comment. The
  top-level `[locale]` index route stays dynamic (out of scope), so its
  assertion is dropped, not un-skipped.
- Existing `npm test`, `tsc --noEmit`, `npm run lint` must stay green.

## Open risks — verify during planning

1. **`getFamilyTree` view serializability.** `unstable_cache` serializes
   its return value (JSON-like, narrower than RSC serialization). If the
   assembled view holds a `Map`, `Set`, `Date`, or class instance, the
   cache will corrupt or throw. Inspect the view shape *before* writing
   the wrapper; if needed, normalize to plain objects/arrays.
2. **`revalidatePath` path form.** `localePrefix: "always"` removes the
   default-locale ambiguity (paths are always `/<locale>/<slug>`), but
   the exact string Next matches against the route cache must still be
   confirmed against a real build. The `revalidation-paths.test.ts`
   helper test pins it.
3. **`next/image` × `/assets` route × Tailscale.** Covered by the
   `<img loading="lazy">` contingency above.
4. **Hidden request-time APIs in the `[slug]` render tree.** If any
   server-service reached from `[slug]` calls `headers()` / `cookies()`,
   the route silently stays dynamic or errors under prerender. The
   rewritten `static-rendering.test.ts` canary is the detector.

## Implementation order (for the plan)

1. `lib/revalidation-paths.ts` + test (pure, no dependencies — safe first step).
2. `getFamilyTree` → `unstable_cache` in `lib/family.ts` (verify risk 1 first).
3. Write-route invalidation: `api/pages`, `api/notes/*`, `api/gedcom/*`.
4. `[slug]` → ISR (`force-dynamic` removal, `revalidate`,
   `generateStaticParams` → `[]`).
5. `next/image` for the three portrait sites.
6. Rewrite `static-rendering.test.ts`; full verification (`build`,
   `test`, `tsc`, `lint`); capture before/after `next build` route
   table + First Load JS.
7. CHANGELOG entry; ROADMAP triad if a `P#.#` applies.
