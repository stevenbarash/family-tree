---
name: outline
description: Plan the article structure (person hub + episode spinoffs) from gathered evidence and research notes.
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
---

# Outline template

Given the gathered evidence drawer plus the research notes from Phase
2, produce a drafting plan for the person's article and any episode
pages worth spinning off.

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
