<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure
may all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.
<!-- END:nextjs-agent-rules -->

## What this package is

The Next.js (App Router) renderer for the wiki. It reads the markdown
pages and GEDCOM-derived data directly from `$WHOAMI_ROOT` and serves a
browseable wiki UI:

- `/` — index of all pages
- `/[slug]` — render a wiki page from `pages/<slug>.md`
- `/family` — family-line summary
- `/family/tree` — interactive family browser (siblings, cousins,
  descendants, lineage, lifespans, places-of-birth map, coverage prompts,
  shareable relationship links)
- `/search` — text + facet search across pages

## Layout

| Path                              | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `app/`                            | App Router pages.                                        |
| `components/family/`              | Family-tree UI primitives (tile, row, monogram, lifespan bar, map). |
| `components/family/sections/`     | One file per section on the `/family/tree` page; the page itself is just composition. |
| `components/directives/`          | Markdown directive renderers (infobox-person, infobox-company, etc.). |
| `components/ui/`                  | shadcn-derived UI primitives. |
| `lib/family.ts`                   | The orchestration layer — joins `core/family/*` graph computations with wiki page metadata for slugs and portraits. |
| `lib/env.ts`                      | Environment surface: `WHOAMI_ROOT`, `SELF_RECORD`, `DERIVED_DIR`, `PLACES_COORDS_FILE`. |
| `lib/server-services.ts`          | Server-side caches (page list, search index). |
| `lib/render.tsx`                  | Markdown → React rendering with directive support. |
| `lib/wikilinks.ts`                | `[[double-bracket]]` link resolution. |

## Tests

```bash
npm test                              # tsx --test "lib/**/*.test.ts"
npx tsx --test lib/family.test.ts     # one file
npx tsc --noEmit                      # typecheck gate
```

## Conventions

- **Server components by default**, `"use client"` only when you need
  client-side state, browser APIs, or third-party libraries that touch
  `window`. Map components (Leaflet) are the prototypical client island.
- **Pure data crosses the server/client boundary** — function props
  can't pass to client components in this Next version, so precompute
  hrefs and other strings on the server. (See `birthplaces-map.tsx`.)
- **Page sections are extracted** — `app/family/tree/page.tsx` is
  intentionally thin; each section is one file under
  `components/family/sections/`. When adding a new section, follow the
  pattern: `MySection({ view })` returns null when its slice of the
  view is empty.
- **No auth** — Tailscale ACLs are the access layer. Don't add login
  screens, sessions, or auth headers.
- **Information density** is preferred over Apple-style sparseness.
  The audience is people scanning and comparing genealogy data; show
  more per screen. Avoid page-bg tints, drop caps, parchment textures.

## Dev access via Tailscale

The dev server runs on `localhost:3001` but is browsed through Tailscale
(100.x.x.x range). Next 16 blocks cross-origin requests to dev resources
by default, which silently breaks dynamic chunk loading (the Leaflet map
hangs at "Loading map…").

`next.config.ts` has `allowedDevOrigins` configured with the project
owner's Tailscale node as a default and `WHOAMI_ALLOWED_DEV_ORIGINS`
(comma-separated) as an override. If you change the IP, restart
`next dev` — `next.config.ts` doesn't hot-reload.

## Pitfalls

- **Importing leaflet at module top-level** — Leaflet references
  `window` at import. Use `dynamic(() => import(...), { ssr: false })`.
  See `components/family/birthplaces-map.tsx` for the wrapper pattern.
- **Passing functions across the server/client boundary** — Next will
  throw `Functions cannot be passed directly to Client Components`.
  Precompute the value on the server; pass strings/numbers/plain
  objects only.
- **Reading data files on every request without caching** — use the
  TTL+mtime caches in `lib/family.ts` as the model (`getCachedDerivedRecords`,
  `getCachedCoords`).
- **Adding business logic in components** — graph operations belong in
  `core/family/*`; page joins belong in `lib/family.ts`; components
  should consume already-shaped view data.

## Internationalization (next-intl)

The site is multilingual (en/ru/uk/he, Hebrew RTL). UI strings live
in `messages/{locale}.json` namespaced by surface (Chrome, Page.*,
Directives.*, Errors). Articles live in `~/whoami/pages/{locale}/`;
Plan 1's PageStore is locale-blind (reads pages/en/), Plan 3 will
add per-locale reads.

**Hard rules:**

- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed it. Older
  blog posts say `middleware.ts`; they are wrong for this codebase.
- **`setRequestLocale(locale)` in every page and layout under
  `app/[locale]/`** — before any other next-intl call. Forgetting
  it silently degrades to dynamic rendering. The
  `frontend/test/static-rendering.test.ts` test is the canary
  (currently skipped — see Plan 1 follow-up about removing
  `force-dynamic`).
- **`Link` from `@/i18n/navigation`, NOT from `next/link`.** The
  i18n wrapper preserves the active locale.
- **`useTranslations('Namespace')`** uses the lowest-common-
  denominator namespace per component to keep the client bundle
  slice tight.
- **Type-safe message keys:** if `t('foo.bar')` fails typecheck,
  the key is missing from `messages/en.json` — add it there.
  `messages/en.json` is the source of truth for the catalog shape;
  other locales mirror its structure.
- **ICU `select` for data unions, not N separate keys.** When a
  variable selects between alternatives (e.g., `'paternal' | 'maternal'`),
  prefer a single `{var, select, paternal {...} maternal {...} other {...}}`
  message over N separate keys. Avoids translation-key sprawl;
  keeps the alternatives visibly related to translators.
- **ICU `plural` for counts.** English needs only `one/other`;
  Russian/Ukrainian need `one/few/many/other`; Hebrew needs
  `one/two/many/other`. Author all categories the language
  requires. Don't use the `_plural`/`_zero` suffix style — it
  silently breaks Slavic and Hebrew.
- **Server vs client components:** server components can call
  `useTranslations` directly (next-intl supports this in async
  server components). Client components (`"use client"`) must
  receive translated strings as props from server parents until
  Plan 2 introduces the scoped `<NextIntlClientProvider messages={pick(...)}>`
  pattern.
