# Multilingual support (en / ru / uk / he)

> Spec for serving the whoami.wiki — UI chrome and article content —
> in English, Russian, Ukrainian, and Hebrew, with full RTL support
> for Hebrew, content parity across languages via a canonical-and-
> translations model, and a stale-translation tracking system that
> keeps parity honest as the canonical evolves.

## Context

whoami.wiki today is English-only. Every UI string in `frontend/`
is hardcoded English JSX; every article in `~/whoami/pages/` is an
English markdown file; every place name in the GEDCOM-derived data
renders as whatever the source GEDCOM recorded; dates render via raw
`Intl.DateTimeFormat` with no locale parameter.

The family this wiki documents spans four language communities:
English-speaking relatives in the US, Russian-speaking relatives in
the diaspora, Ukrainian-speaking relatives still in Ukraine, and
Hebrew-speaking relatives in Israel. The wiki is, in editorial
intent, a story told to all four — not a separate story for each.
When a Hebrew-language letter from 1942 surfaces a fact about a
great-grandfather, that fact belongs in every language's article
on him.

This spec defines the architecture for multilingual support across
all four languages, using `next-intl` (the consensus library for
Next.js 16 App Router), folder-per-locale content layout, an
English-canonical translation model with explicit freshness
tracking, and the project's first deliberate support for
right-to-left layout.

## Goals

1. Serve every UI surface — navigation, page chrome, search facets,
   infobox labels, error messages, error pages — in en / ru / uk /
   he, with full Hebrew RTL layout.
2. Serve every article in all four languages, with **content parity**:
   each language's version of a person's article conveys the same
   facts, sourced from the same evidence pool, faithfully translated
   from a single canonical narrative.
3. Make translation freshness visible. When the canonical article
   changes, the system identifies which translations need re-sync
   and surfaces this to both the agent and the reader.
4. Source citations are language-independent. A Hebrew letter is
   stored once, in Hebrew, and cited from any language's article;
   the cite-vault renders the original alongside a translation
   appropriate to the rendering article's language.
5. Place names and dates render in the reader's language, drawn
   from a curated place-name lookup and locale-aware formatters.
6. Architecturally clean. Use `next-intl`'s maintainer-recommended
   patterns exactly. Static rendering preserved for every page.
   Type-safe message keys. ICU pluralization that handles Russian
   and Ukrainian (`one/few/many/other`) and Hebrew (`one/two/many/
   other`) correctly from day one.
7. **Translation accuracy is auditable.** Every translation carries
   a per-locale talk file where the agent logs every non-trivial
   editorial choice it made (name transliterations, idiom
   handling, register selection, ambiguous places). The talk file
   is a living checklist: until you tick every entry off, the
   translation is not considered `current` — the site renders a
   review banner and `wai i18n status` reports it. This is the
   mechanism that turns "translated" into "accurately translated."

## Non-goals

- **CLI translation.** `wai` is agent-facing and stays English-only.
  Translating its help text and error messages adds maintenance
  burden with no human-reader benefit at the current scale.
- **Editorial guide / plugin translation.** Agent-authoring guides
  in `plugins/whoami/` stay English — they're written for the
  authoring agent, not the wiki reader.
- **Talk page translation.** Article talk pages (`<slug>.talk.md`,
  the research log) are an internal research log, append-only,
  agent-facing. They stay English. Revisit if a human research
  collaborator needs them in another language. (Distinct from the
  per-translation *translation talk file* introduced below, which
  is part of the translation review pipeline.)
- **Machine translation at runtime.** Articles are agent-translated
  with full editorial care, not Google-Translated on the fly. The
  whole point of the wiki is encyclopedic quality; runtime MT
  would erode that.
- **Per-page canonical-language choice.** Canonical is always
  English, even when most sources are in another language. The
  cost of per-page metadata about which language is authoritative
  outweighs the editorial benefit.
- **Hebrew calendar by default.** Dates render Gregorian in
  Hebrew script under the `he` locale. Hebrew calendar can be
  added later as a per-page or per-event opt-in.
- **Translated URL slugs.** `/en/abby-rickelman` and
  `/he/abby-rickelman` share the slug. The slug is the concept
  ID joining translations; translating it would break that link.
  Slugs stay derived from English / transliterated names.
- **Locale-aware GEDCOM ingestion.** The GEDCOM file stays as
  imported (source-language names, dates as recorded). Translation
  is a presentation-layer concern.

## Architecture

Three pieces, each with one job:

