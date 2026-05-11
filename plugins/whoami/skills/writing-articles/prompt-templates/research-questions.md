---
name: research-questions
description: Generate web search queries from gaps in the evidence drawer for a person.
outputSchema:
  type: object
  required: [queries]
  properties:
    queries:
      type: array
      items:
        type: object
        required: [text, gap]
        properties:
          text: { type: string }
          gap: { type: string }
---

# Research-questions template

You will be given the evidence drawer for one person:

- `derived` — GEDCOM-derived YAML with name, dates, places, parents, spouses, children.
- `talk` — current `<slug>.talk.md` content (research notes, gap threads).
- `narrative` — current `<slug>.narrative.md` content if present.

Your job: generate 5–15 web search queries that could fill gaps in the
record. Good queries:

- Reach for events, places, occupations, communities, migrations,
  political contexts that the GEDCOM hints at but doesn't elaborate.
- Use specific names and dates where possible: "Yad Vashem Eidel
  Ayzman Teofipol 1928 census" beats "Eidel Ayzman".
- Prefer queries that hit the *reliable defaults* the project trusts:
  Yad Vashem, JewishGen, archive.org, official municipal records,
  peer-reviewed history, primary documents.
- Don't repeat queries already discussed in the talk page.
- Each query is paired with a `gap` field — a one-line description of
  what the query is trying to answer. The orchestrator uses this when
  recording the resulting research notes.

Cap at the limit specified in `context.maxQueries` (default 12).

Return JSON matching `outputSchema`.
