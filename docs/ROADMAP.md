# Roadmap

> Strategic sequencing for whoami.wiki. Sourced from the
> [May 2026 platform review](./reviews/2026-05-07-platform-review.md),
> the work shipped since, and the contribution-track design conversation
> of 2026-05-19.

**Last updated:** 2026-05-21 (cut `cli-v2.0.0`, the first stable v2 CLI
tag; the ~1,030-line CHANGELOG `[Unreleased]` backlog moved into the
release section. Same-day P2.20 reconciliation — Render deployment +
Descope auth are live; the stale "re-add app-layer auth" parking-lot row
was removed and the reading-track audience widened to the Render replica)
**Cadence:** revisit at the end of each completed track milestone, or when
a new review document lands. Status lines are the source of truth — keep
them honest.

This roadmap is organized as **three parallel tracks plus a cross-cutting
infrastructure lane**. The wave-based structure from the 2026-05-07
review was overrun by reality — most of what shipped between 2026-05-07
and 2026-05-19 was unplanned (multilingual, GEDCOM 7, article pipeline,
drift detectors). Track-based organization reflects how the work
actually clusters and lets the user pick which track to work on each
session, rather than forcing one linear sequence.

**Status icons:** ⏳ ready · 🚧 in flight · 🔧 closing · ✅ shipped · ❌ cancelled · 🅿️ parked.

---

## The three tracks

**Reading track** — the wiki as a thing to browse. Audience: Steven,
read-only Tailscale guests, and invited family members on the Render
replica. Goal: make the accreted reading surface
(home dashboard, article page, family tree, search) coherent and dense
without crossing into Apple-style sparseness.

**Authoring track** — AI agents producing articles. Audience: the
agent itself (Claude Opus 4.7 today). Goal: harden the pipeline that
shipped fast over April–May 2026 (`wai author`, cohort, revert,
history) into something production-grade.

**Contribution track** — human family members feeding raw evidence
into the wiki via the browser. Audience: living family informants
(grandma, parents, aunts, uncles) in any of en/ru/uk/he. **Defined
2026-05-19**, see the [plan-of-plans](./superpowers/plans/2026-05-19-family-contribution-mode-roadmap.md).
This is the current strategic priority.

**Infrastructure & hygiene** — cross-cutting items that don't belong
to a single track (privacy gate, CLI release, test strengthening).

---

## Status snapshot — 2026-05-21

Working tree is clean. The naturally-next actionable item in each
track:

| Track | Next item | Lift |
|---|---|---|
| **Contribution** | **E.0** — Identity & session state | M |
| **Reading** | **P2.3** — merge overlapping residence/occupation intervals in derive | S |
| **Authoring** | Cost telemetry on `wai author` | S |
| **Infrastructure** | **P2.13** — strengthen messages-parity test | S |

Three of those four are S/XS — the contribution-track E.0 is the only
M item near the top. A reasonable sequencing for the next ~2 weeks:

1. ~~Reading-surface audit + all header/composition fixes~~ ✅ shipped 2026-05-19–20; the reading-track cleanup is closed out (audit composition fixes, P2.11, P2.10, P2.7)
2. Cost telemetry on `wai author` (S, info-gathering for Authoring track)
3. Begin E.0 in earnest

---

## Track: Contribution (current strategic priority)

> Browser-side contribution of raw evidence (text, audio, structured Q&A)
> from family informants in en/ru/uk/he. Three modes from one session
> model: interview-with-Zina, interview-with-Sam, self-edit-as-Bella.
> Defined in the [contribution mode roadmap](./superpowers/plans/2026-05-19-family-contribution-mode-roadmap.md).

