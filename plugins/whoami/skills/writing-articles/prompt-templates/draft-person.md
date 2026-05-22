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

## CRITICAL RULE: every factual line must carry `[^id]` or `[?]`

**This is the most important constraint in this template. The verify
phase WILL block phase 7 (and the run will not log as complete) if
any factual line in your draft lacks either a footnote reference
`[^id]` or the citation-needed marker `[?]`.**

A "factual line" is any line containing a date, a four-digit year, a
place name, or a `[[wikilink]]` to a named entity. List items count.
Lead paragraphs count. Infobox content does not.

For every such line, choose ONE:

- **`[^id]`** — when you can name a specific source (a research-note
  ID, a vault snapshot, a citation directive in `## References`).
  Reuse the same `[^id]` across many lines if the source is the same.
- **`[?]`** — when you believe the claim but cannot point to a
  specific source. This is the model's "I don't know where this
  comes from" escape hatch. It is far better than inventing a
  footnote. Reviewers will either source or strike `[?]` claims.

**Do NOT** invent a footnote `[^id]` whose definition you can't
write with a real source. Do NOT leave factual lines bare.

### Worked example

GEDCOM record for the page subject is the implicit source for that
subject's own birth/death dates, places, and family — use `[^gedcom]`
as the footnote id and define it once at the bottom pointing to the
`::cite-vault` directive. Web research from Phase 2 returns claims
with URLs — those become numbered footnotes (`[^1]`, `[^2]`, …).
Anything you assert beyond the GEDCOM record and the Phase 2 claims
must be marked `[?]`.

```markdown
**Boris Smertenko** (born 27 Jul 1946) is the husband of
[[Galina Burmenko]] and the father of [[Victoria Smertenko]] and
[[Erica Smertenko]].[^gedcom] Galina is the younger sister of
[[Steven Barash]]'s maternal grandmother [[Zina Burmenko]],
making Boris Steven's maternal great-uncle by marriage.[^gedcom]
His US documentary record spans 1985 through 2020, in Brooklyn
and (from 1997) in Delray Beach, Florida.[^1][^2][^3]

The household resided at 2821 Bragg Street in Sheepshead Bay,
Brooklyn.[?]

## References

[^gedcom]: ::cite-vault{type="genealogy" snapshot="barash-tree" record="I28906361808"}
[^1]: ::cite-vault{record="S1438116907" title="U.S., Public Records Index, 1950–1993 Vol. 1" apid="1,1788::0"}
…

## Bibliography

::cite-vault{type="genealogy" snapshot="barash-tree" record="I28906361808"}

::cite-vault{record="S1438116907" title="U.S., Public Records Index, 1950–1993 Vol. 1" apid="1,1788::0"}

::cite-vault{record="S1438118374" title="U.S., Public Records Index, 1950–1993 Vol. 2" apid="1,1732::0"}

::cite-vault{record="S1438116790" title="U.S., Index to Public Records, 1994–2019" apid="1,62209::0"}
```

The first three sentences carry `[^gedcom]` (their facts trace to
the page's own derived YAML). The residency sentence carries the
three Ancestry source IDs from the derived YAML's `sources` block.
The specific Brooklyn street address — not in any derived record —
carries `[?]` because the model cannot point to a source for it.

**Critical**: every `::cite-vault{...}` directive used inside a
`[^id]:` definition in `## References` must ALSO appear as a
standalone entry in `## Bibliography`. The consistency check enforces
this: an inline cite-vault not duplicated in Bibliography is a
finding that blocks verify. Just copy each one. Bibliography is the
high-visibility source listing; References ties them to specific
sentences.

## Naming source conflicts

When two sources in the evidence drawer or research notes disagree —
a 1930 census says born 1895, an SSDI death index gives 1893; a
gravestone date conflicts with a death certificate; one ship manifest
records "Borys" arriving in 1908, another "Boris" in 1910 — **do not
pick silently and do not average**. Name the conflict in prose and
cite both sources:

```markdown
The 1930 US Census records Boris's birth year as 1895;[^census-1930]
the SSDI death index gives 1893.[^ssdi] The earlier year is the
better-supported value, since the SSDI is based on the original
Social Security application Boris himself filed in 1956.[^ssdi]
```

If a tier or recency rule lets you prefer one source (primary over
secondary; contemporaneous over retrospective; the subject's own
filing over a third party's report), state the reason briefly and
proceed with the preferred value. If you have no basis to prefer one,
present both without resolving; a reviewer will adjudicate or commission
further research.

Silently picking — writing "born 1893" with only the SSDI footnote and
no mention of the conflicting census — is the failure mode this
section guards against. It turns a disagreement into an apparent fact.

## Page structure

Produce the full markdown body for the person page, including
frontmatter (`title`, `owner`, `editors`, `type: person`, `aliases`,
`categories`, `gedcom: { file, record, snapshot }`, `created`).

The wiki's editorial guide applies (loaded as part of this skill —
read it before drafting). Specifically: documentary voice, third
person, past tense, no editorializing, no words from
`editorial-guide/words-to-watch.md`, citation directives in the
standard shapes (`::cite-message`, `::cite-vault`, etc.).

Person-page conventions:

- Lead paragraph: identity → relationship to the wiki owner → arc.
  Three sentences max. No statistics in the lead.
- Sections per the outline; mention episode pages with a one-sentence
  summary plus a wikilink (`[[<episode-slug>|<title>]]`).
- `## References` for inline footnotes (define `[^gedcom]` here and
  every other `[^id]` you reference).
- `## Bibliography` with `::cite-vault{...}` for full vault snapshots.
- `## See also` for related person/episode pages.

`redlinks` — list any wikilinks you used that don't yet have pages
(GEDCOM-derived names of relatives, cited but un-pageified episodes).
The orchestrator records these in the talk page so the user can
backfill.

## Self-check before returning

Scan your draft. For every paragraph and list item: does it contain
a date, year, place, or `[[wikilink]]`? If yes, does the line end
in `[^id]` or contain `[?]`? If neither, add `[?]` rather than
shipping a bare claim.

Then scan the evidence drawer and research notes one more time:

- **Are there sources that disagree on a date, place, or relationship?**
  If yes, is the disagreement named in the prose (see *Naming source
  conflicts*)? Silently picking one is a failure mode the self-check
  must catch.
- **Are there chronology gaps the outline flagged as silences?** If
  yes, did you avoid filling them with plausible-sounding prose? A
  silence properly named is better than a sentence quietly invented.

## Output format

Return ONLY a single JSON object matching `outputSchema`. No prose
before or after, no markdown code fences around the JSON itself. The
markdown body (including frontmatter) goes inside the `body` string
field — escape newlines as `\n` and double-quotes as `\"`. The
orchestrator parses your response with `JSON.parse` directly.