1. **`next-intl` foundation** — routing, message resolution,
   formatters, type safety, hreflang. Everything Next-side.
2. **Content layout under `~/whoami/pages/{locale}/`** — folder
   per locale, shared slug, English canonical, translations track
   canonical SHA for freshness.
3. **Translation tooling in `wai`** — `wai i18n status`, `wai i18n
   sync`, editor-agent skill that produces translations from the
   English canonical with full source-citation continuity.

```
                    ┌────────────────────────────────────────┐
                    │  ~/whoami/pages/en/<slug>.md           │  canonical
SOURCE OF TRUTH     │  (author once, in English)             │
                    └──────────────┬─────────────────────────┘
                                   │ wai i18n sync
                                   ▼
                    ┌────────────────────────────────────────┐
                    │  ~/whoami/pages/ru/<slug>.md           │  translation
                    │  ~/whoami/pages/uk/<slug>.md           │  translation
                    │  ~/whoami/pages/he/<slug>.md           │  translation
                    │  (each carries canonical_sha)           │
                    └──────────────┬─────────────────────────┘
                                   │ render
                                   ▼
                    ┌────────────────────────────────────────┐
                    │  Next.js [locale] router               │
                    │  /en/<slug>  /ru/<slug>                │
                    │  /uk/<slug>  /he/<slug> (RTL)          │
                    └────────────────────────────────────────┘
```

## Component design

### Library: `next-intl`

`next-intl` is the maintainer-consensus pick for Next.js 16 App
Router in 2026. RSC-native; ICU MessageFormat; no `createInstance`
boilerplate; active maintenance; auto-emits hreflang. Runners-up
considered and rejected:

- **`next-i18next`** — Pages Router era; effectively legacy.
- **`react-intl` (FormatJS)** — works but lacks Next-idiomatic
  App Router integration; heavier.
- **`paraglide-js`** — interesting type-safety story and unique
  support for translated slugs, but slug translation is a non-goal
  (concept-ID joining requires shared slugs). Reconsider only if
  per-language slugs become desired.
- **`lingui`** — smallest runtime bundle, but our bundle is not
  the binding constraint.

### Routing: `localePrefix: 'always'`

Every URL carries a locale prefix: `/en/...`, `/ru/...`, `/uk/...`,
`/he/...`. The unprefixed root `/` redirects to the detected
locale (`accept-language` header, `NEXT_LOCALE` cookie).

