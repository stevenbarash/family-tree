---
name: research-questions
description: Perform web research for a person and return claims with sources.
outputSchema:
  type: object
  required: [claims]
  properties:
    claims:
      type: array
      items:
        type: object
        required: [text, url, gap]
        properties:
          text: { type: string }
          url: { type: string }
          gap: { type: string }
    refuseToFabricate:
      type: boolean
---

# Research template

## CRITICAL: output format

**Return ONLY a single JSON object matching `outputSchema`. No prose
before or after, no markdown code fences, no "I searched for X and
found Y" narration. The orchestrator parses your reply with
`JSON.parse` and aborts on anything else.**

You will use the `WebSearch` and `WebFetch` tools to do research.
The tool outputs are for YOUR consumption; do NOT echo them back as
prose in your final reply. Your final reply is the JSON object only.

### Output shape

```json
{
  "claims": [
    {
      "text": "Boris Smertenko was naturalized in the Eastern District of New York in 1991.",
      "url": "https://www.archives.gov/nyc/citizenship/naturalization-eastern-district.html",
      "gap": "naturalization-date"
    }
  ],
  "refuseToFabricate": false
}
```

If you found no reliable sources and the evidence drawer is also
empty, return:

```json
{ "claims": [], "refuseToFabricate": true }
```

## What you are doing

You will be given the evidence drawer for one person:

- `derived` — GEDCOM-derived YAML with name, dates, places, parents, spouses, children.
- `talk` — current `<slug>.talk.md` content (research notes, gap threads).
- `narrative` — current `<slug>.narrative.md` content if present.

Your job: perform web research to fill gaps in the record, and return
structured **claims** — each with the source URL and the gap it addresses.

## Procedure

1. Identify 5-15 gaps in the record. Good gaps: events, places, occupations,
   communities, migrations, political contexts that the GEDCOM hints at but
   doesn't elaborate.
2. For each gap, use the WebSearch tool to find candidate sources. Prefer
   *reliable defaults*: Yad Vashem, JewishGen, archive.org, official municipal
   records, peer-reviewed history, primary documents (census, ship manifests,
   military records). Drop ancestry-forum results, blogs with no provenance,
   speculative aggregators.
3. For each reliable source, use the WebFetch tool to read it, then extract
   one or more claims you can support with that source. Skip sources that
   don't yield a citable claim.
4. Build the `claims` array. Each entry:
   - `text` — the claim, in one sentence.
   - `url` — the source URL.
   - `gap` — a short tag describing which gap this fills.
5. If you cannot find any reliable sources for any gap AND the evidence
   drawer is empty (no derived/talk/narrative), set `refuseToFabricate: true`
   and return an empty claims array. The orchestrator will exit with a
   refuse-to-fabricate code.

Cap at `context.maxClaims` (default 12).

## Reminder: output is JSON only

After all your tool calls complete, your final reply MUST be the
JSON object alone — nothing before it, nothing after it, no fences.
