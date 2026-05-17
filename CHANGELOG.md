# Changelog

All notable changes to whoami.wiki are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
For the versioning policy (what gets versioned and what doesn't), see
[`AGENTS.md`](./AGENTS.md#versioning).

This is a project-level changelog. The wiki is a multi-package repo;
when a change affects only one package (e.g., a CLI release), the
section is marked with the package name. The project as a whole is
in **v2 development** following the May 2026 markdown migration; the
last tagged production release was [`cli-v1.2.1`](https://github.com/anthropics/whoami/releases/tag/cli-v1.2.1)
(2026-03-26), which predates the v2 architecture.

> **Going forward:** every PR adds a line under `## [Unreleased]`.
> When a release is cut, the unreleased entries are renamed under the
> new version heading.

---

## [Unreleased] — v2 development

### Fixed

- **CLI pages path:** `core/src/paths.ts` and `cli/src/index.ts` default `pagesDir` flipped from `pages/` to `pages/en/`. Closes a regression from the multilingual content migration where `wai read <slug>` looked at the pre-migration path.

### Added

- **Translation talk parser:** `core/src/i18n/translation-talk.ts` parses `<slug>.translation.talk.md` files into unresolved/resolved entry counts. Foundation for the translation accuracy review gate.

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
