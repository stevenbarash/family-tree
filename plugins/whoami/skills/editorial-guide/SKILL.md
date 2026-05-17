---
name: editorial-guide
description: Editorial standards, page conventions, citation system, and talk page structure for whoami.wiki. Use when writing, reviewing, or editing wiki pages.
user-invocable: false
---

# Editorial Guide

## Page types

### Person pages

**File**: `jane-doe.md` (one markdown file per page, slug-cased)

Encyclopedic article about a person. Documentary voice: third person, past tense, factual. The person page is a hub that links out to episode pages.

**Lead paragraph**: Biographical identity first, relationship to wiki owner in one sentence, arc in one more. No statistics in the lead — save those for a dedicated section. No emotional framing.

> Jane Doe (born 3 May 1997) is a Berlin-based photographer and former classmate. She and the wiki owner exchanged 6,200 Instagram DMs between March 2021 and May 2022, the largest one-on-one thread in the archive. They connected over film photography, collaborated on a zine, and met in person in Berlin in November 2021. The conversation faded after Jane moved to Tokyo in early 2022.

**What belongs**: Biographical details, chronological arc (summarized not exhaustive), key statistics, links to episode pages, media embeds, source citations.

**What doesn't belong**: Full voice note transcriptions, raw research notes, detailed retellings of specific episodes (those get their own episode pages).

**Blockquote discipline**: Only quote when exact words matter more than the information — confessions, turning points, self-descriptions that can't be paraphrased without losing the voice. Let paraphrasing carry the rest.

**Episode references**: When the chronological arc mentions a story with its own episode page, summarize in one sentence and link out:

```markdown
On 14 August, Jane described a disastrous shoot at Tempelhof
in a series of five voice notes (see [[Jane and the Tempelhof Disaster]]).
```

### Episode pages

**Naming**: `{Person} and the {Episode Title}` (e.g. `Jane and the Tempelhof Disaster`)

Self-contained page for a specific story, event, or extended narrative. More narrative latitude than person pages, but still third-person and factual. The storytelling comes from sequencing, detail, and well-chosen quotes — not from the writer's adjectives.

**Create when**: 3+ voice notes telling a connected story, or a sustained back-and-forth that would take more than two paragraphs to tell properly.

**What belongs**: Full contextual setup, the story with detail, all relevant voice note transcriptions inline, audio/video embeds, surrounding messages, links back to person page and related episodes.

**What it should feel like**: Reading one should feel like being shown a specific memory. Beginning, middle, end.

## Editorial standards

### Core principles

1. **One canonical home** — every piece of content lives in one place. Other pages link to it; they don't duplicate it.
2. **Prefer splitting to growing** — a story that takes more than two paragraphs deserves its own page.
3. **Documentary voice on person pages** — third person, past tense, factual. Like Wikipedia.
4. **Episode pages allow storytelling** — still third-person and factual, but more narrative.

### Don't interpret for the reader

- **Don't editorialize**: Replace adjectives with specifics. "They exchanged 1,800 messages in five days, averaging 360 per day" — not "The conversation density was staggering."
- **Don't inflate significance**: Cut "marking a pivotal turning point" and "reflecting a broader shift." If something is significant, facts demonstrate it without a caption.
- **Don't use promotional language**: No "vibrant," "rich," "renowned," "groundbreaking," "nestled," "showcases."
- **Don't attribute vaguely**: No "observers have noted" or "friends describe her as." Cite specific sources.

### Prose quality

- **Say "is" when you mean "is"**: Not "stands as" or "serves as."
- **Keep sentences short**: Split anything over ~40 words.
- **Vary rhythm**: Mix short and long sentences. Avoid the "rule of three" tic.
- **Use punctuation precisely**: Don't overuse em dashes as a Swiss Army knife.
- **Don't cycle through synonyms**: If you said "conversation," say "conversation" again.
- **Avoid formulaic transitions**: Cut "moreover," "furthermore," "notably," "additionally."
- **Don't frame by negation**: State what something is, not what it isn't.
- **Don't end sections with summaries**: No "In summary," "Overall," "In conclusion."

