# Translation prompt

You are translating an article from English (canonical) into {{LOCALE}}.

## Subject sex (for gendered verb forms)

Subject sex: **{{SUBJECT_SEX}}**

Russian, Ukrainian, Hebrew, and other languages encode subject gender on
past-tense verbs. Use the form indicated above. Examples:

- Russian "born" — male: `родился`; female: `родилась`
- Ukrainian "married" — male: `одружився`; female: `одружилася`
- Hebrew "died" — male: `נפטר`; female: `נפטרה`

When the subject sex is `not-a-person` (this is a family/event/meta
article rather than an individual's biography), gender-aware verb forms
don't apply — translate naturally without a single grammatical subject
needing a gender marker.

When the subject sex is `unknown`, default to masculine forms but log
the default as a `[name-transliteration]` or `[other]` talk entry so a
human reviewer can correct it if the subject's sex becomes known.

## Related translations already in this locale

{{RELATED_TRANSLATIONS_OR_NONE}}

These pairs are the project's established conventions for surname and
given-name rendering. Use them. If this article introduces a NEW name
(no related-translation match), pick the most natural rendering for
this locale and log the choice as a `[name-transliteration]` talk
entry — your choice becomes the convention for future siblings.

## Source article

Title: {{TITLE}}
Slug: {{SLUG}}
Frontmatter (JSON):

```json
{{FRONTMATTER_JSON}}
```

Body (markdown):

{{BODY}}

## Prior translation (if any — preserve where consistent with new canonical)

{{EXISTING_TRANSLATION_OR_NONE}}

## Prior talk file — Resolved decisions (preserve these decisions verbatim)

{{EXISTING_TALK_RESOLVED_OR_NONE}}

## Your task

1. Translate the article body into {{LOCALE}} faithfully. PRESERVE every `[[wikilink]]`, `::cite-vault{ref="..."}` directive, markdown structure (headings, lists, blockquotes), and any other markdown syntax VERBATIM. Only translate the prose.

2. Produce a translated title (one line).

3. For every NON-TRIVIAL editorial choice (name transliterations, idioms, ambiguous historical place names, register shifts, citation nuance changes, cultural-context calls), append an entry to the talk file's `## Unresolved` section in this format:

   ```
   - [ ] **[kind-tag]** Canonical: "..." Translated as: "..." Alternative: "..." Reason: ...
   ```

   Kind tags: name-transliteration, idiom, place-name, place-historical, register, date-format, citation-nuance, cultural, other.

4. For routine sentence-level translation (no real editorial choice), produce NO entry. Empty talk file = clean translation.

5. PRESERVE the prior `## Resolved` section verbatim (don't re-litigate decisions the user already made).

## Output format

Return a JSON object with three keys (no markdown fence, just the JSON):

```json
{
  "titleTranslation": "<translated title>",
  "body": "<translated markdown body, no frontmatter>",
  "talk": "## Unresolved\n\n<entries here>\n\n## Resolved\n\n<preserved resolved section>"
}
```

Plural categories for ICU strings:
- Russian / Ukrainian: one / few / many / other
- Hebrew: one / two / many / other
- English: one / other (no further categories needed)
