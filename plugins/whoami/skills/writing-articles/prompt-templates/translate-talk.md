# Talk-page translation prompt

You are translating an editorial **talk page** (`{{SLUG}}.talk.md`) from English (canonical) into {{LOCALE}}.

A talk page is the editorial workspace **about** an article: research notes the editor captured while drafting; `::open` / `::closed` / `::superseded` / `::gap` threads tracking unresolved editorial questions; a drafting plan; an agent log of pipeline runs. The audience for a talk page is researchers and editors, not casual readers — but the prose still merits a natural-feeling translation so a reviewer working in {{LOCALE}} can read it without code-switching.

## What translates vs. what stays verbatim

**Translate:**

- Section headings — `## Research notes` → `## Заметки исследования` (ru), etc.
- Thread headings — the human-readable summary above each `::open`/`::closed`/`::superseded`/`::gap` marker.
- Editorial prose inside threads — the body of each thread.
- Prose in research notes — the captured-fact bullets above `Source:` / `<!-- note ... -->` lines.
- The "Drafting plan" section's prose (lead, section descriptions, episode-spinoff notes).
- Section labels like `Sources` / `References` (translate to the locale convention; ru-wiki uses `Источники` / `Литература`, etc.).

**Preserve verbatim — DO NOT translate, transliterate, or reformat:**

- **Thread markers**: `::open`, `::closed`, `::superseded`, `::gap` exactly as written. These are parser tokens; translating breaks the editorial-discussion renderer.
- **HTML-comment note metadata**: `<!-- note id=n_xxx by=whoami kind=research at=YYYY-MM-DDTHH:MM:SS.sssZ -->` byte-for-byte. The attribute order, value formats, and IDs are load-bearing for note edits.
- **Gap slugs**: `Gap: peoria-jewish-community-context` — the slug after `Gap:` must remain identical (kebab-case English). You may translate the `Gap:` label itself if your locale convention prefers (`Пробел:` in ru), but the SLUG stays.
- **Source URLs**: every `Source: https://...` URL stays exactly. The `Source:` label may translate.
- **Date headings**: `### 2026-05-16` — date format is language-neutral ISO, preserve exactly.
- **Pipeline-run identifiers**: `### 2026-05-16 — pipeline run 17ab4025-67d1-466a-84d1-0605c1e8d7cd` — the UUID is opaque. You may translate "pipeline run" → "запуск пайплайна" (ru) but the UUID is verbatim.
- **Agent-log counts**: `- Phases completed: 6/7`, `- Episodes drafted: 0`, `- Sources cited: 0` — the field labels translate; the numbers stay.
- **Wiki link slugs**: `[[abby-rickelman|Abby Rickelman]]` — translate the display label, keep the slug. `[[abby-rickelman]]` without a label: convert to `[[abby-rickelman|<translated display>]]` and supply a localized label.
- **`(accessed YYYY-MM-DD)` parenthetical**: standard format, leave the date untouched. The word "accessed" may translate.

## Subject context

- Subject sex (for gendered verb forms): **{{SUBJECT_SEX}}**
- Article slug: `{{SLUG}}`
- Translated article title (use as the talk-page title's subject): **{{ARTICLE_TITLE_TRANSLATION}}**

If the article has been freshly translated in this run, the translated body is below for term/name-consistency reference. Use the same renderings the article translation used (place names, family names, dates) so the article ↔ talk-page surfaces stay aligned.

### Translated article body (for term consistency)

{{ARTICLE_TRANSLATED_BODY_OR_NONE}}

## Prior translation of THIS talk page (if any — preserve where consistent)

{{EXISTING_TALK_TRANSLATION_OR_NONE}}

If a prior translation exists, preserve unchanged decisions verbatim (don't re-litigate). Only re-translate sections whose EN canonical has materially changed since.

## Source talk page (EN canonical)

{{TALK_BODY}}

## Your task

1. Translate the body per the rules above. Output a clean markdown body with NO frontmatter — the orchestrator injects the frontmatter from the spec.

2. Produce the localized `titlePrefix` — the equivalent of the English "Talk" prefix. Examples by locale:
   - `ru` → `Обсуждение`
   - `uk` → `Обговорення`
   - `he` → `שיחה`
   - any other locale → use the convention from that locale's Wikipedia talk pages

   The orchestrator will compose the final title as `<titlePrefix>: <article title>` and quote it.

3. For every NON-TRIVIAL editorial choice in the talk-page translation (place-name choice for a historical Pale-of-Settlement shtetl; register call on a research-note phrase; choice between several plausible renderings of a section heading; cultural-context calls), append an entry under your `auditEntries` output in this format:

   ```
   - [ ] **[kind-tag]** Canonical: "..." Translated as: "..." Alternative: "..." Reason: ...
   ```

   Kind tags: `name-transliteration`, `idiom`, `place-name`, `place-historical`, `register`, `date-format`, `citation-nuance`, `cultural`, `other`.

4. For routine sentence-level translation (no real editorial choice), produce NO audit entry. Empty `auditEntries` = clean translation, and that's fine.

5. Do NOT add a `## Resolved` section to `auditEntries` — the orchestrator folds your entries into the article's `.translation.talk.md` `## Unresolved` section, which already coexists with a `## Resolved` section managed by humans.

## Output format

Return a JSON object with three keys (no markdown fence, just the JSON):

```json
{
  "body": "<translated talk-page markdown body, no frontmatter>",
  "titlePrefix": "<localized 'Talk' word for the talk-page title>",
  "auditEntries": "<bullet-list of audit entries, or empty string>"
}
```
