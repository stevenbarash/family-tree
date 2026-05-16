# Cross-Page Consistency Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch stale talk-page claims that contradict their live page — the exact failure mode that let the Boris/Kelman medal mix-up linger across `boris-ayzman.md`, `boris-ayzman.talk.md`, and `boris-and-the-road-to-prague.md` undetected. The new detector flags quoted/highlighted claim phrases that appear in a talk page's research-notes or drafting-plan sections but don't appear anywhere in the live page, surfacing the divergence at `wai check` time and (via the existing pre-commit hook) at commit time.

**Architecture:** Add a `detectTalkLivePageDrift` function alongside the existing `detectFootnoteOrphans` / `detectBibliographyMismatch` / `detectGedcomMismatch` in `core/src/checks/consistency-drift.ts`. The function pairs each `<slug>.talk.md` with its live `<slug>.md`, extracts every double-quoted or guillemet-quoted phrase inside the talk page's *Facts extracted*, *Drafting plan*, and *Cross-reference* sections, and flags every such phrase that's absent from the live page. Severity is `warn` — these are heuristics and some legitimate skew exists (a phrase in a talk note may be paraphrased on the live page); the floor for blocking via `--fail-on consistency` is the caller's choice.

**Tech Stack:** Existing — pure TypeScript in `core/src/checks/`, no I/O, `node:test` + `node:assert/strict` via `tsx --test`. The detector is wired through the existing `wai check --include consistency` path; no CLI changes required.

---

## Scope (v1)

**In:** quoted-phrase drift between `<slug>.talk.md` *Facts extracted* / *Drafting plan* / *Cross-reference* sections and the live `<slug>.md`.

**Out (deferred to follow-ups):**

