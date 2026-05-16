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

## CRITICAL RULE: every factual line must carry `[^id]` or `[?]`

**This is the most important constraint in this template. The verify
phase WILL block phase 7 (and the run will not log as complete) if
any factual line in your draft lacks either a footnote reference
`[^id]` or the citation-needed marker `[?]`.**

A "factual line" is any line containing a date, a four-digit year, a
place name, or a `[[wikilink]]` to a named entity.

For every such line, choose ONE:

- **`[^id]`** — when you can name a specific source.
- **`[?]`** — when you believe the claim but cannot point to a
  specific source. Do NOT invent a footnote you can't define
  with a real source.

### Worked example

```markdown
On 29 September 1941, the Sonderkommando 4a unit carried out mass
shootings at Babi Yar in Kyiv.[^historical-record] [[Aidele]] and her
family were among the Jewish residents of the city; the family's
exact circumstances at the time of the massacre are not recorded.[?]
```

The first sentence carries `[^historical-record]` because the date
and event are documented in published history. The second sentence
carries `[?]` because the model is asserting Aidele's presence in
Kyiv from family context but cannot source the specific
circumstances.

## Page conventions

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

## Self-check before returning

Scan your draft. For every paragraph and list item: does it contain
a date, year, place, or `[[wikilink]]`? If yes, does the line end
in `[^id]` or contain `[?]`? If neither, add `[?]` rather than
shipping a bare claim.

## Output format

Return ONLY a single JSON object matching `outputSchema`. No prose
before or after, no markdown code fences around the JSON itself. The
markdown body (including frontmatter) goes inside the `body` string
field — escape newlines as `\n` and double-quotes as `\"`. The
orchestrator parses your response with `JSON.parse` directly.
