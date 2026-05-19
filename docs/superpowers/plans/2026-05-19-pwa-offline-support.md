# PWA Tier 2 — offline support via service worker

> **Status:** sketch — implementation deferred. Spawn a fresh session driven by this plan when the user wants the wiki to be readable on a plane / no-signal Tailscale / weak hotel wifi. P2.18 (Tier 1 installability) shipped 2026-05-19; this is the natural next step but the work is non-trivial and the trigger has not yet fired.

**Goal:** Make the installed wiki PWA browsable offline. Every page the user has visited (or that the service worker has prefetched) renders from cache when the network is unreachable; writes to research notes / talk threads queue and replay on reconnect.

## Why this exists

The Tier 1 PWA work (P2.18) made the wiki *installable* — a home-screen icon, a standalone display mode, an apple-touch-icon, a theme color. What it does not do is make the installed app *usable when offline*. Open the icon from a phone with no signal and Safari/Chrome surface their offline error page; not the wiki.

Offline support converts the wiki from "a website you can install" into "an app that travels with the user's device." Three motivating cases:

1. **Long flights / international travel** — the user often researches genealogy on planes. The data repo (`$WHOAMI_ROOT`) lives on the laptop; the wiki front-end is read-only-friendly. A serviced-worker offline mode lets the user read on a phone without burning roaming data.
2. **Tailscale unreliability** — the wiki is served via Tailscale; when Tailscale auth lapses or the exit node hiccups, the wiki goes dark even when the underlying network is fine. Cached pages bridge the gap.
3. **Mobile-first contribution-track future** — the contribution track (E.0–E.9) puts living family informants into the wiki via the browser. A grandmother on a flaky cellular connection during an interview will lose answers without offline queueing. Tier 2 is the foundation for that resilience.

## Strategy decisions to make before coding

These are the load-bearing choices. Each has an obvious-default and a why-not-default. The user should approve them before implementation starts.

| Decision | Default | Why-not-default |
|---|---|---|
| **Service worker framework** | Serwist (Workbox 7 wrapper, the path Next 16 docs recommend) | Hand-rolled `public/sw.js` is simpler to debug and avoids a webpack-config dependency, but you re-implement cache versioning, route matching, precache manifest, and update lifecycle yourself. |
| **What to cache eagerly (precache at install)** | App shell only — layout chunks, manifest, icons, the font assets, the `/[locale]` route shell | Eager-caching every article (~hundreds of pages) blows mobile storage budgets. Lazy runtime caching is right for content. |
| **What to runtime-cache (cache on first read)** | `/[locale]/[slug]` article HTML (stale-while-revalidate), the article's hover-card data fetches | Hover-card data is precomputed at SSR and already in the HTML; double-caching is wasted. Skip. |
| **What to NEVER cache** | `/api/notes/*` writes, `/api/notes/*` reads (always-fresh; falls back to last-cached HTML when offline), `_next/data` server-action endpoints | Stale notes are worse than no notes — show "offline, cached version" UI. |
| **Write queueing on `/api/notes/*` POSTs** | Background Sync API (Workbox `BackgroundSyncPlugin`) — POST queues in IndexedDB and replays on reconnect. **Out of scope for first pass** — first ship adds offline *reads* only; writes return a clear "offline, try again" error and the form stays populated. | Background sync is fiddly and iOS support is partial as of 2026. Defer until contribution-track usage proves it necessary. |
| **Update lifecycle** | `skipWaiting` + `clientsClaim` so a new SW activates on next navigation, with a small "wiki updated — reload?" toast on detect | Silent updates risk stale-content surprise; intrusive prompts break the install-and-forget feel. The toast is the middle path. |
| **`/manifest.webmanifest` cache strategy** | Network-first with cache fallback, 1-day max-age | Manifest changes are rare but install-prompts depend on it. |
| **Dev/prod parity** | Service worker disabled in `next dev` (Serwist convention; avoids HMR-vs-cache fights). Enabled in `next build && next start`. Document the gotcha in `frontend/AGENTS.md`. | Always-on in dev means a confused agent fighting cache invalidation during iteration. |
| **Offline-fallback page** | `/[locale]/offline` route that explains the state and links to last-cached articles | Without this, the SW fetch handler must return *something* for uncached navigations — a 200 with an explanation page is much better than a generic Chrome offline page. |
| **Locale routing inside the SW** | The SW caches the user's currently-active locale's pages aggressively; other locales lazily. Locale selection reads from `NEXT_LOCALE` cookie. | Caching all 4 locales × every article = 4× storage. The user almost always reads in one locale per session. |

## The flow end-to-end