For the full words-to-watch list, see [words-to-watch.md](words-to-watch.md).

### Quoting conventions

Use direct quotes when:
- The exact words matter (confessions, self-descriptions, turning points)
- The phrasing is distinctive and can't be paraphrased without losing character
- The quote is short (under ~30 words)

Don't quote:
- Routine factual statements that can be paraphrased
- Three quotes in a row saying similar things
- To show off the archive

Integrate quotes grammatically into sentences. Save the `:::blockquote` directive for extended passages (2+ sentences) that need to stand alone.

### Date formats

Dates everywhere — frontmatter, body prose, GEDCOM, derived YAMLs — use `D Mon YYYY`:

- `28 Feb 1970` — full date
- `Feb 1970` — month-only
- `1970` — year-only
- `Abt 1886`, `Bef 1900`, `Aft 1850` — qualified
- `Bet 1850 And 1860` — range

Title-case month abbreviations (`Jan`–`Dec`). Title-case qualifiers (`Abt`, not `ABT` or `abt.`). Single-digit days (`8`, not `08`). Day-month-year order (never `Mon D YYYY` or `M/D/YYYY`).

You don't have to enforce these manually — `wai write` and `wai check --fix` auto-normalize on save. But target the canonical form so commit diffs stay tight.

## Talk page structure

Talk pages live alongside main pages as `<slug>.talk.md`. They use a small set of directives the renderer recognizes:

- `::open` — an open editorial question, counted by `wai search`'s "open gaps" badge.
- `::closed` — a previously-open question that has been resolved.
- `::superseded` — a closed question whose resolution has since been replaced.

A talk page may interleave research notes (with `## Research notes` section header — see Editor agent spec) with directive blocks for editorial questions.

Do NOT use section headers like `## Active gaps` or `## Open editorial questions` — those don't render any UI affordance and aren't counted.

## Citation system

Inline citations use markdown footnote syntax (`text[^id]` in the body, `[^id]: ...` definitions at the bottom of the page under a `## References` heading). Each footnote definition wraps a `:::cite-*` directive describing the source.

### Inline citation templates

**cite-message** — for text messages (DMs, chats):
```markdown
Jane's mother is from Munich.[^ig-2021-04-15]

[^ig-2021-04-15]: ::cite-message{snapshot=a1b2c3d4e5f6 date=2021-04-15 thread=janedoe_12345 note="Family background exchange"}
```

**cite-voice-note** — for voice note content:
```markdown
She first picked up a film camera in art class.[^vn-7]

[^vn-7]: ::cite-voice-note{number=7 date=2021-06-03 speaker=Jane snapshot=a1b2c3d4e5f6 note="Darkroom discovery story"}
```

**cite-photo** — for facts derived from photos:
```markdown
Jane enrolled at UdK in 2019.[^uni-id]

[^uni-id]: ::cite-photo{file=IMG_2847.jpg hash=... date=2021-05-20 snapshot=a1b2c3d4e5f6 note="University ID confirming enrollment"}
```

**cite-video** — for video content:
```markdown
The gallery opening drew about forty people.[^gallery-vid]

[^gallery-vid]: ::cite-video{file=berlin_gallery_opening.mp4 date=2021-11-12 snapshot=a1b2c3d4e5f6 note="Gallery opening footage"}
```

All templates include: **snapshot** (vault hash), **date**, **note** (human-readable description).

### Directive syntax

**Directive shapes**: use `::name{attrs}` (single colon-pair, single line) for leaf directives that carry only attributes — citations (`::cite-vault`, `::cite-message`, `::cite-voice-note`, `::cite-photo`, `::cite-video`), admonitions (`::open`, `::closed`, `::superseded`, `::gap`). Use `:::name{attrs}` opening on its own line, body content on subsequent lines, and `:::` close on its own line for container directives that have a body — infoboxes, blockquotes, dialogue, columns-list. The one-line `:::name{...}:::` shape is invalid and won't render or be picked up by the eval graders.