| Status | Item | Lift | Notes |
|---|---|---|---|
| ⏳ ready | **E.0** Identity & session state | M | `people.yml` opt-in registry, `viewer`+`subject` session model (hybrid persistence: cookie viewer, session subject), identity picker, name-match heuristic |
| ⏳ ready | **E.1** Browser write API with viewer+subject attribution | M | Extend `/api/notes`; multi-modal payloads; living-person opt-in check |
| ⏳ ready | **E.2** Browser audio recording + asset storage | M | MediaRecorder; `~/whoami/assets/audio/`; extends `MediaRef[]` with `kind:'audio'`. **Absorbs P1.7** (media as first-class) and **P2.8** (first non-trivial schema migration) |
| ⏳ ready | **E.3** Living-person audio gate (extends P0.2) | S | Ships paired with E.2. Restricted audio doesn't render or appear in search |
| ⏳ ready | **E.4** Talk-page `## Interview questions` convention + parser | S | Reuses talk-thread infrastructure from P1.9 |
| ⏳ ready | **E.5** Reverse-direction translation (other → EN) | M | **Conceptual hinge** — non-EN contributions feed the article pipeline. New `wai translate-note` or extension of `wai i18n sync` |
| ⏳ ready | **E.6** `/[locale]/interview/` route — MVP completes | M | Cohort-driven relevance filter (reuses `core/src/family/cohort.ts`); text + audio answer; submits to E.1 |
| ⏳ ready | **E.7** Accessibility-grade UI shell | M | Large fonts, icon-first, "Question N of M" wizard, optional TTS read-aloud. Tune from real-session friction |
| ⏳ ready | **E.8** RTL audit for forms + audio player + interview shell | S | Hebrew-speaking contributors are first-class; audit after E.7 settles components |
| ⏳ ready | **E.9** Audio transcription via local whisper.cpp | L | Deferred until corpus of recordings justifies setup. Local-first per privacy posture |

**MVP = E.0–E.6.** ~6 weeks if it's the only thing in motion.
**Full track = E.0–E.9.** ~10 weeks.

This track gives **P3.1** (research frontier as central UI metaphor)
its first concrete instantiation — the interview surface *is* the
frontier.

---

## Track: Reading

> The wiki as a thing to browse. Article page, family tree, search,
> home dashboard. After P1.10 (loading/error/empty states) shipped on
> 2026-05-19, the article page has accreted 10+ visible components.
> An audit gates further reader-side work.

