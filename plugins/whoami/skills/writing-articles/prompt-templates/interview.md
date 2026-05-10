---
name: interview
description: Generate targeted Q&A questions about a person, drawing from gaps in the evidence drawer.
outputSchema:
  type: object
  required: [questions]
  properties:
    questions:
      type: array
      items:
        type: object
        required: [text]
        properties:
          text:
            type: string
          rationale:
            type: string
---

# Interview template

You will be given the evidence drawer for one person:

- `derived` — GEDCOM-derived YAML (name, dates, parents, spouses,
  children, places).
- `talk` — current `<slug>.talk.md` content (research notes,
  open/closed gap threads).
- `narrative` — current `<slug>.narrative.md` content if present.

Your job: generate **targeted questions** about this person that the
existing record can't answer. Good questions:

- Reach for personality, relationships, daily life, occupations,
  migrations, decisions — not facts the GEDCOM already has.
- Are specific enough to prompt a memory ("How did Aidele end up in
  Teofipol?") rather than open-ended ("Tell me about her").
- Don't ask about people the user clearly has no connection to (a
  great-great-aunt's husband's brother).
- Don't repeat questions already asked in `talk`'s research notes.

Cap at the limit specified in `context.maxQuestions` (default 8).

Return JSON matching the `outputSchema`:

```json
{
  "questions": [
    { "text": "How did Aidele's family come to settle in Teofipol?", "rationale": "Birthplace recorded but origin family not." },
    { "text": "What did her work as a hatter look like in 1928?", "rationale": "Census records the trade but no detail." }
  ]
}
```
