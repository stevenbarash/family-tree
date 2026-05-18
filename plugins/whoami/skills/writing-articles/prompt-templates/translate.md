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

## Canonical translated title from GEDCOM (NAME.TRAN for {{LOCALE}})

{{NAME_TRAN_OR_NONE}}

If the value above is anything other than `(none)`, it is the project's
canonical translated title for this individual — pulled from the GEDCOM 7
`NAME.TRAN` substructure. **Use it verbatim as your `titleTranslation`
output.** Do NOT re-translate the title from scratch, and do NOT log a
`[name-transliteration]` talk entry about the title itself; the canonical
form has already been adjudicated. You still translate the body and may
log talk entries for non-title editorial choices (idiom, place-name, date
format, register, etc.).

If the value is `(none)`, no canonical exists yet — pick the best
rendering, use it as `titleTranslation`, and DO log a
`[name-transliteration]` talk entry so a human can ratify it (the
ratified form will eventually be promoted into the GEDCOM as a
`NAME.TRAN`).

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

## Authorship attribution

The pipeline will record this translation's authorship in the
output frontmatter as `author: <model name>`. You do NOT need to
write that line yourself — the pipeline injects it from the
`WAI_AUTHOR_MODEL` env var (default `Claude Opus 4.7`). Just return
the body without any `author:` / `owner:` / `editors:` fields.

If you produce additional frontmatter blocks inside the body (e.g.
copying the canonical's `type:` / `categories:` / `gedcom:` block),
do NOT include `owner:` or `editors:` — those have been retired in
favor of the pipeline-injected `author:`.

## Frontmatter field-format rules (enforced by Zod + `wai check`)

These are validated by the page schema and surface as `wai check
--only schema` findings if violated. Match exactly:

- `translation_of`: a bare page slug (`leah-rosinsky`), NOT a path
  (`pages/en/leah-rosinsky.md`) and NOT a filename.
  Regex: `^[a-z0-9][a-z0-9-]*$`
- `lang`: a BCP 47 short code (`en`, `ru`, `uk`, `he`). Not `english`,
  not `ru-RU`. Regex: `^[a-z]{2,3}$`
- `canonical_sha`: the full 40-character git SHA, lowercase hex. Not
  shortened. Regex: `^[a-f0-9]{40}$`
- `translated_at`: ISO date `YYYY-MM-DD` (today, from the pipeline).

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