### Bibliography template

**cite-vault** — for the Bibliography section, describes full vault snapshots consulted:
```markdown
::cite-vault{type=messages snapshot=a1b2c3d4e5f6 timestamp="2021-03-01/2022-05-15" note="Instagram DM thread with Jane Doe"}
```

Additional fields: **type** (messages, photos, video, etc.), **timestamp** (date range).

### When to cite

**Always cite**: Biographical facts, direct quotes, specific event dates, statistics, claims corrected or disputed on the talk page.

**Don't need citations**: Broadly sourced observations, information already attributed inline with a date, episode page content drawn from a defined set of voice notes listed at the top.

### The `[?]` citation-needed marker

When you know (or strongly believe) a fact but cannot cite a specific source — for instance, family-shared knowledge you've absorbed from talk-page context, or a claim where you'd need to consult records you don't have access to — **mark the claim with a trailing `[?]`** rather than fabricating a footnote.

```markdown
Veniamin lived with Boris and Galina in Brooklyn until his death.[?]
Boris arrived in the United States in the mid-1980s.[?]
```

The marker is the model's escape hatch from the fabrication trap. Every factual sentence (one containing a date, year, place, or `[[wikilink]]` to a named entity) MUST end in **either** a footnote reference `[^id]` **or** the `[?]` marker. Inventing a footnote that points to a vague or unread source is forbidden — use `[?]` and let a reviewer either cite or remove the claim.

The `wai check --only citation` opt-in detector enforces this. The author pipeline's verify phase blocks completion when any factual sentence on the current slug lacks a source.

`[?]` claims are not the same as `::open` threads:
- Use **`[?]`** for an *assertion you believe is true* but haven't sourced.
- Use **`::open`** on the talk page for *gaps and questions* the data leaves open.

### Reusing footnotes

A single footnote definition can be referenced multiple times in the body — just repeat the `[^id]` marker:

```markdown
Jane's mother is from Munich.[^ig-2021-04-15]
Her father works in Zurich.[^ig-2021-05-02]
She has a younger brother named Max.[^ig-2021-04-15]

[^ig-2021-04-15]: ::cite-message{snapshot=a1b2c3d4e5f6 date=2021-04-15 thread=janedoe_12345 note="Family background exchange"}
[^ig-2021-05-02]: ::cite-message{snapshot=a1b2c3d4e5f6 date=2021-05-02 thread=janedoe_12345 note="Family details, father in Zurich"}
```

### Page structure

Every person and episode page ends with:

```markdown
## References

[^ig-2021-04-15]: ::cite-message{snapshot=a1b2c3d4e5f6 date=2021-04-15 thread=janedoe_12345 note="Family background exchange"}
[^vn-7]: ::cite-voice-note{number=7 date=2021-06-03 speaker=Jane snapshot=a1b2c3d4e5f6 note="Darkroom discovery story"}

## Bibliography

::cite-vault{type=messages snapshot=a1b2c3d4e5f6 timestamp="2021-03-01/2022-05-15" note="Instagram DM thread with Jane Doe"}
::cite-vault{type=voice_notes snapshot=b2c3d4e5f6a1 timestamp="2021-04-12/2021-06-03" note="47 voice notes, Jane and wiki owner"}
```

**References** = inline citations tracing specific claims to specific moments in the vault.

**Bibliography** = full vault snapshots consulted for the page overall.

## Corrections

When an external source contradicts a GEDCOM-derived value (cemetery records, Yad Vashem, family confirmation), record the correction in **two places**:

1. **Page narrative** — explain the reasoning, cite the source.
2. **Page frontmatter `corrections:` array** — machine-readable so the renderer can overlay the corrected value into the infobox.

**Never write a narrative-only correction.** The infobox keeps showing the wrong (GEDCOM) value if the frontmatter is silent. The two-place rule keeps the rendered page consistent with the prose.

### Frontmatter shape

