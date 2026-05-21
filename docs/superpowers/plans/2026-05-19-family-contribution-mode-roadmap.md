# Family Contribution Mode Roadmap

> **Index, not a plan.** Each item below gets its own plan document under `docs/superpowers/plans/`. This file just sequences them and explains why.

**Goal.** Let any family member contribute raw evidence — text, audio recordings, audio links, structured Q&A — to the wiki via the browser, in their own language, without dropping to the CLI. Three modes fall out of one session model:

1. **Interview** — Steven sits with Grandma Zina; Steven operates the device; Zina is the subject and the source of new content. Relevance filtered to Zina's family side.
2. **Interview** — Steven sits with Grandpa Sam; same shape, different subject; relevance filtered to Sam's side.
3. **Self-edit** — Aunt Bella opens the wiki on her own device, picks herself as both viewer and subject, and adds context to her own page.

**Scope.** 10 features, sequenced below. Each is a separate, shippable plan.

**Project-wide implications of this track:**

- Living people gain a **contributor role**, parallel to their existing subject role. The privacy gate (P0.2) doesn't restrict the contributor list — it gates what content their pages display to other viewers.
- The article-authoring pipeline gains a second canonical-language direction: the existing EN→ru/uk/he flow stays; a new ru/uk/he→EN flow lets non-English contributions feed the article agent. The contributor's exact words remain canonical for *that note*.
- The pedigree chart's frontier slots (P1.1 / sub-project F) and the editorial-discussion panel's `::open` threads (P1.9) both become *targets* for contribution. This track gives [P3.1](../../ROADMAP.md#p3-strategic-bets-12-month-horizon) (research frontier as central metaphor) a concrete operationalization — frontier becomes "list of questions a contributor can answer today."

**Constraints carried through every feature:**

- **Identity model is environment-split.** Real auth shipped 2026-05-20 (Descope, P2.20) *after* this roadmap was written.
  - **Local (Mac Studio, `WHOAMI_AUTH` unset):** no login wall — Tailscale ACLs are the boundary. `viewer` is a self-asserted picker; anyone on the device can pick any identity.
  - **Render replica (`WHOAMI_AUTH=on`):** every visitor is already authenticated via the invite-only Descope gate. The Descope session *is* the `viewer` — no picker, no name-match heuristic. A `contributorXref` claim is verified against the session, not trusted from the client.
  `subject` is a session-scoped pick in *both* environments — auth resolves who operates the device, never who is interviewed. See [`docs/SCOPE.md`](../../SCOPE.md) and the [Descope auth plan](./2026-05-20-descope-auth.md).
- **Browser writes are append-attribute-and-thread-state, not free edit of prior content.** A contributor can append new notes and edit/redact their *own* prior notes (matched by the note's `contributor:` field), but not edit anyone else's. Frontmatter and structured GEDCOM data stay CLI/external-only.
- **Multilingual completeness** — every contribution surface must work in en / ru / uk / he. Hebrew renders RTL. Question prompts, form labels, audio player chrome, error messages, and TTS read-aloud (where applicable) all participate.
- **Information density preferred** in non-contributor surfaces (article, tree, search). Contributor surface is the one exception — large fonts, generous touch targets, minimal English in fallbacks. The "non-English grandma operates it" bar is the floor, not the ceiling.
- **No page-bg tints, drop caps, noise overlays.** Type and layout are where creativity lives. The contributor surface gets a *distinct* layout shell (full-screen flow, single question on screen) rather than a tinted theme.
- **`core/` is platform-agnostic.** Cohort-based relevance filtering reuses `core/src/family/cohort.ts`. Question parsing extends `core/src/pages/talk-threads.ts`. No I/O above the function boundary.

---

## Sequenced features

### E.0 — Identity & session state (M)

**Why first.** Foundation. Without `viewer:` + `subject:` in session state, every later item either picks the wrong attribution or shows the wrong filtered content. The picker is also the first thing a contributor touches; it sets the tone for the rest of the UX.

**What ships.** `~/whoami/data/people.yml` opt-in registry (one entry per living person who's consented to be a contributor, linked to their GEDCOM xref, with preferred locale, plus an optional Descope-account link — `email` or `descope_user_id`). `wai people add|list|edit` CLI for Steven to curate. Frontend session model: a `viewer` resolved per-environment — the Descope session when `WHOAMI_AUTH=on` (looked up in `people.yml` by email to recover the GEDCOM xref + locale), or a cookie-persisted self-asserted pick when auth is off — and a session-only `subject` (prompted each visit if interview mode is engaged). Identity picker UI in the layout chrome for the auth-off `viewer` pick and for `subject` selection in both environments. Name-match heuristic against the device OS user applies only to the auth-off picker.

**Defaults.** Auth-off: when no identity is set, the session falls back to anonymous read-only (today's behavior); contributions require a picked identity. Auth-on: there is no anonymous tier — the Descope gate is the floor; a Descope account with no `people.yml` mapping is authenticated-but-unmapped (can read; must confirm a `contributorXref` before contributing).

**Open for the plan.** (1) *Scribe trust* — interview mode means `viewer ≠ contributor`; the endpoint must allow that mismatch and record both the operating session and the claimed contributor. Decide the rule for who may scribe for whom. (2) *`people.yml` vs `data/users.json`* — `AGENTS.md` lists a `users.json` in `~/whoami/data/`; the plan must verify what it currently is (Rule 16) and decide whether the contributor registry merges with it or cross-references it.

**Plan:** TBD when picked up.

### E.1 — Browser write API with viewer+subject attribution (M)

**Why second.** Extends the existing `/api/notes` route to accept multi-modal contribution payloads. Every later contribution path goes through this endpoint. Reusing `/api/notes` instead of creating a parallel route keeps the write surface to one audited boundary.

**What ships.** `POST /api/notes` accepts `{ text? | audioRef? | qaPair?, contributorXref, subjectXref?, locale }`. Writes attribute both `viewer:` and `subject:` content fields on the resulting note. Schema-validated at the boundary (Zod). Living-person check on `contributorXref` against the people.yml opt-in. The endpoint is already session-gated when `WHOAMI_AUTH=on` — P2.20 made every `/api/notes/*` handler call `requireSession()` and return 401 to unauthenticated clients. When auth is on, `viewer` comes from the verified Descope session and a client-supplied `contributorXref` is checked against it; when auth is off, Tailscale is the boundary and the picker's self-asserted identity is trusted. (Same pattern the auth work already applied to the spoofable `by` field.)

**Plan:** TBD when picked up.

### E.2 — Browser audio recording + asset storage (M)

**Why third.** Audio is the second modality after text. Independent of E.3 (the privacy gate) in implementation, but pairs with it for privacy correctness.

**What ships.** Client component using the MediaRecorder API; saves to `~/whoami/assets/audio/<slug>-<iso>.webm`. References attached via `MediaRef[]` (which already exists on `DerivedRecord`) with a new `kind: 'audio'` value and `recorded_at`, `duration_ms`, `language` fields. Audio link input (paste a URL — phone-call recording, podcast, etc.) lands here as a sibling path: same `MediaRef` shape, no local file.

**Plan:** TBD when picked up.

### E.3 — Living-person audio gate (extends P0.2) (S)

**Why fourth, paired with E.2.** Don't ship audio writes without the gate, even though they're separate code paths. Audio of living relatives is sensitive by default. Land in the same commit as E.2.

**What ships.** `restricted: bool` on the audio `MediaRef`, derived from the subject's privacy status (reuses the existing `Privacy` heuristic in `core/src/gedcom/derive.ts`). When the privacy gate is enabled (`WHOAMI_PRIVACY_GATE=on`), restricted audio doesn't render on the page or appear in search. Export safety: `wai export --redact-living` strips restricted audio refs.

**Plan:** TBD when picked up.

### E.4 — Talk-page `## Interview questions` convention + parser (S)

**Why fifth.** Once identity + writes + audio exist, contribution becomes *directed*. Questions are how the interviewer (Steven, or the contributor themselves in self-edit mode) frames what they want input on. Pure parser, reuses the talk-thread infrastructure that shipped in P1.9.

**What ships.** A `## Interview questions` section convention on talk pages, each question structured as `### <question-slug> :: <prompt-en>` with optional `prompt-ru`, `prompt-uk`, `prompt-he` body fields and an optional `targets:` line for cross-person questions ("Where did your father and his brother live in 1942?"). New `core/src/pages/interview-questions.ts` parser. `wai check` detector for malformed question blocks. Editorial-guide section on authoring questions.

**Plan:** TBD when picked up.

### E.5 — Reverse-direction translation (other → EN) for research notes (M)

**Why sixth, before the UI surface.** The conceptual hinge of the whole track. Grandma's Russian answer needs to (a) stay canonical for that note in her language, (b) get an EN gloss for the article-authoring agent, (c) preserve her exact words as a quotable source. Without this, non-EN contributions sit in a silo and never feed the article pipeline. Must land before E.6 so the interview route doesn't capture content that can't be used downstream.

**What ships.** New `wai translate-note --from <locale> --to en <note-id>` command (or extension of `wai i18n sync`'s plumbing). The translation lives alongside the original; the note's source-language text remains canonical for citation; the EN gloss is a derived field consumed by the article agent. Translation talk-page audit log entry per translated note. Reuses the harness adapter and the existing translation pipeline; the `translate` prompt template gets a sibling `translate-note-to-en` template.

**Plan:** TBD when picked up.

### E.6 — `/[locale]/interview/` route (M)

**Why seventh — MVP completes here.** Everything below it now exists: identity, write API, audio, privacy, questions, reverse translation. The route is the assembly. After E.6 ships, a real session is end-to-end possible: pick contributor → pick subject → see relevant filtered questions → answer text or audio → submit. Polish (E.7–E.9) follows from observed friction.

**What ships.** New route at `frontend/app/[locale]/interview/page.tsx`. Renders the session subject's filtered relevance list (cohort-driven, via `core/src/family/cohort.ts`). Each item is either a pending question from a talk page or an open `::open` thread or a frontier slot from the pedigree chart. Click an item → answer panel with text input + audio recorder + "submit" → POST to E.1. Scribe-mode rendering when `viewer ≠ subject` (UI reads "Recording for [subject]"). Self-edit when `viewer === subject` ("Editing your own contributions").

**Plan:** TBD when picked up.

### E.7 — Accessibility-grade UI shell (M)

**Why eighth, after MVP runs.** Tuning for the "non-English grandma operates it" bar should follow real session friction, not anticipate it. Ship E.6 with a reasonable default shell, run a real session, fix what actually broke.

**What ships.** Opt-in shell for the `/interview/` route: 1.5× base font, icon-first action buttons (record, stop, save) using universal symbols, "Question N of M" wizard pattern, large touch targets (60px+), confirmation steps on destructive actions. Optional text-to-speech read-aloud per locale using browser `SpeechSynthesis`. No global chrome distractions — language switcher and identity stay accessible but de-emphasized once a session is in motion.

**Plan:** TBD when picked up.

### E.8 — RTL audit for forms + audio player + interview shell (S)

**Why ninth.** Hebrew-speaking contributors are first-class. Most of the heavy lifting was done by the Plan 2 logical-property sweep — this is verification + small fixes that surface only once forms and an audio player exist to audit. Cheap to do after E.7 settles the shell's component set.

**What ships.** Verification of `<bdi>` placement on mixed-script person names in the interview question text. Audio scrubber direction reversal in RTL (timeline reads right-to-left). Form input direction. Language switcher prominence in the interview shell. Any specific RTL-only fixes the audit surfaces.

**Plan:** TBD when picked up.

### E.9 — Audio transcription via local whisper.cpp (L)

**Why last.** Largest scope; optional for MVP because Steven can type transcripts by hand for early sessions. Worth deferring until there's a corpus of recordings justifying the local-model setup. Local-first per the privacy posture.

**What ships.** `wai transcribe-audio <ref>` command using `whisper.cpp` (built locally; models for en / ru / uk / he / yi). Outputs source-language transcript with per-segment timestamps, attached to the audio `MediaRef`. Pipes into E.5 for EN gloss when needed. Existing `wai transcribe` (which currently handles images via OCR) gains the audio subcommand or splits into `transcribe-image` / `transcribe-audio`.

**Plan:** TBD when picked up.

---

## Sequencing principles

- **Foundation before features.** E.0 → E.1 are the substrate; nothing else ships without them. E.2 + E.3 ship together (audio with its privacy gate).
- **Data work before presentation.** E.4 (question schema) and E.5 (reverse translation) gate the route. Shipping E.6 before E.5 would build a UI that captures content the agent pipeline can't use.
- **MVP before polish.** E.6 completes the minimum viable path. Real sessions then surface what E.7 / E.8 / E.9 need to tune.
- **Highest scope last.** E.9 (whisper transcription) has a meaningful local-tooling project inside it (model selection, build setup). All other features are pure code on existing data.

## MVP vs full sequence

```
MVP (a working contribution session, even rough):
  E.0 + E.1 + E.2 + E.3 + E.4 + E.5 + E.6
  → identity, writes, audio with privacy, directed questions,
    reverse translation, route assembled

Polish (after MVP runs through real sessions):
  E.7  Accessibility-grade UI shell tuning
  E.8  RTL audit
  E.9  Local whisper transcription
```

7 plans to MVP, 3 to full. Realistically ~6 weeks to MVP, ~10 weeks to full, if this is the only thing in motion.

## Relationship to existing roadmap items

- **Supersedes** P1.7 (media as first-class) by *leading with audio* — the static-media work P1.7 originally proposed becomes a sub-case of E.2's `MediaRef` extension. Recommend folding P1.7 into the contribution track in the next ROADMAP refresh.
- **Gives [P3.1](../../ROADMAP.md#p3-strategic-bets-12-month-horizon)** (frontier as central UI metaphor) **its first concrete instantiation.** The contribution surface *is* the frontier: each open question, gap, frontier slot is a thing a contributor can address today.
- **Extends [P0.2](../../ROADMAP.md#wave-2--privacy--schema-groundwork-weeks-23)** (living-person privacy gate) into audio assets via E.3.
- **May force an extension to [P1.5](../../ROADMAP.md#wave-2--privacy--schema-groundwork-weeks-23)** (conflict-resolution schema) — two living relatives disagreeing in their contributions is a likely case; the existing conflict schema's `weight` axis may need a `contributor:` dimension. Surface this if it becomes real after a real session.

## Execution model

Each item is a separate session with its own subagent-driven execution. Commit boundaries match item boundaries. Each item promotes to a full plan doc when pulled. Update [`docs/superpowers/plans/README.md`](./README.md) and [`docs/ROADMAP.md`](../../ROADMAP.md) when shipping items per CLAUDE.md Rules 14/15.

The contribution track is a distinct third track parallel to the existing reading track and authoring track. Plans from this track should not be mixed into the same commit as reading-track or authoring-track work.
