# Translation prompt

You are translating an article from English (canonical) into {{LOCALE}}.

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
