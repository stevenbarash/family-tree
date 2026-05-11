---
name: writing-articles
description: Multi-stream article authoring for whoami.wiki — research synthesis, episode-spinoff judgment, person-vs-episode drafting. Composes with editorial-guide.
user-invocable: false
---

# Writing articles

This skill assumes you have already loaded `editorial-guide`. It adds:
how to research, how to decide person-vs-episode, and how to weave the
three input streams (relations / family narrative / external research)
into prose.

## Preconditions

- The evidence drawer for the slug (derived YAML, talk-page research
  notes, narrative file, audio transcripts) has been gathered by the
  caller and is provided in the request `context`.
- Web access is available (research template only).
- `editorial-guide` is loaded and applies to all drafted prose.

## Templates

The harness adapter calls this skill with one of five templates:

- `research-questions` — Phase 2; emit web-search queries from gaps.
- `outline` — Phase 3; emit drafting plan + episode spinoffs.
- `draft-person` — Phase 4; emit person-page markdown.
- `draft-episode` — Phase 5; emit episode-page markdown (one call per
  episode).
- `interview` — used by `wai interview`; emit Q&A questions tailored
  to gaps in the evidence drawer.

All five templates are implemented. The harness adapter resolves
`prompt-templates/<template>.md` automatically when invoked.

## Three-stream weaving rule

Every *claim* (a factual assertion: a date, a place, an action, a
relationship, an attribution) must be traceable to at least one input
stream — relations, narrative, or external research. Connective and
summary prose — sentences that sequence claims, transition between
sections, or compress an arc into a paragraph — is permitted and
necessary for readable episode pages. Speculation that fills a silence
with a guess is forbidden; gaps are recorded as `::open` threads on
the talk page.

## Forbidden, even on episode pages

- Inventing details to dress up data ("the cold November wind…").
- Period color the records don't license. Name a regime only when the
  record names it or it materially shaped the event.
- Filling silences with plausible guesses.
- First-person family voice. The wiki is third-person across all kinds.

## Self-check before saving (semantic only)

- Every claim has a footnote, OR is GEDCOM-derived, OR is from the
  evidence drawer with the source identifiable.
- No words from `editorial-guide/words-to-watch.md` survived.
- The page reads as a coherent narrative — no orphan paragraphs, no
  abrupt subject changes between sections.

Mechanical checks (footnote integrity, references/bibliography
placement, wikilink resolution, frontmatter shape) are **not**
duplicated here. `wai check` enforces them; `wai author` Phase 6
surfaces any findings.
