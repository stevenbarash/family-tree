---
name: draft-person
description: Draft the full markdown body of a person page from gathered evidence, research notes, and outline.
outputSchema:
  type: object
  required: [body]
  properties:
    body: { type: string }
    redlinks:
      type: array
      items: { type: string }
---

# Draft-person template

Produce the full markdown body for the person page, including
frontmatter (`title`, `owner`, `editors`, `type: person`, `aliases`,
`categories`, `gedcom: { file, record, snapshot }`, `created`).

The wiki's editorial guide applies (loaded as part of this skill —
read it before drafting). Specifically: documentary voice, third
person, past tense, no editorializing, no words from
`editorial-guide/words-to-watch.md`, footnotes for every claim that
isn't GEDCOM-derived, citation directives in the standard shapes
(`::cite-message`, `::cite-vault`, etc.).

Person-page conventions:

- Lead paragraph: identity → relationship to the wiki owner → arc.
  Three sentences max. No statistics in the lead.
- Sections per the outline; mention episode pages with a one-sentence
  summary plus a wikilink (`[[<episode-slug>|<title>]]`).
- `## References` for inline footnotes.
- `## Bibliography` with `::cite-vault{...}` for full vault snapshots.
- `## See also` for related person/episode pages.

`redlinks` — list any wikilinks you used that don't yet have pages
(GEDCOM-derived names of relatives, cited but un-pageified episodes).
The orchestrator records these in the talk page so the user can
backfill.