| Status | Item | Lift | Source |
|---|---|---|---|
| ✅ shipped | **Reading-surface audit** | S | Shipped 2026-05-19 — [`docs/reviews/2026-05-19-reading-surface-audit.md`](./reviews/2026-05-19-reading-surface-audit.md). Inventoried home dashboard (8 blocks), article page (10 blocks), and family-tree page (10 sections). Identified 4 redundancies (chart vs lineage; freshness "talk:" link vs inline panel; intentional dual-surfacing of frontier; person-header vs sticky chrome), 3 mis-prioritizations (article-header visual weight; chart-before-H1; home-nav 5-link equality), 3 cut candidates (`MediaSection`, article type label, `/index` header chrome) and 3 demote candidates (`CoverageSection` → stat; `ConflictsSection` → bottom; categories pills → muted line). Sequenced 8 XS/S composition fixes + 1 M-lift localization pass that unblock Pedigree T/D, P1.4, P2.3/7/11/12 to proceed in any order. |
| ✅ shipped | **`/[locale]/roadmap` site page** | S | Shipped 2026-05-19. `frontend/lib/roadmap.ts` parses `docs/ROADMAP.md` into typed sections (snapshot, track, parking, cut, shipped, narrative) with per-section item counts and aggregate totals; mirrors the `lib/changelog.ts` cache + render pattern. Route at `frontend/app/[locale]/roadmap/page.tsx` with side-rail index and section blocks coloured by kind. Chrome translated to all 4 locales under `Page.Roadmap` (24 keys × 4); body stays English. `.roadmap-prose` table-first typography added to `globals.css`. 9 parser tests; full frontend suite 89/89 green. |
| ⏳ ready | **Pedigree follow-on T** Talk-page candidates format + parser | M | [Pedigree follow-on T](#pedigree-chart-follow-ons-extends-p11) — `## Candidates` section in talk files; parser in `core/`; `wai candidates list <slug>` CLI surface |
| ⏳ ready | **Pedigree follow-on D** Research drawer | M | [Pedigree follow-on D](#pedigree-chart-follow-ons-extends-p11) — side-panel `Sheet` opened on chart node click. Depends on F (shipped) + benefits from T. **This is the chart's transition from "view of state" → "entry point for research."** |
| ⏳ ready | **P1.4** Search facets (place + decade), re-spec'd with locale awareness | M | [Review §P1.4](./reviews/2026-05-07-platform-review.md#p14--search-lacks-faceting-and-reads-as-flat). Re-spec post-multilingual: locale facet, place facet via `places-coords.yml`, decade facet via existing date parser |
| 🔧 partial | **P2.5** Per-locale `lang=` on multilingual name spans | S | [Review §P2.5](./reviews/2026-05-07-platform-review.md#p25--accessibility-gaps). Skip-to-content + alt text shipped; `lang=` deferred. Natural follow-on now that per-locale name renders exist |
| ⏳ ready | **P2.3** Merge overlapping residence/occupation intervals in derive | S | [Review §P2.3](./reviews/2026-05-07-platform-review.md#p23--place-residence-overlaps-not-deduplicated) |
| ✅ shipped | **P2.7** Mobile density on `/family/tree` (collapse Lifespans/Descendants by default `< sm`) | S | Verified-shipped 2026-05-20. The `MobileDisclosure` client island (`components/family/sections/mobile-disclosure.tsx`) already renders `DescendantsSection` + `LifespansSection` collapsed by default below `sm` with a localized show/hide toggle — the disclosure win [Review §P2.7](./reviews/2026-05-07-platform-review.md#p27--mobile-density-on-the-tree-page) called for. It landed in earlier frontend work without being recorded against this row. The review's secondary "shorten the header back-button area" sub-part is moot — the tree page's sticky header is already a single compact `py-2.5` row. |
| ✅ shipped | **P2.9** `next-intl` Link sweep across `frontend/` | S | Shipped 2026-05-19 alongside the article-chrome localization pass (audit item 9). All 21 `import Link from 'next/link'` callsites across `app/` and `components/` swapped to `import { Link } from '@/i18n/navigation'` — the locale-preserving wrapper from `frontend/i18n/navigation.ts`. Mechanical change; the Link API is drop-in. Suite 89/89 → 88/88 green (one test deleted as part of the formatTalkLabel removal). |
| ✅ shipped | **P2.10** `<bdi>` sweep on family-tree components for RTL | S | Shipped 2026-05-20. Wrapped every user-generated name, place, and date string in `<bdi>` across 10 `components/family/` files — the `AncestorTile`/`PersonRow`/`LifespanBar` leaf components plus `PersonHeaderSection`, `PlacesSection`, `CoverageSection`, `ConflictsSection`, `FamilySection`, `BirthplacesMap`, `PedigreeNode`. Closes the bidi-isolation gap the [reading-surface audit](./reviews/2026-05-19-reading-surface-audit.md) flagged. The folio GEDCOM-ID — the one interpolated string the leaf-component sweep couldn't reach — was isolated 2026-05-20 via a `t.rich` `<id>`/`<bdi>` rich tag in all four `folio` messages. |
| ✅ shipped | **P2.11** Hide home-page browse-all footer when `live.length === 0` | XS | Shipped 2026-05-20. The home footer's `Browse all N articles →` link is now gated on `live.length > 0` (`frontend/app/[locale]/page.tsx`), mirroring the existing `talk.length > 0` gate; an empty wiki no longer advertises a dead `Browse all 0 articles →`. `Changelog`/`Roadmap` meta links stay unconditional. |
| ⏳ ready | **P2.12** `/[locale]/gaps` listing route | S | docs/superpowers/specs/2026-05-18-home-research-dashboard-design.md |
| ✅ shipped | **P2.17** Mobile-friendliness baseline | S | Shipped 2026-05-19 (`dcf96a7`). Explicit `viewport` export with `viewport-fit=cover`; `env(safe-area-inset-*)` padding on `<body>` for notched phones; iOS auto-zoom-on-focus suppressed by raising inputs/textarea/select to 16px below the `sm` breakpoint; wide tables (`.changelog-prose`, `.roadmap-prose`, `.wiki-article :where(table, pre)`) become horizontal-scroll containers instead of overflowing the viewport; `/search` page polished — responsive padding, `autoFocus` dropped, `text-base` input with `enterKeyHint="search"`, larger tap targets on filter chips. |
| ✅ shipped | **P2.18** PWA Tier 1 — installability | S | Shipped 2026-05-19 (`5320ce1`). `app/manifest.ts` (Next 16 file-convention manifest at `/manifest.webmanifest`, `display: standalone`, scope `/`); `app/icon.tsx` + `app/apple-icon.tsx` dynamically render 512/180 PNG icons via `next/og`'s `ImageResponse` (no `sharp`/`imagemagick` dependency); `themeColor` (light + dark media), `appleWebApp` (capable, title), `formatDetection: telephone=no` (stops iOS auto-linking GEDCOM years as `tel:` links); `proxy.ts` matcher excludes `icon\|apple-icon\|manifest` so next-intl doesn't prepend the locale to well-known URLs. Tier 2 (offline support) tracked as P2.19 below. |
| ⏳ ready | **P2.19** PWA Tier 2 — offline support via service worker | M | New, 2026-05-19. Cache app shell + read-only article HTML so the wiki is browsable on a plane / no-signal Tailscale. Strategy decisions: Serwist (Workbox 7 wrapper, recommended by Next docs) vs. hand-rolled `public/sw.js`; cache strategies per route (stale-while-revalidate for `/[locale]/[slug]`, network-first with offline-fallback for `/api/notes/*`); versioning + dev/prod parity (`updateViaCache: 'none'` for sw, content-hashed shell). Plan sketched at [`2026-05-19-pwa-offline-support.md`](./superpowers/plans/2026-05-19-pwa-offline-support.md). |

---

## Track: Authoring

> AI agents writing articles. The pipeline shipped fast (`wai author`,
> `--cohort`, `revert`, `history`) over April–May 2026. Track focus:
> hardening, schema reach, source criticism.

| Status | Item | Lift | Source |
|---|---|---|---|
| ⏳ ready | **Cost telemetry on `wai author`** | S | New, 2026-05-19. Per-run + cumulative model-spend reporting. Cheapest hardening; surfaces info we don't currently have |
| ⏳ ready | **Cohort resumability for `wai author --cohort`** | M | New, 2026-05-19. Pattern transferable from `tools/backfill-talk-i18n.sh` which already does this for translations |
| ⏳ ready | **Verify-phase grader-disagreement policy** | M | New, 2026-05-19. **Needs design before code.** What does `verify` do when graders disagree with the draft today? It logs; does it block? Retry? Defer to human? Brainstorm first |
| ⏳ ready | **P2.6** `wai recite --strict` warning mode for source typos and trailing-comma noise | S | [Review §P2.6](./reviews/2026-05-07-platform-review.md#p26--gedcom-source-typos--trailing-commas) |
| ⏳ ready | **P3.2** Source-criticism mode (strength + confidence per fact) | L | [Review §P3.2](./reviews/2026-05-07-platform-review.md#p32--source-criticism-mode). Depends on P1.5 (✅) + E.2 (MediaRef extension lands first) |
| ⏳ ready | **P3.4** Document evidence as first-class object | L | [Review §P3.4](./reviews/2026-05-07-platform-review.md#p34--document-evidence-as-a-first-class-object). **Substantially overlaps with Contribution-track E.2 + E.6 + E.9.** Revisit scope when Contribution MVP ships; may collapse to a thin extension rather than a separate workstream |

---

## Track: Infrastructure & hygiene

| Status | Item | Lift | Notes |
|---|---|---|---|
| ✅ shipped | **P2.20** Render deployment + Descope auth + two-way git sync | L | Shipped 2026-05-20. The wiki now runs as a read-write replica on Render (`family-tree`, `srv-d807l4faqgkc739sqak0`) alongside the canonical Mac Studio. A Next.js `instrumentation.ts` startup hook bootstraps the data repo onto the persistent disk and starts an in-process pull/push sync scheduler (`frontend/lib/sync.ts`); a shared `REPO_LOCK` serialises browser writes against the scheduler's `pullRebase`. The replica is gated by `WHOAMI_AUTH`-on invite-only Descope auth. Shipped as plans 1–3 of the render deployment ([git-sync-core](./superpowers/plans/2026-05-20-git-sync-core.md), [descope-auth](./superpowers/plans/2026-05-20-descope-auth.md), [render-deploy-and-sync](./superpowers/plans/2026-05-20-render-deploy-and-sync.md)); [spec](./superpowers/specs/2026-05-20-render-deployment-design.md). Reverses the `SCOPE.md` "no public hosting" / "no app-layer auth" anti-goals. |
| ✅ shipped | **`cli-v2.0.0` release** | S | Shipped 2026-05-21. First stable v2 CLI tag — `cli-v2.0.0-pre.0`/`-pre.1` were the markdown-era pre-releases and the `cli-v1.x` tags predate v2. Cut via `cli/scripts/release.sh`, fixed first (it left `package-lock.json` un-bumped, re-creating the drift `e59eaae` fixed, and still sed'd the `const VERSION` that `af36ded` removed). The release commit also moved the ~1,030-line `[Unreleased]` CHANGELOG backlog into a `[cli-v2.0.0]` section; `release.yml` now marks the newest tag as GitHub's "Latest". |
| ⏳ ready | **P2.13** Strengthen `frontend/test/messages-parity.test.ts` to catch leftover English in non-English locale strings | S | docs/superpowers/specs/2026-05-18-home-research-dashboard-design.md |
| 🔧 partial | **CHANGELOG hygiene** | S | Process improvement, not a track item. The unreleased-backlog half is done — the `cli-v2.0.0` release (2026-05-21) moved ~1,030 lines of `[Unreleased]` into a version section, so `[Unreleased]` is empty again. Remaining: trim the verbose multi-paragraph entries to one-line headers + `<details>` collapsibles — a large editorial pass, deferred |

---

## Parking lot — bookmarked with explicit triggers

Each item has an explicit triggering signal. When that signal fires,
the item moves to its track, not before.

| Item | Trigger | Source |
|---|---|---|
| **P0.2** Privacy-gate re-enable decision | User decides to revisit — parked open-ended 2026-05-20, no automatic trigger. Gate ships disabled (`WHOAMI_PRIVACY_GATE` off, `frontend/lib/env.ts:39`); E.3's audio gate inherits the same machinery and can re-raise the question | (no plan — gate shipped 2026-05-15) |
| **P1.6** Half/step/adoptive distinctions | User annotates `PEDI` / `ADOP` tags in the source GEDCOM | [Review §P1.6](./reviews/2026-05-07-platform-review.md#p16--no-halfstepadoptive-distinction) — verification 2026-05-19 found 0 such tags in the corpus |
| **P1.8** Breadcrumbs from relationship-calc path | Pedigree chart wayfinding proves insufficient in real usage | [Review §P1.8](./reviews/2026-05-07-platform-review.md#p18--no-breadcrumbs-or-wayfinding-inside-the-tree) — chart shipped 2026-05-18 supersedes most of this |
| **P2.4** CLI v1→v2 migration docs | An external user complains about a removed v1 command | [Review §P2.4](./reviews/2026-05-07-platform-review.md#p24--cli-help-carries-13-removed-commands-forever) |
| **P3.3** Global navigable timeline | Contribution-track work doesn't already give timeline-as-axis a natural surface | [Review §P3.3](./reviews/2026-05-07-platform-review.md#p33--timeline-as-a-navigable-axis) |
| **P3.6** Story spine per person | User finds the existing event coverage on person pages insufficient | [Review §P3.6](./reviews/2026-05-07-platform-review.md#p36--story-spine-per-person) |
| **P3.7** DNA reconciliation slot | User obtains DNA test results | [Review §P3.7](./reviews/2026-05-07-platform-review.md#p37--dna-reconciliation-slot) |
| **P3.8** Federation / encrypted off-site backup | User wants to share read access outside Tailscale | [Review §P3.8](./reviews/2026-05-07-platform-review.md#p38--federation--remote-vault) — *backup itself is already de-facto via `~/whoami` GitHub remote at `stevenbarash/family-tree-data.git`; the remaining concern is E2E encryption / federation, not loss prevention* |
| Narrative ↔ GEDCOM round-trip (paste-to-vault) | User wants to paste raw research text and have it weave into the wiki | [`narrative-to-gedcom`](./superpowers/plans/2026-05-03-narrative-to-gedcom.md) |
| Typed CLI/server contract module (Zod) | First contract-drift bug that costs > 30 min of debugging | [`cli-server-contract`](./superpowers/plans/2026-05-03-cli-server-contract.md) |
| Wikitext → Markdown converter polish (Plan B) | Old MediaWiki content needs migrating again | [`wikitext-to-md-converter`](./superpowers/plans/2026-05-01-wikitext-to-md-converter.md) |

---

## Cut from roadmap

| Item | Reason | Disposition |
|---|---|---|
| **P3.5** Cross-tree linking (signed-link reference between trees) | Conflicts with `SCOPE.md` anti-goals (no public hosting, no multi-user). Was miscategorized as a P3 strategic bet; it's actually an anti-goal | Removed entirely. Note added to SCOPE.md confirmed-anti-goals list if needed |
| **P1.7** Media as first-class object | Absorbed into Contribution-track **E.2**. Audio is the leading media kind for the user story; static media is a sub-case of the same `MediaRef[]` extension | Removed; referenced from E.2 |
| **P2.8** Schema-migration registry exercise | Absorbed into Contribution-track **E.2**. E.2's MediaRef extension is the first real migration that exercises the registry | Removed; referenced from E.2 |
| **P2.16** Bulk-backfill translated talk pages | Operational task that the user runs themselves (`tmux new -s backfill 'tools/backfill-talk-i18n.sh'`, ~12h, $150–$600). Engineering infrastructure shipped 2026-05-19; the *run* belongs in user-operational memory, not the engineering roadmap | Removed; lives in [user's operational notes](./superpowers/plans/2026-05-19-quality-checks-pass-2.md) and auto-memory |

---

## Pedigree chart follow-ons (extends P1.1)

The pedigree chart shipped 2026-05-18 ([P1.1](#track-reading)).
Manual testing surfaced three follow-on sub-projects that together
deliver the "gap-as-frontier with talk-page candidate matching" idea —
foundational groundwork for [P3.1](#contribution-track-instantiates-p31).
Each ships independently; F → T → D is the recommended order.

| Status | Item | Lift | Spec | Notes |
|---|---|---|---|---|
| ✅ shipped | **F** Chart frontier slots | S | [`pedigree-frontier-slots-design`](./superpowers/specs/2026-05-18-pedigree-frontier-slots-design.md) | Shipped 2026-05-18 |
| ⏳ ready | **T** Talk-page candidates format + parser | M | (spec TBD) | Standalone data utility; **ship second** |
| ⏳ ready | **D** Research drawer | M | (spec TBD) | Side-panel Sheet on chart node click; **ship third — depends on F + benefits from T** |

---

## Contribution track instantiates P3.1

[Review §P3.1](./reviews/2026-05-07-platform-review.md#p31--make-the-research-frontier-the-central-ui-metaphor)
proposed making the "research frontier" the central UI metaphor. The
contribution track is its concrete operationalization — the interview
surface *is* the frontier. Each open question, gap, redlink target,
or frontier slot becomes a thing a contributor can address today.
P3.1 as a standalone item is therefore subsumed by the Contribution
track and removed from the strategic-bets list.

---

## Recently shipped (since 2026-05-07 platform review)

The 12 days after the May 7 review (2026-05-08 through 2026-05-19)
shipped substantially more than any single wave called for, and most of
it was not on the original plan. Listed for honest accounting (Rule 12).

| Item | Plan | Notes |
|---|---|---|
| **P0.1** Strip removed CLI commands from agent prompts + smoke test | (no plan) | Shipped 2026-05-17 |
| **P0.2** Living-person privacy gate (parsing + search filter + export + RestrictedNotice) | (no plan) | Shipped 2026-05-15. Gate disabled via env flag pending user re-enable |
| **P0.3** Slash-date ambiguity detection + `wai audit dates` + `?` glyph | (no plan) | Shipped 2026-05-17. Current data has 0 hits |
| **P0.4** Source-coverage metric on `/family/tree` Coverage section | (no plan) | Partial close 2026-05-19. Recs #1/#2 made moot by GEDCOM 7; rec #3 shipped |
| **P1.1** Pedigree chart on `/family/tree` | [plan](./superpowers/plans/2026-05-18-pedigree-chart.md) | Shipped 2026-05-18 |
| **P1.2** Article freshness/attribution metadata strip | (no plan) | Shipped iteratively 2026-05-07 → 2026-05-17 |
| **P1.3** Home page → research dashboard | [plan](./superpowers/plans/2026-05-18-home-research-dashboard.md) | Shipped 2026-05-18 |
| **P1.5** Conflict-resolution schema (focal-person view) | (no plan) | Shipped 2026-05-09 in `a8ff233` |
| **P1.9** Talk-page editorial threads on article pages | (no plan) | Shipped 2026-05-18 |
| **P1.10** Empty / error / loading states | (no plan) | Shipped 2026-05-19. `error.tsx` bonus rolled back due to dev-mode `performance.measure` interaction |
| **P2.1** Citation directives on design tokens + dark-mode contrast | (no plan) | Shipped 2026-05-18 |
| **P2.2** Red-links flow (`wai redlinks`) | (no plan) | Shipped 2026-05-09 in `839a714` |
| **P2.5** Skip-to-content + alt text on portraits/avatars | (no plan) | Shipped 2026-05-15 |
| **P2.15** Locale-aware `readTalkBody` (talk-page i18n B.3) | (no plan) | Shipped 2026-05-19 |
| **P2.17** Mobile-friendliness baseline (viewport, iOS input zoom, table overflow, /search polish) | (no plan) | Shipped 2026-05-19 in `dcf96a7` |
| **P2.18** PWA Tier 1 — installability (manifest, icons, theme color, apple meta, formatDetection) | (no plan) | Shipped 2026-05-19 in `5320ce1` |
| **Pedigree F** Chart frontier slots | [plan](./superpowers/plans/2026-05-18-pedigree-frontier-slots.md) | Shipped 2026-05-18 |
| **GEDCOM 5.5.1 → 7.0.18 upgrade** | [plan](./superpowers/plans/2026-05-17-gedcom-7-upgrade.md) | Foundational for all multilingual and source-criticism work |
| **Multilingual support — Plans 1, 2, 3** | [1](./superpowers/plans/2026-05-17-multilingual-support-plan-1-foundation.md) · [2](./superpowers/plans/2026-05-17-multilingual-support-plan-2-chrome-translations.md) · [3](./superpowers/plans/2026-05-17-multilingual-support-plan-3-translation-pipeline.md) | en/ru/uk/he with RTL Hebrew |
| **Talk-page i18n pipeline (B.1, B.2, B.3)** | (across several commits) | Real agent talk translator + locale-aware reader; closes P2.15 |
| **Sex-aware translation pipeline** | (PR #10) | Gendered past-tense across all locales |
| **Author/attribution frontmatter** | (PR #11) | LLM model name (e.g. `Claude Opus 4.7`); closes data-model half of P1.2 |
| **Article pipeline — Plans 1, 2, 3** | [1](./superpowers/plans/2026-05-10-article-pipeline-plan-1-foundation.md) · [2](./superpowers/plans/2026-05-10-article-pipeline-plan-2-author-core.md) · [3](./superpowers/plans/2026-05-10-article-pipeline-plan-3-cohort-review.md) | `wai author / --cohort / revert / history` |
| **Quality checks Pass 2** | [plan](./superpowers/plans/2026-05-18-quality-checks-pass-2.md) | 4 new drift detectors; surfaced 534 real stale translations |
| **Cross-page consistency detector** | [plan](./superpowers/plans/2026-05-16-cross-page-consistency-detector.md) | Catches Boris/Kelman-class talk↔live drift |
| **Wikilink hover-cards** | [plan](./superpowers/plans/2026-05-16-wikilink-hover-cards.md) | 200ms-delayed page preview |
| **"This day in family history" ribbon** | [plan](./superpowers/plans/2026-05-16-this-day-in-family-history-ribbon.md) | Home-page almanac |
| **Relationship strip on person pages** | [plan](./superpowers/plans/2026-05-16-relationship-strip-on-person-pages.md) | "Your `<relation>`" subtitle |
| **`wai doctor` + actionable connection errors** | [plan](./superpowers/plans/2026-05-09-wai-doctor.md) | Dev-env diagnostics |
| **Roadmap & plan-index drift guards + CLAUDE.md Rules 14/15** | (no plan) | `roadmap-drift` + `plan-index-drift` tests |

---

## Cadence and updates

- **Track-milestone boundaries trigger an update.** When the next item
  in a track ships, update that track's section and the snapshot at
  the top.
- **Authority:** if this doc and an individual plan's status disagree,
  this doc is the planning source of truth and the plan body is the
  implementation source of truth — fix whichever is stale.
- **Drift tests:** `cli/test/roadmap-drift.test.ts` and
  `cli/test/plan-index-drift.test.ts` enforce ROADMAP ↔ CHANGELOG ↔
  plan-index agreement bidirectionally. Keep them passing.
- **Reviews:** treat `docs/reviews/YYYY-MM-DD-platform-review.md` as
  scheduled punctuation. The next one is due when Contribution MVP
  closes (E.0 → E.6), or when the user senses drift.

---

## See also

- [`SCOPE.md`](./SCOPE.md) — what whoami.wiki is and isn't (browser-writes-to-notes in scope, lightweight-identity in scope, both as of 2026-05-19)
- [`reviews/2026-05-07-platform-review.md`](./reviews/2026-05-07-platform-review.md) — the platform-review assessment this roadmap was originally derived from
- [`superpowers/plans/README.md`](./superpowers/plans/README.md) — index of all plans, by status
- [`superpowers/plans/2026-05-19-family-contribution-mode-roadmap.md`](./superpowers/plans/2026-05-19-family-contribution-mode-roadmap.md) — contribution track plan-of-plans
- [`/CHANGELOG.md`](../CHANGELOG.md) — what has shipped and when