```
[ first install ] → [ SW precaches app shell + offline page ]
                          │
                          ▼
[ user visits /[locale]/<slug> ] → [ SW fetch handler: network, cache result with SWR ]
                          │
                          ▼
[ user goes offline ] → [ next visit to same slug: serve from cache, revalidate when online ]
                          │
                          ▼
[ user visits uncached slug while offline ] → [ serve /[locale]/offline with link list ]
                          │
                          ▼
[ user posts a note while offline ] → [ first pass: fail clearly. later: BG sync queue ]
                          │
                          ▼
[ user comes back online ] → [ stale-while-revalidate refreshes cached pages on next visit ]
                          │
                          ▼
[ new SW deploys ] → [ on-next-navigation: toast "wiki updated — reload?" ]
```

## Files to create / modify

```
Create: frontend/app/[locale]/offline/page.tsx
  - Server component, lists the user's most-recently-cached articles
    via a small client island that reads from `caches.match`.

Create: frontend/lib/sw-register.tsx
  - 'use client' island mounted in [locale]/layout.tsx.
  - Registers /sw.js, listens for `controllerchange`, surfaces the
    "wiki updated" toast.

Create: frontend/serwist.config.ts  (if going Serwist)
  OR
Create: frontend/public/sw.js       (if hand-rolling)

Modify: frontend/next.config.ts
  - Add Serwist's plugin OR ensure public/sw.js is served with
    correct Content-Type + Cache-Control: no-cache,no-store,
    must-revalidate (per Next docs §8 security headers).

Modify: frontend/proxy.ts
  - Already excludes well-known PWA URLs; add `sw.js|workbox-*` so
    the SW + its workbox chunks bypass the locale matcher.

Modify: frontend/app/[locale]/layout.tsx
  - Mount <SwRegister /> client island.

Modify: frontend/AGENTS.md
  - New "Service worker" subsection: SW runs in build/start, not dev;
    clearing the cache in DevTools when iterating; the
    update-on-reload behavior.

Modify: CHANGELOG.md
  - "closes P2.19" entry under [Unreleased] with the same breakdown
    P2.17 / P2.18 used.

Modify: docs/ROADMAP.md
  - Flip P2.19 row from ⏳ ready → ✅ shipped; mirror into
    Recently shipped table.

Modify: docs/superpowers/plans/README.md
  - Flip this plan's row from 📝 → ✅; bump the total count.
```

## Out of scope for the first ship

These are real follow-ons but should not block P2.19:

- **Push notifications.** Tier 3 of the PWA roadmap. No use case for a private family wiki on Tailscale.
- **Background Sync for offline note posts.** Adds an IndexedDB-backed queue and a UI for "N pending notes." Defer until the contribution track (E.1+) actually has a user on the field with intermittent connectivity. First-pass Tier 2 just makes reads offline-resilient.
- **Periodic Background Sync** (the API that prefetches new content overnight) — iOS does not support it; not worth shipping Android-only.
- **Custom install button.** Manifest alone gives Android Chrome the browser-native install prompt; iOS still requires Add-to-Home-Screen via Share menu. A custom UI is mostly chrome we don't need on a private wiki.

## Test plan

- **Unit:** None — service-worker behavior is integration-only.
- **Manual:**
  1. `next build && next start`. Install the PWA to a phone. Visit 3 articles. Toggle airplane mode. All 3 articles still render. A 4th, uncached article renders the offline page.
  2. Post a research note while online; succeeds. Post while offline; fails with a clear message and the textarea stays populated.
  3. Ship a code change; the next phone visit toasts "wiki updated — reload?" and re-loading picks up the new bundle.
- **CI:** Lighthouse PWA score should hit 100. Add a `frontend/test/pwa.test.ts` that fetches `/manifest.webmanifest` + asserts `display: standalone`, the icon URLs are reachable, and (if going Serwist) the generated `sw.js` exists in `.next/static/`. Service-worker behavior itself stays manual.

## Lift estimate

**M.** The framework choice (Serwist vs hand-rolled) is most of the lift's variance. Serwist is faster to ship but adds a webpack-config dependency. Hand-rolled is more code but easier to reason about for a small site. ~1–2 days of focused work either way; another half-day for the update-toast and offline-page polish.

## Open questions

1. **Tailscale + SW.** Does the service worker see Tailscale-served HTTPS as same-origin? Likely yes (it's the same host header), but worth a 30-min probe before committing.
2. **`force-dynamic` on every route.** Most app routes export `dynamic = 'force-dynamic'`. Does Serwist's precache work with always-dynamic shells, or does it need at least some routes to be static? May need to flip some routes to `force-static` for precaching to be meaningful.
3. **Locale switching while offline.** If the cache only holds the user's active locale's pages, what does the language switcher do offline? Best answer is probably "shows an offline-language-unavailable badge"; needs UI design.

These are not blockers — they shape the implementation but don't change the decision to do this.