```yaml
corrections:
  - field: death.date         # required: birth.date, birth.place, death.date, death.place, name
    value: "1989"             # the corrected value as a string
    source: "Find A Grave Memorial #209496149"   # provenance
    record: I372189255251     # OPTIONAL — defaults to this page's own gedcom.record
```

For corrections targeting a different individual (e.g. a family overview page correcting a parent's death year), spell out `record:` explicitly.

### Field whitelist (v1)

Only these fields are correctable via frontmatter today:

- `birth.date`, `birth.place`
- `death.date`, `death.place`
- `name`

Adding new relationships (parents, spouses, children) or new individuals is **not** a frontmatter correction — those require a direct GEDCOM edit. If the correction you want to make isn't in the whitelist, the right move is to edit `genealogy/barash-tree.ged` directly and run `wai sync-gedcom`.

### Promotion to GEDCOM

When you (or a human) decide the correction is durable enough to live in the GEDCOM itself, run:

```bash
wai promote-corrections --record I... --apply
```

This rewrites the relevant `1 BIRT` / `1 DEAT` block in `barash-tree.ged` (with a `2 NOTE` line citing your `source`) and removes the correction entry from the page. Provenance moves from the page to the GEDCOM. Run `wai sync-gedcom` afterwards to regenerate `derived/*.yml`.

Without `--apply` the command is dry-run and prints the planned changes only.

### Drift detection

`wai check` reports your corrections as one of:

- **active** — page value differs from raw derived value (the overlay is doing real work).
- **promotable** — page value matches raw derived value (correction is redundant; either drop it from the page or run `wai promote-corrections`).
- **conflict** — two pages target the same `(record, field)` with different values. Hard error; resolve before merging.

## Fact-correction discipline

When you correct a factual error in any wiki page — a wrong date, medal, unit, name, place, relationship, source attribution — the correction has to be replicated everywhere the wrong claim lives. Wiki facts are graph-distributed: the same claim typically appears on the live page, the page's talk file (research notes and drafting plan), any episode page that derives from the same source extraction, the source page's "confirmed entries" summary, and cross-references on related people's pages.

**The required workflow when fixing any factual error:**

1. **List every variant of the wrong claim** before you touch the keyboard. Names, dates, units, medals, and place names typically have English + Russian + Ukrainian + sometimes Hebrew/Yiddish forms. The wrong claim may also appear in inverse framings ("Both brothers were decorated X") and in cite-vault note prose.

2. **Grep the entire wiki** for every variant before editing any single file:

   ```bash
   wai grep-claims "<phrase>" --variants "<translation>,<acronym>,..."
   ```

   `wai grep-claims` is the right tool — it searches pages, talk pages, and `assets/sources/**/transcript.md` in one pass. Fall back to raw `grep -rn` only when you need a non-standard search root.

3. **Build a numbered audit list** — file path, line number, what's wrong, what it should be — before opening any editor. This makes scope visible and prevents the fix-one-ship-get-asked-to-fix-more pattern.

4. **Fix all locations in one pass** so the wiki is internally consistent at every commit boundary. Cross-page links should match the corrected facts immediately, not after a follow-up.

5. **Final grep** to confirm zero remaining hits — or only intentional hits inside correction-notes that cite the old claim to flag it as fixed.

**Talk pages need fixing too.** Talk pages are research logs that feed future re-drafts of the live page; a stale fact in a talk page's *Facts extracted* or *Drafting plan* section becomes a re-injected stale fact on the next regeneration. When fixing a live page, fix its `.talk.md` companion in the same pass — typically by adding a top dated research note ("2026-MM-DD — correction note") that records what was wrong and why, then editing the affected lines inline with a brief `*[Corrected 2026-MM-DD from "<old>"]*` annotation so the audit trail is preserved.

**Episode pages are derived content.** A `[[Person]] and the [[Event]]` episode page that was authored from the wrong source extraction propagates the same wrong claims into a narrative the reader will treat as authoritative. When fixing a person page, check `pages/<person>-and-*.md` for episode pages and reconcile them.

**The discipline applies symmetrically to NEW facts.** When you add a fact (a newly-discovered birthplace, a confirmed military unit, a corrected death date), grep for everywhere that the *old* fact (or its absence) was asserted and propagate. Adding a fact to one page without updating the talk page's drafting plan leaves the wiki internally inconsistent.

**Why this is its own section:** an editorial agent who skips the grep step ships internal contradictions. A reader cross-checking the wiki finds the live page says one thing, the talk page says another, the episode page asserts a third — and concludes the wiki can't be trusted as a coherent source. Internal consistency is editorial, not just hygienic.

## Genealogy data quality

For pages that surface GEDCOM-derived data (person pages, family overviews,
wartime/migration narratives), the page-side editorial rules above are not
enough — the underlying data has its own invariants. The summary: **separate
the physical place from the political regime**. `wai check` enforces these,
and the data repo's `AGENTS.md` documents them in full. The points an editor
needs to know while writing prose:

1. **Same place, same dot.** "Kiev, Ukraine, Soviet Union" (1941) and "Kiev,
   Ukraine, Russian Empire" (1900) and "Kyiv, Ukraine" (2025) all point at
   the same town. The map collapses them. The page prose can and should keep
   the historical attribution where it matters editorially ("died at Babi
   Yar in Soviet Ukraine, September 1941").

2. **Don't conflate the regimes in prose either.** A person born in 1902 was
   born in the Russian Empire, not the Soviet Union — even if the GEDCOM
   record says "Kiev, Ukraine, Soviet Union" (which would be a data-entry
   error `wai check` flags as an anachronism). When you hit anachronism
   findings while writing about a person, the fix lives in the GEDCOM
   (correct the PLAC), not in the prose.

3. **Tentative identifications stay tentative in prose.** If
   `places-coords.yml` has a `note:` flagging an entry as best-effort
   (Kozyatyn for "Kazotin, Russia", Pyzdry for "Peisern", the Trakai-vs-
   Druskininkai Ratnyčia variants), the page prose should match — phrase as
   "tentatively identified as", not as established fact. Cite the note's
   reasoning if a reader would otherwise expect a citation.

4. **Don't manufacture history to dress up data.** The temptation when
   writing about a Russian-Empire-era ancestor is to drop in period color
   ("during the reign of Nicholas II", "before the 1905 revolution"). Keep
   it factual: state what the records show, name the regime only when the
   record itself names it or when the regime materially shaped the event.

5. **`wai check` before commit.** The detectors that matter for editorial
   work: `coverage` (redlinks, unmapped places), `data` (correction
   conflicts, anachronisms). Treat `info` findings as cleanup signals, not
   blockers; treat `warn` and `error` as blockers.

## Page conventions

The wiki is a tree of markdown files on git. Page kind is encoded in the filename, not a namespace prefix.

| Kind | Filename pattern | Purpose |
|------|------------------|---------|
| Person / episode | `<slug>.md` | Person and episode pages |
| Talk | `<slug>.talk.md` | Editorial process and research notes for the matching page |
| Source | `source/<slug>.md` | Data source documentation |
| Task | `task/<slug>.md` | Agent work logs |

### Redirects

Redirects are not separate pages. Add an `aliases:` field to the target page's frontmatter listing every name that should resolve to it:

```markdown
---
title: Jane Doe
aliases:
  - Jane
  - Jane D.
---
```

### Other directives

- `:::infobox-person` for biographical infoboxes (fields like `name`, `birth`, `birthPlace`)
- `:::blockquote{by="Person"}` for extended quoted passages
- `:::dialogue{speaker="Jane"}` for transcribed exchanges
- `:::columns-list{cols="2"}` for multi-column lists
- `::gap` as a leaf admonition for inline gap markers (use sparingly — prefer talk page threads)

Images use standard markdown: `![caption](/assets/photo.jpg)`. Headings use `## Heading` / `### Subheading` (not `==Heading==`). Emphasis uses `**bold**` and `*italic*` (not `'''bold'''` / `''italic''`). Wikilinks `[[Page]]`, `[[Page|alt]]`, and `[[Page#Section]]` are preserved by the renderer.