- **Bullet-line structural diff.** Comparing `- **Decorations**: …` lines between talk drafting-plans and live page sections. Requires a structured page convention that doesn't yet exist.
- **Episode-page-vs-person-page consistency.** An episode like `boris-and-the-road-to-prague.md` asserts facts about Boris; check `boris-ayzman.md` agrees. Needs episode→subject linkage to be a first-class field (currently it's an `## See also` link or a `subject:` frontmatter that some episode pages have inconsistently).
- **Stale-mtime detection.** Talk pages that haven't been git-touched since the live page was edited. Useful but a different signal; separate detector worth its own plan.
- **Auto-fix.** Talk-page drift is editorial; no safe auto-fix.

The v1 scope is narrow but **would have caught the Boris case end-to-end**: the talk page asserted `"For Defense of Kyiv"` inside its *Facts extracted* and *Drafting plan* sections; the live page (after correction) doesn't contain that phrase; v1 would surface the divergence.

---

## File structure

| File | Role |
|---|---|
| `core/src/checks/consistency-drift.ts` (modify) | Add three module-local helpers (`extractQuotedPhrases`, `sectionSlice`, `livePageBodies`) plus a new `detectTalkLivePageDrift(state)` function. Wire into the existing exported `detectConsistencyDrift` detector. |
| `core/test/checks/consistency-drift.test.ts` (modify) | Append a section of tests for the new detector + its helpers. |

The detector lives in the existing file rather than a new one because (a) it's the same category — consistency — and (b) the existing file is 163 lines with three sibling detectors; adding a fourth keeps the cohesion of "all consistency drift logic in one module" that the project already uses. If the file passes ~300 lines after this change, consider a follow-up split (one detector per file under `consistency/`); not in scope for this plan.

---

## Task 1: Extract quoted phrases from a markdown body

A pure helper that pulls every double-quoted phrase (`"…"` or `«…»`) out of a body string, scoped to specific markdown sections. Used by the detector to find "claim phrases" in talk-page sections.

**Files:**
- Modify: `core/src/checks/consistency-drift.ts` (append helpers)
- Modify: `core/test/checks/consistency-drift.test.ts` (append tests)

- [ ] **Step 1: Write failing tests for `extractQuotedPhrases`**

Append to `core/test/checks/consistency-drift.test.ts`:

```typescript
import { extractQuotedPhrases } from '../../src/checks/consistency-drift.ts';

test('extractQuotedPhrases: pulls double-quoted phrases from prose', () => {
  const body = 'Boris had the "For Defense of Kyiv" medal and also "For Victory".';
  assert.deepEqual(extractQuotedPhrases(body), ['For Defense of Kyiv', 'For Victory']);
});

test('extractQuotedPhrases: pulls guillemet-quoted phrases', () => {
  const body = 'The book reads «Айзман Борис Хаскельович» on p. 120.';
  assert.deepEqual(extractQuotedPhrases(body), ['Айзман Борис Хаскельович']);
});

test('extractQuotedPhrases: handles mixed quote styles in one body', () => {
  const body = 'Medal "За оборону Києва" matches «За оборону Києва» (Ukrainian).';
  assert.deepEqual(extractQuotedPhrases(body), ['За оборону Києва', 'За оборону Києва']);
});

test('extractQuotedPhrases: ignores empty quotes and apostrophes', () => {
  const body = "It's his \"\" or '' — neither counts. \"Real phrase\" does.";
  assert.deepEqual(extractQuotedPhrases(body), ['Real phrase']);
});

test('extractQuotedPhrases: trims whitespace inside quotes', () => {
  const body = 'Phrase: "  spaced out  " — kept trimmed.';
  assert.deepEqual(extractQuotedPhrases(body), ['spaced out']);
});

test('extractQuotedPhrases: returns empty array for empty body', () => {
  assert.deepEqual(extractQuotedPhrases(''), []);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd core && npx tsx --test test/checks/consistency-drift.test.ts
```

Expected: FAIL — `extractQuotedPhrases` is not exported.

- [ ] **Step 3: Implement `extractQuotedPhrases`**

Append to `core/src/checks/consistency-drift.ts`:

```typescript
/**
 * Pull every double-quoted (`"…"`) or guillemet-quoted (`«…»`) phrase out
 * of a body string. Empty quotes are skipped; interior whitespace is
 * trimmed. Used by `detectTalkLivePageDrift` to find claim phrases on
 * talk pages that the live page should also assert if they're load-bearing.
 */
export function extractQuotedPhrases(body: string): string[] {
  const out: string[] = [];
  const patterns = [/"([^"]+)"/g, /«([^»]+)»/g];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const phrase = m[1]!.trim();
      if (phrase.length > 0) out.push(phrase);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd core && npx tsx --test test/checks/consistency-drift.test.ts
```

Expected: PASS (existing tests still pass + 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add core/src/checks/consistency-drift.ts core/test/checks/consistency-drift.test.ts
git commit -m "feat(core): add extractQuotedPhrases helper for talk-page drift detector"
```

---

## Task 2: Slice a specific section out of a markdown body

A pure helper that returns the text contents of a given `## Heading` section, used to scope the talk-page phrase scan to *Facts extracted*, *Drafting plan*, and *Cross-reference* sections only (rather than every quoted phrase anywhere in the talk page, which would over-flag).

**Files:**
- Modify: `core/src/checks/consistency-drift.ts` (append helpers)
- Modify: `core/test/checks/consistency-drift.test.ts` (append tests)

- [ ] **Step 1: Write failing tests for `sectionSlice`**

Append to `core/test/checks/consistency-drift.test.ts`:

```typescript
import { sectionSlice } from '../../src/checks/consistency-drift.ts';

test('sectionSlice: returns content of named H2 section, ending at next H2', () => {
  const body = '## A\n\nfirst\n\n## B\n\nsecond\n\n## C\n\nthird\n';
  assert.equal(sectionSlice(body, 'B'), '\nsecond\n');
});

test('sectionSlice: returns content from H2 to end-of-body when no next H2', () => {
  const body = '## A\n\nfirst\n\n## B\n\nsecond and last\n';
  assert.equal(sectionSlice(body, 'B'), '\nsecond and last\n');
});

test('sectionSlice: returns empty string when section not found', () => {
  const body = '## A\n\nfirst\n';
  assert.equal(sectionSlice(body, 'B'), '');
});

test('sectionSlice: H3 inside the H2 is included in the slice', () => {
  const body = '## A\n\n### A.1\n\nnested\n\n## B\n\nb\n';
  assert.equal(sectionSlice(body, 'A'), '\n### A.1\n\nnested\n');
});

test('sectionSlice: name match is case-sensitive on the heading text', () => {
  const body = '## Drafting plan\n\np\n\n## Other\n\no\n';
  assert.equal(sectionSlice(body, 'drafting plan'), '');
  assert.equal(sectionSlice(body, 'Drafting plan'), '\np\n');
});

test('sectionSlice: a literal "## Drafting plan" inside a fenced code block does not match', () => {
  // Mirror the line-anchoring + code-fence discipline already used by the
  // Phase 3/7 outline finders in cli/src/commands/author/*.
  const body = [
    '## Research notes',
    '',
    '```markdown',
    '## Drafting plan',
    '',
    'fake nested heading',
    '```',
    '',
    '## Drafting plan',
    '',
    'real plan content',
  ].join('\n');
  assert.equal(sectionSlice(body, 'Drafting plan'), '\nreal plan content\n');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd core && npx tsx --test test/checks/consistency-drift.test.ts
```

Expected: FAIL — `sectionSlice` is not exported.

- [ ] **Step 3: Implement `sectionSlice`**

Append to `core/src/checks/consistency-drift.ts`:

```typescript
/**
 * Return the text contents of the named `## Heading` section, ending at
 * the next `## ` heading (or end-of-body). Returns `""` if the section
 * isn't present. Match is on the exact heading text (case-sensitive).
 * Code-fence aware: a literal "## Name" inside a fenced block does not
 * count as the section header — mirrors the discipline in the Phase 3/7
 * outline finders in `cli/src/commands/author/{outline,log}.ts`.
 */
export function sectionSlice(body: string, headingText: string): string {
  const marker = `## ${headingText}`;
  const lines = body.split('\n');
  let inCode = false;
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmedStart = line.trimStart();
    if (trimmedStart.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (startLine === -1) {
      if (line === marker) startLine = i;
    } else if (line.startsWith('## ')) {
      // End of the section.
      return '\n' + lines.slice(startLine + 1, i).join('\n').replace(/\n+$/, '') + '\n';
    }
  }
  if (startLine === -1) return '';
  return '\n' + lines.slice(startLine + 1).join('\n').replace(/\n+$/, '') + '\n';
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd core && npx tsx --test test/checks/consistency-drift.test.ts
```

Expected: PASS (all previous + 6 new tests).

- [ ] **Step 5: Commit**

```bash
git add core/src/checks/consistency-drift.ts core/test/checks/consistency-drift.test.ts
git commit -m "feat(core): add sectionSlice helper for talk-page drift detector"
```

---

## Task 3: The `detectTalkLivePageDrift` function

The detector itself. For each talk page in the state, find the matching live page, slice the *Facts extracted* / *Drafting plan* / *Cross-references* sections, extract quoted claim phrases, and flag any phrase that doesn't appear (verbatim) in the live page.

**Files:**
- Modify: `core/src/checks/consistency-drift.ts` (add detector + wire into exported detector)
- Modify: `core/test/checks/consistency-drift.test.ts` (add detector tests)

- [ ] **Step 1: Write failing tests for the detector**

Append to `core/test/checks/consistency-drift.test.ts`:

```typescript
test('detectConsistencyDrift: flags quoted claim on talk page absent from live page', () => {
  // The exact failure mode that escaped the Boris/Kelman mix-up.
  const livePage = page('boris', {
    body: 'Boris was awarded the Order of the Red Star and the medal "For the Capture of Berlin".',
  });
  const talkPage = page('boris.talk', {
    body: [
      '## Facts extracted',
      '',
      '- Decorations: Order of the Red Star and the medals "For Defense of Kyiv", "For the Capture of Berlin".',
    ].join('\n'),
  });
  const findings = detectConsistencyDrift(makeState({ pages: [livePage, talkPage] }));
  const drift = findings.filter(f => /talk page asserts/.test(f.message));
  // "For the Capture of Berlin" is on both → no finding.
  // "For Defense of Kyiv" is only on talk → one finding.
  assert.equal(drift.length, 1);
  assert.match(drift[0]!.message, /For Defense of Kyiv/);
  assert.equal(drift[0]!.category, 'consistency');
  assert.equal(drift[0]!.severity, 'warn');
});

test('detectConsistencyDrift: quoted phrase outside scoped sections is ignored', () => {
  // Quoted phrase in the talk page's "Open editorial questions" section
  // is NOT one of the scanned sections; should not trigger.
  const livePage = page('boris', { body: 'plain body, no quotes' });
  const talkPage = page('boris.talk', {
    body: [
      '## Open editorial questions',
      '',
      '::open',
      'Should we cite "For Defense of Kyiv" here?',
    ].join('\n'),
  });
  const findings = detectConsistencyDrift(makeState({ pages: [livePage, talkPage] }));
  const drift = findings.filter(f => /talk page asserts/.test(f.message));
  assert.equal(drift.length, 0);
});

test('detectConsistencyDrift: scans Facts extracted, Drafting plan, and Cross-references', () => {
  const livePage = page('boris', { body: 'no quoted phrases here' });
  const talkPage = page('boris.talk', {
    body: [
      '## Facts extracted',
      '',
      '- "fact-section claim"',
      '',
      '## Drafting plan',
      '',
      '- "drafting-section claim"',
      '',
      '## Cross-references',
      '',
      '- "cross-ref claim"',
    ].join('\n'),
  });
  const findings = detectConsistencyDrift(makeState({ pages: [livePage, talkPage] }));
  const drift = findings.filter(f => /talk page asserts/.test(f.message));
  // All three quoted phrases are claimed on the talk page but absent from
  // the live page, so each triggers a finding.
  assert.equal(drift.length, 3);
  const messages = drift.map(d => d.message).join('|');
  assert.match(messages, /fact-section claim/);
  assert.match(messages, /drafting-section claim/);
  assert.match(messages, /cross-ref claim/);
});

test('detectConsistencyDrift: orphan talk page (no live page) is silently skipped', () => {
  // A `.talk.md` that exists without a corresponding live page (e.g.,
  // pre-creation working notes) shouldn't produce findings on every
  // quoted phrase. It's just unmatched.
  const talkPage = page('orphan.talk', {
    body: '## Facts extracted\n\n- "something quoted"\n',
  });
  const findings = detectConsistencyDrift(makeState({ pages: [talkPage] }));
  const drift = findings.filter(f => /talk page asserts/.test(f.message));
  assert.equal(drift.length, 0);
});

test('detectConsistencyDrift: live page without a talk page produces no talk-drift findings', () => {
  // Trivial: no talk page → nothing to compare.
  const livePage = page('boris', { body: 'just a body with "a quoted phrase".' });
  const findings = detectConsistencyDrift(makeState({ pages: [livePage] }));
  const drift = findings.filter(f => /talk page asserts/.test(f.message));
  assert.equal(drift.length, 0);
});

test('detectConsistencyDrift: finding location points at the talk page and line of the claim', () => {
  const livePage = page('boris', { body: 'no match here' });
  const talkPage = page('boris.talk', {
    body: '## Facts extracted\n\n- normal line\n- claim line "For Defense of Kyiv"\n',
  });
  const findings = detectConsistencyDrift(makeState({ pages: [livePage, talkPage] }));
  const drift = findings.filter(f => /talk page asserts/.test(f.message));
  assert.equal(drift.length, 1);
  assert.equal(drift[0]!.location.file, talkPage.path);
  // Line 4 of the talk body is the claim line.
  assert.equal(drift[0]!.location.line, 4);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd core && npx tsx --test test/checks/consistency-drift.test.ts
```

Expected: FAIL — the new findings (with messages matching `/talk page asserts/`) are not produced because no detector emits them yet.

- [ ] **Step 3: Implement `detectTalkLivePageDrift` and wire it into the exported detector**

In `core/src/checks/consistency-drift.ts`, find the existing exported detector at line 3:

```typescript
export const detectConsistencyDrift: Detector = (state: RepoState): Finding[] => {
```

The current body iterates pages and appends findings from the three existing sub-detectors. Update it to also pair talk pages with live pages and invoke the new detector:

```typescript
export const detectConsistencyDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  const livePages = new Map<string, LoadedPage>();
  for (const page of state.pages) {
    if (!page.slug.endsWith('.talk')) livePages.set(page.slug, page);
  }
  for (const page of state.pages) {
    if (page.slug.endsWith('.talk')) {
      const liveSlug = page.slug.slice(0, -'.talk'.length);
      const livePage = livePages.get(liveSlug);
      if (livePage) {
        findings.push(...detectTalkLivePageDrift(page, livePage));
      }
      continue;
    }
    findings.push(...detectFootnoteOrphans(page));
    findings.push(...detectBibliographyMismatch(page));
    findings.push(...detectGedcomMismatch(page, state));
  }
  return findings;
};
```

Then add the new function alongside the other detectors (near the bottom, after `detectGedcomMismatch`):

```typescript
const SCANNED_TALK_SECTIONS = ['Facts extracted', 'Drafting plan', 'Cross-references'] as const;

/**
 * Flag quoted claim phrases that appear in a talk page's research / drafting
 * sections but don't appear (verbatim) on its live page. This is the
 * specific failure mode that let the Boris/Kelman medal mix-up linger: the
 * talk page's Facts extracted and Drafting plan sections asserted the
 * "For Defense of Kyiv" medal as Boris's, the live page (after correction)
 * doesn't, and nothing in the existing detectors compared the two surfaces.
 *
 * v1 scope is narrow on purpose: only double-quoted (`"…"`) and
 * guillemet-quoted (`«…»`) phrases inside three named sections. Phrases
 * elsewhere on the talk page (e.g., Open editorial questions) are scoped
 * out — they're often hypotheticals being weighed, not active claims.
 * Severity is `warn` because some legitimate skew exists (a quoted source
 * phrase on the talk page may be paraphrased rather than quoted on the
 * live page); the caller decides whether to `--fail-on consistency`.
 */
function detectTalkLivePageDrift(talkPage: LoadedPage, livePage: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  const talkLines = talkPage.body.split('\n');
  const seen = new Set<string>();
  for (const section of SCANNED_TALK_SECTIONS) {
    const slice = sectionSlice(talkPage.body, section);
    if (!slice) continue;
    for (const phrase of extractQuotedPhrases(slice)) {
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      if (livePage.body.includes(phrase)) continue;
      // Find the talk-page line number that contains this phrase, for the
      // finding location.
      let line = 1;
      for (let i = 0; i < talkLines.length; i++) {
        if (talkLines[i]!.includes(phrase)) { line = i + 1; break; }
      }
      findings.push({
        category: 'consistency',
        severity: 'warn',
        message: `${talkPage.slug}: talk page asserts "${phrase}" in ## ${section} but live page ${livePage.slug}.md doesn't mention it — talk page may be stale, or live page may be missing a claim that should be asserted`,
        location: { file: talkPage.path, line },
      });
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd core && npx tsx --test test/checks/consistency-drift.test.ts
```

Expected: PASS (all previous tests still pass + 6 new detector tests).

- [ ] **Step 5: Run the full core suite to confirm no regression**

```bash
cd core && npm test
```

Expected: previous core test count + the 18 new tests from Tasks 1, 2, and 3 (6 each). All green.

- [ ] **Step 6: Commit**

```bash
git add core/src/checks/consistency-drift.ts core/test/checks/consistency-drift.test.ts
git commit -m "feat(core): add talk-page-vs-live-page drift detector for consistency"
```

---

## Task 4: Manual sanity check against the real wiki

Run the extended detector against the actual `~/whoami` data repo and confirm (a) the Boris/Kelman-style failure mode would have been caught and (b) the false-positive rate on real pages is acceptable.

**Files:** none modified.

- [ ] **Step 1: Run `wai check --only consistency` against the real data repo**

```bash
cd cli && WHOAMI_ROOT="$HOME/whoami" npx tsx src/index.ts check --only consistency 2>&1 | tail -40
```

Expected: a list of findings including any current talk-page-vs-live-page drift. **All Boris-corrections you applied in this session should now be reflected — no `"For Defense of Kyiv"` finding on `boris.talk` because both pages were already updated.** If unrelated drift findings appear on other talk pages (most likely Sonya, Kelman, or any in-progress edits), they are surfacing real drift — that's the detector working.

- [ ] **Step 2: Reproduce the historical failure mode and confirm detection**

Construct a synthetic case in a tmp dir to confirm the detector would have caught the original Boris failure if it had existed at the time:

```bash
mkdir -p /tmp/drift-demo/pages
cat > /tmp/drift-demo/pages/boris.md <<'EOF'
---
title: Boris
type: person
---
Boris was awarded the medal "For the Capture of Berlin".
EOF
cat > /tmp/drift-demo/pages/boris.talk.md <<'EOF'
---
title: Boris
type: person
---
## Facts extracted

- Medals: "For Defense of Kyiv", "For the Capture of Berlin"
EOF
cd cli && WHOAMI_ROOT=/tmp/drift-demo npx tsx src/index.ts check --only consistency 2>&1 | tail -10
```

Expected output includes a `consistency` finding mentioning `"For Defense of Kyiv"` on `boris.talk`. Confirms the historical mix-up would have been caught.

- [ ] **Step 3: Note any false positives observed in Step 1**

If the real-wiki scan from Step 1 surfaces talk-page drift that is *intentional* (e.g., a talk-page research note quoting a hypothetical claim being evaluated, in a section that happens to be named *Drafting plan* but contains a working hypothesis), document it. Two acceptable mitigations:

1. **Widen the section-name skip list** — add another section name (e.g., *Open editorial questions* is already skipped because it's not in `SCANNED_TALK_SECTIONS`; if another commonly-misfires section is found, add it to a sibling skip list).
2. **Move the false-positive content out of *Facts extracted* / *Drafting plan*** — the talk-page convention is that *Facts extracted* and *Drafting plan* contain active claims; hypotheticals belong in *Open editorial questions*. If the false positive is here, the talk page is using the wrong section.

No code change in this task — just document the observed false-positive rate as a follow-up if needed.

---

## Task 5: CHANGELOG entry + plan-index update

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add the CHANGELOG entry**

Under `## [Unreleased] — v2 development` → `### Added`, insert near the top:

```markdown
- **Cross-page consistency detector: talk-page vs live-page drift**
  *(2026-05-17)*. New `detectTalkLivePageDrift` sub-detector inside
  `core/src/checks/consistency-drift.ts` flags quoted/highlighted claim
  phrases that appear in a talk page's *Facts extracted*, *Drafting
  plan*, or *Cross-references* sections but don't appear on the live
  page. Surfaces via `wai check --include consistency` (and via the
  data-repo pre-commit hook when consistency is in `--fail-on`).
  Catches the specific failure mode that let the Boris/Kelman medal
  mix-up linger across `boris-ayzman.md` and `boris-ayzman.talk.md` —
  the talk page's drafting plan asserted "For Defense of Kyiv" as
  Boris's medal, which it isn't, and nothing compared the two
  surfaces. Severity `warn` (these are heuristics; some legitimate
  skew exists).
```

- [ ] **Step 2: Add the plan-index row**

In `docs/superpowers/plans/README.md`, add (chronologically near the other 2026-05-16 entries):

```markdown
| ✅ | [`2026-05-16-cross-page-consistency-detector.md`](./2026-05-16-cross-page-consistency-detector.md) | Cross-page consistency detector | Talk-page-vs-live-page quoted-claim drift detector in `consistency-drift.ts`; catches the Boris/Kelman mix-up class. |
```

Bump totals (+1 plans, +1 shipped) if a footer-count line exists.

- [ ] **Step 3: Commit**

The working tree's `CHANGELOG.md` may have unrelated edits. Stage only the relevant hunks via the snapshot-and-restore technique used in earlier plans:

```bash
cp CHANGELOG.md /tmp/changelog-current.md
git checkout HEAD -- CHANGELOG.md
# Re-apply the Step 1 insertion via Edit to the clean HEAD CHANGELOG.md
git add CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "docs: changelog + plan-index for cross-page consistency detector"
# Restore the user's unrelated reorg from the snapshot (manual or via cp)
```

NEVER use `git add -u`, `git add .`, or `git add -A`.

---

## Verification checklist (run after Task 4)

- [ ] `cd core && npm test` — all tests green, +18 tests from Tasks 1–3
- [ ] `cd core && npx tsc --noEmit` — typecheck clean
- [ ] `cd cli && WHOAMI_ROOT=$HOME/whoami npx tsx src/index.ts check --only consistency` — runs without errors; surfaces real drift if any exists
- [ ] Synthetic Boris reproducer (Task 4 Step 2) — produces the expected `For Defense of Kyiv` finding

---

## Out of scope (deferred follow-ups, in priority order)

1. **Episode-page-vs-person-page consistency.** Episode pages like `boris-and-the-road-to-prague.md` assert facts about their `subject:` person; flag any quoted phrase in the episode's body that contradicts (or is absent from) the subject's live page. Needs an episode→subject linkage to be a first-class field. Same detector pattern as v1, different page-pair selection.
2. **Stale-mtime detection.** A talk page whose git-mtime predates its live page's git-mtime is presumed stale. Different signal from the v1 quoted-claim diff (lossy on either side: catches stale talk pages but not freshly-edited talk pages that drift). Worth a separate, smaller detector.
3. **Bullet-line structural diff** of `## Drafting plan` *Sections* lists between talk and live pages. Highest-fidelity but requires structured page conventions to be enforced (currently they're soft conventions).
4. **CLI flag to scope the detector** (`wai check --only consistency --talk-drift-sections "X,Y,Z"`). Premature until false-positive patterns emerge from real-wiki runs.
5. **Auto-fix mode.** Talk-page drift is editorial; no safe auto-fix. Confidence-tier suggestion at most. Probably never auto-fix.
