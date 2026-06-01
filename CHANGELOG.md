# Changelog

All notable changes to whoami.wiki are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
For the versioning policy (what gets versioned and what doesn't), see
[`AGENTS.md`](./AGENTS.md#versioning).

This is a project-level changelog. The wiki is a multi-package repo;
when a change affects only one package (e.g., a CLI release), the
section is marked with the package name. The project as a whole is
in **v2 development** following the May 2026 markdown migration; the
last tagged production release was [`cli-v1.2.1`](https://github.com/stevenbarash/family-tree/releases/tag/cli-v1.2.1)
(2026-03-26), which predates the v2 architecture.

> **Going forward:** every PR adds a line under `## [Unreleased]`.
> When a release is cut, the unreleased entries are renamed under the
> new version heading.

---

## [Unreleased] — v2 development

### Added

- **Source-quality and named-silences discipline in the `wai author` pipeline (`plugins/whoami`)** — the editor agent's author-pipeline prompt templates now bake in three editorial guards. (1) The outline phase emits a `chronology` array (dated events with sources) and a `silences` array (named gaps where the record is absent), so the page structure follows the evidence rather than inventing order or filling silences with plausible prose. (2) The research-questions phase enumerates a source-quality tiering rubric (primary / secondary / tertiary / lay reports) plus permalink and access-constraint hygiene. (3) The person and episode draft prompts gain a "Naming source conflicts" section plus a self-check addendum that catches silent disagreements between sources. Net effect on output: drafts that flag conflicting evidence rather than silently picking one side, and that name gaps as `::open` talk-page threads instead of filling them with prose.

### Changed

- **Family-tree computation is cached behind `unstable_cache` (`frontend`)** — the shared family-graph computation (`getFamilyTree`, used by the home, index, and `/family/tree` routes) moved behind `unstable_cache` with a 60-second window and a `gedcom` invalidation tag, so repeat loads skip the per-request graph rebuild. Page, note, and GEDCOM writes `revalidateTag`/`revalidatePath` the affected surfaces for immediate freshness. Portrait images in infoboxes and hover cards render through `next/image`. (The companion change shipped in #17 — moving `/[locale]/[slug]` article pages onto an on-demand ISR cache — was reverted; see *Fixed* below. Article pages remain `force-dynamic`.)

### Fixed

- **`wai` mutating commands no longer fire malformed requests on an empty slug (`cli`)** — `read`, `write`, `create`, `edit`, `delete`, and `note` derived their slug via `toSlug(args.positional[0] ?? '')`, which returns `''` for a missing or all-punctuation argument, then passed it straight to the API as a request to `/api/pages/` (no slug) — a confusing failure for reads and a malformed *mutating* request for `write`/`create`/`delete`. The four other slug commands (`narrative`, `interview`, `author`, `revert`) already guarded `if (!slug)`; the six write/read commands now reject an empty slug with `slug is required` before touching the client, matching that pattern.
- **GEDCOM `sync` and `recite` API routes now hold `REPO_LOCK` (`frontend`)** — `POST /api/gedcom/sync` and `POST /api/gedcom/recite` call into `core` functions that run `git add`/`commit` directly, but — unlike the page- and note-write routes, which wrap their commit + push in `withLock(REPO_LOCK, …)` — they held no lock. On the Render replica (`SYNC_PUSH=on`, the sync scheduler ticking `pullRebase`/`push` under `REPO_LOCK`) a sync or recite could interleave with a scheduler rebase or a concurrent page-write commit and corrupt the working tree. Both routes now run their git-mutating work (and the disk-reading search rebuild, for `sync`) inside `withLock(REPO_LOCK, …)`, serialising them against the scheduler exactly as the write routes already are.
- **Article pages returned HTTP 500 on the auth-on Render deploy (`frontend`)** — #17 moved `/[locale]/[slug]` from `force-dynamic` to on-demand ISR (`export const revalidate = 60`). The route read `headers()` during the ISR cache-fill render, which threw `DYNAMIC_SERVER_USAGE` and surfaced as a 500 on *every* article page in production (e.g. `/ru/haskel-pinchas-ayzman`). The `headers()` source was **not** the page or the shared layout (sign-in shares the layout and renders static) — it was `[slug]/loading.tsx`, whose *server-side* `useTranslations` resolved the locale via `headers()`. A `loading.tsx` Suspense fallback renders with no `params`, so it can't call `setRequestLocale`, and next-intl then falls back to `headers()` — making the whole route un-prerenderable. It shipped undetected because `next dev` ignores ISR and a production build silently downgrades such a route to dynamic rather than erroring (only `export const dynamic = 'error'` makes it throw, naming `headers()`), while the original guard test inspected source text without rendering. Fixes: the route is reverted to `force-dynamic` (the pre-#17 behavior; it *can* now be made static, but the ~10ms render doesn't justify ISR's fragility); `loading.tsx`, `family/tree/loading.tsx`, and `not-found.tsx` are converted to client components so their `useTranslations` no longer reads `headers()`; and a new `render-strategy` test guards both layers — no `[locale]` route may declare ISR/static caching, and no param-less route fallback may use a next-intl server API without `"use client"`. The family-tree `unstable_cache` work from #17 is unaffected and stands.
- **Cold-authored pages no longer get stacked frontmatter (`frontend`)** — the `draft-person` prompt template instructs the draft agent to emit a page body that *begins with* its own `type: person` frontmatter block, but `PUT /api/pages/[slug]` treated the request body as body-only and synthesised a `defaultPageMeta` (`type: meta`) for any page that did not exist yet. `serializePage` then rendered the synthesised block followed immediately by the agent's block — two stacked frontmatter blocks on the file, with the server reading the page as `type: meta` and stranding the real metadata in the body. Every cold-authored page was affected; the corpus only looked clean because of periodic "collapse dual-frontmatter" cleanup passes. A new `extractEmbeddedFrontmatter()` helper detects an embedded frontmatter block, parses and schema-validates it via `parsePage`, and the route now promotes it to the page meta instead of burying it. Bodies with no frontmatter are written verbatim, as before.

---

## [cli-v2.0.0] — 2026-05-21

First stable v2 CLI tag. `cli-v2.0.0-pre.0` / `-pre.1` were the
markdown-era pre-release builds; this section captures the project-wide
work that accumulated alongside the stabilising CLI. CLI-specific
changes since `cli-v2.0.0-pre.1` are the two `(cli)`-tagged entries
under **Fixed** below (`wai --version` sourcing and command-boundary
input hardening).

### Added

- **Public deployment on Render, with two-way git sync (closes P2.20)** — the wiki now runs as a read-write replica on Render alongside the canonical Mac Studio copy. A Next.js `instrumentation.ts` startup hook clones the data repo onto Render's persistent disk on first boot and starts an in-process sync scheduler that `pullRebase`s upstream changes every ~10 minutes and pushes local commits; the page-write API pushes after each write, and a shared `REPO_LOCK` serialises writes against the scheduler so a rebase never races a commit. The replica is gated by the `WHOAMI_AUTH`-on Descope login (invite-only, trusted family) and browser edits are attributed to the signed-in member. The Mac Studio stays canonical and the local-first model is preserved — local dev still has no login wall and no auto-sync. This reverses the former "no public hosting" / "no app-layer auth" `SCOPE.md` anti-goals (see the render deployment spec).
- **Descope login + write attribution, gated by `WHOAMI_AUTH`** — when `WHOAMI_AUTH=on`, every page sits behind a Descope login flow: `proxy.ts` composes Descope's `authMiddleware` with the next-intl middleware as redirect-or-fall-through, sending unauthenticated visitors to `/[locale]/sign-in` (which hosts the embedded Descope flow widget), and `<AuthProvider>` wraps the app. API route handlers self-gate via a `requireSession()` helper that doubles as the write-attribution source — browser edits to talk pages and research notes are committed as the signed-in family member (name + email from their Descope profile, memoised in a userId→identity TTL cache) instead of the generic `whoami` placeholder. `/api/healthz` stays public for deploy probes. A fail-loud `assertAuthConfig` guard throws at startup if `WHOAMI_AUTH=on` but `NEXT_PUBLIC_DESCOPE_PROJECT_ID` / `DESCOPE_MANAGEMENT_KEY` are unset. **Off by default** — with `WHOAMI_AUTH` unset the local frontend (browsed over Tailscale) has no login wall, exactly as before; the Render replica sets the flag (a later deployment plan).
- **Account menu in the header bar** — with `WHOAMI_AUTH=on`, signed-in family members get an account menu beside the language switcher: an avatar + name trigger opens a popover showing their email, Descope role(s), a relative last-sign-in time, and a sign-out control. Adds a Base-UI `popover` UI primitive. No effect when auth is off (the menu is not mounted).

### Changed

- **Roadmap drift swept; P2.7 recorded as shipped (closes P2.7)** — the ROADMAP status snapshot still advertised the reading-surface audit's header/composition fixes (M2 swap, C2 cut, R2 link, D1 demote) as "ready to land," but they had all shipped 2026-05-19 (commits `95c37f1`, `a8207d9`, `5199c1b`). The `roadmap-drift` test only checks P-IDs, not the free-text snapshot table or sequencing list, so the staleness slipped through. Corrected the snapshot table and the two-week sequencing list. Separately, **P2.7** (collapse Lifespans/Descendants by default below `sm`) was found already satisfied by the `MobileDisclosure` client island — it shipped in earlier frontend work without ever being recorded against its roadmap row; flipped to ✅. The review's secondary "shorten the tree-page header" sub-part is moot (the sticky header is already a single compact row). No code change — roadmap + changelog accuracy only.

### Fixed

- **`wai --version` no longer reports a stale hardcoded version (`cli`)** — the CLI version was a hand-maintained `const VERSION` in `src/index.ts`, and it drifted the moment `cli/package.json` was bumped: the constant still read `2.0.0-pre.0` while the package had moved to `2.0.0-pre.1`, so `wai --version` — and the `cliVersion` that `wai doctor` compares for server/CLI skew detection — both reported the wrong number. `VERSION` is now read from `package.json` (esbuild inlines it into the bundle at build time, so it stays correct in the shipped binary), and a spawn test asserts `wai --version` equals `package.json`'s version to keep the two from diverging again.
- **Mutating API routes now require an authenticated session under `WHOAMI_AUTH=on` (`frontend`)** — the `proxy.ts` matcher excludes `/api`, so Descope middleware never runs on API routes; auth was per-route opt-in and only `/api/pages/[slug]` had opted in. On the `WHOAMI_AUTH=on` Render replica an unauthenticated client could still append/edit/delete/restore research notes, trigger a GEDCOM sync or recite, run the schema migration, and rebuild the search index. All six handlers now call `requireSession()` and return HTTP 401 on an unauthenticated request — `requireSession()` returns the default identity (never throws) when auth is off, so the local/Tailscale and CLI experience is unchanged. The three note routes additionally attribute the write to the signed-in identity when auth is on (a client-supplied `by` was spoofable); with auth off the trusted CLI's `by` is still honoured. Separately, `/api/search`'s `include_living` flag — which surfaces living/restricted records past the privacy gate — now also requires a session, closing a query-parameter bypass.
- **`wai` hardens slug and numeric-flag handling at the command boundary (`cli`)** — three trust-boundary gaps closed. (1) `wai narrative`, `transcribe`, `interview`, `author`, `revert`, and `i18n sync` took the positional slug verbatim, so a value like `../../tmp/x` escaped `$WHOAMI_ROOT` when joined into a filesystem path; they now route it through `toSlug()` like the page commands already do — which also means `wai author "Some Person"` and `wai author some-person` resolve identically instead of the spaced form silently finding nothing. (2) `i18n sync` / `i18n status` built their `git log` calls by interpolating the slug into a shell string; both now use `execFileSync` (no shell), and `runI18nSync` rejects a non-slug input at its own boundary. (3) `--limit`, `--recent`, `--questions`, and `--parallel` parsed via `parseInt(x) || fallback`, which let negatives through (`-5` is truthy) — `wai history --recent -3` became `git log -n -3`; a new `parsePositiveInt` clamps non-positive and non-numeric values to the default.
- **Eval suite: cross-ref grader no longer scores 0 for cases it can't measure; harnesses point agents at the real wiki URL (`evals`)** — two benchmark-accuracy bugs. (1) The `cross-ref` grader returned a hard `score: 0` for fixtures with fewer than two source types — a case the agent cannot influence — instead of marking itself `skipped`, so `computeComposite` counted it and pulled the 20%-weighted mechanics tier toward 0. It now skips, the way `tool-usage` skips when no agent log is available. (2) All four harness drivers (Claude Code, Codex, Cursor, OpenCode) read `WIKI_SERVER` for the wiki URL, but the isolated eval host exports `WHOAMI_SERVER`; the agent prompt always fell back to a stale `localhost:8081`. Corrected to `WHOAMI_SERVER`.
- **Research-note author names with spaces are no longer truncated** — each research note carries a trailing HTML-comment trailer of space-delimited `key=value` attrs, and the author fields (`by`, `editedBy`, `deletedBy`, `restoredBy`) stored free text verbatim. A multi-word value — notably the real model names the LLM-attribution convention mandates, e.g. `Claude Opus 4.7` — was split on whitespace at read time and silently truncated to its first word (`Claude`), losing the attribution entirely. The author fields are now percent-encoded on write and decoded on read, so the full name survives the round-trip; id/kind/timestamp fields are whitespace-free by construction and stored verbatim as before. Existing single-token authors (`steven`, `editor-bot`) are unaffected.
- **Article subject's infobox now shows the page portrait, not just initials** — the `:::infobox-person` directive rendered the subject's avatar with only an initials monogram; the page's `portrait:` frontmatter never reached it. Two gaps: `InfoboxPerson` had no image element, and `page.meta.portrait` was never threaded into the `renderMarkdown` context that injects `derived` into the directive. `RenderContext` now carries `portrait`, the article page passes `page.meta.portrait` through, and `InfoboxPerson` renders the portrait as a plain `<img>` — not `<AvatarImage>`, because Base-UI's avatar image is client-load-state driven and renders nothing during SSR, which is why the family-tree `AvatarMonogram` already uses a plain `<img>`. Portraits previously showed on `/family/tree` but never in an article infobox.
- **Account-menu popover and wikilink hover-cards no longer render behind page chrome** — the Base-UI overlay wrappers (`ui/popover.tsx`, `ui/hover-card.tsx`) set `z-50` on the `Popup`, but the Popup is `position: static` inside the `Positioner` — a z-index on a static element is inert. The popover's real stacking was the Positioner's default `auto`, which loses to the family-tree page's sticky `z-20` header, so the top of the account menu (email, role, last sign-in) was clipped behind the header band. Moved `z-50` onto the `Positioner` — the positioned element — in both primitives.
- **Article infobox now floats correctly in RTL (Hebrew) articles** — the person/company infobox floated with the physical `float-right`/`clear-right` while offsetting with the logical `ms-6` margin. In an RTL article those disagree: the float stayed on the physical right (the wrong side — an infobox belongs on the inline-end, i.e. the left in RTL) while `ms-6` flipped to the right, so the wrapping body text jammed against the box with no gap. Switched to logical `float-end`/`clear-end`; the infobox now sits on the inline-end side with its text gap intact in both directions. The `rtl-tailwind-sweep` test now also forbids `float-`/`clear-left|right`, which is why this slipped through — it only matched `pl-`/`mr-`/`left-N`-style classes before.
- **Research-note writes now serialise with the git sync scheduler** — the `/api/notes/*` write routes (add, edit, soft-delete, restore) commit to the data repo but, unlike the page-write route, weren't wrapped in the shared `REPO_LOCK` or followed by `pushAfterWrite()`. On the Render replica a note write landing mid-`pullRebase` produced a spurious rebase-conflict and delayed the note one sync interval. The four handlers now mirror the page-write route: `withLock(REPO_LOCK, …)` + immediate push.
- **Account menu no longer flashes an empty name while loading** — `AuthAccountMenu` held its loading skeleton only until the Descope *session* resolved, but the *user record* (name, email) loads separately via `useUser()`. When the session resolved first, the trigger briefly rendered an empty name and a `?` avatar fallback before the real name arrived. The skeleton now also waits on `useUser()`'s `isUserLoading`, checked *after* the unauthenticated guard so the public `/sign-in` page still renders nothing rather than a stray skeleton.
- **Folio GEDCOM-ID is now `<bdi>`-isolated (lands the deferred P2.10 sub-item)** — the `<bdi>` sweep below left one string un-isolated: the GEDCOM xref ID interpolated into the folio label on `/family/tree` person headers. Isolating an ICU-interpolated value needs markup *inside* the message, so the `folio` key in all four locales now wraps the placeholder in an `<id>` rich tag (`"Folio · <id>{record}</id>"`) and `PersonHeaderSection` renders it via `t.rich` with an `id` chunk returning `<bdi>` — the same `t.rich`-plus-chunk pattern `editorialGapsRow` / `unwrittenPagesRow` already use to isolate interpolated names. The ID stays inside the ICU string so translators keep control of its placement. No visible bug today (GEDCOM xrefs lead with a strong-LTR letter); this closes the convention gap as defense-in-depth.
- **`<bdi>` isolation swept across the family-tree components for RTL (closes P2.10)** — the reading-surface audit flagged that `OnThisDayRibbon` / `OpenGapsCard` / `RedlinksCard` wrap user-generated names in `<bdi>` but the family-tree surface did not. Without bidi isolation, a Hebrew person or place name rendered inline next to LTR text (dates, separators, layout) can reorder visibly. Wrapped every user-generated name, place name, and date string across 10 components: the `AncestorTile` / `PersonRow` / `LifespanBar` leaf components (which covers every section composing them), plus `PersonHeaderSection` (H1 + dates + birthplace), `PlacesSection` (region + person + place), `CoverageSection` (frontier names), `ConflictsSection` (conflicting field values), `FamilySection` (marriage meta), `BirthplacesMap` (popup place + person names), and `PedigreeNode` (year string — its name was already wrapped). `PedigreeFrontierNode` was already correct. The one string left un-isolated is the folio GEDCOM-ID in `PersonHeaderSection` — isolating an ICU-interpolated value needs `t.rich`, deferred as a follow-up.

### Changed

- **Home-page browse-all footer hides the articles link on an empty wiki (closes P2.11)** — the footer's `Browse all N articles →` link rendered unconditionally, so a wiki with zero live articles advertised `Browse all 0 articles →` pointing at an empty `/index`. Now gated on `live.length > 0`, mirroring the existing `talk.length > 0` gate on the talk-pages link. The `Changelog` / `Roadmap` meta links stay unconditional — they're project pages, relevant regardless of article count.

### Removed

- **`/family` page deprecated and removed** — the paternal/maternal line summary view is redundant now that `/family/tree` renders the full interactive browser (lineage, cohort, descendants, places, timeline). Deleted `frontend/app/[locale]/family/page.tsx`, dropped `getFamily()` + `FamilyView` + `AncestorView` from `frontend/lib/family.ts`, and removed the `Page.Family` translation namespace from all four locales (~21 keys × 4). Dangling-link fixes: the homepage `Family →` nav (was the second link in the chrome nav) is gone, and the `/family/tree` sticky-header back-link retargets from `/family` → `/` with the renamed `Page.FamilyTree.navIndex` key (translations reused from the deleted `Page.Family.navIndex`).

### Changed

- **PWA polish round 2 — review-deferred items** — four smell-level items from the post-PWA review, now landed:
  - **Locale-aware manifest.** `app/manifest.ts` is now async, reads the `NEXT_LOCALE` cookie via `cookies()`, and emits the right `lang` / `dir` / `description` per request. A Hebrew-reading user installing from `/he` sees a Hebrew description on the install sheet and `dir: rtl` for correct sheet alignment; brand `name` / `short_name` stay untranslated since `whoami.wiki` isn't a translatable phrase. New `Chrome.PWA.description` key in all four locales. Verified per-locale: en `lang=en dir=ltr`, ru `lang=ru dir=ltr "Семейная вики-энциклопедия…"`, uk `lang=uk dir=ltr "Сімейна вікі-енциклопедія…"`, he `lang=he dir=rtl "ויקי משפחתי…"`.
  - **`orientation: 'portrait'` dropped** — defaults to `'any'`. The pedigree chart, wide infoboxes, and lifespans timeline all benefit from rotating the phone; locking portrait was a usability regression on those pages.
  - **Shared monogram helper.** `app/icon.tsx` and `app/apple-icon.tsx` no longer duplicate the same ~25 lines of ImageResponse JSX; both call `renderMonogram(px)` from `lib/pwa-icon.tsx`. The safe-zone math (`fontSize = px * 0.625`, glyph inside the maskable 80% radius) and brand palette (`#0a0a0a` / `#fafafa`) live in one place, so the 192/512/180 sizes can't drift apart.
  - **Two `body {}` blocks in `globals.css` merged.** Cosmetic cleanup from two sequential Edits in the prior commits.

  Deliberately NOT changed (would create regressions):
  - **`statusBarStyle: 'default'`** stays — switching to `'black-translucent'` forces iOS status-bar text white on a white-bg page → invisible.
  - **`scroll-padding-top: 4rem` stays global** — on pages without a sticky header it just lands anchor jumps 4rem above target = slightly nicer reading position. Net improvement everywhere, not a leak.

  Frontend typecheck clean; suite 95/95; drift tests 7/7.

### Fixed

- **Code-review fixes on the mobile + PWA pass** — five real bugs surfaced by reviewing the prior two commits:
  - **iOS-zoom CSS rule was dead.** Lived inside `@layer base` using `:where()` — Tailwind v4's `@layer utilities` (where `.text-sm`, `.text-xs` come from) wins on layer order, and `:where()` zeros specificity. Any input with `text-sm` (the search box on `not-found`, the add-note-form `Textarea` overriding shadcn's `text-base md:text-sm` default) still triggered Safari zoom-on-focus. Moved the `@media (max-width: 640px)` block OUTSIDE `@layer base` (unlayered styles win over all named layers) and switched from `input:where(...)` to plain `input[type="text"], ...` so specificity is `(0,1,1)` — higher than `.text-sm`'s `(0,1,0)`. Comment added in `globals.css` warning future refactors not to push it back into `@layer base`.
  - **Proxy matcher was over-broad.** `(?!api|assets|_next|icon|apple-icon|manifest|.*\..*)` matched any path *starting* with those tokens. Verified failure cases: `/iconography`, `/icons`, `/icon-bearer`, `/manifest-of-deeds` all bypassed the locale middleware → 404 if they were ever real article slugs. Tightened to `icon(?:$|/|\?)|apple-icon(?:$|/|\?)` so only exact PWA endpoints (`/icon`, `/icon/192`, `/icon/512`, `/icon?<hash>`, `/apple-icon`, `/apple-icon?<hash>`) bypass; arbitrary article slugs starting with those prefixes route through normally. `manifest.webmanifest` already bypasses via the dot rule and no longer needs its own clause.
  - **Manifest claimed `/icon` served 192×192 too — it didn't.** The file is 512×512; the browser was scaling it down for the 192 slot (Lighthouse warning, extra bytes). Rewrote `app/icon.tsx` with Next 16's `generateImageMetadata` to emit two distinct routes (`/icon/192` and `/icon/512`) from one source. Letter `font-size` scales with canvas (62.5% of side), keeping the safe-zone math identical at both sizes.
  - **`purpose: 'maskable'` was on the wrong entry.** Apple's home screen does its own corner-rounding and ignores the maskable spec; Android home screens do honor it. Moved `maskable` to the main `/icon/192` + `/icon/512` entries (the "w" sits in ~62% of the canvas — well within maskable's 80% safe-zone radius). The apple-icon entry is unannotated. Each size is declared twice — once `any` (Android pre-maskable fallback, also what most launchers actually use), once `maskable` (modern Android) — pointing at the same URL.
  - **`not-found.tsx` search input had the same mobile bugs the prior pass fixed in `/search`** — `autoFocus` (jumps page + opens keyboard on mobile) and `text-sm` (12px → iOS zoom). Mirrored the fixes: dropped `autoFocus`, switched to `text-base sm:text-sm`, added `enterKeyHint="search"`, `autoComplete="off"`, `autoCorrect="off"`, `spellCheck={false}`.

  Dev-server caveat noted: turbopack aggressively caches the `app/icon.tsx` output and may continue serving pre-change bytes (~13.7KB 512×512 PNG) until `next dev` restarts. Production `next build` picks up the new `generateImageMetadata` cleanly; no code change is needed for that. Frontend typecheck clean; suite 95/95.

### Added

- **PWA Tier 1: installability + native-feel polish (closes P2.18)** — followup to the mobile-friendliness pass below (P2.17). The wiki can now be installed to a phone's home screen and behaves like a standalone app when launched from there.
  - **`frontend/app/manifest.ts`** (Next 16 file-convention manifest, served at `/manifest.webmanifest`): name `whoami.wiki`, short_name `whoami`, `display: standalone`, `orientation: portrait`, theme/background `#ffffff`, scope `/`, three icon entries (192/512 PNG + 180 maskable).
  - **`frontend/app/icon.tsx` + `frontend/app/apple-icon.tsx`** dynamically render PWA icons via `next/og`'s `ImageResponse` — a serif "w" on near-black background, sized 512×512 and 180×180 respectively. No PNG-generation tooling required (no `sharp`/`imagemagick` dependency); icons rebuild on theme changes if we ever swap the palette. Verified rasterization in dev — 13.7KB and 3.2KB PNGs.
  - **Root metadata additions** in `frontend/app/[locale]/layout.tsx`:
    - `themeColor` with light (`#ffffff`) + dark (`#0a0a0a`) media queries so Android Chrome's status bar matches the active scheme
    - `appleWebApp` (capable, title `whoami.wiki`, statusBarStyle `default`) so iOS Add-to-Home-Screen produces a clean standalone PWA
    - `applicationName` (Next emits both `application-name` and `mobile-web-app-capable`)
    - **`formatDetection: { telephone: false, date: false, address: false, email: false }`** — critical for a genealogy app. iOS Safari otherwise auto-links GEDCOM-shaped date strings (`1903`, `1903–1968`) as `tel:` links, creating mis-tap targets all over lineage views.
  - **Proxy matcher exclusion** in `frontend/proxy.ts` — the next-intl middleware was prepending `/en` to `/icon` and `/apple-icon` (no `.` in the path so it didn't match the existing dot-exclusion). Added `icon|apple-icon|manifest` to the non-match group so PWA file-convention URLs resolve at the root. `/manifest.webmanifest` was already bypassing via the `.*\..*` clause.
  - **CSS polish** in `globals.css`:
    - `-webkit-text-size-adjust: 100%` on `html` (prevent iOS landscape font inflation on rotate)
    - `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation` on `a, button, summary, [role="button"]` (drops the default Android blue tap-flash and the legacy 300ms tap delay on older mobile WebViews)

  **Out of scope, deferred:** service worker / offline support (Tier 2 — needs a separate plan, Workbox 7 + Serwist + caching strategy decisions for the article-read vs. notes-write split), Web Push notifications (Tier 3 — no use case for a private family wiki).

  Verified: `/manifest.webmanifest` returns 200 with `application/manifest+json`; `/icon` returns a 512×512 RGBA PNG; `/apple-icon` returns a 180×180 RGBA PNG; rendered HTML carries all expected `<meta>` and `<link rel>` tags. Frontend typecheck clean; suite 95/95.

### Changed

- **Mobile-friendliness pass (closes P2.17)** — the wiki was usable but not deliberate on phones. Five low-risk fixes across the frontend that take the small-screen experience from "works if you zoom" to "works as-is":
  - **Explicit `viewport` export in `frontend/app/[locale]/layout.tsx`** with `width: device-width`, `initialScale: 1`, `viewportFit: cover`. Next was emitting a default tag, but `viewport-fit=cover` is what unlocks `env(safe-area-inset-*)` on notched iPhones.
  - **Safe-area-inset padding on `<body>`** in `globals.css` so sticky chrome (`/family/tree` header) and the home indicator don't collide with content.
  - **iOS auto-zoom-on-focus suppressed.** Below the `sm` breakpoint (640px), `input[type=text|search|email|url|tel|number|password]`, `textarea`, and `select` get `font-size: 16px` — Safari triggers zoom on any input < 16px, and the search box (`text-sm`), note-author input (`text-xs`), and textarea (`text-sm`) all qualified. Visual hierarchy on desktop unchanged.
  - **Wide tables become horizontal-scroll containers, not page-scroll triggers.** `.changelog-prose table`, `.roadmap-prose table`, and `.wiki-article :where(table)` switch from `width: 100%` to `display: block; width: max-content; max-width: 100%; overflow-x: auto`. Same applied to `<pre>` blocks in articles. Before: changelog/roadmap pages overflowed the viewport on phones and required a horizontal page swipe. After: the table itself scrolls; the page stays put.
  - **`/search` page polished.** Switched from flat `p-6` to `px-4 py-6 sm:px-6 sm:py-8`. Dropped `autoFocus` on the input (was forcing the keyboard open and jumping the page on mobile — a desktop ergonomic that hurts on phones). Input bumped to `text-base` (16px, ties into iOS rule above) with `enterKeyHint="search"` for a "Search" key on the mobile keyboard. Type and place filter chips bumped from `px-2 py-1`/`px-2 py-0.5` to `px-2.5 py-1.5`/`px-2.5 py-1` for thumb-friendly tap targets.

  Frontend typecheck clean; suite 95/95 green. No new dependencies, no new components — purely additive Tailwind/CSS adjustments plus the one `viewport` export.

- **Close-out polish: fetch-error fallback strings and command-palette dialog title localized** — a review pass on the dangling-strings work surfaced two reader-visible English islands that the earlier passes had missed:
  - **6× `request failed (${res.status})`** fallback messages in `research-notes/{add,edit,note-item,note-history-dialog}.tsx`. Rendered only when the API returns non-OK *and* the response body has no `error` field — rare, but reader-visible when it fires. New `Errors.requestFailed` and `Errors.requestFailedWithStatus` keys × 4 locales; each callsite gets a `useTranslations('Errors')` translator and replaces the template literal.
  - **`<CommandDialog>` `title` and `description` props** in `components/ui/command.tsx` default to `"Command Palette"` / `"Search for a command to run..."` (shadcn-generated). These render inside an `sr-only` `<DialogHeader>` — only screen readers see them on Cmd-K. `CommandPaletteDialog` now passes localized `title={t('dialogTitle')}` and `description={t('dialogDescription')}` from the same `Chrome.CommandPalette` namespace.

  Frontend typecheck clean; suite 95/95.

- **Translation refinement pass: gender selector on "Your X.", idiomatic Russian/Ukrainian cousin removal, Hebrew cousin-degree fix** — followup to the dangling-strings sweep, fixing specific quality issues I'd flagged for native-speaker review:
  - **Gender selector for "Your X." possessive** (`Page.Article.Relationship.yours`). Previously rendered Russian/Ukrainian as `Ваш(а) отец.` — the parenthesized form is technically correct but reads as a clumsy fallback. New ICU `select` on `gender` (passed from `relationshipGender(kind)` in the dispatcher) picks `Ваш` for fathers, `Ваша` for mothers, `Ваш(а)` for everything else where target gender isn't known (siblings, cousins, etc.). English `select` template wraps the same way (no visible change in EN; structural prep). Hebrew drops the awkward `ה{label} שלך.` (definite-article + label + your) prefix structure — the `ה` doesn't compose cleanly with most kinship terms — in favour of just `{label} שלך.` with the label carrying its own form.
  - **Russian/Ukrainian `cousinRemoved` restructured.** Previously rendered as `троюродный брат или сестра, удалённый# раз` — "removed N times" is a literal English calque that doesn't exist in Russian. New form: `троюродный брат или сестра через {removed} поколений` ("through N generations") — idiomatic. Ukrainian gets the parallel `через {removed} поколінь`.
  - **Hebrew cousin terminology was outright wrong.** The old `cousin` key for `degree=2` rendered `שני בני דודים` which literally means "two cousins" — not "second-degree cousin"! Same error on degrees 3–5. Fixed to `בן או בת דוד מדרגה שנייה` (cousin of degree N) with parallel forms for higher degrees. `cousinRemoved` got the same fix.
  - **Russian/Ukrainian `editedBy` and `retractedBy` got their missing connector.** Previously rendered `изменено 3 минуты назад Alice` — no preposition between time and name. Russian wants `пользователем` (by user), Ukrainian wants `користувачем`. Now: `изменено 3 минуты назад пользователем Alice` / `удалено пользователем Bob`.
  - **Hebrew "retract" verb changed from `משוך` (pull) to `הסר` (remove)** — `משוך` is a literal English-translation calque that no native speaker would use for a UI action. Touches `retractAria`, `confirmRetract`, `retractedBy`.
  - **Hebrew `self`** changed from `אתה` (bare masculine "you") to `זה אתה` ("this is you") — slightly less marked, reads better as a standalone label on the family-line page where it's rendered as `זה אתה / Perspective`.
  - **Hebrew `ancestorN` fallback** for degree-4+ ancestors went from `סבא בדרגה 3+ אחורה` to `אב קדמון מדרגה 3+ אחורה` — `אב קדמון` is the standard Hebrew term for "ancestor / forefather" and reads naturally instead of stacking `סבא`.

  Frontend typecheck clean; suite 95/95 green. The deep-cousin and great-great-great-grand-X cases were the hardest to get right across all four locales — these forms are functional but a native speaker might tighten further. Everything else should now be production-quality. — closes the last reader-visible English islands. Every article page renders `ResearchNotesPanel`, and inside it the per-note display (`by X · 3 days ago`, `(agent)`, `edited 4h ago by Y`, `retracted by Z`), the action buttons' `aria-label`s, the retract confirm prompt, the inline add-note form (placeholders, errors, hint, button), the edit-note form, and the history dialog (event kinds, loading/retry/empty states, `by` author, snapshot disclosure) — all of those were English-hardcoded:
  - New nested keys under `Page.Article.ResearchNotes`: `Item` (10 keys), `Add` (8), `Edit` (5), `History` (12). ~35 keys × 4 locales = 140 strings. Translations follow the project's "functional defaults, native-speaker pass later" pattern; Russian/Ukrainian/Hebrew were drafted side-by-side with the English source.
  - **`formatRelative` is now locale-aware via `Intl.RelativeTimeFormat`** (`components/research-notes/relative-time.ts`). Function signature gained a `locale: string` parameter; callers (`note-item.tsx`, `note-history-dialog.tsx`) pass `useLocale()`. With `numeric: 'auto'`, English collapses "1 day ago" → "yesterday" — Russian/Hebrew/Ukrainian get their natural pluralization. Format changed from compact `"5m ago"` → verbose `"5 minutes ago"` / `"5 минут назад"` / `"לפני 5 דקות"`; that's a deliberate UX regression in exchange for correct cross-locale rendering. Older-than-a-week falls back to `toLocaleDateString(locale)` (was a fixed ISO `YYYY-MM-DD`).
  - **Test script fix:** `frontend/package.json` `test` script previously ran `lib/**/*.test.ts` + `test/**/*.test.ts` only, silently skipping `components/**/*.test.ts` (the relative-time test had been there since the file was added but never ran in `npm test`). Sweep'd in. Frontend suite jumps from 88/88 → 95/95.
  - **CSS evaluation:** affected surfaces are all flex-row containers with `gap-2` + text-xs sizing. Verbose Russian time strings ("5 минут назад") run ~30% longer than English ("5m ago") but stay short enough that the notes-meta row doesn't break layout. The action buttons are right-aligned via `ms-auto` and don't fight for space. Dialog content auto-wraps within `sm:max-w-lg`.

- **Command palette, birthplaces-map loading state, and schema-out-of-date error block localized** — three more dangling-English islands closed for non-EN readers:
  - **Command palette** (`Cmd-K` overlay, present on every page): button text (`Search`), `aria-label` (`Open search`), input placeholder (`Search people, companies, places…`), the two empty states (`Start typing to search.` / `No matches.`), and the results-group heading. New `Chrome.CommandPalette` sub-namespace × 4 locales.
  - **Birthplaces map** (rendered on `/family/tree` `PlacesSection`): the dynamic-import loading skeleton's `aria-label` (`Loading map`) was hardcoded — now goes through `Loading.map`. Refactored the `dynamic()` `loading` callback to a small `MapSkeleton` component so it can call `useTranslations`.
  - **Schema-out-of-date error block** in `[slug]/page.tsx`: when a page was authored against a newer schema version than the running build can parse, the page renders a short explainer. Was hardcoded English (`Code is out of date` + description with `{from}`/`{current}` interpolated). Now goes through `Page.Article.SchemaError.title` and `Page.Article.SchemaError.description`. Rendered ~never in practice — but it's reader-facing when it does fire, and was the last reader-chrome island left in EN.

  Frontend typecheck clean; suite 88/88 green; messages parity green across all 4 locales.

- **Relationship labels localized across all four locales** — closes the biggest remaining English-island visible to non-EN readers. `RelationshipStrip` on article pages, the perspective line in `PersonHeaderSection` on `/family/tree`, and the per-ancestor labels on `/family` were rendering `computeRelationship`'s English output verbatim ("father", "great-grandmother", "second cousin once removed"). Fix is structural rather than a string-translation map:
  - **Core:** `RelationshipResult` in `core/src/family/relationship.ts` gains a `kind: RelationshipKind` field — discriminated union of `self` / `ancestor{role,degree}` / `descendant{degree}` / `sibling` / `auntUncle{degree}` / `nieceNephew{degree}` / `cousin{degree,removed}`. Purely additive; the existing `label` string stays for callers that still want it. New tests in `core/test/family/relationship.test.ts` cover the kind shape; existing label assertions unchanged. Core suite 613/613 green.
  - **Frontend:** `lib/family.ts` (`FamilyTreeView.relationship`) and `lib/relationship-from-self.ts` (`RelationshipFromSelf`) thread `kind` through. New `lib/relationship-label.ts` exposes `localizedRelationshipLabel(kind, t)` that dispatches on `kind.kind` and returns the locale's kinship term via `Page.Article.Relationship.label.*` keys. Discrete keys for degrees 1–3 (parent / grandparent / great-grandparent) per locale since the patterns differ structurally — English uses the "great-" word, Russian uses the "пра-" prefix per generation — with `ancestorN` / `descendantN` / `auntUncleN` / `nieceNephewN` fallbacks for degree 4+. Cousins use ICU `plural` over `degree` and `removed`.
  - **Consumers:** `RelationshipStrip`, `PersonHeaderSection`, and the `PersonCard` helper on `/family` all call `localizedRelationshipLabel` instead of rendering `relationship.label` raw. The English `label` string is still present on the return type for backward compatibility and debugging.
  - **Translations may need native-speaker review.** Russian kinship terminology around cousins ("двоюродный … удалённый") and Ukrainian "юрідний"/"віддалений" patterns are functional but not idiomatic; Hebrew "סבא רבא רבא"-style accumulation for deep ancestors is a best-effort default. The frontend dispatch keeps these fixable as a pure-translation change later — no more code changes needed.
  - **CSS evaluation:** the affected surfaces handle length growth gracefully — `RelationshipStrip` is a flowing `<p>` in a `max-w-3xl` container (wraps if needed); `PersonHeaderSection`'s perspective line lives in a `min-w-0` flex child with `flex-wrap` semantics and tolerates wrapping under `tracking-[0.18em]` uppercase styling (CSS `uppercase` is a no-op on Hebrew so Hebrew renders in normal case, which is correct); the family-page `PersonCard` uses `flex flex-wrap` on its description row so longer Russian/Ukrainian terms wrap to the next line rather than overflowing.

- **Article-page chrome fully localized + P2.9 `Link` sweep complete (closes P2.9, closes audit item 9)** — paired the M-lift from [`docs/reviews/2026-05-19-reading-surface-audit.md`](docs/reviews/2026-05-19-reading-surface-audit.md) with the existing P2.9 row since both touch the same files:
  - **Article chrome localized.** Back link (`navBack`), categories label (`categoriesLabel`), six freshness-strip pieces (`Freshness.created` / `author` / `editors` / `gedcomSnapshot` / `sourcesCited` / three `talk*` variants), the relationship subtitle (`Relationship.yours`), and the research-notes panel heading + help + empty copy (`ResearchNotes.heading` / `help` / `empty`) — all hardcoded English replaced with `Page.Article.*` keys via `getTranslations` (article page) or `useTranslations` (server components `RelationshipStrip` and `ResearchNotesPanel`). 14 new keys × 4 locales = 56 strings. Slavic plurals authored with `one/few/many/other` for ru/uk; Hebrew with `one/two/many/other`. Translations may need native-speaker review — the back-arrow direction was reversed for he (`אינדקס ←` lands "back" arrow on the right in RTL context).
  - **`formatTalkLabel` deleted.** The util in `lib/citations.ts` returned hardcoded English (`"2 notes · 3 open gaps"`) — that formatting now lives in the article page as branching `t('Freshness.talkBoth' / 'talkGapsOnly' / 'talkNotesOnly')`. The util's unit test (`lib/citations.test.ts`) deleted with it; `countOpenGaps` and `countCitations` tests remain.
  - **The relationship label itself stays English** (`computeRelationship` in `core/family/relationship.ts` returns `"second cousin once removed"` regardless of locale). Localizing the label requires a translation map in `core/family/`; flagged in `RelationshipStrip` doc-comment for future work, out of scope here.
  - **P2.9 sweep:** all 21 `import Link from 'next/link'` callsites across `app/` and `components/` swapped to `import { Link } from '@/i18n/navigation'` — the locale-preserving wrapper from `frontend/i18n/navigation.ts`. Mechanical change; the Link API is drop-in. Includes the three files the audit explicitly flagged (`[locale]/page.tsx`, `[locale]/index/page.tsx`, `[locale]/[slug]/page.tsx`) plus 5 more app routes and 13 components.

  Frontend typecheck clean; test suite 88/88 green (was 89/89; `formatTalkLabel` test removed). The remaining audit items (none — all 9 sequenced items now done) are absorbed into the change log. The schema-out-of-date error block in `[slug]/page.tsx` remains hardcoded English; rendered only when a page is on a future schema version (effectively never in practice) — out of scope for this pass.

- **Reading-surface composition cleanups — second batch from the audit (M1, M3, D2)** — three more from [`docs/reviews/2026-05-19-reading-surface-audit.md`](docs/reviews/2026-05-19-reading-surface-audit.md):
  - **M1: article-header visual weight rebalanced.** `RelationshipStrip` moved from `italic text-muted-foreground/90` to `font-medium text-foreground/90` (same size, no longer recedes); categories collapsed from pill chips (`rounded-full border bg-muted/50 px-2.5 py-1`) to a single muted mono line `categories: a · b · c` matching the freshness strip style below. The relationship to self is the most reader-anchoring fact after the title; pills were outshouting it.
  - **M3: home nav trimmed; Changelog and Roadmap demoted to footer.** Top-of-page `<nav>` on `/[locale]` is now Family / Tree / Search (three content destinations, equal weight). Changelog and Roadmap (meta-pages about the project, not content) appended to the existing footer stack underneath the browse-all-articles / browse-all-talk links. Same translation keys (`navChangelog`, `navRoadmap`); footer's `font-mono uppercase` styling renders them as `CHANGELOG →` / `ROADMAP →`.
  - **D2: `ConflictsSection` moved to the bottom of `/family/tree`** (after `LineageSection`, adjacent to `ResearchNotesPanel`). Conflicts are an *authoring* concern — the agent or human needs to resolve them — not a *reading* concern; clustering them with the editorial-workspace surface (notes) matches that semantic. Was 4th, now last visible section before the notes panel.

  Localization pass on the article-page hardcoded English (back link, categories label, freshness strip, `Your <relation>` in `RelationshipStrip`, `ResearchNotesPanel` heading) is the M-lift follow-up that pairs naturally with P2.9 — not in this batch. Frontend typecheck clean; suite 89/89 green.

- **Source-coverage % hoisted into `PersonHeaderSection` (refined D1)** — the [reading-surface audit](docs/reviews/2026-05-19-reading-surface-audit.md) recommended removing `CoverageSection` outright in favour of a single header stat. Reading the section in detail surfaced that it does *three* jobs, not one: the source-coverage percent, a per-generation known/possible grid, and a research-frontier card. Refined the move: the source-coverage stat now appears as a 6th `Stat` tile in `PersonHeaderSection` (`Sourced  28%  ·  8 / 29 cited`), and the duplicate line is dropped from `CoverageSection`'s `SectionHeader.after` slot. The per-generation grid and frontier card stay — both carry unique value the audit underweighted. `Stat`'s `value` widened from `number` to `number | string` to accept the `"28%"` display string. Stats grid moved from `sm:grid-cols-5` (one row of 5) to `sm:grid-cols-6` with `sm:max-w-xl` (one row of 6) so the addition doesn't wrap. New `statSourced` and `statSourcedFraction` keys added to all 4 locales (`messages/{en,ru,uk,he}.json`). Frontend typecheck clean; suite 89/89 green.

- **Reading-surface composition cleanups — first batch from the audit (M2, C1, C2, R2)** — four XS fixes landing from [`docs/reviews/2026-05-19-reading-surface-audit.md`](docs/reviews/2026-05-19-reading-surface-audit.md):
  - **M2: chart follows the focal person's H1 on `/family/tree`** (`app/[locale]/family/tree/page.tsx`). Was: `PedigreeSection` rendered before `PersonHeaderSection`, so the chart of ancestors preempted the page's own identity. Now: header first, chart second — same composition principle as a wiki H1 followed by an infobox. Loading skeleton swapped to match.
  - **C1: `MediaSection` removed from `/family/tree`** until Contribution-track E.2 ships a real media render. The current component was a flat title list with a `[primary]` tag, no thumbnails, no preview — vertical real estate without payoff. File `components/family/sections/media-section.tsx` deleted; `view.selectedMedia` left in place since E.2 will reuse it.
  - **C2: small uppercase type label above the article H1 removed** (`app/[locale]/[slug]/page.tsx`). The H1 already named the entity; the URL carried the type; the label was chrome that didn't disambiguate. Loading skeleton's matching `h-3 w-20` removed.
  - **R2: freshness-strip "talk:" link is now an in-page anchor instead of routing to the full talk page** (`app/[locale]/[slug]/page.tsx`). The data it advertised — note count and open-gap count — is already rendered inline by `ResearchNotesPanel` and `TalkThreadsPanel`; routing away forced a context switch for content already on the page. The link now anchors to `#talk-threads-heading` when `openGapCount > 0` (the panel will render), else `#research-notes-heading`. Arrow changed from `→` to `↓` to signal the in-page jump. The full-talk route remains reachable via the panel's `viewFullTalk` link.

  Remaining audit items (D1 demote `CoverageSection`, D2 demote `ConflictsSection`, M1 visual rebalance, M3 nav demotion, plus the M-lift localization pass) land in follow-ups. Frontend typecheck clean; test suite 89/89 green.

### Added

- **Reading-surface audit** — [`docs/reviews/2026-05-19-reading-surface-audit.md`](docs/reviews/2026-05-19-reading-surface-audit.md). Honest sit-down audit of the three pages a Tailscale visitor reads — home dashboard (8 blocks), article (10 blocks), family-tree (10 sections + chrome) — after the May 2026 build-out left them accreted. Inventories what is on each page, then names 4 redundancies, 3 mis-prioritizations, 3 cuts and 3 demotes per the ROADMAP brief; surfaces a secondary list of UI-guideline findings (localization gaps on article-page chrome, `next/link` vs `@/i18n/navigation` import mix on top-level pages, sticky-header scroll-margin-top, `<bdi>` sweep coverage); sequences 8 XS/S composition fixes plus 1 M-lift localization pass that, once landed, unblock the remaining Reading-track items (Pedigree T/D, P1.4, P2.3/7/11/12) to proceed in any order. The 6-bullet TL;DR up top is the actionable summary; the per-page inventory tables are the supporting evidence. Flips the "Reading-surface audit" row in [`docs/ROADMAP.md`](docs/ROADMAP.md) to ✅ shipped per Rule 14; the Reading-track snapshot row updates to point at the header/composition fixes the audit enumerates. No code changes in this commit — audit is the deliverable.

- **`/[locale]/roadmap` site page** — renders `docs/ROADMAP.md` on the wiki itself, mirroring the existing `/[locale]/changelog` pattern. New `frontend/lib/roadmap.ts` parses the doc into typed sections (`snapshot` / `track` / `parking` / `cut` / `shipped` / `narrative`), counts table-row items per section, and aggregates totals (tracks, ready, in-flight, shipped, parked, cut) by scanning the ⏳/🚧/✅/🅿️/× glyphs in the source. The route at `frontend/app/[locale]/roadmap/page.tsx` lays out a side-rail index and per-section blocks colored by kind (primary border for the snapshot, amber for parking, emerald for shipped, etc.). Chrome localized to all 4 locales under a new `Page.Roadmap` namespace (19 keys × 4); body stays English since the doc is English-only project planning. New `.roadmap-prose` block in `globals.css` — table-first typography (compact rows, monospace first column, muted header background) since each track section is a status table. 9 unit tests in `lib/roadmap.test.ts` cover classify-by-title, item-row counting, totals aggregation, intro extraction, and empty-doc handling. Full frontend suite 89/89 green; typecheck clean. Closes the Reading-track "site roadmap page" row added in the same session's roadmap restructure. View source link points to `github.com/stevenbarash/family-tree` (the actual code repo).

- **Home-page nav link to `/roadmap`** — added next to the existing changelog link in the home-page header (`app/[locale]/page.tsx:94`). New `navRoadmap` key under `Page.Home` in all four locales (en `"Roadmap →"`, ru `"Дорожная карта →"`, uk `"Дорожня карта →"`, he `"מפת דרכים →"`).

### Fixed

- **CHANGELOG URL typo** — the v1.2.1 release-tag link in the document header pointed to `github.com/anthropics/whoami` (a template URL from the migration). Corrected to `github.com/stevenbarash/family-tree`. This was the only occurrence of the wrong URL in the repo.

### Changed

- **ROADMAP restructured around three tracks** — wave-based sequencing (Wave 1–5) from the 2026-05-07 platform review was overrun by what actually shipped over the following 12 days. New top-level structure: **Reading**, **Authoring**, **Contribution** (the new track defined 2026-05-19 — see [`docs/superpowers/plans/2026-05-19-family-contribution-mode-roadmap.md`](docs/superpowers/plans/2026-05-19-family-contribution-mode-roadmap.md)), and **Infrastructure & hygiene**. Each item carries its existing P#.# review-ID where one exists; the wave grouping is dropped. Status snapshot near the top of the doc gives the at-a-glance "next item per track" answer. Items absorbed: P1.7 (media as first-class) → contribution-track E.2; P2.8 (schema-migration registry exercise) → E.2's MediaRef extension; P3.1 (frontier as central UI metaphor) → operationalized by the contribution surface itself. Items cut: P3.5 cross-tree linking (anti-goal per SCOPE.md), P2.16 talk-i18n backfill (operational task, lives in memory). Items parked with explicit triggers: P1.6 (needs `PEDI`/`ADOP` annotation in source GEDCOM — verified 0 in corpus), P1.8 breadcrumbs (chart now does wayfinding), P3.3/P3.6/P3.7/P3.8 (each gets a concrete reopen signal). The `roadmap-drift` test still passes (every ✅ row maps to a CHANGELOG mention bidirectionally).

- **SCOPE.md: browser writes to research notes and talk pages are in-scope; lightweight identity is in-scope; both as of 2026-05-19.** The "no user accounts inside the app" anti-goal sharpened to "no authentication (passwords, anti-impersonation, real access control)" — Tailscale ACLs remain the access boundary. A self-asserted person picker that holds `viewer`+`subject` session state (hybrid persistence: cookie viewer, session subject) is *not* auth and is now explicitly permitted. The "tree editing in the browser" anti-goal tightened to clarify it covers `.ged` and `genealogy/derived/*.yml` only; browser writes to research notes and talk pages are now in scope, with attribution as content fields rather than logged-in identity. Together these unlock the family-contribution-mode track (E.0–E.9) where family informants in en/ru/uk/he can contribute raw evidence — text, audio recordings, audio links, structured Q&A — via the browser without dropping to the CLI.

### Fixed

- **`performance.measure` console error on 404 navigation** — after the P1.10 commit (`5dcebe1`), navigating to a non-existent slug threw `Uncaught TypeError: Failed to execute 'measure' on 'Performance': 'PageRoute' cannot have a negative time stamp` in the browser console. The 404 page itself rendered correctly; the error was dev-only RSC perf-timing instrumentation in `react-server-dom-turbopack-client.browser.development.js` recording the component-end timestamp before the component-start timestamp for `PageRoute`. Root cause: the new `app/[locale]/error.tsx` sat between `[slug]/page.tsx` (which calls `notFound()`) and `app/[locale]/not-found.tsx`; Next 16's `ErrorBoundaryHandler` catches NEXT_NOT_FOUND in `getDerivedStateFromError` and re-throws to the not-found boundary, and that intermediate catch+rethrow registers as a "component erred" event that misaligns RSC's timing for the throwing component. Rolled back the bonus `error.tsx` (it was not part of P1.10's original scope of skeletons + 404 + GEDCOM banner — all three of which still ship). The inline schema-mismatch error in `[slug]/page.tsx` continues to be the runtime-error model the review pointed to. A dedicated runtime error UI can be revisited as a P2 if a route-segment placement is found that doesn't sit above `notFound()` callers.

### Added

- **Skeleton loaders for article and family-tree (closes P1.10)** — the 2026-05-07 platform review called the schema-mismatch error in `[slug]/page.tsx` "the model — it's specific and actionable. The other states should learn from it." Two of P1.10's three sub-deliverables had already shipped iteratively (custom 404 in `app/[locale]/not-found.tsx`; GEDCOM-stale-snapshot banner on the home page, 30-day threshold, in `app/[locale]/page.tsx`). This commit closes the last sub-deliverable — Suspense skeletons for the two big force-dynamic routes. New: `components/ui/skeleton.tsx` (shadcn primitive via `npx shadcn add skeleton`); `app/[locale]/[slug]/loading.tsx` (back-link + header skeletons + 9-line prose skeleton); `app/[locale]/family/tree/loading.tsx` (sticky-header chrome + 520px pedigree placeholder + 4 section skeletons matching the live layout). Replaces the static gray `BirthplacesMap` placeholder with the `Skeleton` primitive for consistency (same 420px height, now animate-pulse instead of frozen, no English-only "Loading map…" text leak). i18n: new `Loading` namespace in en/ru/uk/he (the `messages-same-shape` tests confirm parity). A locale-level `app/[locale]/error.tsx` was originally included as a bonus to generalize the schema-mismatch pattern but rolled back because it triggered `Failed to execute 'measure' on 'Performance': 'PageRoute' cannot have a negative time stamp` in browser console on 404 navigations — Next 16's `ErrorBoundaryHandler` catches NEXT_NOT_FOUND in `getDerivedStateFromError` and re-throws to the not-found boundary, and that intermediate catch+rethrow disrupts the dev-only RSC perf-timing instrumentation. The schema-mismatch error continues to render inline in `[slug]/page.tsx` (the original "model"); a dedicated runtime error UI can be revisited if a different approach (route-scoped boundary at a level not above `notFound()` callers) presents itself.

### Fixed

- **Directive dark-mode contrast (closes P2.1)** — the citation directives (`cite-vault`, `cite-message`) had already been migrated off hardcoded `text-slate-600` / `bg-slate-50` / `border-blue-300` to design tokens (`bg-muted`, `text-muted-foreground`, `border-s-border`, `border-s-primary`) in commit `3f300e0`; verified the resulting dark-mode contrast against `--card` passes WCAG AA (`text-muted-foreground` on `bg-muted` ≈ 6.5:1). Adjacent fix in the same directive directory: admonition icons (`open`/`closed`/`superseded`/`gap`) gained `dark:[&>svg]:text-{yellow,green,red,amber}-400` variants — the `-600` light-mode hues were borderline (3.9–4.7:1) on the dark card background. Borders (`border-{yellow,green,red,amber}-500`) and the violet quote-accent borders in `blockquote` / `dialogue` are mid-luminance and pass in both modes — left alone.

### Added

- **Source-coverage metric on `/family/tree` (Partial close P0.4)** — surfaces the source-citation gap the 2026-05-07 platform review flagged. The review's recommendation #1 (resolve `_APID` → titles) was made moot by the May 2026 GEDCOM 7 upgrade: v7 uses standard `EXID` and `deriveSourceRef` already pulls TITL/AUTH/PUBL; 18/18 top-level SOUR records carry TITL, and an audit found 0 individuals with nested-only sources the deriver was missing. Recommendation #2 (`sources_unresolved` field) would be empty in current data — skipped on YAGNI. Recommendation #3 ships: `CoverageView` gains `sourceCoverage: { cited, total }` (cited = ancestors with non-empty `DerivedRecord.sources`); `CoverageSection` renders a sibling line under the existing `knownOfPossible` row, e.g. "29 / 126 known" + "8 / 29 cited (28%)". No new I/O — uses the already-loaded records map. i18n strings in en/ru/uk/he. The metric exposes a 77% (158/203) uncited gap in the corpus so it's visible and actionable.

### Fixed

- **Atomic writes for `wai i18n sync` output files** — `runI18nSync` and `runTalkOnly` were calling `fs.writeFile` directly for the translated article, the `.translation.talk.md` audit, and the localized `.talk.md`. SIGINT mid-write could leave a half-written file that the bulk-backfill's resume logic then skips (file exists → counted as "already done", silent corruption). Now all 4 user-facing writes go through a new `atomicWrite(path, content)` helper that writes to `<path>.tmp` and atomically renames — same pattern the core PageStore has used since v2. Backfill script complementary: a SIGINT/SIGTERM trap logs the slug+locale where the interrupt landed before exit 130, so post-mortem is a one-grep.

- **Harness `defaultSkillsDir()` walks up to find the skills marker** — surfaces when the `wai` binary is installed outside the repo (e.g. `~/.local/bin/wai` byte-copy of the bundle). The legacy path `dirname(argv[1])/../../plugins/whoami/skills` resolves to `~/plugins/whoami/skills` for that install layout, which doesn't exist; talks-only sync was blowing up with `harness: skill not found at /Users/<user>/plugins/whoami/skills/SKILL.md`. New behaviour: try the legacy path, then walk up from `cwd` and from the binary dir (bounded depth 8) looking for any ancestor that contains `plugins/whoami/skills/`. The first match wins; falls back to the legacy literal for unchanged error semantics when nothing matches. Caught by the P2.16 backfill dry-validation.

### Added

- **`wai i18n sync --talk-only` + backfill script** — bulk-translate the 101 EN editorial talk pages × 3 locales without re-translating the 181 existing article translations. New `--talk-only` flag on `wai i18n sync` skips the article translator; reads `pages/{locale}/<slug>.md` for the title + body anchor; runs only the talk translator; writes `pages/{locale}/<slug>.talk.md`; surgically updates the sibling `.translation.talk.md`'s `### Talk-page translation` subsection (strips any prior one to avoid duplicate accumulation on re-runs). Refuses if the article translation is missing — `--talk-only` is meant to run after a full sync. Measured at ~45% faster than full sync (2:07 vs 3:46 against aidele.talk on Opus). New `tools/backfill-talk-i18n.sh` enumerates every `(slug, locale)` pair where `pages/en/<slug>.talk.md` exists, `pages/{locale}/<slug>.talk.md` is missing, and the article translation is present — runs sequential `--talk-only` syncs with progress logging, supports `--dry-run` / `--start-from <slug>` / `--locale <l>` / `--limit N`, resumable across kills. Bash 3.2 + BSD-find compatible (stock macOS). 3 new orchestrator tests (basic talk-only, refusal on missing article, no-duplicate subsection on re-sync); cli 318 (was 315). For the corpus today: 291 pairs to backfill, 12 skipped (4 EN talks have no article translation in any locale and need a full sync first).

- **`WHOAMI_MODEL` env-var override for the harness adapter** — pass `--model <alias-or-id>` to the sub-`claude` call without touching the user's global config. Useful for cost/quality experiments (`WHOAMI_MODEL=claude-sonnet-4-6 wai i18n sync …`) and for pinning a specific model in CI. Default (env unset) behavior is unchanged — claude picks its configured default. 2 new harness tests; cumulative cli 315.

- **`readTalkBody` becomes locale-aware (Phase B.3 — closes P2.15)** — surfaces the translated talk pages B.2 started producing. `frontend/lib/server-services.ts:readTalkBody(talkSlug, locale)` now reads `pages/{locale}/<slug>.talk.md` first and falls back to `pages/en/<slug>.talk.md` when the localized file is missing. Call sites at `frontend/app/[locale]/[slug]/page.tsx:70` and `frontend/app/[locale]/family/tree/page.tsx:93` pass the route's locale; the inline "Editorial discussion" panel on `/ru/<slug>` now reads from the Russian talk page when one exists, rather than always showing English threads. The `getCachedOpenGaps` fan-out at `server-services.ts:168` intentionally stays at EN because the home-page open-gaps count is structural (`::open` thread markers are preserved verbatim across translations) and locale-invariant. New `readTalkBodyWithStore` export for DI-friendly testing; 4 new unit tests covering locale="en", locale-hit, locale-miss→EN-fallback, and neither-exists→"". Cumulative frontend 86 (was 82).

- **`wai i18n sync` invokes the real agent talk translator (Phase B.2 — `translate-talk` template + `agentTalkTranslator`)** — completes the talk-page i18n pipeline started in B.1. New `prompt-templates/translate-talk.md` in the `writing-articles` skill: a tight contract telling the agent which talk-page elements translate (section headings, thread headings, prose in research notes and threads) vs preserve verbatim (thread markers, HTML-comment note IDs, gap slugs, source URLs, pipeline-run UUIDs, agent-log counts, date headings, wiki link slugs). New `agentTalkTranslator` in `cli/src/commands/agent-translator.ts` parallel to `agentTranslator`: invokes the harness with the new template. `cli/src/index.ts` non-stub path now wires `agentTalkTranslator` (replacing the `talkTranslator: undefined` placeholder from B.1). New `'translate-talk'` member in `HarnessTemplate`. `i18n` added to the `prompt-drift` test's `LIVE_COMMANDS` allowlist (previously absent — the SKILL.md mention of `wai i18n` was the first prompt reference). New `slug` field on `TranslateTalkRequest` so the agent prompt's `{{SLUG}}` resolves correctly (talk-page YAML carries no `slug` / `translationOf` field; the orchestrator now passes it explicitly). One new orchestrator test verifies the slug-plumbing; cumulative cli 313 (was 312). Real-call validation lives in the integration tests (skipped by default; `WAI_INTEGRATION_TESTS=1 npm test`).

- **`wai i18n sync` now translates editorial talk pages alongside articles (Phase B.1 — plumbing + stub)** — when `pages/en/<slug>.talk.md` exists and a `talkTranslator` is provided, `wai i18n sync <slug> <locale>` writes a localized talk page at `pages/<locale>/<slug>.talk.md` with the same translation lifecycle as the article (`lang`, `translation_of`, `canonical_sha`, `translated_at` stamps). Frontmatter follows the talk-page format spec — `schemaVersion: 1`, `title: "<localized Talk>: <translated subject>"`, `type: meta`, `categories: [Open editorial questions]` iff the body has at least one `::open` thread. Talk-page translation decisions fold into the single sibling `.translation.talk.md` under a new `### Talk-page translation` subsection (one audit log per locale). New `TalkTranslator` interface and `stubTalkTranslator` in `cli/src/commands/i18n-sync{,-stub}.ts`. New `--no-talk` flag to opt out. Default behaviour matches existing pipeline: the stub path is wired in Phase B.1; the real agent talk translator (requires a `translate-talk` template in the `writing-articles` skill) lands in Phase B.2 — the agent path currently passes `talkTranslator: undefined` so it skips talk silently rather than writing a half-translated file. Companion change: the `detectTalkPageFormat` detector now gates on EN-only paths (`pages/en/`, plus the legacy top-level `pages/`) so translated talk pages with localized "Talk:" prefixes and translation-stamp fields aren't false-positive-flagged. 6 new orchestrator tests + 2 new detector tests; cumulative cli 312 (was 306), core 613 (was 611).

- **`wai check` detector + format spec for editorial talk-page frontmatter (`detectTalkPageFormat`)** — locks the format ahead of extending `wai i18n sync` to translate talk pages. Five rules: (1) `schemaVersion: 1` required; (2) `title:` carries the canonical `"Talk: <Subject>"` prefix; (3) `type: meta` (talk pages are editorial workspace, not the article subject); (4) `categories:` contains `Open editorial questions` iff at least one `::open` thread exists — other tags preserved, duplicates deduped; (5) when two or more of `## Research notes`, `## Drafting plan`, `## Agent log` are present, they appear in that order. Rules 1–4 auto-fix via line-targeted replacements (insertions encoded as anchor-line replacement); rule 5 is warn-only because whole-section reorders are too risky for auto-fix. 18 unit tests. Found 50 stragglers across 28 of the 101 corpus talk pages on first run — all migrated to canonical form in the data repo: 28 `"Talk:"` prefix adds, 11 `type: person` → `meta`, 8 `schemaVersion: 1` inserts, 3 categories normalizations (including the one duplicate-tag file). Companion "Frontmatter" + "Section ordering" subsections added to `plugins/whoami/skills/editorial-guide/SKILL.md` so future agent writes match the contract.

- **feat(frontend):** home page reworked as a research dashboard — gains editorial-gaps and unwritten-pages cards (top 5 each, hide when zero, global aggregate footers). The A–Z articles and talk-pages grids move to a new `/index` route; the home ends with a two-line browse-all footer. A full redlinks listing lands at `/redlinks`. Closes P1.3.

- **Talk-page editorial threads surfaced on article pages (P1.9)** — closes the "talk pages are invisible to readers" review item. Each `## Heading` + `::open`/`::closed`/`::superseded`/`::gap` thread on a person's talk page now renders as a collapsible card inline beneath the article body, grouped into "Open questions" (default-expanded), "Resolved" and "Superseded" (default-collapsed). Pure parser in `core/src/pages/talk-threads.ts` (13 tests) feeds `buildTalkThreadsView` in `frontend/lib/server-services.ts`; new server component at `frontend/components/talk-threads/threads-panel.tsx` translated in all 4 locales (`Page.Article.TalkThreads.*`). The freshness-strip `countOpenGaps` now delegates to the shared parser — fixing a level-3-heading undercount the legacy regex had (e.g. `wartime-catastrophe-in-the-barash-family-tree` now correctly reports 43 open gaps instead of 0). `### Subheadings` inside a thread body (used by 28 real threads for sub-sections like "Project objective" / "Resolution paths") are preserved as part of the body; only `##` and sibling `### + marker` headings act as thread boundaries. The full talk page remains one click away via the "Full talk page →" link in the panel header.

- **`wai check` detector for non-canonical talk-thread shapes (`detectTalkThreadShape`)** — surfaces the two real failure modes that ship threads silently invisible to readers: (1) **orphan markers** — `::open`/`::closed`/`::superseded`/`::gap` line with no `##` or `###` heading directly above it (paragraph starting with bold-prefix text intended as the topic, or legacy MediaWiki `== Heading ==`); (2) **single-line markers** — `## ::open <id>` concatenated heading + marker. Both forms parse to nothing in the editorial-discussion renderer because the parser requires the marker on its own line directly after the heading. Category `schema`, severity `warn`. 12 unit tests; wired into `wai check` with the other schema detectors. Found 19 stragglers across 3 files on first run against the wiki corpus (all migrated to canonical form in the data repo). Companion clarifications added to `plugins/whoami/skills/editorial-guide/SKILL.md` ("Canonical form" + "Wrong forms" sections) and `plugins/whoami/agents/editor.md` (Phase 3 talk-thread example) so future agent writes match the parser.

- **Pedigree chart frontier slots** — every present ancestor whose `parents[]` lacks a father or mother now produces a dashed-border placeholder node in the `/family/tree` chart at the missing parent's position. Click a slot to open the descendant's tree page (where the existing research-frontier list lives). Sub-project F of 3 in the gap-as-frontier feature (T = talk-page candidate parsing, D = research drawer — both deferred). New `kinship.*` i18n keys in all 4 locales. The recursive-midpoint layout treats frontier slots as full leaves, so asymmetric branches with detectable gaps spread spatially instead of collapsing.

- **Pedigree chart on `/family/tree` (P1.1)** — interactive ancestor chart at the top of the page, replacing the list-only layout. Pure layout function in `core/src/family/pedigree-layout.ts` assigns positions from the binary path-from-root (no `d3-hierarchy` dep); React Flow (`@xyflow/react` v12.10.2) renders on `md+` with pan, zoom, click-to-navigate; mobile falls back to a stacked generations list (`< md`). Focal person highlighted; node clicks route via `familyTreeHref`. Closes platform-review P1.1 — the single biggest UX gap the review called out.

- **Pipeline-fields validation on non-article pages:** Talk pages (`type: translation-talk`), meta pages, and any other non-article frontmatter carrying translation-pipeline fields (`lang`, `translation_of`, `canonical_sha`, `translated_at`) are now validated against the same regex constraints PageMeta uses. Surfaces via `RepoState.parseErrors` → `detectSchemaDrift`, same channel as article-page schema failures. New `parsePipelineFields()` helper in `core/src/pages/schema.ts` exposes the focused check; `load.ts` runs it in the catch branch where it used to silently drop non-article files. Motivation: the `rahil-moiseyevna-berezovskaya` translation-talk files carried the same `translation_of: en/<slug>` path-vs-slug bug as the article files but were invisible to `wai check` until now — the main schema rejects talk pages on type alone, so the focused validator never ran. 7 new tests; cumulative core 549 (was 542).

### Changed

- **`detectStaleCanonicalSha` severity dropped from `warn` to `info`:** Caught on its first real-world deployment — the pre-commit hook in the data repo (`wai check --fail-on format,schema,data --min-severity warn`) was blocking unrelated commits because the 534 stale translations from the recent canonical-EN cleanup commits tripped the warn threshold. Stale-sha is a "you might want to refresh" signal, not a corruption blocker; downgraded to `info` so it's visible via `wai check --min-severity info` without gating commits. Other Pass-2 detectors (NAME.TRAN ↔ title, pipeline-frontmatter) stay at warn — those are real disagreements, not natural drift.

### Added

- **Schema at the write boundary for `DerivedRecord` (`genealogy/derived/*.yml`):** New `core/src/gedcom/schema.ts` defines `DerivedRecordSchema` (Zod) mirroring the TypeScript type — record/family/source/media IDs carry regex constraints (the join keys between YAMLs and the GEDCOM), `nameTranslations` keys must be BCP 47 short codes, `sex` is an enum, nested arrays use `.default([])` for backward-compat with older deriver output without coercing wrong-shape values. New `parseDerivedRecord(raw): Result` exposes a tagged success/error result with flattened field-path messages. Audited against all 203 existing `derived/*.yml` files: 100% pass. Wired in three places: (1) `writeDerivedYaml` validates before serialization — a deriver bug that produces a malformed record now throws instead of polluting the data repo; (2) the new exported `serializeDerivedRecord` helper is used by `sync.ts` for the change-detection diff so byte comparison stays apples-to-apples post-Zod-normalization (without it, every record would have looked "changed" after the schema landed — caught by `syncGedcom: detects added record` test); (3) `checks/load.ts` switched from `normalizeDerivedRecord` to `parseDerivedRecord` and pushes failures into `RepoState.parseErrors`, so `detectSchemaDrift` surfaces hand-edited or stale YAMLs that previously got silently dropped. `normalizeDerivedRecord` retained as a thin wrapper for the four other read call sites (search rebuild, export, frontend family loader, frontend derived loader); legacy "coerce wrong-shape arrays to []" behavior removed (those were silent-drop patterns hiding real bugs). `schema-drift` message reworded from "frontmatter failed schema validation" to "schema validation failed" now that it covers both PageMeta and DerivedRecord. 11 new tests; cumulative core 542 (was 531), cli 303, frontend 75.

- **Quality Checks Pass 2 — four new `wai check` detectors:** Building on the 5-layer frontmatter defenses below. (1) `detectNameTranDrift` (data, warn): flags `(record, locale)` pairs where the GEDCOM `NAME.TRAN` value disagrees with the translation page's frontmatter `title` — catches one-sided hand edits that the next `wai i18n sync` would silently overwrite. (2) `detectStaleCanonicalSha` (data, warn): compares each translation file's `canonical_sha` against `git log -1 --format=%H -- pages/en/<slug>.md`; fires when the canonical has moved since translation, when `canonical_sha` is missing, and silently skips when the canonical has no git history. Surfaced 534 stale translations after the recent canonical-EN cleanup commits — a real signal the user can fix by re-running `wai i18n sync`. (3) `detectInfoboxNameDrift` (consistency, warn, gated behind `--include-consistency`): catches `name:` inside the `:::infobox-*` block diverging from frontmatter `title`. Allows the infobox to be a richer form (substring/subsequence rule: passes "Clara Barash" against "Clara קלרה Barash"). (4) `detectPipelineFrontmatterDrift` (schema, warn): asserts every page under `pages/{ru,uk,he}/` carries the full pipeline-stamped field set (`lang`, `translation_of`, `canonical_sha`, `translated_at`, `author`). New `RepoState.canonicalHeadSha?: ReadonlyMap<string,string>` populated by `load.ts` (bounded git cost: only canonicals that have at least one translation). Fix along the way: `load.ts` was bypassing `normalizeTranslationKeys` and so didn't see the snake_case→camelCase mapping that `parsePage` performs, which would have produced 537 false positives from pipeline-frontmatter-drift before the fix. Cumulative test count: core 531 (was 498), cli 306. Plan: `docs/superpowers/plans/2026-05-18-quality-checks-pass-2.md`.

- **Defenses against frontmatter-drift bug class (5 layers):** A bug surfaced during Phase 1 verification — 3 translation files had `translation_of: pages/en/<slug>.md` (a path) instead of `<slug>` (a slug), causing my NAME.TRAN extractor to silently drop them. These five changes prevent the class:
  1. **Tighter schema (`core/src/pages/schema.ts`):** added regex constraints to `translationOf` (slug-form only), `lang` (BCP 47 short code), and `canonicalSha` (40-char hex). Zod rejects future writes that don't match.
  2. **load.ts walks per-locale dirs:** `core/src/checks/load.ts` previously only read `pages/*.md` (legacy pre-multilingual path), missing all canonical EN and translation files under `pages/{en,ru,uk,he}/`. Now walks all five paths. Bonus: surfaced 18 real pre-existing schema issues in translations and 7 prose-date format issues that had been invisible.
  3. **`schema-drift` surfaces parse errors:** `load.ts` collects per-page Zod errors into `RepoState.parseErrors`; `detectSchemaDrift` emits one error-severity finding per. Previously parse failures were silently `continue`d, so malformed pages just disappeared from the loaded set.
  4. **Idempotent `injectNameTran` + tests:** promoted the one-off `/tmp/inject-name-tran.mjs` to `core/src/gedcom/inject-name-tran.ts` (pure function: string in, string out). Strips existing `2 TRAN`/`3 LANG` lines before re-injecting, so re-running is a no-op. 9 new node:test cases including an explicit idempotency assertion.
  5. **Locale-aware `data-drift`:** `detectCorrectionsConflicts` now skips non-`en` translation pages when looking for conflicts. Translation files carry locale-prose translations of the SAME canonical correction — comparing them to each other always looked like a conflict but wasn't. Adds 3 tests covering the new behavior.
  Cumulative test count: core 498 (was 489), cli 306, frontend 81. `wai check` now surfaces real data signals it couldn't see before.



- **`NAME.TRAN` cross-locale name canonicalization (GEDCOM 7 feature, Phase 1):** Per-individual ru/uk/he name renderings now live in `genealogy/barash-tree.ged` as `2 TRAN`/`3 LANG` substructures under each `1 NAME` line, rather than being re-derived per translation article. Backfilled 468 TRAN entries across 156 individuals from existing translation titles (after a 3-locale accuracy audit corrected 12 titles and swept 8 Hebrew typography issues). `DerivedRecord.nameTranslations?: Record<string,string>` exposes the map in `genealogy/derived/*.yml`; `wai i18n sync` reads it and passes the locale-specific value as `nameTranslation` to the translator. The prompt template (`translate.md`) instructs the agent to use the value verbatim as `titleTranslation` when present, eliminating per-article re-translation of names already adjudicated. Pipeline still falls back to fresh translation for individuals without TRAN entries (the 47 GEDCOM records that have no wiki page yet). Two new tests cover the read-and-forward path. Future translation backfills inherit the canonical names automatically; new individuals get TRANs promoted from translated titles in a follow-up sweep.

### Changed

- **GEDCOM 5.5.1 → 7.0.18:** Source `genealogy/barash-tree.ged` converted using `gedcom7code/c-converter` (official, public-domain, by the v7 spec editor — built locally from `~/dev/_tools/c-converter`; required `-D_GNU_SOURCE` + `-Wno-strict-prototypes` for macOS Tahoe clang). Parser library swapped from `parse-gedcom@2.0.1` (5.5.1-only) to vendored `gedcom7code/js-gedcom` (one self-contained file at `core/src/gedcom/vendor/gedcstruct.mjs`, public domain, by the v7 spec editor). The vendor file carries one documented local patch: orphan pointers (e.g. `1 SOUR @S99@` to a non-existent record) preserve the original `@xref@` string as payload rather than being silently dropped — matches `parse-gedcom@2.x` behavior and keeps citations visible when target records go missing. `core/src/gedcom/parser.ts` rewritten against the new tree shape; public surface (`ParseResult`, `GedcomNode`) preserved. `core/src/gedcom/derive.ts` updated: reads v7's standard `EXID` tag where it used to read Ancestry's `_APID` (both fall through, EXID preferred); reads `DATE.PHRASE` substructure when present (v7 stores the original non-canonical form there). `core/src/checks/format-drift.ts` no longer flags ALL-CAPS month names in GEDCOM source — uppercase is spec-canonical for both 5.5.1 and 7.0; only the page-prose normalizer rewrites to title case for display. Derived YAML re-sync was cosmetic-only (month case `Aug` → `AUG`, MEDI.FORM `jpg` → `image/jpeg`). Old 5.5.1 file preserved at `genealogy/barash-tree.ged.5.5.1-backup-20260517-190228`. Closes plan `2026-05-17-gedcom-7-upgrade`.

- **LLM-author attribution replaces `owner`/`editors`:** new `author` frontmatter field records the actual LLM model that wrote a page (e.g. `Claude Opus 4.7`). `owner` and `editors` are now deprecated but still parse for backwards compatibility; the serializer preserves them on round-trip. `wai i18n sync` injects `author:` into both the translation file and the translation-talk file from `WAI_AUTHOR_MODEL` (default `Claude Opus 4.7`). Existing translations + canonical EN articles backfilled to `Claude Opus 4.7` in the same session (data-repo commits `f877ced` and `4ac54fb`). Schema: `core/src/pages/types.ts` adds `author?: string`; `owner` and `editors` made optional. Frontend strip shows the new `author:` line. Prompt template (`plugins/whoami/skills/writing-articles/prompt-templates/translate.md`) documents the new convention so the translator agent doesn't re-introduce `owner:`. Closes platform-review P1.2 (article freshness/attribution metadata strip) — the renderer surface (`created`, `editors`, `GEDCOM snapshot`, source/note/gap counts) was already in place at `frontend/app/[locale]/[slug]/page.tsx:131-180`; this entry adds the missing `author:` LLM-model line so the strip answers the full "how was this written?" epistemic question the review asked for.

### Fixed

- **Async pages use `getTranslations`, not `useTranslations`:** all async server components under `frontend/app/[locale]/` were calling `useTranslations()` which is only valid in sync server components or client components — runtime crash with `Error: useTranslations is not callable within an async component`. Converted to `await getTranslations({ locale, namespace })` from `next-intl/server`. Affected: HomePage, ChangelogPage, FamilyPage, SearchPage, FamilyTreePage. The static-rendering canary test (skipped pending force-dynamic removal) would have caught this earlier.

- **CLI pages path:** `core/src/paths.ts` and `cli/src/index.ts` default `pagesDir` flipped from `pages/` to `pages/en/`. Closes a regression from the multilingual content migration where `wai read <slug>` looked at the pre-migration path.

### Added

- **Translation prompt enriched with related-slug context:** `wai i18n sync` now scans the canonical for `[[wikilinks]]`, looks up which referenced slugs already have a translation in the target locale, and passes the (English title → locale title) pairs as `RELATED_TRANSLATIONS_OR_NONE` context to the translator. Lets the agent mirror established surname/given-name renderings across sibling articles instead of inventing fresh transliterations and creating cross-page drift. Acts at generation time — prevents drift rather than detecting it. Closes the highest-leverage gap in the translation-backfill methodology surfaced by the 78-article first pass.

- **Sex-aware translation pipeline:** `DerivedRecord.sex` (M/F/U) now surfaced from the GEDCOM `SEX` tag through to the translator prompt. `wai i18n sync` looks up the linked GEDCOM record's sex and passes it via the `SUBJECT_SEX` template variable so future translations pick gendered past-tense verbs correctly per language (Russian `родилась` vs `родился`, Hebrew `נפטרה` vs `נפטר`, etc.). The 23 already-translated articles default masculine until re-sync.

- **Agent translator (default for `wai i18n sync`):** the command now invokes the editor agent via the harness adapter (`writing-articles` skill, new `translate` prompt template) and writes the resulting translation + talk file. Pass `--stub` to fall back to the offline echo translator (tests, dry runs, CI without a harness). Prompt template lives at `plugins/whoami/skills/writing-articles/prompt-templates/translate.md`. Completes Plan 3 Task 11.

- **`wai i18n sync <slug> <locale>`:** new CLI command writes `pages/{locale}/<slug>.md` + `pages/{locale}/<slug>.translation.talk.md` from the canonical EN article, stamping translation frontmatter (`translation_of`, `canonical_sha`, `translated_at`, `lang`) and a sibling talk file with `## Unresolved` / `## Resolved` sections. Plan 3 ships with a stub translator (echoes canonical body); the real agent pipeline lands in Plan 3 Task 11.

- **`wai i18n status`:** new CLI command lists every (slug × target-locale) pair with its computed translation status (`current` / `stale` / `review` / `missing`) and unresolved translation-talk-entry count. Tab-separated output (`slug\tlocale\tstatus\tunresolved`) for grep / sort / awk. Standalone — reads `$WHOAMI_ROOT/pages/{en,ru,uk,he}/` directly and shells out to `git log -1` for the canonical-EN head SHA.

- **Article translation status detection:** `app/[locale]/[slug]/page.tsx` now resolves translation status per request via `getTranslationInfo(slug, locale)` and renders the appropriate banner. Missing translations fall back to canonical EN content with a "not translated yet" banner.

- **Translation banners:** new `frontend/components/translation-banner.tsx` renders stale / review / missing notices on translated article pages. Strings added to `Page.Article.banners` in all four locale message files with correct ICU plural categories.

- **Translation frontmatter:** `translation_of`, `canonical_sha`, `translated_at`, `lang` fields now parse off translation files into `PageMeta` (as `translationOf`, `canonicalSha`, `translatedAt`, `lang`). All optional — canonical EN files continue to parse cleanly. `serializePage` round-trips them in snake_case form on disk. No schema-version bump needed.

- **Per-locale PageStore reads:** `PageStore.read(slug, { locale })` reads from `pages/{locale}/<slug>.md`. Existing callers (no locale) unchanged.

- **Translation talk parser:** `core/src/i18n/translation-talk.ts` parses `<slug>.translation.talk.md` files into unresolved/resolved entry counts. Foundation for the translation accuracy review gate.

- **Translation status helper:** `core/src/i18n/status.ts` computes `current | stale | review | missing` from `(translation canonical_sha, head canonical_sha, unresolved-talk-entries)`. Status is computed, not stored.

- **Russian translation:** `frontend/messages/ru.json` — LLM-drafted translation of all UI chrome strings; Slavic ICU plural categories (one/few/many/other). Human review pending.
- **Ukrainian translation:** `frontend/messages/uk.json` — LLM-drafted; Slavic ICU plural categories (one/few/many/other). Human review pending.
- **Hebrew translation:** `frontend/messages/he.json` — LLM-drafted; Hebrew ICU plural categories (one/two/many/other); RTL script. Human review pending.

- **Content migration:** `PAGES_DIR` flipped from `$WHOAMI_ROOT/pages` to `$WHOAMI_ROOT/pages/en`. All article and talk-page files in the data repo were `git mv`d under `pages/en/` in a separate commit there. The frontend's article loader (PageStore) stays locale-blind in Plan 1 — Plan 3 will add per-locale reads.

- **Directive labels localized:** `infobox-person` and `on-this-day-ribbon` directives now read labels from `Directives.infoboxPerson` and `Directives.onThisDay` namespaces. These render on every article page, so they're the highest-volume translation targets.

- **Changelog page localized:** moved under `[locale]/`; strings extracted to `Page.Changelog`.

- **Search page localized:** `TYPE_LABELS` dict ("People/Families/Events/Trees/Meta") and the search placeholder extracted to `Page.Search` namespace using ICU `select`.

- **Family tree localized:** `app/family/tree/page.tsx` → `app/[locale]/family/tree/page.tsx` and `components/family/sections/*` strings extracted to `Page.FamilyTree` namespace. The interactive tree is the largest UI-string surface and the densest translation target; data unions (relations, pedigree, missing-parent side, generation headings) use ICU `select`. The `mobile-disclosure` client island accepts show/hide labels as props from its server parent.

- **Family page localized:** `app/family/page.tsx` → `app/[locale]/family/page.tsx`; strings extracted to `Page.Family` namespace (nav, titles, generation headings, line-side labels, date formats, empty-state copy).

- **Article routes under [locale]/:** `app/[slug]/page.tsx` → `app/[locale]/[slug]/page.tsx`. `generateStaticParams` enumerates all (locale, slug) pairs for static prebuild.

- **Home page localized:** `app/page.tsx` moved to `app/[locale]/page.tsx`; hardcoded English strings ("The Registry", "Continue research", "Recently revised", "All articles", "Talk pages", nav labels, month names, frontier meta, GEDCOM stale-snapshot warning) extracted into `messages/en.json` under `Page.Home` and `Months.long`. Pluralized counts (ancestors, generations, articles, snapshot age in days) use ICU `plural` syntax. The stale-snapshot warning uses `t.rich()` to preserve the inline `<code>` element.

- **Locale-prefixed routes:** Root layout moved to `app/[locale]/layout.tsx`; sets `<html lang dir>`, `setRequestLocale`, `NextIntlClientProvider`. Static rendering preserved via `generateStaticParams` over all four locales.

- **Locale-aware routing:** `frontend/proxy.ts` wires `next-intl` middleware; `/` redirects to `/{detected-locale}/`. API and asset routes are excluded (locale-agnostic).

- **Multilingual scaffold:** Initial `next-intl` routing config in `frontend/i18n/routing.ts` defining four locales (en/ru/uk/he) and `LOCALE_DIR` for `<html dir>`. Part of multilingual support foundation.

- **Language switcher:** dropdown mounted in root layout. Available on every page across all four locales (en/ru/uk/he). Switching preserves the current path.

- **Language switcher messages:** `Chrome.LangSwitcher` namespace in `messages/en.json` (native names per locale).

- **RTL family-tree icon audit:** directional icons in `components/family/` were audited for RTL mirroring. No horizontal directional icons (ChevronRight, ChevronLeft, ArrowLeft, ArrowRight) are present in that subtree — only `ChevronDown` (a vertical expand/collapse indicator that does not require mirroring) and `FileText` (non-directional). Horizontal `flex-row` auto-flips under RTL via CSS logical default; no Tailwind change needed. One `ArrowLeft` exists in `app/[locale]/family/tree/page.tsx` (the "back to family" nav link) — outside `components/family/` scope; deferred to a future cleanup pass.

- **RTL-ready Tailwind:** converted directional utility class usages (ml-/mr-/pl-/pr-/text-left/text-right/left-/right-/border-l/border-r/rounded-l/rounded-r) across `frontend/app/` and `frontend/components/` to logical equivalents (ms-/me-/ps-/pe-/text-start/text-end/start-/end-/border-s/border-e/rounded-s/rounded-e). Layout now flows correctly under `dir="rtl"` for Hebrew. The `sheet.tsx` `data-[side=left|right]:*` variants were intentionally left physical because they tie to a `side` prop naming a visual position; converting them would change the component contract.

- **Roadmap & plan-index drift guards + CLAUDE.md Rules 14/15**
  *(2026-05-17)*. Two new drift-detection test files mirror the
  agent-prompt drift test added under P0.1: `cli/test/roadmap-drift.test.ts`
  cross-checks ROADMAP `P#.#` rows against CHANGELOG mentions
  bidirectionally, and `cli/test/plan-index-drift.test.ts` cross-checks
  `docs/superpowers/plans/*.md` against the README index (existence
  both ways, plus a soft signal: any 🚧 plan whose every
  `Create: \`<path>\`` file already exists on disk fails as
  likely-shipped). Caught 11 real drift items on the existing tree:
  P0.2 was still ⏳ ready after all four sub-items shipped; 3 article-
  pipeline plans + 3 directives/eval plans were 🚧 with all Create
  files present; 7 drift-prevention plans + the commit-slicing plan
  weren't indexed at all; the totals footer was off by 7. All
  backfilled. Codified as CLAUDE.md Rule 14 (when shipping a P-ID,
  update ROADMAP and CHANGELOG together; use "addresses" / "lands"
  for partial work, "closes" / "completes" / "ships" only when the
  row can flip to ✅) and Rule 15 (when shipping / abandoning /
  renaming a plan, update the plan-index README in the same commit).

- **`<bdi>` for inline person names:** infobox-person, on-this-day-ribbon, and search results now wrap inline person names in `<bdi>` for correct bidirectional rendering when mixing Latin and non-Latin scripts.

- **`wai audit dates` — slash-date ambiguity report (P0.3)**
  *(2026-05-17)*. New CLI command that lists every ambiguous slash
  date (m/d/y vs d/m/y when both fields ≤ 12) across the GEDCOM
  source (`genealogy/barash-tree.ged`), the derived YAMLs
  (`genealogy/derived/*.yml`), and page prose (`pages/**/*.md`).
  Output is grouped by source with file path, line, column, and a
  trimmed context snippet; `--json` for tooling; exit code 1 when
  any ambiguous date is found, so the command is wireable into
  pre-commit hooks or CI. Closes the third leg of P0.3 — slash
  ambiguity detection in `core/src/format/dates.ts` and the `?`
  glyph in `frontend/components/directives/infobox-person.tsx` were
  already shipped; this adds the listing report the roadmap called
  for. Pure scanner lives at `core/src/checks/ambiguous-dates.ts`;
  CLI wrapper at `cli/src/commands/audit-dates.ts`. Current user
  data has zero hits, so the command lands as a forward-looking
  guardrail rather than a remediation report.

- **Agent prompts refreshed against the live CLI surface (P0.1)**
  *(2026-05-17)*. `plugins/whoami/CLAUDE.md` and
  `plugins/whoami/agents/editor.md` previously documented only the
  pre-`author`-pipeline subset of `wai`. They now cover the full
  agent-facing surface: `author` and `author --cohort` as the
  orchestrator, `narrative` / `transcribe` / `interview` as evidence
  drawers, `grep-claims` for the fact-correction discipline,
  `redlinks` for picking the next page to write, `delete`, and the
  `note --kind <k>` flag for tagging research-note provenance.
  Editor-agent workflow gained a new "Phase 2.5: Fact-correction
  discipline" that requires `wai grep-claims` before any factual
  edit. Two pre-existing stale flag references (`wai check --include
  consistency/citation` — that flag never existed; the real form is
  `--only`) were also fixed in `editorial-guide/SKILL.md`. New smoke
  test `cli/test/prompt-drift.test.ts` extracts every `wai <cmd>`
  and `--flag` mention from the four agent-facing markdown files
  (CLAUDE.md, editor.md, editorial-guide, writing-articles) and
  asserts each is a live CLI surface element — so future drift in
  either direction fails fast at `npm test` time.

- **`wai grep-claims <phrase>`** *(2026-05-17)*. New CLI command that
  walks `~/whoami/pages/` and `~/whoami/assets/sources/` looking for
  occurrences of a phrase (and optional comma-separated `--variants`
  for English / Russian / Ukrainian forms of the same claim). Used
  as the first step of any factual correction in the wiki, so every
  place the wrong claim lives can be fixed in one pass instead of
  discovered piecemeal across rounds of "did you also fix the talk
  page" follow-ups. Output groups hits by file with line numbers —
  an audit list. `--json` for structured consumption; `--no-talk`
  skips `*.talk.md`; `--no-sources` skips `assets/sources/`
  transcripts; `--case-sensitive` overrides the default
  case-insensitive match. 8 tests in
  `cli/test/commands/grep-claims.test.ts`.

- **`tools/ocr/` — local Tesseract helper for source-document images**
  *(2026-05-17)*. New `tools/ocr/ocr-source-image.sh` for OCR'ing
  photographed book pages, archival letters, certificates etc.
  Defaults to a 10-language combination covering the family's
  archive (`eng, ukr, rus, heb, yid, pol, deu, lit, aze, aze_cyrl`);
  accepts extra Tesseract language codes as additional positional
  args. 22 useful languages installed via `brew install tesseract
  tesseract-lang`. Transparently handles two macOS quirks: (a) the
  Tahoe shell sandbox where tesseract called with an absolute image
  path from certain CWDs silently produces empty output (the script
  always `cd`s to the image's directory first), and (b) the PNG
  alpha-channel quirk where `sips`-resampled PNGs can't be read by
  tesseract despite working in other tools (the script converts
  PNG → JPG via `sips` before OCR and cleans up the temp). `README.md`
  alongside the script covers install, language list, usage, and
  accuracy tips.

- **`[?]` citation-needed marker convention** *(2026-05-16)*. New
  editorial-guide section documents the convention: every factual
  sentence MUST end in either a footnote `[^id]` or the `[?]`
  marker. `[?]` is the model's escape hatch from the fabrication
  trap — invent no footnotes pointing at vague sources; mark `[?]`
  and let a reviewer either cite or remove the claim. The
  `wai check --include citation` detector enforces this, and the
  author pipeline's verify phase blocks on it. `[?]` claims are
  distinct from `::open` talk-page threads (`[?]` = unsourced
  assertion; `::open` = open question on the talk page).

- **Fact-correction discipline section in editorial-guide**
  *(2026-05-16)*. Documents the required workflow when fixing a
  factual error: list every variant of the wrong claim (English +
  Ukrainian + Russian + Hebrew/Yiddish forms, plus inverse framings),
  grep the entire wiki for every variant before editing any single
  file (`wai grep-claims "<phrase>"` is the helper), build a
  numbered audit list, fix everything in one pass, final grep to
  confirm zero remaining hits. Also explains: talk pages need
  fixing too (stale claims feed the next regeneration of the live
  page); episode pages are derived content that propagate mix-ups
  into authoritative-looking narrative; the same discipline applies
  symmetrically when adding new facts. Motivated by the
  Boris/Kelman Stasyuk medal mix-up unwound in the 2026-05-16
  session.

- **Cross-page consistency detector: talk-page vs live-page drift**
  *(2026-05-17)*. New `detectTalkLivePageDrift` sub-detector inside
  `core/src/checks/consistency-drift.ts` flags quoted/highlighted claim
  phrases that appear in a talk page's *Facts extracted*, *Drafting
  plan*, or *Cross-references* sections but don't appear on the live
  page. Surfaces via `wai check --include consistency` (and via the
  data-repo pre-commit hook when consistency is in `--fail-on`).
  Catches the specific failure mode that let the Boris/Kelman medal
  mix-up linger across `boris-ayzman.md` and `boris-ayzman.talk.md` —
  the talk page's drafting plan asserted "For Defense of Kyiv" as
  Boris's medal, which it isn't, and nothing compared the two
  surfaces. Editorial annotations of the form
  `*[Corrected 2026-MM-DD from "X"]*` are stripped before phrase
  extraction so correction notes don't trigger false positives.
  Severity `warn` (these are heuristics; some legitimate skew exists).

- **Wikilink hover-cards** *(2026-05-16)*. Hovering any internal link in
  a wiki page body now pops a 200ms-delayed preview card next to the
  link with the target's portrait (or monogram), title, dates, and a
  one-line lead. Card content is fully precomputed at SSR — no
  client-side fetch, no loading flicker. Touch devices fall through to
  plain links (no hover events). Self-links suppress the card. Cards
  use the project's existing shadcn-on-base-ui primitive layer
  (`@base-ui/react/preview-card` wrapped in
  `frontend/components/ui/hover-card.tsx`) so the primitive handles
  hover delay, positioning (Floating UI), focus, keyboard (Esc), and
  ARIA. New `frontend/lib/page-card-data.ts` (lead extractor + card
  builder), `frontend/components/wikilink-hover-card.tsx` (composition),
  renderer hook in `frontend/lib/render.tsx`, request-time data build
  in `frontend/app/[slug]/page.tsx` limited to slugs the current page
  actually links to (so dense pages don't slow the request).

- **`findOnThisDay` almanac aggregator** *(2026-05-16)*. New pure
  `core/src/family/on-this-day.ts` walks a derived-records map and
  returns births, deaths, and marriages on a given `(month, day)`
  sorted oldest-first. Marriages are deduped by FAM id, approximate
  dates (`Abt`/`Bef`/`Aft`/`Bet`/`Cal`/`Est`) and partial dates are
  excluded, and births of likely-living people (no recorded death AND
  born within the living-window, default 80 years) are suppressed.
  Feeds the upcoming home-page "this day in family history" ribbon.

- **Relationship-from-self strip on person pages** *(2026-05-16)*. Person
  pages joined to a GEDCOM record now render a one-line subtitle under
  the title naming the subject's relationship to the configured
  `SELF_RECORD` (e.g., "Your great-grandfather."). Strip is suppressed
  on talk pages, restricted pages, pages without a `gedcom.record`, and
  when the target is `SELF_RECORD` itself. The relationship is computed
  server-side from the cached derived-records map, so there's no extra
  I/O per request. The wrapper (`frontend/lib/relationship-from-self.ts`)
  already returns the full crumb chain from self → target with each
  hop's slug resolved; rendering it as a hoverable trail of avatar
  chips is a deferred follow-up.

- **`wai check --min-severity` flag** *(2026-05-15)* lets the exit code
  ignore findings below a severity floor (`info|warn|error`). Display
  and `--json` output still include every finding — only the exit code
  filters — so info findings remain visible as cleanup signals without
  blocking commits. Resolves the catch-22 between the editorial guide
  (which says info findings are advisory) and the pre-commit hook
  (which previously failed on any finding in `--fail-on` categories).
  The data-repo's `.githooks/pre-commit` now invokes
  `wai check --fail-on format,schema,data --min-severity warn`, so a
  page with an info-severity active-correction finding commits cleanly
  via both `git commit` and the wai API write path.

### Fixed

- **Research-note kinds round-trip through the parser** *(2026-05-16)*.
  `parseResearchNotes` narrowed any kind other than `'agent'` back to
  `'human'` on read (a stale `(attrs.kind === 'agent' ? 'agent' :
  'human')` conditional from when only those two kinds existed). The
  recent route widening to accept `interview`/`research`/`transcript`
  only fixed the write side: on read, every non-agent note came back as
  `'human'`. The downstream impact was severe — `cli/src/commands/author/
  gather.ts` filters notes by `n.kind === 'transcript'` to populate the
  evidence drawer with transcripts; with kinds collapsed to `human`,
  the filter never matched and `wai author` couldn't see any transcript
  evidence. Same path for `wai interview` (kind=interview) and
  `wai author` Phase 2 research notes (kind=research). Widened
  `NoteKind` in `core/src/pages/research-notes.ts` to match the
  CLI/route enums, taught the parser to preserve any known kind (with
  unknown values still falling back to `'human'` defensively), and
  widened the matching types in `frontend/lib/server-services.ts` and
  `frontend/components/research-notes/note-item.tsx`. Also caught a
  frontend typecheck regression that the route widening had silently
  introduced (the route compiled but `appendNoteOnDisk` rejected the
  wider kind). Covered by two new tests in
  `core/test/pages/research-notes.test.ts`.

- **Harness JSON extractor ignores quotes outside JSON depth** *(2026-05-16)*.
  `extractFirstBalancedJson` (the brace-matching helper that locates
  JSON in a model response) entered string-tracking mode on any `"`,
  including quotes in preamble prose. A model response like
  `I read "the docs and here it is: {"answer":42}` consumed the real
  JSON's opening `{` as part of a phantom "string" because the
  unmatched preamble `"` flipped `inString=true`. The extractor then
  returned null, and `JSON.parse` failed on the raw prose with an
  unhelpful "Unexpected token" pointing at the first letter of the
  preamble. Fix: only enter string mode once `depth > 0`. Outside
  depth, `"` is just text. Covered by a new test
  (`unmatched quote in preamble does not swallow the real JSON`).

- **`wai author` Phase 3/7 section finders skip code fences** *(2026-05-16)*.
  `replaceOrAppendOutline` (Phase 3, outline) and `appendLogEntry`
  (Phase 7, log) located their section headers (`## Drafting plan` /
  `## Agent log`) with bare `indexOf(marker)`. Two failure modes:
  (a) a literal `## Drafting plan` appearing mid-paragraph in a
  research note matched as if it were the section header;
  (b) the same marker appearing inside a fenced code block (e.g., a
  research note quoting the prompt template verbatim) matched and the
  splice corrupted the talk page — replacing fence contents or
  inserting the new subsection inside a quoted template block, while
  leaving the real section unchanged. Replaced both with a
  line-scanning helper that tracks `inCode` state and only matches
  the marker at the start of a non-fenced line. The
  next-heading scan already used `\n## ` (the author had even left
  a comment about line-anchoring) — this fix extends the same
  discipline to the first lookup. Covered by two new tests
  (`appendLogEntry: ... inside a code fence`, `replaceOrAppendOutline:
  does not match ... inside a code fence`).

- **`consistency-drift` bibliography mismatch detector is line-anchored**
  *(2026-05-16)*. `detectBibliographyMismatch` used
  `body.indexOf('## Bibliography')` to locate the section. A mid-prose
  reference like "see ## Bibliography below" matched, so `bibSection`
  started mid-paragraph and any body-prose `::cite-vault` directives
  between the false match and the real `## Bibliography` were swept
  into `bibKeys` — silently hiding "inline cite missing from
  bibliography" findings (false negatives that the citation
  housekeeping pass would never see). Anchored to line start with a
  `body.startsWith` + `\n## Bibliography` fallback. Covered by a new
  test (`a body mention of "## Bibliography" mid-prose is not treated
  as the section`).

- **CLI server-URL normalization strips all trailing slashes** *(2026-05-16)*.
  The five sites that normalize a server URL (`probe.ts`, `config.ts` x2,
  `api-client.ts`, `doctor.ts` x2) used `replace(/\/$/, '')`, which strips
  only one trailing slash. A configured URL like `http://localhost:3001//`
  reached `fetch` as `http://localhost:3001//api/healthz` and still
  compared equal against the also-once-stripped `baseUrl` in
  doctor/api-client, so the bug only surfaced as a malformed request URL.
  Switched all five sites to `/\/+$/` so every trailing slash is dropped,
  and updated the test that documented the bug to assert the corrected
  behavior.

- **`wai check` citation-drift detector no longer flags relation bullets or
  bibliography lines** *(2026-05-16)*. The detector previously treated every
  list item with a wikilink as a factual claim. `## See also` bullets shaped
  `- [[link]] — wife` and `## Bibliography` / `## Further reading` entries
  with source years (Berl Kagan 1961, Maryland Archives 2014) generated
  false-positive findings — and any one such finding blocked `wai author`'s
  Phase 6 verify. Six well-authored pages were stuck verify-blocked on
  bullets like `- [[Anna Rose Cherlin]] — wife` or bibliography entries
  listing the very Yizkor books the rest of the page cited. Fix adds two
  narrow exemptions in `core/src/checks/citation-drift.ts`:
  (1) `BULLET_RELATION_RE` skips list items whose only content is a
  wikilink + optional short descriptor, IFF the descriptor contains no
  year, date, or second wikilink (so an actual claim smuggled into a
  descriptor — `- [[bob]] — emigrated in 1898` — still flags);
  (2) `SKIPPABLE_H2` skips the body of `## Bibliography` and
  `## Further reading`. `## See also` is NOT in SKIPPABLE_H2 because the
  bullet rule already handles its common shape and section-skip would let
  claims hidden in descriptors slip through. Empirical impact: citation
  findings across the wiki dropped 823 → 737 (−86 false positives); 5 of 6
  verify-blocked pages cleared. Commit `0e1bf25`; covered by 6 new tests
  in `core/test/checks/citation-drift.test.ts`.

- **`wai author` drafts now cite the research-phase findings, not just GEDCOM**
  *(2026-05-16)*. The in-memory evidence drawer was populated once at Phase 1
  and never refreshed, so Phases 3 (outline), 4 (draft-person), and 5
  (draft-episode) passed a stale drawer (`researchNotes: []`) to the harness
  even after Phase 2 had written candidate-claim notes to the talk page via
  the API. The result: every authored page cited only `[^gedcom]` regardless
  of how many Yizkor / Pinkas Hakehillot / JewishGen URLs Phase 2 had
  gathered. The bug masked itself on `--resume` past Phase 1 because the
  fallback re-gathered fresh and picked up the prior run's notes. Fix:
  re-gather after Phase 2 commits its notes, conditional on
  `candidateClaims.length > 0` so the noWeb path and zero-claims path stay
  single-gather. Empirical impact across 24 previously-language-thin slugs
  re-authored: 16 jumped from 1 footnote / GEDCOM-only to 8–25 footnotes
  with non-English language markers (de, pl, he) in body prose. Commit
  `3e08f20`; covered by 5 new tests in `cli/test/commands/author.test.ts`.

- **Page-write API summary cap raised from 200 to 1000 chars**
  *(2026-05-16)*. The page-write endpoint (`PUT
  /api/pages/[slug]`) Zod-validated `summary.max(200)`. `wai author`
  passes both the conventional commit subject AND the pipeline trailer
  (UUID + phase + slug + inputs + sources + guard, ~150 chars on its own)
  as the `summary` field so the trailer ends up in the commit body. For
  slugs with long compound names like
  `mordechai-kalwaryiski-margolis` (30 chars), the combined summary
  reached 221 chars and the route returned HTTP 400: bad-request at
  Phase 3 (outline). Five slugs were stuck on this and couldn't be
  authored. Raising the cap to 1000 unblocks them and leaves headroom
  for additional trailer fields. Commit `85e10ef`.

- **Real-CLI integration tests for harness tool restriction** *(2026-05-15)*.
  New `cli/test/integration/harness.integration.test.ts` exercises the
  actual `claude` binary contract — three tests: (a) `claude --help`
  mentions `--tools` (cheap rename guard), (b) `--tools ""` actually
  blocks Write in the sub-model (verified by checking that a tmp
  sentinel file is NOT created after a prompt asking for one), (c)
  `--tools "WebSearch,WebFetch"` is an allowlist (sub-model still
  can't Write). Skipped by default; run with `WAI_INTEGRATION_TESTS=1`.
  Catches the regression class where claude itself renames the flag
  or changes its semantics — the existing unit tests (with fakeSpawn)
  would silently keep passing, hiding the failure.
- **`wai author` Phase 7 (log) is idempotent on retry** *(2026-05-15)*.
  Phase 7 used to unconditionally append `## Agent log\n\n### <date> ...`
  to the talk page. A second pipeline run on the same slug produced a
  second `## Agent log` header instead of a new dated subsection inside
  the existing section. Now the new `appendLogEntry` helper in `log.ts`
  detects an existing `## Agent log` section, splices the run's new
  `### <date> — pipeline run <id>` subsection into it, and only creates
  a fresh section header when there isn't one yet. Each run still gets
  its own dated subsection as visible history.
- **Stale-bundle warning at `wai` startup** *(2026-05-15)*. New
  `cli/src/bundle-freshness.ts`: at every `wai` invocation we compare
  `cli/dist/wai.cjs` mtime to the newest `.ts` mtime in `cli/src/`; if
  src is newer, stderr gets one line ("`wai: bundle is stale (src newer
  by 5m); run npm run build in cli/`"). Catches the regression class
  where a fix lands in source but isn't compiled — the same class of
  bug that hides regressions in plain sight because the old code keeps
  running. Skips silently when `cli/src/` isn't alongside the bundle
  (npm-installed deployments) and only runs in the bundled-CLI case
  (`process.argv[1]` ending in `.cjs`).
- **Harness adapter caches templates per author run** *(2026-05-15)*.
  The adapter previously re-read `SKILL.md` and the prompt-template
  file from disk on every phase invocation. A mid-pipeline edit
  (in-progress refactor, editor auto-save) would have different phases
  see different instructions. The adapter now caches the
  `(skill, template)` → content pair the first time each is seen and
  reuses the snapshot for subsequent invocations within the same
  adapter (one author run). Different pairs are read independently.
- **Harness sub-claude tool access restricted to template needs** *(2026-05-15)*.
  The harness adapter invokes `claude --print` for each pipeline phase. It
  previously inherited the full default tool set, so the sub-model could
  call `Write`/`Edit`/`Bash`/`Skill`/etc. directly — bypassing the
  orchestrator's intended flow. Observed in the boris-ayzman Phase 4 run
  in this session: when the sub-model emitted conversational prose around
  the JSON, page content had already been written via the `Write` tool,
  leaving both a parse error and a half-modified page on disk. The
  adapter now passes `--tools <list>` per (skill, template): the
  `research-questions` template gets `WebSearch,WebFetch` (which it
  legitimately needs to gather sources) and every other template gets
  `""` (all tools disabled). Unknown skill/template combos also default
  to `""`, so adding a new template can never silently inherit dangerous
  capabilities.
- **`wai author` Phase 3 (outline) is idempotent on retry** *(2026-05-15)*.
  Phase 3 used to unconditionally append the outline text to the talk
  page, so a second run on the same slug — without `--resume`, or after
  a downstream failure — left two near-identical `## Drafting plan`
  sections in the talk body (this happened twice on boris-ayzman in
  this session and had to be cleaned up by hand). The phase now uses a
  new `replaceOrAppendOutline` helper in `outline.ts` that detects an
  existing `## Drafting plan` section and replaces it in place, while
  preserving research notes above and any later sections (Agent log,
  open threads) below.
- **Harness adapter tolerates JSON preamble/trailing text** *(2026-05-15)*.
  Some model invocations emit a brief conversational preamble
  ("Draft writing follows:", "Here is the JSON:") or trailing text
  ("Done!") around the JSON payload, which made `JSON.parse` abort
  mid-pipeline. The adapter previously only stripped markdown code
  fences; it now extracts the first balanced `{...}` or `[...]` from
  the response with a string-aware brace counter that ignores braces
  inside JSON string literals. If no JSON-like structure is present
  (refusal text, error message), the original error surface is
  preserved. This is what kept the `wai author boris-ayzman` Phase 4
  / draft-person call working through completion in this session;
  prior runs aborted at the orchestrator-level parse failure.
- **`runDetectors` helper** *(2026-05-11)* extracted from
  `wai check` into `cli/src/commands/check/run-detectors.ts`. Runs
  the requested detectors against a `RepoState`, optionally applies
  format/schema fixes and reloads, returns structured
  `{ findings, fixedCount }`. Shared between the standalone `wai
  check` command and the author orchestrator's Phase 6 verify
  wiring. The author's verify phase now actually surfaces consistency
  findings against the live data repo instead of a no-op stub.

### Fixed

- **Pipeline-run trailers actually land in commit messages** *(2026-05-11)*.
  Phase commits go through the frontend API (`client.write`,
  `client.note`), which commits server-side using the `summary`
  argument as the commit message. The orchestrator was producing
  trailer commits via a separate `maybeCommit` call that always
  found a clean working tree (API already committed) and silently
  did nothing — so trailers never landed and `wai history`/`wai
  revert`'s `--grep` filters found nothing. The fix bakes
  `pipeline-run`/`phase`/`slug` trailers into the API's `summary`
  argument for phases 3/4/5/7. Phase 2 (research) writes N notes
  via `client.note` and then emits a single `git commit
  --allow-empty` marker commit carrying the trailer. Phase 6
  (verify) writes directly to disk via `runDetectors` and commits
  with explicit paths via a focused `commitDirectChanges` helper.
- **`wai author` Phase 6 verify no longer a no-op** *(2026-05-11)*.
  The verify phase is now wired to the real detector pipeline via
  the extracted `runDetectors` helper. Surfaces the 39 real
  consistency findings (and counting) the existing data already has.

### Changed

- **`changelog-nudge.sh` hook hardened from warning to enforcement for
  feat/fix commits** *(2026-05-17)*. The PreToolUse hook on
  `git commit` previously emitted a soft warning when code files were
  staged without `CHANGELOG.md`. It now BLOCKS the commit
  (`permissionDecision: deny`) when the commit subject is
  `feat:` / `feat(scope):` / `fix:` / `fix(scope):` and CHANGELOG.md
  isn't staged. Other prefixes (`chore:` / `refactor:` / `docs:` /
  `test:` / `release:`) keep the soft-warn behavior. Unparseable
  commit messages (editor buffers, `-F file`) also fall back to the
  soft warn to avoid false positives. Codifies the new CLAUDE.md
  Rule 13 ("Commit hygiene").

- **CLAUDE.md Rule 13 — Commit hygiene** *(2026-05-17)*. Three
  disciplines added to the project's 12-rule template: (a) commit at
  logical units, not at end of session, (b) feat/fix commits MUST
  include the CHANGELOG entry in the same commit (enforced by the
  hardened nudge hook above), (c) push after each batch (local
  commits are not backups). Codifies friction observed in the
  2026-05-16/17 marathon session where ~49 files accumulated
  uncommitted, the CHANGELOG had to be patched up at the end, and
  nothing reached origin until the closing slicing pass.

- **`findDatesInLine` + `normalizeDatesInBody` exported from
  `core/src/format/dates.ts`** *(2026-05-17)*. The `findDatesInLine`
  date-substring matcher previously lived as a private function in
  `format-drift.ts`. Moved to the natural home in `format/dates.ts`
  alongside `normalizeDate`; the format-drift detector imports it
  back. Also adds `normalizeDatesInBody(body)` — rewrites every
  date string in a markdown body into its canonical D Mon YYYY
  form, skipping fenced code blocks and ambiguous slash dates.
  Used by the author orchestrator to canonicalize model-drafted
  prose before writing it to disk, so phase commits don't trip the
  data repo's format-drift pre-commit hook on dates the detector
  would auto-fix anyway. Also fixes a latent build break: the
  citation-drift detector already imported `findDatesInLine` from
  `format/dates.ts`, but the export only existed in working-tree
  changes — `core/` failed `npm test` on import-load until the
  export was committed.

- **`writing-articles` prompt-template iterations** *(2026-05-17)*.
  Tightenings to the four prompt templates the wai author harness
  uses: `draft-episode.md` and `draft-person.md` get output-schema
  and convention guidance tightened plus explicit episode-page
  structure; `outline.md` gets per-episode guidance; `research-questions.md`
  gets output-schema + structured-claims framing. Travels with the
  author-pipeline iteration shipped under "Stale-bundle warning",
  "Harness adapter caches templates", etc.

- **Privacy gate disabled by default** *(2026-05-16)*. New
  `PRIVACY_GATE_ENABLED` flag in `frontend/lib/env.ts` (reads
  `WHOAMI_PRIVACY_GATE`, default off). When off, the page render and
  search API both stop filtering on `derived.privacy.restricted` —
  restricted records render as normal pages and surface in search
  regardless of `--include-living`. All gate code stays in place;
  setting `WHOAMI_PRIVACY_GATE=on` (or flipping the default back to
  `true`) restores the prior behavior. Same posture as auth being
  out of scope while Tailscale ACLs are the access layer.

- **Web research is performed by the harness, not the orchestrator**
  *(2026-05-11)*. Phase 2 used to take `webSearch`/`webFetch`
  callbacks that defaulted to no-ops. The `research-questions`
  prompt template now instructs the harness to use its own
  `WebSearch`/`WebFetch` tools and return structured `claims` with
  source URLs. `webSearch`/`webFetch` fields removed from
  `AuthorOptions`. The reliable-source allowlist (Yad Vashem,
  JewishGen, archive.org, etc.) moved from JS code into the prompt
  where the model evaluates it.

- **`wai author --cohort`** *(2026-05-11)*. Batch mode for the
  article pipeline. v1 selectors: `missing` (all derived records
  without a page) and `file:<path>` (one slug per line; `#` inline
  comments dropped). Writes per-run journal at
  `data/author-runs/<run-id>.jsonl` and `<run-id>-failed.txt` for
  one-command retry. `--resume-run <run-id>` skips completed slugs
  and picks up partial ones at their last completed phase via the
  existing pipeline-run trailer. >25 slugs prompts for `--yes`;
  >100 hard-requires `--yes`. `--parallel N` is parsed but ignored
  in v1 (sequential only; worker-pool optimization deferred).
  `--order chronological|alphabetical|file`.
- **`wai revert`** *(2026-05-11)*. Wiki-style undo built on `git
  revert` filtered by the `pipeline-run` trailer. Modes:
  `wai revert <slug>` (most recent run), `--run <uuid>` (specific
  run), `--phase <p>` (single phase: research/outline/draft/verify/
  log; `draft` matches phases 4 and 5), `wai revert --last` (most
  recent pipeline activity, any slug), `--list` (show runs for slug
  with summaries), `--dry-run`. Produces a single
  `revert(<slug>): <what>` commit per invocation.
- **`wai history <slug>`** *(2026-05-11)*. Render the
  pipeline-related commit log for a page as a markdown table by
  default or JSON via `--json`. Filters: `--no-pipeline` (manual
  edits only), `--pipeline-only` (default). `wai history --recent N`
  shows the last N pipeline commits across all slugs (default 50).
- **`wai author <slug>`** *(2026-05-11)*. Single-slug article-authoring
  orchestrator. Drives seven phases (gather → research → outline →
  draft person → draft episodes → verify → log) via the harness
  adapter, with the pipeline-run trailer baked into each phase's
  commit message in `$WHOAMI_ROOT`. Flags: `--no-web`,
  `--skip-episodes`, `--resume`, `--dry-run`, `--branch`. Pre-flight
  checks reject non-git repos (exit 8), uncommitted changes (7),
  unreachable frontend (14), unsupported `WHOAMI_HARNESS` (11).
  Refuses to fabricate when no usable evidence exists (exit 4). Web
  research is performed by the harness using its own WebSearch/
  WebFetch tools; the orchestrator no longer takes injected
  `webSearch`/`webFetch` deps. Phase 6 (verify) runs the real
  `runDetectors` against the data repo and exits 5 when consistency
  findings remain after format/schema auto-fix.
- **`wai check --include consistency`** *(2026-05-11)*. Fifth detector
  category. v1 covers orphaned footnotes (referenced not defined or
  vice versa), bibliography↔inline cite-vault mismatches, and
  GEDCOM↔page infobox mismatches (born/died/birthplace differing
  from derived YAML and no `corrections:` entry). Self-contradiction
  within a page, cross-page contradictions, and footnote↔claim
  mismatches deferred (`TODO(consistency-v2)` markers in the
  detector). Smoke against the current data repo surfaced 39 real
  findings, most of them GEDCOM birthplace mismatches.
- **Renderer + search filter** *(2026-05-11)*: `pages/<slug>.narrative.md`
  is excluded from `core/src/pages/store.ts:list()` and from
  `core/src/search/rebuild.ts`. The narrative file is an authoring
  input only; it never appears at a URL or in search results.
- **Four prompt templates** added to `writing-articles`:
  `research-questions`, `outline`, `draft-person`, `draft-episode`.
  Together with the `interview` template from Plan 1, all five
  templates referenced by the harness contract are now implemented.
  Smoke verified the harness adapter loads each at ~4–5 KB of
  prepended system-prompt content.
- **Harness adapter — template routing** *(2026-05-11)*: the adapter
  now reads `<skillsDir>/<skill>/SKILL.md` plus
  `prompt-templates/<template>.md` from disk and concatenates them
  via `--append-system-prompt`. Resolves the Plan 1 limitation that
  was passing the literal skill-name string. Fence-stripping handles
  Claude's ```json-wrapped JSON responses.
- **Pipeline-run trailers** *(2026-05-11)*: every phase commit
  carries a structured trailer (`pipeline-run`, `phase`, `slug`,
  `inputs`, optional `sources`, `fabrication-guard`). `--resume`
  reads the trailer from `git log` to skip already-completed phases;
  cold-start (no prior trailer) is treated as a fresh run.
- **`wai narrative <slug>`** *(2026-05-10)*. Edit, ingest (`--file F`),
  or print (`--print`) the per-slug family-narrative file at
  `pages/<slug>.narrative.md`. Each save commits in `$WHOAMI_ROOT`.
  Aborts with exit 7 if the data repo has uncommitted changes; never
  overwritten by the pipeline.
- **`wai transcribe <slug> <audio>`** *(2026-05-10)*. Transcribe via
  the OpenAI Whisper API, copy audio under `assets/audio/<slug>/`,
  append the transcript as a `kind=transcript` research note, commit.
  `--lang en|ru|he|auto` (default auto). `--dir` batch mode processes
  every audio file in a directory; per-file failures journal to
  `data/transcribe-runs/<run-id>-failed.txt` and the command exits 5.
  Requires `OPENAI_API_KEY`; missing key exits 4.
- **`wai interview <slug>`** *(2026-05-10)*. Harness-driven Q&A round.
  Generates targeted questions from gaps in the evidence drawer
  (derived YAML, talk page, narrative file), opens `$EDITOR` with a
  fillable buffer, posts each answered pair as a `kind=interview`
  note. First user of the harness adapter; selectable via
  `WHOAMI_HARNESS` (v1 supports `claude-code`).
- **`wai note --kind <k>`** *(2026-05-10)* accepts new sub-kinds for
  agent-authored notes: `interview`, `research`, `transcript`. The
  existing `human` and `agent` values continue to work.
- **Harness adapter** *(2026-05-10)* — the new LLM-driver class of
  CLI command at `cli/src/harness/`. Defined by an `invoke` contract
  (request → `{ ok, result | error, retryable }`) with response
  validation against a per-template `outputSchema`. v1 ships the
  Claude Code adapter; Codex and OpenCode return exit 11 ("not yet
  supported in v1; use claude-code").
- **`writing-articles` skill** *(2026-05-10)* at
  `plugins/whoami/skills/writing-articles/`. Plan-1 scope ships
  `SKILL.md` (composes with `editorial-guide`, sets the three-stream
  weaving rule and forbidden-prose list) plus the `interview` prompt
  template with a typed `outputSchema`. The remaining four templates
  (`research-questions`, `outline`, `draft-person`, `draft-episode`)
  land alongside `wai author` in Plan 2.
- **`wai doctor`** command and actionable connection errors. Replaces
  `fetch failed` with a probe-based hint that names the alive port and
  the exact `wai config server` command to run; `wai doctor` runs the
  same checks proactively (server reachability, workspace presence,
  CLI/frontend version skew) and `--fix` writes the discovered URL into
  `~/.whoami/config.json`. New `/api/version` route on the frontend.
  (`cli/src/probe.ts`, `cli/src/api-client.ts`,
  `cli/src/commands/doctor.ts`, `cli/src/index.ts`,
  `frontend/app/api/version/route.ts`.)
- **Conflict-resolution schema** for disagreeing sources, addressing
  platform-review P1.5 (`core/src/family/conflicts.ts`,
  `frontend/components/family/sections/conflicts-section.tsx`).
  *In progress.*
- **Red-links flow:** `wai redlinks` CLI command, `/api/redlinks`
  route, `core/src/pages/redlinks.ts`. Addresses P2.2. *In progress.*
- **GEDCOM normalize layer** (`core/src/gedcom/normalize.ts`) for
  cleaner derive output. *In progress.*
- **Places-drift detector** (`core/src/checks/places-drift.ts`,
  `core/test/checks/places-drift.test.ts`, wired into `wai check`)
  — emits `schema` (lat/lon range, alias collisions), `coverage`
  (dead aliases that match no GEDCOM PLAC string), and `data`
  (anachronistic place/date pairs: Soviet Union pre-1922 / post-1991,
  Russian Empire post-1917, Prussia post-1947) findings.
- **Editorial guide: genealogy data quality** section added to
  `plugins/whoami/skills/editorial-guide/SKILL.md` — keeps prose
  consistent with the regime/anachronism rules `wai check` enforces.
- **Prompt-drift smoke test** (`evals/test/prompt-drift.test.ts`)
  — closes platform-review P0.1 by failing the build if any agent
  prompt in `plugins/whoami/` references a v1-removed command or
  any unknown command. Parses `cli/src/index.ts` directly so the
  test stays in sync with the CLI surface. Caught one residual
  drift in `plugins/whoami/agents/editor.md` (`wai search source`
  → `wai search "source"`).
- **Ambiguous-date `?` glyph** in person infobox
  (`frontend/components/directives/infobox-person.tsx`) — when a slash
  date can't be unambiguously canonicalized (`m/d/y` vs `d/m/y`, both
  numbers ≤ 12), the rendered date gets a `?` indicator with a tooltip
  explaining the ambiguity. Closes platform-review P0.3 (the underlying
  `normalizeDate` ambiguity flag and `wai check` audit were already in
  place; this surfaces the signal to the reader).
- **Privacy gate — frontend article gating:** when a person page's
  joined derived record has `privacy.restricted`, the renderer skips
  the body, infobox, categories chips, and info strip; instead it
  shows a `RestrictedNotice` with initials + birth year and a one-line
  unlock recipe. Closes the fourth and final P0.2 sub-item. The skip
  happens before `renderMarkdown` runs so directives like
  `:::infobox-person` can't interpolate from `derived` and leak
  fields.
- **Privacy gate — `wai export --redact-living`:** new standalone
  CLI command (third P0.2 sub-item). Walks `genealogy/derived/` and
  emits a copy under `--out <dir>` where restricted records are
  reduced to `{ initials, birth-year-only }` with all relations and
  events dropped. Pure logic in `core/src/export/redact.ts`,
  file-I/O orchestration in `core/src/export/run.ts` (boundary).
  Pages export is intentionally out of scope for this iteration —
  narrative content can't be safely auto-redacted; a future module
  can drop pages whose joined record is restricted.
  - Drive-by: `export` removed from the v1 REMOVED set since this
    is its v2 reintroduction with a different shape.
- **Privacy gate — search filter:** `wai search` now hides
  restricted records by default. `--include-living` flag (and
  `?include_living=1` API param) opt back in. Filtering happens
  query-time in the `SearchIndex` wrapper; restricted slugs are
  tracked in a side set that round-trips through persist/load via
  a sentinel key. `searchAndJoin` and the `/api/pages/[slug]` PUT
  upsert path both pass the privacy flag through. Closes the second
  of four P0.2 sub-items.
- **Privacy gate (foundation)** for living-person records, addressing
  platform-review P0.2. Adds `Privacy { restricted, reason }` to
  `DerivedRecord` populated by the deriver from the GEDCOM `RESN`
  tag (privacy/confidential/locked) and a "no death + latest possible
  birth year within 110 of today" living-person heuristic. Bounds-aware
  for `BET … AND …` and `AFT` dates so a record like `Bet 1900 And 1925`
  is restricted via the upper bound. Older YAMLs without a `privacy`
  field default to unrestricted via `normalizeDerivedRecord`. Search
  filtering, export-redact command, and frontend gating are upcoming
  follow-on commits.
- **Skip-to-content link** in the root layout
  (`frontend/app/layout.tsx`) — visually-hidden anchor that becomes
  visible on focus and jumps past nav to the page's main content.
  Partial close on platform-review P2.5 (alt text was already correct
  via `AvatarMonogram`'s `alt=""` + `aria-hidden`; `lang=` on
  multilingual name spans deferred — no rendering surface yet).
- **Plans index** at `docs/superpowers/plans/README.md` and project
  `SCOPE.md` / `ROADMAP.md`.

### Changed

- **`RegistryCard` and `GenerationHeader` extracted** from the family-
  tree section files. Six call sites that hand-rolled
  `<Card className="gap-0 overflow-hidden p-0 py-0 shadow-none ring-foreground/12">`
  now wrap a single primitive (`components/family/registry-card.tsx`),
  and the in-card `roman + heading + count` flex header duplicated
  between `DescendantsBlock` and `GenerationBlock` collapses to one
  component in `components/family/sections/shared.tsx`. `GroupedList`
  also routes through `RegistryCard` so the wrapper style has one
  source of truth.
- Family browser section components iterating: descendants, family,
  lifespans, infobox-shell.
- `plugins/whoami/CLAUDE.md` rewritten (in flight; resolves part of
  P0.1 — agent-prompt drift after v2 CLI surface change).
- **Frontend perf pass against Vercel React rules.** Parallelized
  `buildNotesView` (was awaiting `renderMarkdown` per note in series)
  and the family-tree page's slug/talk-body/notes resolution; both
  were serial waterfalls on the render hot path.
  (`frontend/lib/server-services.ts`,
  `frontend/app/family/tree/page.tsx`.)
- **Command palette deferred via `next/dynamic`.** The cmdk-backed
  dialog body now ships in a chunk loaded on first open instead of in
  every page's client bundle; the header button + ⌘K listener stay in
  the main bundle. New `frontend/components/command-palette-dialog.tsx`.
- **`AddNoteForm` author persistence on blur** instead of every
  keystroke. (`frontend/components/research-notes/add-note-form.tsx`.)
- **Misc loop/regex cleanups.** `lib/changelog.ts` no longer parses
  each version H3 twice; `lib/family.ts` merges two passes over the
  page list and hoists the year regex to module scope.

### Fixed

- **`wai sync-gedcom --force` no longer 500s when the deriver output
  is byte-identical.** After a deriver-code update that doesn't move
  the bits (or a re-run after a successful sync), `git commit` was
  failing with "no changes added to commit" and the route returned
  `HTTP 500: sync-failed`. Sync now detects the empty-staging case
  before invoking commit and returns `{ kind: 'no-op', reason:
  'no-output-changes' }`. (`core/src/gedcom/sync.ts`.)
- **CLI surfaces server-side `detail` field in error messages.** The
  frontend's `errorResponse` has been emitting useful `detail` strings
  for a while; the CLI was dropping them, so `wai sync-gedcom` printed
  `HTTP 500: sync-failed` instead of `HTTP 500: sync-failed: nothing
  to commit on working tree`. Same papercut applied to every API
  command. (`cli/src/api-client.ts`.)
- **Note edit-history:** byline spacing and dead empty-events branch
  in note history reconstruction (`1e1ac7b`).

---

## [cli-v2.0.0-pre.1] — 2026-05-19 (package-bump release)

A no-feature release. `cli/` semver bumps `2.0.0-pre.0` → `2.0.0-pre.1`
to capture an end-to-end dependency refresh: TypeScript 5.9 → 6.0.3
across all six packages plus every other dep to its latest. No CLI
source change; no user-facing wiki change. The non-tagged packages
(`core`, `frontend`, `plugins/whoami`, `tools/*`) roll with the repo
as usual — the CLI tag is just the project's release marker per
[AGENTS.md versioning](./AGENTS.md#versioning). One bump held back
upstream (ESLint 9 → 10) with a documented unblock condition.

### Changed

- **TypeScript 5.9 → 6.0.3 across all six packages (`core`, `frontend`, `cli`, `evals`, `tools/wiki-preview`, `tools/wikitext-to-md`).** The bump itself is one-line per `package.json` (`typescript: ^5.5.0` / `^5` → `^6.0.0`) but TS 6 ships several default-shifts and deprecations that touched the configs. Two real edits: (a) `types: ["node"]` added to `core/tsconfig.json`, `cli/tsconfig.json`, `evals/tsconfig.json` — TS 6 changed the default `types` field from "every `@types/*` in `node_modules`" to `[]`, and these three packages directly import from `node:test`/`node:fs`/`node:assert/strict` etc.; without the explicit list TS6 emitted ~210 `TS2591: Cannot find name 'node:test'` errors against test files. The other three packages compiled clean without it (Next's `next-env.d.ts` pulls node types via reference; `tools/wiki-preview` and `tools/wikitext-to-md` happen to satisfy whatever heuristic survives). (b) `baseUrl: "."` removed from `cli/tsconfig.json` and `tools/wiki-preview/tsconfig.json` — TS 6 deprecates `baseUrl`; `paths` resolves relative to the tsconfig directory by default. Scanned for the other patterns TS 6 rejects (legacy `module Foo {}` namespaces, `assert {}` import attributes, `outFile`, `downlevelIteration`, `moduleResolution: classic|node`, `esModuleInterop: false`, `target: es5`, `no-default-lib` reference directives) — zero hits in the codebase. AGENTS.md gains a "TypeScript 6 conventions" subsection covering the `types: ["node"]` trap, the `baseUrl` deprecation, `with`-not-`assert` for import attributes, `namespace`-not-`module`, and the new stdlib (`Map.getOrInsert` / `RegExp.escape`) worth reaching for.

- **Dependency refresh: everything pinnable to latest, one upstream block.** Same-session follow-up to the TS 6 bump. Per-package outcomes:
  - **`frontend`** — `next` 16.2.4 → 16.2.6 (patch, exact-pinned in package.json), `react` / `react-dom` 19.2.5 → 19.2.6 (exact-pinned), `eslint-config-next` 16.2.4 → 16.2.6 (exact-pinned), `@base-ui/react` 1.4.1 → 1.5.0, `tailwindcss` + `@tailwindcss/postcss` 4.2.4 → 4.3.0, `tailwind-merge` 3.5.0 → 3.6.0, `lucide-react` 1.14.0 → 1.16.0, `zod` 4.4.2 → 4.4.3, `@types/node` 24.12.2 → 25.9.0 (major), `tsx` 4.21.0 → 4.22.3.
  - **`core` / `cli` / `evals`** — `@types/node` 24 → 25 (major), `tsx` 4.21 → 4.22.3.
  - **`tools/wiki-preview`** — `express` 4.22.1 → 5.2.1 (major), `@types/express` 4 → 5 (major), `remark-directive` 3 → 4 (major), `@types/node` 24 → 25 (major), `tsx` 4.21 → 4.22.3. `src/server.ts` needed zero edits — the existing Express surface (`app.get(':slug', async handler)`, `req.params`, `res.type/send/status`) is unchanged in Express 5; path-to-regexp v6's syntax changes (catchalls, optional groups) don't apply because the server only uses `:param` placeholders. Typecheck clean against the new `@types/express` 5 ambient types.
  - **`tools/wikitext-to-md`** — `better-sqlite3` 11.10.0 → 12.10.0 (major), `@types/node` 24 → 25, `tsx` 4.21 → 4.22.3. Native bindings rebuild during install; the surface used (`new Database(path, { readonly: true })` + `db.prepare(sql)`) is stable across the v11→v12 jump.
  - **`eslint` 9 → 10 in `frontend` — blocked upstream, held at ^9.** Attempted the bump; npm `ERESOLVE` warnings (peer-dep override) predicted breakage; lint crashed with `TypeError: contextOrFilename.getFilename is not a function` from `eslint-config-next/node_modules/eslint-plugin-react/lib/util/version.js:31`. ESLint 10 removed the deprecated `context.getFilename()` API, and the `eslint-plugin-react` version bundled inside `eslint-config-next` 16.2.6 hasn't migrated to `context.filename` yet. `eslint-config-next`'s peer dep advertises `eslint: ">=9.0.0"` but the bundled plugin can't deliver. Re-attempt when `eslint-config-next` ships a release that bumps its bundled `eslint-plugin-react`. No code change needed today.

### Why this matters

- **TS 7 readiness with zero migration cost.** TS 7 is the [native (Go) port](https://devblogs.microsoft.com/typescript/typescript-native-port/) targeting ~10× compile speed. The deprecations TS 6 surfaces are precisely the patterns TS 7 will refuse — legacy `module Foo {}` namespaces, `assert` import attributes, `outFile`, `baseUrl`, `moduleResolution: classic|node`. This codebase had zero hits on any of them; the future `^6.0.0 → ^7.0.0` bump becomes a one-line change in six `package.json` files instead of a project-wide audit.
- **New TS-6 stdlib that shortens existing code.** Two concrete sites available when those files are next touched: `core/src/gedcom/inject-name-tran.ts:46-47` (current `if (!byRecord.has(e.record)) byRecord.set(e.record, []); byRecord.get(e.record)!.push(e);` collapses to `byRecord.getOrInsert(e.record, []).push(e);` under `Map.prototype.getOrInsert` — one line, no `!`, no double lookup); `cli/src/commands/revert.ts:258` (same shape). Not refactored here; documented for the next visit.
- **Express 5 small robustness win in `tools/wiki-preview`.** Express 5 [auto-forwards rejected promises](https://expressjs.com/en/guide/migrating-5.html) from async route handlers to error middleware. The server has one async handler (`app.get('/wiki/:slug', async (req, res) => …)`); on Express 4 a rejected promise from `readFileSync` or `pipeline.process` would have been silently swallowed.
- **Documented unblock condition for ESLint 10.** The attempted bump pinpointed the holdup specifically: `eslint-config-next` 16.2.6 bundles an older `eslint-plugin-react` calling the removed `context.getFilename()`. When `eslint-config-next` ships its next bundled-plugin refresh, the ESLint 10 retry is a one-line bump — and the failure mode to grep for is on file.
- **AGENTS.md gains a TypeScript 6 conventions section.** Durably tells future agents about the `types: ["node"]` trap, the `baseUrl` deprecation, `with`-not-`assert` for import attributes, `namespace`-not-`module`, and the new stdlib worth reaching for. Next agent adding a new tsconfig won't re-discover the `TS2591: Cannot find name 'node:test'` failure mode from TS 6's new `types: []` default.
- **Hygiene: stay on currently-maintained majors.** Security patches and ecosystem fixes land on the latest line; falling further behind makes them progressively harder to absorb. Captures `@base-ui/react` 1.5.0, `tailwindcss` 4.3.0, `tailwind-merge` 3.6.0, `lucide-react` 1.16, `remark-directive` 4, `better-sqlite3` 12, `tsx` 4.22.3, plus patch-level fixes on `next` 16.2.6, `react` 19.2.6, `zod` 4.4.3.

### Not changed

- **No user-facing wiki change.** Interactive tree, articles, search behave identically. `next build` ships 766/766 static pages across all 24 routes.
- **No runtime perf change.** TS 6 is the bridge to TS 7's compile-speed win; on its own, TS 6 is roughly parity with 5.9. None of the other bumps are perf-targeted.
- **No new features.** Pure deps work. The two `### Added` entries above this section (`/[locale]/roadmap`, home-page nav link) are pre-bump work that landed earlier in the session and remain under `[Unreleased]` until a later release captures them.
- **No CLI source change.** The `wai` binary behaves identically; the version bump is purely the release marker for the dep refresh.

### Verification

- `tsc --noEmit` clean in all six packages.
- Test suites green: core 613/613, frontend 89/95 (6 pre-existing skips), cli 315/318 (3 pre-existing skips), evals 76/76, wikitext-to-md 98/101 (3 pre-existing skips); wiki-preview has no test suite.
- `next build` succeeds, 766/766 static pages across all 24 routes (Next 16.2.6 + React 19.2.6).
- `cli` esbuild bundle produces `dist/wai.cjs` cleanly.
- `wiki-preview` Express 5 runtime: indexes 283 pages, listens on configured port.
- `frontend npm run lint` has 9 pre-existing problems (`eslint-plugin-react-hooks` lockfile-confirmed identical at 7.1.1 pre and post bump; no new lint regressions).

---

## [v2.0.0-pre] — 2026-05-01 to 2026-05-07

The v2 markdown migration. A fundamental rewrite of the platform from
MediaWiki-coupled architecture to a markdown-first, local-file system.
Not yet tagged; current `package.json` versions are placeholders
(`core: 0.1.0`, `frontend: 0.1.0`, `cli: 0.1.0`, `evals: 2.0.0-pre.0`).

### Added — platform foundations

- **Markdown page store** (`core/src/pages/`) — `PageStore.read/write/list/softDelete`
  backed by the filesystem, with `simple-git` wrapping
  add/commit/history/restore, atomic temp+rename writes, and a
  per-slug async mutex that serializes concurrent writes
  (`716d9e9`, `1435938`, `b8b9dc9`, `886e081`).
- **Page types and zod-validated frontmatter schema** — `Page`,
  `PageMeta`, slug regex/assert helper, gray-matter parse + serialize
  round-trip (`b2453a2`).
- **Soft-delete semantics** — `PageStore.softDelete` moves pages to
  `_archived/` with a `deletedAt` timestamp, leaving git history
  intact.
- **Atomic-write rollback** — failed git commits restore the file to
  last-good state and surface the error end-to-end.
- **Next.js 16 App Router frontend** — fresh scaffold with Tailwind v4,
  shadcn/ui (button/card/alert), `@core/*` tsconfig path alias, and
  `allowedDevOrigins` config so dynamic chunks load through Tailscale
  (`40fa96e`, `8484d4d`, `2a52a32`).
- **Index page and `[slug]` RSC route** — full-list home, server-rendered
  article pages via `core/pages` + remark, Tailwind typography for prose.
- **Wikilink resolver** with title + alias index.
- **Markdown-to-HTML pipeline** — directives, sanitizer,
  `hast-util-to-jsx-runtime` React rendering, derived-data merge for
  infoboxes.
- **HTTP API surface** — `GET/PUT/DELETE /api/pages/[slug]` (PUT is
  upsert with default frontmatter), `POST /api/login` /
  `POST /api/logout` (later removed), `POST /api/gedcom/sync`,
  `GET/POST /api/gedcom/recite`, `POST /api/notes/...`,
  `POST /api/migrate`, `POST /api/search/rebuild`, `/healthz`.
- **`wai` CLI rewritten as a pure HTTP client** — `toSlug` canonicalizer,
  fetch-based `ApiClient` with typed error mapping, server URL config
  chain (env → `~/.whoami/config.json` → default), body-input helpers
  (file / stdin / `$EDITOR`), commands `read`, `write`, `create`,
  `edit`, `delete`, `recite`, `sync-gedcom`, `healthz`, and a new
  dispatcher.
- **Schema-migrations runtime** — `schemaVersion` field added to
  `PageMeta` and zod schema; `peekSchemaVersion` helper; `parsePage`
  owns the migration chain and composes a registry of per-version
  migrations; strict write rule rejects stale or future versions in
  the page store; `runMigrateOnDisk` orchestration; `POST /api/migrate`
  route; `wai migrate` command; 409 responses surface stale/future
  writes with `slug + onDisk + current`; SSR error page when reading a
  future-schema-version file (`cf815fe`, `f502170`, `4a512e3`,
  `a65abc5`, `b232a17`, `38582a6`, `b66241c`, `bf5f730`, `47db2f1`,
  `b5cabce`, `46ed278`).
- **Command palette + UI primitives** — `cmd+k` palette; badge, roman
  util, command/dialog/input-group/input/textarea shadcn primitives.

### Added — family graph

- **GEDCOM module** (`core/src/gedcom/`) — strict UTF-8 5.5.x parser
  that rejects ANSEL; derives name, birth, death, parents (FAMC),
  spouses & children (FAMS), residences, occupations, source citations
  into one YAML record per individual.
- **`syncGedcom` pipeline** — parse + derive + diff + commit + append
  snapshot manifest (no-op on duplicate hash); `writeDerivedYaml` and
  `hashGedcomFile` helpers; backfills `derived/` when a Plan B snapshot
  exists but `derived/` is empty.
- **Recite drift detection** — `reciteDrift` walks pages and diffs
  cited-vs-current sources via git; `applyRecite` advances stale
  snapshot pointers with a regex pass.
- **`wai sync-gedcom`, `wai recite`** — CLI front-ends for the GEDCOM
  and recite endpoints.
- **Family browser #1 — siblings & cousins** — cohort module computing
  full siblings, half-siblings, and first cousins with paternal/maternal
  split; surfaced on the family tree view (`5d21828`).
- **Family browser #2 — descendants** — descendants walker with depth,
  multi-generation, missing-record, and cycle handling; rendered as
  descendants panel.
- **Family browser #3 — relationship calculator** — BFS+LCA with human
  labels for parent/child, grandparent, sibling, aunt/uncle, first
  cousin, removed cousins, missing-record cases; shown in the person
  header (`41326f8`).
- **Family browser #4 — coverage prompts** — lineage coverage and
  research-frontier panel surfacing tree gaps.
- **Family browser #5 — lifespan timeline** — GEDCOM year parser
  handling `ABT`, `BEF`, `AFT`, `BET ... AND ...` qualifiers;
  horizontal lifespan bars on the family tree page.
- **Family browser #6 — portraits & monogram avatars** — initials
  helper, avatar monogram component, portrait paths threaded through
  `PageMeta` and family view; monogram fallback on tiles, rows, and
  lifespan bars.
- **Family browser #7 — search type facets** — person/family/event/
  tree/meta facet filters on `/search`.
- **Family browser #8 — places & map** — birthplace grouping by region;
  Leaflet map joined with curated `genealogy/places-coords.yml`;
  unmapped fallback list.
- **Family browser #9 — shareable relationship links** — `?perspective=`
  / `?from=&to=` query params drive the relationship calculator from
  URL; ancestor gender derived from the last hop (not the first) for
  correct labels (`d854942`).
- **Family tree spine & polish** — initial browseable tree, hardening,
  and refactor splitting `/family/tree` into per-section components.

### Added — search & discovery

- **FlexSearch index** — doc-builder flattens `Page` + `DerivedRecord`
  into searchable fields with weighted scoring; persisted as JSON via
  atomic write; lazy-loaded singleton with rebuild fallback.
- **Index freshness** — search index updates on every page write/delete
  and GEDCOM mutation; `searchAndJoin` extracted as the shared query
  path.
- **`/search` UI and API** — `GET /api/search?q=&limit=` returning
  ranked slugs joined with summaries; search form + result list page.
- **`wai search`** CLI command hitting `/api/search`.
- **Search index rebuild system** — `isSearchIndexStale` probe,
  `rebuildSearchIndexFromDisk` returning `{pages, ms}`, dev-mode
  auto-rebuild on stale state, `POST /api/search/rebuild`,
  `ApiClient.rebuildSearch`, and `wai rebuild-search` command.

### Added — research notes

- **Talk-page research notes** with stable per-note identity and full
  lifecycle, stored as trailing HTML comments on `## Research notes`
  bullets:
  - `parseResearchNotes` parser, note types & error classes, with
    section-boundary and round-trip coverage (`5c2640e`).
  - `appendResearchNote` writes a trailer with `id` / `by` / `kind` /
    `at`; id generator emits `n_` + 8 base32.
  - `editResearchNote` records a last-edit timestamp; `softDelete`
    and `restore` round-trip cleanly.
  - On-disk wrappers `appendNoteOnDisk` (returns id), `editNoteOnDisk`,
    `softDeleteNoteOnDisk`, `restoreNoteOnDisk`; wire-error mapping.
  - HTTP endpoints — `POST /api/notes`, `PATCH/DELETE /api/notes/[slug]/[id]`,
    `POST /api/notes/[slug]/[id]/restore`.
  - CLI — `wai note --edit/--delete/--restore/--list/--as-agent` and
    matching `ApiClient` methods.
  - Structured panel UI — `buildNotesView`, `NoteItem`,
    `EditNoteForm`, relative-time formatter for bylines, full
    edit/delete/restore controls.
- **Per-note edit-history modal** — core reconstructor walks each
  note's git versions to produce an audit trail; modal renders the
  full per-note history (`73f33aa`, `0219687`).

### Added — agent surface

- **Frontend directive components** (shadcn-based, derived-data aware)
  — admonition (Open / Closed / Superseded), blockquote, cite-vault,
  cite-message, dialogue, columns-list, infobox-company (structured
  fields), infobox-person (merges `genealogy/derived/<record>.yml`);
  replaces wikitext-era CSS classes.
- **`tools/wikitext-to-md` converter** — one-shot MediaWiki migration
  tool: reads post-cutoff pages from legacy MediaWiki SQLite,
  slugifies titles, renders `PageMeta` as YAML frontmatter, transforms
  `[[Category:X]]`, `#REDIRECT`, `<ref>` footnotes, wikitables (with
  HTML fallback for merged cells), bold/italic, ATX headings, h1, and
  every wiki template (`Cite vault`, `Cite message`, `Infobox
  person/company`, `Dialogue`, `Blockquote`, `Open/Closed/Superseded`,
  `Gap`, `Columns-list`) into markdown directives; pipeline composed
  in `convertPage`; CLI orchestrates db read → conversion → redirect
  rewrite → on-disk write.
- **`tools/wiki-preview`** — local renderer for migrated pages.
- **GEDCOM hash + snapshots manifest** — `.ged` file content is hashed
  and appended to the snapshots manifest on every import.
- **Editor-agent prompt updates** — drops dead `wai` commands, switches
  examples to markdown directives, adds note-trailer + retraction
  guidance; editorial guide rewritten end-to-end.
- **Eval harness rebuilt for the markdown world** — `parsePageContent`
  extracts directives / headings / wikilinks; harness runs against
  Next.js + a temp git repo; reference, accuracy, completeness,
  citation, and citation-resolver graders all consume markdown
  directives; runner and agent prompts rewritten for the new `wai`
  surface.

### Changed

- **Auth removed** — bcrypt password hashing, `users.json`,
  sqlite-backed sessions, CSRF, sliding-window rate limiter, and
  `AuthService` were built out for Plan C, then removed within hours
  of shipping when the project committed to Tailscale ACLs as the
  only access layer (`309619a`).
- **Frontend rewritten as RSC** — article pages and index render
  through React Server Components against the `PageStore`, replacing
  the MediaWiki-era client architecture.
- **CLI rewritten as a thin HTTP client** — MediaWiki client and 14
  legacy commands removed; CLI now speaks only to the local Next.js
  server (`0830803`).
- **Per-package `AGENTS.md` adopted**, with `CLAUDE.md` aliasing via
  `@import`; the "stranger test" for user-data vs. project-data added
  to root `AGENTS.md`.

### Removed

- **MediaWiki-based desktop app** — entire `desktop/` package retired;
  doc references swept (`b33b9fb`, `c4af8e2`).
- **Marketing site** (`web/`) (`4dd7ddd`).
- **App-layer auth** — bcrypt + sqlite-session machinery removed
  shortly after it shipped; Tailscale ACLs are the access layer
  (`309619a`). Re-adding auth is bookmarked, not scheduled.
- **MediaWiki-coupled CLI commands** — `task`, `source`, `snapshot`,
  `talk`, `auth`, `archive`, `vault`, `update`, and the rest of the
  v1 surface deleted along with the old wiki client; v2 surfaces only
  the HTTP-client commands listed above (`0830803`).
- **Legacy `.directive-*` CSS** — directives now own their styling via
  React components.

### Fixed

- **Page-title underscore normalization** when matching redirects in
  the wikitext-to-md CLI.
- **Wikitext h1 (`= text =`)** correctly handled in body content;
  body-less directives emit as leaf (`::name`) rather than container
  (`:::name:::`).
- **Footnote placement** — `<ref>` definitions now anchor to
  `<references />` location and empty headings are pruned.
- **Atomic write surfaces git commit failures** end-to-end instead of
  silently rolling back.
- **Ancestor gender** in relationship-label rendering is derived from
  the last hop (not the first), fixing wrong gendered labels on
  multi-hop ancestors (`d854942`).
- **Tailscale dev origin** allowed so dynamic chunks load through
  Tailscale; default restored after a regression.
- **GEDCOM derived backfill** — `derived/` is repopulated when a
  Plan B snapshot already exists but the directory is empty.
- **409 responses on schema-version writes** include
  `slug + onDisk + current` so the CLI can show actionable errors
  (`b5cabce`).
- **Note edit-history** — byline spacing and dead empty-events branch
  in history reconstruction (`1e1ac7b`).

### Notes

- The v2.0.0 tag has not been cut. When it is, every package version
  in `package.json` should be reconciled — see `AGENTS.md` versioning
  policy. Current values are placeholders.

---

## CLI v1.x — pre-v2 (Feb–Mar 2026)

Tagged releases of the MediaWiki-coupled CLI. These predate the v2
markdown migration; the commands listed in their changelogs no longer
exist in the v2 CLI surface.

### [cli-v1.2.1] — 2026-03-26

- Improved CLI auth messages (#112).

### [cli-v1.2.0] — 2026-03-24

- Unified `credentials.json` between desktop and CLI (#106).
- Obfuscated password input; skip server prompt in `wai auth login` (#105).

### [cli-v1.1.2] — 2026-02-22

- Suppressed `DEP0169` deprecation warning from `proxy-from-env` (#61).

### [cli-v1.1.1] — 2026-02 (skipped public release notes)

- `tough-cookie` upgrade to v5.1.0; outdated type definitions removed (#54).

### [cli-v1.1.0] — 2026-02-16

- Glossary page added to `/docs` (#42).
- Renamed `archive` to `vault` (#43).
- Fixed silent `wai snapshot` write failures (#39).
- Moved CLI archive to Application Support and included in backup (#37).
- Replaced XML export/import with full wiki backup (#32).
- Hardened `write` command and improved CLI error reporting (#30).

### [cli-v1.0.6] — 2026-02

- Fixed CLI install and auto-update (#26).

### [cli-v1.0.5] — 2026-02

- Task-queue system supported in CLI and wiki (#25).

### [cli-v1.0.4] — 2026-02

- Improved `snapshot` command (#22).
- `gh`-based CLI auto-update (#18).
- Improved import/export CLI (#20).

### [cli-v1.0.3] — 2026-02

- Updated `source list` CLI command (#17).

### [cli-v1.0.2] — 2026-02

- CLI release logic + skill (#10).

### [cli-v1.0.1] — 2026-02-08

- Initial public release of the `wai` CLI.

---

## Desktop v1.x — retired

The MediaWiki-based desktop app shipped tags `desktop-v1.1.0` through
`desktop-v1.2.4` (2026-02 through 2026-04). Removed in `b33b9fb`
(May 2026) when the platform moved to a markdown-first architecture.
Tags are kept as historical record; the code is not in the tree.

---

## See also

- [`docs/SCOPE.md`](./docs/SCOPE.md) — what's in/out of scope
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — what's next
- [`docs/superpowers/plans/README.md`](./docs/superpowers/plans/README.md) — implementation plan index
- [`docs/reviews/`](./docs/reviews/) — platform reviews
