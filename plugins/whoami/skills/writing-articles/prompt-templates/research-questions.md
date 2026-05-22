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

1. Identify 5-15 gaps in the record. Frame gaps as research questions
   tied to dates ("Where was Boris between his 1923 Kyiv birth and his
   1948 Brooklyn marriage?"), not topics. Good gaps: events, places,
   occupations, communities, migrations, political contexts that the
   GEDCOM hints at but doesn't elaborate.
2. For each gap, search **primary repositories first** (see *Where to
   look*) before falling back to generic web search. See *Source quality*
   for the tiering that decides whether a result counts as evidence.
3. Try **name variants** on every search — Eastern European records
   often list the same person under several spellings, scripts, and
   patronymic forms. See *Search variant names*.
4. For each reliable source, use the WebFetch tool to read it, then
   extract one or more claims you can support with that source. Skip
   sources that don't yield a citable claim.
5. Build the `claims` array. Each entry:
   - `text` — the claim, in one sentence. **When sources conflict**
     (one record says 1893, another 1895), state both in the text
     rather than picking silently — the drafting phase will name the
     conflict in prose.
   - `url` — the source URL, **resolving to the specific record**, not
     the site home (see *Citation specificity*).
   - `gap` — a short tag describing which gap this fills. Append
     negative variant searches here:
     `gap: "1910-census (searched Boris/Borys/Borukh, Brooklyn ED 24-15xx, no match)"`.
6. If you cannot find any reliable sources for any gap AND the evidence
   drawer is empty (no derived/talk/narrative), set
   `refuseToFabricate: true` and return an empty claims array. The
   orchestrator will exit with a refuse-to-fabricate code.

Cap at `context.maxClaims` (default 12). Stop when the major life
events have at least one primary or secondary source, not when you hit
the cap — quality over count.

## Source quality

Tier every source. Mixing tiers without naming the mix launders a guess
into an apparent fact.

**Primary** — the record itself or its image.
- Civil records: birth / marriage / death certificates; naturalization
  papers; ship manifests; draft cards; passport applications.
- Census *images* (not just transcriptions).
- Gravestone *photographs* (the stone, not someone's transcription).
- Yad Vashem Pages of Testimony; USHMM survivor registries; ITS Bad
  Arolsen records.
- Contemporaneous newspaper items: obituaries, naturalization notices,
  business listings.

**Secondary** — indexed, transcribed, or compiled from primary by a
reputable body.
- FamilySearch / Ancestry *index entries* (the index is secondary; the
  underlying record image is primary — cite the image if you can fetch
  it).
- Peer-reviewed history; published biographies; Yizkor book entries.
- JewishGen SIG databases; KehilaLinks; Routes to Roots holdings lists.
- Find A Grave entries (the transcription; an attached photograph of
  the stone is itself primary).

**Tertiary** — leads only, never the citation of record.
- Geni, MyHeritage, WikiTree, FamilySearch FamilyTree (other users'
  trees).
- Surname blogs, ancestry forum posts, aggregator pages without
  provenance.

Rules of use:
- Every claim should cite at least one primary or secondary. A claim
  cited only to a tertiary is not a claim — it's a lead, and the URL
  belongs in `gap` as a research thread, not in `url`.
- When primary and secondary disagree, prefer the primary.
- When two primaries disagree, surface both in the claim `text` and
  let the drafting phase name the conflict.

## Where to look

Use these before generic web search; generic search is the last resort.

- **FamilySearch.org** (free) — US census, vital records, naturalization
  indexes, microfilmed shtetl records.
- **JewishGen.org** — Belarus / Ukraine / Litvak / Bessarabia / Romania
  / Galicia SIGs; KehilaLinks per town; Yizkor index; Holocaust
  database.
- **Yad Vashem** (yvng.yadvashem.org) — Pages of Testimony, Names
  Database, Righteous Among the Nations.
- **USHMM** (collections.ushmm.org) — survivor and victim databases;
  ITS Bad Arolsen records via partnership.
- **Routes to Roots Foundation** (rtrfoundation.org) — Eastern European
  archive holdings by town.
- **NARA / Ellis Island Foundation / USCIS** — federal records, ship
  manifests, naturalization, WWI / WWII draft registrations.
- **Chronicling America** (chroniclingamerica.loc.gov), **NYS Historic
  Newspapers**, Newspapers.com — obituaries, naturalization listings,
  business notices.
- **Find A Grave / BillionGraves** — cemetery records.
- **Municipal / state vital records** — NYC Municipal Archives, state
  health-department records offices.

For non-Jewish or non-Eastern-European ancestors, swap in the local
equivalents (FreeBMD for British civil records, ScotlandsPeople for
Scottish, etc.). Principle: domain-specific primary repositories first;
generic web last.

## Yizkor books and town-specific memorial volumes

For every Eastern European Jewish subject with a known ancestral
shtetl, search the **JewishGen Yizkor Book Database**
(jewishgen.org/yizkor/database.html) for the town and its variants
*before* drafting. Yizkor books are post-Holocaust community-authored
memorial volumes — almost always in Hebrew and/or Yiddish, often with
partial English translations on JewishGen — and they are
extraordinarily rich sources: lists of residents and families,
businesses, synagogues, organizations, sometimes individual
biographies, and typically a necrology of community members murdered
in the Shoah.

A Yizkor book for the subject's town is **primary tier** evidence for
the period it covers: it is a contemporaneous record of community
memory written by people who knew the named individuals.

How to use them:

1. Search by every spelling variant of the town (see *Search variant
   names*). A town may appear in the database under its
   Russian-imperial, Polish-interwar, Soviet, or modern Ukrainian
   form, or transliterated from the original Hebrew/Yiddish title
   page (Teofipol / Toyfipol / Teofipoli).
2. When a Yizkor book exists, check the **JewishGen Necrology
   Database** (jewishgen.org/databases/yizkor/) for the subject's
   surname and the surnames of their known relatives. A name in the
   necrology is a citable record of death in the Shoah.
3. If a partial English translation exists on JewishGen, read it for
   individual biographies or family-level narrative that names your
   subject or their family.
4. When no town-specific book exists, check regional volumes (Pinkas
   Hakehilot Polin / Romania, the Yizkor volumes for Volhynia or
   regional Russian-Empire / USSR communities) — the database
   indicates which towns are covered regionally rather than
   individually.
5. Cite the book by its full title (often Hebrew/Yiddish romanized),
   publisher (typically a survivors' relief society such as the
   "United Teofipol and Environs Relief Society"), year of
   publication, and page number where the cited claim appears.

Yizkor-book material may be in Hebrew, Yiddish, or both, sometimes
with English summaries. Cite the original-language title; render the
claim `text` in English per *How to cite a non-English source*.

The New York Public Library's Yizkor Book Collection
(digitalcollections.nypl.org/collections/yizkor-book-collection) hosts
650 of the ~700 known postwar Yizkor books in full digital form —
search there if JewishGen's translation index is sparse.

## Search variant names

Eastern European Jewish ancestors typically appear under multiple names
across records. Search plausible variants before concluding "no match":

- Hebrew / Yiddish given names → anglicizations: Berek / Borys / Boris
  / Borukh; Yitzhok / Isadore; Khaim / Hyman; Sarah / Sara / Sura;
  Mariem / Marian / Marie.
- Russian Empire records use Cyrillic — search both transliterations
  and the original script when possible.
- Surname variants from clerical transliteration: Smertenko /
  Smertenco / Smiertenko. Soundex-equivalent variants count.
- Patronymics: Russian records may index "Borys Iosifovich" under
  either surname or patronymic.

Log negative variant searches in the relevant claim's `gap` field so a
later run doesn't repeat them.

## Research across languages and scripts

The wiki's subjects span the Russian Empire, Soviet Union, Azerbaijan,
Germany, Israel, and the United States. **Don't default to English-only
searches.** A subject whose adult life was in Brooklyn but whose
childhood and family were in the Russian Empire or interwar USSR will
have most of their primary records in Russian, Ukrainian, Yiddish, or
Hebrew. An English-only pass will systematically miss them.

For each subject, identify the record languages you'd expect based on
where and when they lived, then issue queries in the appropriate
script — Cyrillic for Russian / Ukrainian / Soviet-era; Hebrew for Yad
Vashem's Hebrew interface and Israeli archives; German for Reich-era
and DP records; Azerbaijani (or its earlier Cyrillic form) for
Azerbaijan SSR / post-Soviet Azerbaijani records.

The English faces of multilingual archives (the English Yad Vashem
search, the English Arolsen portal) are a translation layer over a
larger original-language corpus. Search the original-language
interface when the subject's records would live there.

### Per-language repositories

**Russian**
- pamyat-naroda.ru — Soviet WWII service, casualties, award citations.
  Indispensable for anyone of military age in 1941–1945 in the USSR.
- obd-memorial.ru — Soviet military casualty records.
- ru.wikipedia.org — typically more detailed than en.wikipedia.org for
  Russian Empire / Soviet history, place histories, regional events.
- eleven.co.il — Электронная еврейская энциклопедия, Russian-language
  Jewish encyclopedia covering Russian Empire and Soviet Jewish life.
- rusarchives.ru and regional archive finding aids.

**Ukrainian**
- uk.wikipedia.org.
- archives.gov.ua and oblast-level Ukrainian state archives.
- Holodomor research databases when the chronology touches 1932–1933.

**Soviet (multilingual)**
- Soviet-era records may be in Russian, Ukrainian, Belarusian, Yiddish
  (1920s–1930s), or German (occupied territories). Cross-reference all
  that apply rather than assuming Russian.
- Memorial society's database of political-repression victims (memo.ru
  and successor archives — the original org was dissolved in 2021 but
  the data was mirrored; search Memorial-affiliated successor sites).

**Azerbaijani**
- az.wikipedia.org.
- Azerbaijani State Archives (arxiv.az).
- Mountain Jewish / Juhuro / Caucasian-Jewish community records may
  appear in Azerbaijani *or* Russian — cross-reference both, since
  Russian was the Soviet-era administrative language and Azerbaijani
  the local community language.

**German**
- arolsen-archives.org (successor to ITS Bad Arolsen) — Holocaust-era
  persecution, DP, and forced-labour records. Search in German.
- bundesarchiv.de — German federal archives.
- KZ-memorial archives: mauthausen-memorial.org, buchenwald.de, and
  the individual camp memorials.
- de.wikipedia.org for Reich-era and regional history.
- Standesamt civil registers (locale-specific).

**Hebrew**
- yvng.yadvashem.org Hebrew interface — Pages of Testimony and the
  Names Database are typically more comprehensive in Hebrew than the
  English subset.
- archives.gov.il — Israel State Archives.
- jpress.nli.org.il — National Library of Israel Historical Hebrew
  Press (newspapers, obituaries, immigration notices).
- Central Zionist Archives.

**English**
- The repositories listed under *Where to look* apply for the US / UK
  legs of any subject's life. English is the *last* language to search
  when the subject's pre-US records are elsewhere — not the first.

### How to cite a non-English source

- Keep the `url` in its original form. Cyrillic, Hebrew, and other
  non-Latin URLs resolve fine.
- Render the claim `text` in English for the wiki's English-language
  readers, but preserve the original-language form of distinctive
  names, places, or institutions — e.g., "the Soviet 384th Rifle
  Division (384-я стрелковая дивизия)".
- Mark the language in `gap`:
  `gap: "ww2-service (ru: pamyat-naroda award citation)"`.

When a claim depends on a direct quotation, the drafting phase will
render original + English gloss; do not silently translate-and-quote,
which loses provenance.

## Citation specificity

The `url` field must resolve to the specific record. A link to the
site home is not a citation.

- ✗ `https://www.findagrave.com/`
- ✓ `https://www.findagrave.com/memorial/209496149/boris-smertenko`
- ✗ `https://www.familysearch.org/`
- ✓ `https://www.familysearch.org/ark:/61903/3:1:S3HT-DR5Y-V3Z`
- ✗ "1940 US Census" (no locator)
- ✓ "1940 US Census, ED 24-1551, sheet 4B, line 78, Brooklyn NY" —
  encode the locator in `gap` if the URL points to a paywall.

If a permalink is behind authentication, use the canonical record-id
form in `url` and note the access constraint in `gap`.

## Reminder: output is JSON only

After all your tool calls complete, your final reply MUST be the
JSON object alone — nothing before it, nothing after it, no fences.