Always-prefix is the operationally safer choice for a content site:
no special-case middleware to strip the default-locale prefix,
unambiguous URLs, clean hreflang. It matches MDN's approach;
Stripe / Vercel docs use unprefixed-default but trade simplicity
for SEO-correctness risk. (Source: [Google: Localized Versions](https://developers.google.com/search/docs/specialty/international/localized-versions).)

`alternateLinks: true` in the routing config means **next-intl
emits `<link rel="alternate" hreflang>` headers automatically**.
No custom hreflang implementation needed; `generateMetadata` adds
`alternates.languages` for the `<head>` form.

### File layout (next-intl maintainer-recommended)

```
frontend/
  src/
    i18n/
      routing.ts            # defineRouting()
      request.ts            # getRequestConfig()
      navigation.ts         # createNavigation(routing)
    proxy.ts                # createMiddleware(routing)
    app/
      [locale]/
        layout.tsx          # <html lang dir>, setRequestLocale, provider
        page.tsx            # /
        family/page.tsx
        family/tree/page.tsx
        search/page.tsx
        [slug]/page.tsx
        changelog/page.tsx
      page.tsx              # static-export fallback: redirect('/en')
  messages/
    en.json
    ru.json
    uk.json
    he.json
```

Two Next-16-specific notes:

- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed the file.
  Older tutorials still say `middleware.ts`; they are wrong.
- **`await params`.** App Router params became async in Next 15;
  `[locale]` extraction is `const { locale } = await params`.

### `routing.ts` shape

```ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ru', 'uk', 'he'],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: true,
  alternateLinks: true
});

export const LOCALE_DIR: Record<typeof routing.locales[number], 'ltr' | 'rtl'> = {
  en: 'ltr', ru: 'ltr', uk: 'ltr', he: 'rtl'
};
```

`navigation.ts` re-exports `createNavigation(routing)`'s `Link`,
`useRouter`, `redirect`, `getPathname`. All cross-page navigation
in the app uses these wrappers, not raw Next exports — the
wrappers preserve the active locale automatically.

### `app/[locale]/layout.tsx` discipline

Three non-negotiable lines, in this order, per the docs:

```tsx
const { locale } = await params;
if (!hasLocale(routing.locales, locale)) notFound();
setRequestLocale(locale);    // MUST precede any next-intl call

return (
  <html lang={locale} dir={LOCALE_DIR[locale]}>
    <body>
      <NextIntlClientProvider>{children}</NextIntlClientProvider>
    </body>
  </html>
);
```

Missing `setRequestLocale` silently degrades the page to dynamic
rendering — the docs flag this as the #1 pitfall. Every page
under `[locale]/` repeats it. `generateStaticParams` returns
`routing.locales.map(locale => ({ locale }))` so the prebuild
covers all four.

### Message namespacing

Nested JSON, namespaced by surface area:

```json
{
  "Chrome": {
    "Nav": { "home": "Home", "family": "Family", "search": "Search" },
    "Footer": { "...": "..." },
    "LangSwitcher": { "label": "Language" }
  },
  "Page": {
    "Home": { "title": "...", "registry": "The Registry" },
    "Search": {
      "placeholder": "Search the wiki…",
      "TYPE_LABELS": {
        "person": "People", "family": "Families",
        "event": "Events", "tree": "Trees", "meta": "Meta"
      }
    },
    "Family": { "...": "..." },
    "FamilyTree": { "skipToContent": "Skip to content" },
    "Article": {
      "infobox": { "born": "Born", "died": "Died" },
      "translationBanner": "This translation is from an earlier version."
    }
  },
  "Months": {
    "long": { "1": "January", "2": "February", "...": "..." }
  },
  "Errors": { "notFound": "Page not found" }
}
```

Each component calls `useTranslations('Page.Article')` at the
lowest-common-denominator namespace it needs — keeps the call site
clean and the client bundle slice tight.

### Client components — explicit `pick`

The docs explicitly warn against shipping the full message catalog
to the client. Client islands (the interactive family tree, the
language switcher) wrap themselves in a scoped provider:

```tsx
<NextIntlClientProvider messages={pick(messages, ['Chrome.LangSwitcher'])}>
  <LangSwitcher />
</NextIntlClientProvider>
```

Almost everything in the app is RSC. The interactive family-tree
component (`/family/tree`) is the main client island and is where
`pick` matters most.

### Server-side translation in async contexts

- **RSC (sync):** `useTranslations()` from `'next-intl'`.
- **Async (metadata, server actions, route handlers):**
  `getTranslations({ locale, namespace })` from `'next-intl/server'`.
  Pass `locale` explicitly in `generateMetadata` — without it,
  metadata won't statically render.

### Per-page metadata + hreflang

```ts
export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'Page.Article' });
  const article = await loadArticle(locale, slug);
  return {
    title: article.title,
    description: t('metaDescription'),
    alternates: {
      languages: Object.fromEntries(
        availableLocalesForSlug(slug).map(l => [l, `/${l}/${slug}`])
      )
    }
  };
}
```

`alternates.languages` lists only the locales that have an article
for this slug — important because a stale-or-missing translation
shouldn't claim hreflang coverage it doesn't have.

### Formatters: `useFormatter()`, named presets

```ts
// in routing config — define once
formats: {
  dateTime: {
    short:    { day: 'numeric', month: 'short', year: 'numeric' },
    yearOnly: { year: 'numeric' }
  }
}

// at the call site
const format = useFormatter();
format.dateTime(date, 'short');                    // locale-bound
format.list(items, { type: 'conjunction' });
format.number(n);
```

This supersedes the initial plan to add `formatDate(date, locale)`
to `core/src/format/dates.ts`. For frontend rendering, use
`useFormatter()`. `core/` retains raw `Intl.*` for code paths that
run outside the request context (agent-side, CLI-side).

### ICU pluralization

CLDR plural categories (which `Intl.PluralRules` enforces) must
match the language's grammar. Authoring rules:

- **English:** `one`, `other`
- **Russian, Ukrainian:** `one`, `few`, `many`, `other`
- **Hebrew:** `one`, `two`, `many`, `other`

Example:

```json
"articleCount": "{count, plural, =0 {No articles} one {# article} few {# articles} many {# articles} other {# articles}}"
```

The i18next `_plural` / `_zero` suffix convention is **not used**;
it silently breaks Slavic and Hebrew counts. ICU `plural` selector
from message one.

### Type-safe message keys

`next.config.ts`:

```ts
const withNextIntl = createNextIntlPlugin({
  experimental: { createMessagesDeclaration: './messages/en.json' }
});
```

Plus a global `AppConfig` augmentation declaring `Locale`,
`Messages`, `Formats`. Result: `t('Chrome.Nav.about')` is typed
against the EN message file; missing or misspelled keys fail
typecheck. The generated `.d.json.ts` file is gitignored.

### Article model: canonical + translations

```
~/whoami/pages/
  en/abby-rickelman.md          # canonical (source of truth)
  ru/abby-rickelman.md          # translation
  uk/abby-rickelman.md          # translation
  he/abby-rickelman.md          # translation
  en/abby-rickelman.talk.md     # talk page (English-only)
```

Every language's article on a subject shares the same slug. The
slug **is** the concept ID joining translations. No
cross-frontmatter pointer needed for the join (any sibling-locale
file with the same slug is, by convention, a translation of the
same subject).

The canonical English article carries the full editorial state:
infobox, sections, citations, wikilinks. Translation files carry
the same structure, translated, plus translation-tracking
frontmatter:

```yaml
# pages/ru/abby-rickelman.md
title: Эбби Рикельман            # translated title (per-locale)
lang: ru
translation_of: abby-rickelman   # slug; identifies the canonical
canonical_sha: a3f2c19           # git hash of pages/en/abby-rickelman.md at translation time
translated_at: 2026-05-16
# translation_status is NOT stored — it's computed (see below).
# All other frontmatter (owner, type, gedcom, categories, aliases)
# is read from the canonical file at load time — not duplicated here.
```

The article loader reads structural frontmatter (`type`, `gedcom`,
`categories`, `owner`) from the canonical EN file; the translation
file contributes only the per-locale `title` plus its translation-
tracking fields. This keeps structural data single-sourced — if the
GEDCOM record ID or article type changes on canonical, the change
takes effect across all language versions without per-translation
edits.

**Translation status is computed, not stored.** Three states, each
derivable from disk state:

| State        | Condition                                                                                       |
|--------------|--------------------------------------------------------------------------------------------------|
| `current`    | `canonical_sha` matches `HEAD:pages/en/<slug>.md` AND the translation talk file has zero unresolved entries |
| `stale`      | `canonical_sha` does not match `HEAD:pages/en/<slug>.md` (regardless of talk file)              |
| `review`     | `canonical_sha` matches HEAD AND the translation talk file has one or more unresolved entries   |

Computing-not-storing the status means the talk file is always
authoritative: the user resolving entries (ticking `[ ]` → `[x]`)
flips the rendered status without requiring a metadata edit.

When the canonical changes (any commit touching
`pages/en/<slug>.md`), `wai i18n status` detects which translations
have `canonical_sha` no longer matching `HEAD:pages/en/<slug>.md`
and reports them as **stale**. The rendered page shows a banner:

> *"This translation reflects an earlier version of the article.
> An updated translation is in progress."* (with link to canonical)

A **missing** translation (the slug has no `pages/{locale}/<slug>.md`
file) falls back to rendering the canonical EN article with a banner:

> *"This article hasn't been translated to Russian yet. Showing
> the English version."*

`alternates.languages` excludes missing translations from hreflang.

**Why English-always-canonical:** Agent quality is highest in
English (training data depth); one unambiguous source of truth per
subject; no per-page metadata about which language is
authoritative. Trade-off: a Hebrew-source-heavy subject is still
synthesized through English first. The friction is acceptable
because the editorial benefit of an unambiguous canonical
outweighs the per-subject inefficiency.

### Translation creation: agent skill

`wai i18n sync <slug> [<locale>]` invokes the editor agent with:

- the canonical English article body and frontmatter
- the cite-vault entries it references (in original languages)
- the active translation file (if it exists, for diff-aware updates)
- the place-name lookup
- the language to translate into

The agent produces a faithful translation that:

- Preserves all `[[wikilinks]]` (same slug)
- Preserves all `::cite-vault{ref="..."}` directives (same ref)
- Translates infobox labels via the message catalog (not freeform)
- Renders person names per per-language convention (e.g., Russian
  transliteration of names; Hebrew transliteration; Ukrainian
  variants)
- Maintains the structural parallelism of the canonical
- Sets `canonical_sha` to the current `HEAD:pages/en/<slug>.md`
  hash and `translation_status: current`

The agent does **not** machine-translate at runtime. Translations
are committed files, version-controlled, reviewable in PRs. Every
translation lands with a paired translation talk file capturing
the agent's editorial choices (see next section); the user clears
the talk file before the translation is considered `current`.

### Translation talk files — the accuracy review pipeline

Goal: every translation reflects the canonical accurately, and
every editorial choice the agent made is auditable.

**One translation talk file per translation:**

```
pages/ru/abby-rickelman.md                       # the translation
pages/ru/abby-rickelman.translation.talk.md      # paired talk file
```

The talk file is **English-only** (same as article talk files) so
a reader can review the agent's reasoning without being fluent in
the target language. It's created or updated by `wai i18n sync`
in the same operation that writes the translation.

**Logging threshold: all non-trivial choices.** The agent appends
an entry every time it made a deliberate editorial decision —
name transliteration variants, idiom translations, register
selection, ambiguous place names, citations whose nuance shifted,
date format choices, anything where a careful human translator
would pause. Routine sentence-level translation (no real choice
to make) produces no entry. Empty talk file = the agent reports
no deviations to flag.

**File format:**

```markdown
---
type: translation-talk
translation_of: abby-rickelman
lang: ru
canonical_sha_when_logged: a3f2c19
synced_at: 2026-05-17
---

# Translation notes — Russian (Эбби Рикельман)

## Unresolved

- [ ] **[name-transliteration]** Translated "Abby" as "Эбби" (phonetic).
  Alternative: "Абигейл" (formal full name). Chose phonetic because the
  canonical uses informal "Abby" throughout. Resolve by confirming Эбби
  or editing the translation to "Абигейл" and ticking.

- [ ] **[idiom]** Canonical: "She had a knack for languages." Translated
  as "Ей легко давались языки." Lost the colloquial warmth of "knack."
  Alternative: "У неё был дар к языкам" (more formal). Resolve by
  confirming or editing.

- [ ] **[place-historical]** Canonical mentions "Kiev" in a 1942 context.
  Translated as "Киев" (standard Russian historical name; matches the
  era's usage). Alternative: "Київ" (modern Ukrainian, anachronistic
  for this period). Resolve by confirming or editing.

## Resolved

- [x] **[place-name]** Translated "Brooklyn" as "Бруклин" (standard
  Russian transliteration). *Resolved 2026-05-17 by user.*
```

**Entry conventions:**

- One bullet per choice, opening with `[ ]` (unresolved) or `[x]`
  (resolved).
- A bracketed kind tag (`[name-transliteration]`, `[idiom]`,
  `[place-name]`, `[place-historical]`, `[register]`, `[date-format]`,
  `[citation-nuance]`, `[cultural]`, `[other]`).
- The canonical text, the chosen translation, the alternative
  considered, and a one-sentence rationale.
- A resolution instruction: how the user signals acceptance vs.
  what to do if they want the alternative.
- Resolved entries move into a `## Resolved` section with a date
  and attribution.

**Resolution mechanic — living checklist, status-gating:**

The talk file is parsed at read time. Any `- [ ]` checkbox in the
`## Unresolved` section counts. While that count is > 0, the
translation is `review`, not `current`. The site renders:

> *"This translation is under review. The agent flagged N
> editorial choices for your confirmation."* (with link to talk file)

The user resolves entries by editing the talk file: change `[ ]` →
`[x]` (accept the agent's choice), or edit the translation file
to use the alternative AND tick `[x]` (accept the alternative).
Either way, the entry moves to `## Resolved` and the unresolved
count drops. Once the count hits zero, the translation flips to
`current` on next render — no `wai` command needed.

**Re-sync workflow:**

When the canonical changes and the user runs `wai i18n sync` on
a stale translation, the agent:

1. Reads the new canonical + the existing translation + the
   existing talk file's `Resolved` section.
2. Translates the canonical afresh, preferring resolved choices
   from the prior talk file (so the user's earlier decisions
   don't get re-litigated).
3. Logs new unresolved entries for choices the prior talk file
   didn't cover.
4. Preserves the `## Resolved` history.

This way the talk file is the wiki's institutional memory for
"how do we translate this person's name, this idiom, this
historical place reference."

**Cost acknowledgement:** This is the rigor-first end of the
spectrum. With 113 articles × 3 target languages, talk-file
entries will accumulate — likely 5-20 entries per translation in
the early going, settling down as recurring patterns get
established. The translation experience is closer to "agent
drafts; user reviews and resolves" than "agent ships; user spot-
checks." That's the intentional trade for accuracy.

### Sources are language-independent

The cite-vault gains multilingual support at the data layer:

```yaml
# cite-vault entry
ref: letter-aaron-to-maxim-1942
original:
  lang: he
  text: "הטקסט העברי המקורי…"
  citation: "Aaron Frankel to Maxim Burmenko, Jerusalem, 1942-03-15"
translations:
  en: "Original Hebrew text rendered in English…"
  ru: "Перевод на русский…"
  uk: "Переклад українською…"
```

In any language's article, `::cite-vault{ref="letter-aaron-to-maxim-1942"}`
renders the original Hebrew in `<bdi lang="he" dir="rtl">` above a
translation appropriate to the rendering article's language. **One
source, four article-language presentations.** When a new source
arrives, translating it once into the four languages is a small
cost paid once; the alternative (per-article-language separate
citations) would not scale.

### Place names: `places-i18n.yml`

A new file in the data repo, keyed by the same canonical place ID
used in `places-coords.yml`:

```yaml
kyiv-ukraine:
  en: Kyiv
  uk: Київ
  ru: Киев
  he: קייב
  historical:
    - { en: Kiev, until: 1991 }     # optional period-specific names
```

Joined at render time. Infobox, family tree, search results, and
prose all pull through the same lookup. The GEDCOM-derived data
(`genealogy/derived/*.yml`) stays as imported (source-language
names); translation happens at the display layer.

Backfilling the lookup is itself a content task: a one-time pass
to gather the place names appearing across the wiki and
translate them. Out of scope for Plan 1; happens in Plan 3.

### Person names

Each language's article carries its own `title` field. When an EN
article renders `[[svetlana-burmenko]]`, the link text is the EN
article's `title` for that slug. When the HE article renders the
same link, it pulls from the HE article's `title`. No separate
people-i18n lookup — per-article `title` is the lookup.

If a slug has no article in the active locale, the language
switcher omits that locale (or shows it greyed; UX decision in
Plan 2). Wikilinks pointing at untranslated slugs render the
canonical EN title with `<bdi lang="en">` isolation.

### RTL: Hebrew

`<html dir>` set per-request from `LOCALE_DIR[locale]`. Tailwind
swept to logical properties: `ml-` → `ms-`, `mr-` → `me-`,
`text-left` → `text-start`, `border-l` → `border-s`, etc.

Three edge cases the W3C [bidi guidance](https://www.w3.org/International/articles/inline-bidi-markup/index.en.html) flags:

1. **`<bdi>` for embedded foreign content.** A Hebrew article
   mentioning an English place name, a numeric range
   (`1880–1942`), or a GEDCOM ID needs `<bdi>` wrapping for
   correct bidirectional rendering. Plain `<span dir="ltr">`
   does not isolate; it lets neighboring strong-directional
   characters bleed in. `<bdi>` is the right primitive.
2. **`<span lang="...">` on embedded foreign text** in any
   direction. A Russian name in an English paragraph:
   `<span lang="ru">Светлана</span>`. Affects screen readers,
   hyphenation, font selection, and search indexing. The P2.5
   roadmap item that flagged `lang=` on multilingual name
   spans lands here.
3. **Directional UI.** The family tree has a reading direction
   (ancestors at the top, descendants at the bottom; siblings
   left-to-right). Under `dir="rtl"`, siblings should mirror
   (right-to-left). Vertical relationships stay vertical.
   Directional icons (chevrons, arrows) mirror via
   `transform: scaleX(-1)`; non-directional icons (clocks,
   search magnifier) do not.

The family-tree component gets explicit RTL testing in Plan 2.

### Dates and numbers

- **Frontend:** `useFormatter()` with named presets
  (`dateTime.short`, `dateTime.yearOnly`). Locale-bound
  automatically.
- **`core/`:** raw `Intl.DateTimeFormat(locale, options)` with
  explicit `locale` parameter on every call. No reliance on
  server-default locale.
- **Hebrew calendar:** Gregorian by default everywhere. Hebrew
  calendar is per-page or per-event opt-in (e.g., a yahrzeit
  date) — added later if useful.
- **Sorting:** `Intl.Collator(locale).compare(a, b)` for surname
  lists, place lists, search results. Default JS string sort is
  byte order and produces wrong results for Cyrillic and Hebrew.

### Language tags

Bare-language codes: `en`, `ru`, `uk`, `he`. No region subtags
(`ru-RU`, `he-IL`, etc.) — BCP-47 says omit region unless the
variety is regionally distinct in a content-meaningful way.
Hebrew is effectively `he-IL` only; Ukrainian is `uk-UA` only;
Russian has regional varieties but the distinction carries no
editorial weight here. Region tags can be added later for
specific `Intl.*` formatting differences if needed (e.g.,
`en-GB` vs `en-US` date formats — not currently needed).

## Phasing

Four plans, each independently mergeable.

### Plan 1 — next-intl foundation + content migration (~2 days)

- Install `next-intl`, configure `next.config.ts` plugin with
  `createMessagesDeclaration`
- Create `src/i18n/{routing,request,navigation}.ts` + `src/proxy.ts`
- Restructure `app/` → `app/[locale]/`; add `setRequestLocale`
  to every page and layout
- `<html lang dir>` driven by `LOCALE_DIR`
- Extract all UI strings from `page.tsx`, `search/page.tsx`,
  `family/tree/page.tsx`, directive components into
  `messages/en.json` with namespacing
- `AppConfig` type augmentation for typed `t()` calls
- Migrate `~/whoami/pages/*.md` → `~/whoami/pages/en/*.md` (data
  repo; separate commit there)
- `useFormatter()` plumbed; `core/` keeps raw `Intl.*`
- Static rendering preserved on every page (verified by build
  output)

Acceptance: site is architecturally multilingual but still
English-only in content; build is green; static rendering report
shows all `[locale]/*` routes prebuilt.

### Plan 2 — RTL + chrome translations (~1-2 days)

- Hand-author or LLM-draft `messages/{ru,uk,he}.json` with ICU
  plurals (`one/few/many/other` for Slavic, `one/two/many/other`
  for Hebrew)
- RTL Tailwind sweep: logical properties throughout
- Family-tree RTL mirroring + visual regression test
- `<bdi>` and `<span lang="...">` patterns documented in
  `frontend/AGENTS.md`; applied to current name-rendering sites
- Language switcher (client island, scoped `pick` provider)
- Locale-detection redirect from `/` verified across all four
  locales

Acceptance: site chrome reads cleanly in all four languages;
Hebrew rendering correct on all pages; manual smoke test of
family tree under each locale.

### Plan 3 — Article translation infrastructure (~3-4 days)

- `translation_of` + `canonical_sha` + `translated_at` frontmatter
  spec on translation files (note: `translation_status` is
  computed, not stored)
- Translation talk file format spec (`<slug>.translation.talk.md`
  with `## Unresolved` / `## Resolved` sections, bracketed kind
  tags, checkbox-driven resolution)
- Talk-file parser in `core/`: counts `- [ ]` entries in
  `## Unresolved`; returns `{ unresolved: N, resolved: M, entries: [...] }`
- Computed-status helper in `core/`: returns `current | stale |
  review | missing` from `(canonical_sha, talk-file unresolved
  count)`
- `wai i18n status` — lists every (slug × locale) with its
  computed state and unresolved-entry count
- `wai i18n sync <slug> [<locale>]` — agent-driven translation
  that:
  - reads canonical, prior translation (if any), prior talk file's
    `## Resolved` section
  - emits the translation
  - emits a fresh `## Unresolved` block in the talk file (carrying
    forward unresolved entries from prior sync where still
    applicable); preserves the `## Resolved` history
  - updates `canonical_sha` and `translated_at`
- Stale-translation banner component on article pages
- **Review-translation banner** component: "This translation is
  under review. The agent flagged N editorial choices for your
  confirmation." (with link to talk file)
- Missing-translation fallback (renders canonical EN with banner)
- `~/whoami/genealogy/places-i18n.yml` lookup integrated through
  infobox, tree, and prose
- Multilingual cite-vault rendering: original in `<bdi lang>` above
  translation in active language; cite-vault schema migration
- `Intl.Collator(locale)` for all sorted lists in `core/` and
  `frontend/`
- `alternates.languages` excludes missing AND `review` translations
  from hreflang (a translation under review shouldn't claim
  authoritative status)
- Editor agent prompt update: documents the talk-file logging
  threshold (all non-trivial choices), kind-tag taxonomy, and the
  resolution-preservation contract for re-syncs

Acceptance: an article translated via `wai i18n sync` round-trips
end-to-end. Agent reads canonical, writes translation + talk file,
files commit to data repo. `wai i18n status` reports the translation
as `review` with N unresolved entries. User ticks the checkboxes
in the talk file; `wai i18n status` flips to `current`. Site renders
cleanly under `/{locale}/<slug>` with no banner; hreflang correct.

### Plan 4 — Article backfill (ongoing content workflow)

Not a code plan. A user-driven workflow:

1. User picks a slug (or `wai i18n status --missing` surfaces
   priorities).
2. `wai i18n sync <slug> <locale>` runs; agent writes the
   translation + talk file.
3. User reviews the talk file's `## Unresolved` entries, edits
   the translation as needed, ticks `[ ]` → `[x]`.
4. Translation flips from `review` to `current` automatically
   on next render. PR merges.

Throughput rises as recurring patterns (name transliterations,
historical place names, family-specific idioms) accumulate in
`## Resolved` sections — re-syncs in the same language carry
those resolutions forward, so the same call doesn't get re-made.
Translation talk files become institutional memory.

Open question (deferred to Plan 4): batch resolution. If 50
translations all flag the same `[name-transliteration]` choice
("translate Светлана as Svetlana, not Sveta"), the user
shouldn't have to tick 50 boxes. A `wai i18n resolve --pattern
'name-transliteration: Светлана'` batch command may emerge.
Hold off until the pattern is observed.

## Open questions (deferred)

1. **CI block for stale translations.** Initial: banner-only.
   Later: PR check that blocks merging canonical changes
   without updated `canonical_sha` on all translations (or a
   `--allow-stale` opt-out). When? After Plan 4 backfill has
   established translation throughput.
2. **Hebrew calendar dates.** Add as a per-page opt-in for
   yahrzeit-style life events (`date_hebrew: 5702 Adar 5`).
   When? When a user-facing need surfaces.
3. **Per-page canonical-language override.** A Hebrew-source-heavy
   subject might benefit from a Hebrew canonical. Revisit if the
   English-canonical friction becomes editorially significant.
4. **Translated slug variants.** Slugs stay English for now.
   If we want `/he/אבי-ריקלמן`-style URLs, `paraglide-js`
   becomes the better library. Re-evaluate as a v3 question.
5. **Talk-page translation.** Talk pages are English-only this
   phase. Revisit if human research collaborators need them in
   another language.
6. **CLI translation.** `wai` stays English. Revisit if non-
   English-speaking humans start using the CLI directly (today
   it's agent-facing).

## Migration risks

- **Move from `pages/*.md` to `pages/en/*.md` is destructive
  to git history.** Use `git mv` per file; the data repo
  preserves blame. The frontend article loader has to update
  in lockstep — flag-day, not gradual.
- **`middleware.ts` → `proxy.ts` on Next 16** is the rename
  most likely to bite if anyone copies a tutorial. Linter rule
  or AGENTS.md note as defense.
- **Static rendering regressions** silently degrade performance
  without breaking the build. Add a Plan 1 acceptance test that
  parses the build output and asserts every `[locale]/*` route
  is prebuilt.
- **Hreflang errors** can drop SEO traffic. `alternateLinks: true`
  + `alternates.languages` should cover it; add a Plan 2 manual
  check using Google's hreflang validator.
- **Bundle bloat from un-`pick`ed client providers.** Plan 2
  acceptance includes a bundle-size check on the family-tree
  client island.

## References

- [next-intl: App Router setup](https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing)
- [next-intl: Routing configuration](https://next-intl.dev/docs/routing/configuration)
- [next-intl: Server/Client components](https://next-intl.dev/docs/environments/server-client-components)
- [next-intl: Metadata & route handlers](https://next-intl.dev/docs/environments/actions-metadata-route-handlers)
- [next-intl: Messages (ICU plurals)](https://next-intl.dev/docs/usage/messages)
- [next-intl: Dates & times](https://next-intl.dev/docs/usage/dates-times)
- [next-intl: TypeScript](https://next-intl.dev/docs/workflows/typescript)
- [Google Search: Localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google Search: x-default hreflang](https://developers.google.com/search/blog/2013/04/x-default-hreflang-for-international-pages)
- [W3C: Inline markup and bidirectional text](https://www.w3.org/International/articles/inline-bidi-markup/index.en.html)
- [W3C: Handling RTL scripts in HTML](https://www.w3.org/International/geo/html-tech/tech-bidi.html)
- [MDN: BCP 47 language tag](https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag)
- [Wikipedia: Help:Interlanguage links](https://en.wikipedia.org/wiki/Help:Interlanguage_links) — model considered and rejected for content-parity reasons
- [Hugo: Translation by content directory](https://cloudcannon.com/documentation/guides/hugo-multilingual/translation-by-content-directory/) — folder-per-locale precedent
- [Astro: i18n routing](https://docs.astro.build/en/guides/internationalization/) — folder-per-locale precedent
