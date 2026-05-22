---
name: outline
description: Plan the article structure (chronological spine + person hub + episode spinoffs + named silences) from gathered evidence and research notes.
outputSchema:
  type: object
  required: [person, episodes]
  properties:
    person:
      type: object
      required: [lead, sections]
      properties:
        lead: { type: string }
        sections:
          type: array
          items:
            type: object
            required: [heading, gist]
            properties:
              heading: { type: string }
              gist: { type: string }
    episodes:
      type: array
      items:
        type: object
        required: [slug, title, scope]
        properties:
          slug: { type: string }
          title: { type: string }
          scope: { type: string }
    chronology:
      type: array
      items:
        type: object
        required: [date, event, source]
        properties:
          date: { type: string }
          event: { type: string }
          source: { type: string }
    silences:
      type: array
      items: { type: string }
---

# Outline template

Given the gathered evidence drawer plus the research notes from Phase
2, produce a drafting plan for the person's article and any episode
pages worth spinning off. The plan starts with a **chronological
spine** — the dated events the page will be organized around — and
names the **silences** where the record is absent, so neither prose
nor outline tries to fill them with speculation.

## Chronological spine

Before choosing sections, build a unified chronology of dated events
from the evidence drawer plus the Phase 2 research claims. Emit it as
the `chronology` array — one entry per dated event:

- `date` — in `D Mon YYYY` form when known to the day; `Mon YYYY`,
  `YYYY`, `Abt YYYY`, `Bet YYYY And YYYY` when partial. Match the date
  format used elsewhere in the wiki.
- `event` — one short sentence describing what happened.
- `source` — a research-note id, a footnote id you intend to use in
  the draft, or a short citation tying the event to its evidence.

The chronology drives the page. Sections should organize around it,
not invent their own order. A page about a person whose chronology
spans 1923–2003 should not lead with "Family" if "Family" mostly
covers 1950s-and-after events; lead with the early-life material.

If the evidence is too thin for a chronology (one or two dated
events), emit those two and let the page be short.

## Silences

A silence is a stretch of the chronology where the record is absent
and the writer cannot fill it without speculation. Name these
explicitly in the `silences` array — one short sentence per gap:

- "1910–1920: no US census record; not yet confirmed whether Boris
  remained in Ukraine or had emigrated by 1918."
- "1942–1945: no documentation of wartime location or fate."

Silences become talk-page open threads in the editorial process. Don't
fill them in prose; name them so they can be researched later.

If the chronology is complete (no gaps you'd flag), emit `silences: []`.

## Person hub

- `lead` — three sentences: identity → relationship to the wiki owner
  → arc. No editorial framing, no statistics in the lead.
- `sections` — heading + one-line gist of what the section covers.
  Common sections: Family, Life, Death, Names, Notes, References.
  Don't invent sections that won't have content.

## Episode spinoffs

Apply the spinoff heuristic: 3+ research notes / voice notes /
narrative paragraphs telling a connected story; OR an event with a
clear arc that needs more than two paragraphs to tell; OR a
wartime/migration/persecution event warranting its own page on
accuracy grounds.

For each episode:

- `slug` — kebab-case, format `<person>-and-<event>` (e.g.
  `aidele-and-the-bazaliya-road`).
- `title` — Title Case, matches the episode-page convention.
- `scope` — one paragraph describing what this episode covers and the
  evidence it draws on. The orchestrator passes this to `draft-episode`.

If no episode spinoffs are warranted, return `episodes: []`.

Return ONLY a single JSON object matching `outputSchema`. No prose
before or after, no markdown code fences. The orchestrator parses
your response with `JSON.parse` directly.
