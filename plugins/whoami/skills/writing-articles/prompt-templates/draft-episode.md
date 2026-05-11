---
name: draft-episode
description: Draft the full markdown body of an episode page (more narrative latitude than person pages, but still factual and footnoted).
outputSchema:
  type: object
  required: [body]
  properties:
    body: { type: string }
    redlinks:
      type: array
      items: { type: string }
---

# Draft-episode template

Produce the full markdown body for an episode page about the scope
described in `context.scope`. Frontmatter: `title`, `type: episode`,
`subject` (slug of the person), `categories`, `created`.

Episode pages have **more narrative latitude than person pages** but
remain third-person and factual. Storytelling comes from sequencing,
detail, and well-chosen quotes — not from adjectives.

Editorial constraints (loaded from `editorial-guide`):

- Three-stream weaving rule: every *claim* (a date, a place, an
  action, a relationship, an attribution) must trace to one of the
  three input streams (relations, narrative, external research).
  Connective and summary prose between cited claims is permitted.
- No inventing details to dress up data ("the cold November wind…").
- No period color the records don't license. Name a regime only when
  the record names it or the regime materially shaped the event.
- No filling silences with plausible guesses — gaps go on the talk
  page as `::open` threads.
- No first-person family voice.

Episode page structure:

- Lead paragraph: when, where, who, what.
- Body sections in chronological or thematic order.
- `## References` and `## Bibliography` per the editorial guide.
- Wikilinks back to the person page and to any related episodes.

`redlinks` — list any wikilinks you used that don't yet have pages.
