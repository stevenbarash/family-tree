# Quality Checks — Pass 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four `wai check` detectors that close the gaps the Phase 1 verification surfaced. Each detector targets a distinct bug class with a concrete failure case from the corpus already in mind. The four ship as separate, independently-testable additions; pre-commit hooks pick them up automatically.

**Architecture:** Each detector is a pure function (`RepoState → Finding[]`) in `core/src/checks/`. New detectors wire into the existing `wai check` runner (`cli/src/index.ts` already routes by category). The runtime invariants — that `load.ts` populates `state.pages` for every locale-dir, that `state.parseErrors` surfaces Zod failures, that `state.derived` has every record from the GEDCOM — were established in the 2026-05-17 5-layer defense work and don't need to be redone.

**Tech Stack:** Existing — pure TypeScript in `core/src/checks/`, `node:test` + `node:assert/strict` via `tsx --test`. No new dependencies. Each detector adds findings under an existing category (`schema` or `data`) so the pre-commit hook (`wai check --fail-on format,schema,data --min-severity warn`) picks them up without configuration changes.

**Context:** The 5-layer defense work (2026-05-17, commit `9055ade` on `feat/gedcom-7-upgrade`) added schema validation, per-locale `load.ts` walks, parse-error surfacing, an idempotent `injectNameTran`, and locale-aware `data-drift`. Those defenses prevent the *bug class* that hit the NAME.TRAN backfill. This plan extends the same approach to four adjacent failure modes that wouldn't have triggered the existing detectors.

---

## Scope (v1)

**In (each ships as one task):**

1. **NAME.TRAN ↔ translation-title consistency** (Task 1). For every record that has both a GEDCOM `NAME.TRAN` substructure for a given locale AND a translation page at `pages/<locale>/<slug>.md`, assert that the translation file's `title:` equals the GEDCOM TRAN value. Catches hand-edits to one side that don't propagate to the other.

2. **Stale-canonical-sha detector** (Task 2). For every translation file with `canonical_sha:` set, verify it matches `git log -1 --format=%H -- pages/en/<slug>.md`. Translations whose SHA is older than the canonical's current HEAD are stale and need re-syncing. Already surfaced by `wai i18n status` but not currently by `wai check`.

3. **Title ↔ infobox-name consistency** (Task 3). When a page body contains a `:::infobox-person` directive with a `name:` field, assert it equals the frontmatter `title:`. Catches hand-edits to one but not the other — a class of drift I've already seen in the corpus.

4. **Pipeline-required frontmatter for translations** (Task 4). Every translation file (`page.meta.lang` set to a non-`en` value) must have all four pipeline-emitted fields: `translation_of`, `canonical_sha`, `translated_at`, `author`. Catches files written outside the `wai i18n sync` pipeline.

**Out (deferred):**

- **Wikilink display text aligns with NAME.TRAN.** The original idea — assert `[[Sofia Krasnova|<display>]]` display text matches `София Краснова` (the NAME.TRAN value) — runs into Slavic morphology: `Софию Краснову` (accusative) is a correct grammatical inflection, not drift. Would need a Russian/Ukrainian morphological analyzer to distinguish. Possibly worth a separate skill or a stem-comparison heuristic in a v3 pass.
- **GEDCOM ↔ derived YAML ↔ page record-id consistency.** Coverage-drift already reports 47 "orphan derived" records (no page yet). Distinguishing "expected gap" from "broken sync" needs an explicit allowlist or a different heuristic; valuable but out of scope here.
- **Talk-file structure validator.** Translation talk files have well-defined structure (`## Unresolved`, `## Resolved`, kind tags). Validating it formally would help, but the agent translator already produces compliant output; the failure mode is hypothetical at this point.

---

## File structure

| File | Role |
|---|---|
| `core/src/checks/name-tran-drift.ts` (new) | Task 1 detector. |
| `core/src/checks/stale-sha-drift.ts` (new) | Task 2 detector. Needs git plumbing — calls `git log -1 --format=%H -- pages/en/<slug>.md` per translation file. |
| `core/src/checks/infobox-name-drift.ts` (new) | Task 3 detector. Parses `:::infobox-person` blocks from page body. |
| `core/src/checks/translation-frontmatter-drift.ts` (new) | Task 4 detector. |
| `core/src/checks/index.ts` (modify) | Wire all four new detectors into the exported detector list. |
| `core/test/checks/{name-tran,stale-sha,infobox-name,translation-frontmatter}-drift.test.ts` (new ×4) | Test fixtures + assertions per detector. |
| `cli/src/index.ts` (modify, light) | Add category labels for the new detectors if needed (likely all reuse `schema` or `data`). |
| `CHANGELOG.md` (modify) | One entry covering all four (or one per task if you prefer line-item visibility). |
| `docs/superpowers/plans/README.md` (modify) | Add the row for this plan; flip status when shipped. |

---

## Task 1: NAME.TRAN ↔ translation-title consistency

**Files:** `core/src/checks/name-tran-drift.ts` (new), `core/test/checks/name-tran-drift.test.ts` (new), `core/src/checks/index.ts` (wire).

**Trigger case:** someone hand-edits `pages/ru/sofia-krasnova.md`'s `title:` from `София Краснова` to `Софья Краснова` but the GEDCOM's `NAME.TRAN` for `I372189255251` still says `София Краснова`. The next `wai i18n sync` would overwrite the page back to the GEDCOM form, silently losing the manual edit. Or vice versa: someone edits the GEDCOM TRAN but the page-title isn't re-synced.

- [ ] **Step 1: Write failing tests.**

```typescript
// core/test/checks/name-tran-drift.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNameTranDrift } from '../../src/checks/name-tran-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';

// helpers reuse the makeState pattern from other detector tests

test('name-tran-drift: NAME.TRAN matches title → no finding', () => {
  // record I1 has nameTranslations: { ru: 'А' }; ru page has title: 'А'
  const state = makeState({
    records: [['I1', { nameTranslations: { ru: 'А' } }]],
    pages: [translationPage('a', 'I1', 'ru', 'А')],
  });
  assert.deepEqual(detectNameTranDrift(state), []);
});

test('name-tran-drift: NAME.TRAN differs from title → one finding', () => {
  const state = makeState({
    records: [['I1', { nameTranslations: { ru: 'А' } }]],
    pages: [translationPage('a', 'I1', 'ru', 'Б')],
  });
  const findings = detectNameTranDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'warn');
  assert.match(findings[0].message, /NAME\.TRAN \(ru\).*"А".*title.*"Б"/);
});

test('name-tran-drift: only flags pairs where BOTH exist', () => {
  // Translation exists but no NAME.TRAN → no finding (Phase 1 not yet promoted)
  // NAME.TRAN exists but no translation page → no finding (record has no wiki page)
  const state = makeState({
    records: [
      ['I1', { nameTranslations: { ru: 'А' } }],
      ['I2', {}],
    ],
    pages: [translationPage('two', 'I2', 'ru', 'Б')],
  });
  assert.deepEqual(detectNameTranDrift(state), []);
});

test('name-tran-drift: walks all 3 target locales', () => {
  const state = makeState({
    records: [['I1', { nameTranslations: { ru: 'А', uk: 'Б', he: 'ג' } }]],
    pages: [
      translationPage('a', 'I1', 'ru', 'А'),    // match
      translationPage('a', 'I1', 'uk', 'ZZZ'),  // drift
      translationPage('a', 'I1', 'he', 'ג'),    // match
    ],
  });
  const findings = detectNameTranDrift(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /\(uk\)/);
});
```

- [ ] **Step 2: Implement detector.**

```typescript
// core/src/checks/name-tran-drift.ts
import type { Detector, Finding, RepoState } from './types.ts';

export const detectNameTranDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  // Build a lookup: (record, locale) → translation page title
  const titleByKey = new Map<string, { title: string; path: string }>();
  for (const p of state.pages) {
    if (!p.meta.lang || p.meta.lang === 'en') continue;
    const record = p.meta.gedcom?.record;
    if (!record) continue;
    titleByKey.set(`${record}::${p.meta.lang}`, { title: p.meta.title, path: p.path });
  }
  // Walk every record's nameTranslations
  for (const [record, derived] of state.derived) {
    if (!derived.nameTranslations) continue;
    for (const [locale, tranValue] of Object.entries(derived.nameTranslations)) {
      const entry = titleByKey.get(`${record}::${locale}`);
      if (!entry) continue;  // no translation page for this (record, locale) pair
      if (entry.title === tranValue) continue;
      findings.push({
        category: 'data',
        severity: 'warn',
        message: `NAME.TRAN (${locale}) "${tranValue}" differs from page title "${entry.title}" for record ${record} — edit one or re-sync both`,
        location: { file: entry.path },
      });
    }
  }
  return findings;
};
```

- [ ] **Step 3: Wire into checks/index.ts.**

```typescript
// core/src/checks/index.ts — add to the detectors list
import { detectNameTranDrift } from './name-tran-drift.ts';
// ...
export const detectors: Detector[] = [
  // ...existing...
  detectNameTranDrift,
];
```

- [ ] **Step 4: Run tests.** `cd ~/dev/whoami/core && npm test`. Expected: tests above pass + entire core suite still green (498+ tests).

- [ ] **Step 5: Run against real data.** `cd ~/dev/whoami/cli && npm run build && WHOAMI_ROOT=~/whoami /Users/nyetwork/dev/whoami/cli/dist/wai.cjs check --only data 2>&1 | grep -i name.tran`. Expected: 0 findings against the post-Phase-1 corpus (since I just injected and the data is fresh). If findings appear, investigate before moving on.

---

## Task 2: Stale-canonical-sha detector

**Files:** `core/src/checks/stale-sha-drift.ts` (new), `core/test/checks/stale-sha-drift.test.ts` (new), `core/src/checks/index.ts` (wire).

**Trigger case:** `pages/en/sofia-krasnova.md` is edited and committed. Its HEAD SHA changes. `pages/ru/sofia-krasnova.md` still has the old `canonical_sha:` in its frontmatter. Until someone runs `wai i18n sync sofia-krasnova ru`, the Russian translation is stale. `wai i18n status` reports this; `wai check` currently does not — so a contributor who only ever runs `wai check` won't notice.

- [ ] **Step 1: Decide where the git plumbing lives.** Two options:
  - (a) New boundary module `core/src/checks/git-head-sha.ts` that exec-shells `git log -1 --format=%H -- <path>` per file.
  - (b) Pre-load all HEAD SHAs in `load.ts` and add to RepoState (`canonicalHeadSha: Map<slug, sha>`). More upfront cost but the detector stays pure.

  Recommend (b) — keeps detectors pure, amortizes the git call across all detectors that might want it.

- [ ] **Step 2: Update load.ts** to populate `canonicalHeadSha` map.

```typescript
// core/src/checks/load.ts — after pages walk
const canonicalHeadSha = new Map<string, string>();
const enDir = join(pagesDir, 'en');
if (existsSync(enDir)) {
  for (const name of readdirSync(enDir)) {
    if (!name.endsWith('.md') || name.endsWith('.talk.md')) continue;
    const slug = name.replace(/\.md$/, '');
    try {
      const sha = execSync(
        `git -C "${rootDir}" log -1 --format=%H -- pages/en/${slug}.md`,
        { encoding: 'utf8' },
      ).trim();
      if (sha) canonicalHeadSha.set(slug, sha);
    } catch {
      // git failures are non-fatal — the file may not yet be committed
    }
  }
}
// Add canonicalHeadSha to the returned RepoState
```

Update `RepoState` type accordingly.

- [ ] **Step 3: Tests for the detector.**

```typescript
test('stale-sha-drift: translation matches canonical HEAD → no finding', () => {
  const state = makeState({
    pages: [
      canonicalPage('a', 'sha1'),
      translationPage('a', 'ru', 'sha1'),
    ],
    canonicalHeadSha: new Map([['a', 'sha1']]),
  });
  assert.deepEqual(detectStaleShaDrift(state), []);
});

test('stale-sha-drift: translation lags canonical HEAD → one finding', () => {
  const state = makeState({
    pages: [translationPage('a', 'ru', 'sha1-old')],
    canonicalHeadSha: new Map([['a', 'sha2-new']]),
  });
  const findings = detectStaleShaDrift(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /stale.*sha1-old.*HEAD.*sha2-new/);
});
```

- [ ] **Step 4: Implement.** Walk `state.pages`; for each translation file (lang set, non-en), look up `state.canonicalHeadSha.get(slug)`; compare to `meta.canonicalSha`. Emit warn-severity finding on mismatch with a suggestion to run `wai i18n sync <slug> <locale>`.

- [ ] **Step 5: Wire + test against real data.** Should produce 0 findings against the current corpus (translations were just synced) but verify by editing one canonical page locally and seeing the finding appear.

---

## Task 3: Title ↔ infobox-name consistency

**Files:** `core/src/checks/infobox-name-drift.ts` (new), `core/test/checks/infobox-name-drift.test.ts` (new), `core/src/checks/index.ts` (wire).

**Trigger case:** someone edits `Steven Barash` → `Steven N. Barash` in the page's `title:` frontmatter but forgets to update the `:::infobox-person\nname: Steven Barash` block in the body. Reader sees two different names on the same page.

- [ ] **Step 1: Parse the infobox block.** The directive format is `:::infobox-person\nname: X\n...\n:::`. Regex-extract per page (compatible with any line in body that starts with `name: ` between `:::infobox-person` and the next `:::`).

```typescript
function extractInfoboxName(body: string): string | null {
  const match = body.match(/:::infobox-person\b([^]*?):::/);
  if (!match) return null;
  const nameLine = match[1].match(/^name:\s*(.+)$/m);
  return nameLine ? nameLine[1].trim().replace(/^"|"$/g, '') : null;
}
```

- [ ] **Step 2: Tests.**

```typescript
test('infobox-name-drift: title matches infobox.name → no finding', () => {
  const state = makeState([page('a', 'Steven Barash', ':::infobox-person\nname: Steven Barash\n:::')]);
  assert.deepEqual(detectInfoboxNameDrift(state), []);
});

test('infobox-name-drift: title differs from infobox.name → finding', () => {
  const state = makeState([page('a', 'Steven N. Barash', ':::infobox-person\nname: Steven Barash\n:::')]);
  const findings = detectInfoboxNameDrift(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /title "Steven N\. Barash".*infobox.*"Steven Barash"/);
});

test('infobox-name-drift: pages without infobox-person → skipped', () => {
  const state = makeState([page('a', 'X', 'body without infobox directive')]);
  assert.deepEqual(detectInfoboxNameDrift(state), []);
});
```

- [ ] **Step 3: Implement detector.** Walk `state.pages`; extract infobox name from body; compare to `meta.title`. Emit warn-severity finding on mismatch.

- [ ] **Step 4: Wire + test against real data.** Expect 0 findings against current corpus. If findings appear, those are real drifts to fix.

---

## Task 4: Pipeline-required frontmatter for translations

**Files:** `core/src/checks/translation-frontmatter-drift.ts` (new), `core/test/checks/translation-frontmatter-drift.test.ts` (new), `core/src/checks/index.ts` (wire).

**Trigger case:** someone copies `pages/en/sofia-krasnova.md` to `pages/ru/sofia-krasnova.md`, translates the body, but forgets to add `translation_of`, `canonical_sha`, etc. The Russian page now exists but is invisible to `wai i18n status` (no `translation_of` to join on) and won't get re-synced when the canonical updates. Or someone runs an old version of `wai i18n sync` that didn't yet emit `author:` and the field is missing.

- [ ] **Step 1: Tests.**

```typescript
test('translation-frontmatter-drift: all 4 fields present → no finding', () => {
  const state = makeState([translationPage('a', 'ru', {
    translationOf: 'a', canonicalSha: 'sha-40-chars-here'.padEnd(40, '0'),
    translatedAt: '2026-05-17', author: 'Claude Opus 4.7',
  })]);
  assert.deepEqual(detectTranslationFrontmatterDrift(state), []);
});

test('translation-frontmatter-drift: missing translation_of → finding', () => {
  const state = makeState([translationPageMissing('a', 'ru', { /* no translationOf */ })]);
  const findings = detectTranslationFrontmatterDrift(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /translation_of/);
});

// Same per missing field — parametrize.

test('translation-frontmatter-drift: canonical EN pages NOT flagged', () => {
  // lang undefined or lang: en → not a translation
  const state = makeState([canonicalPage('a')]);
  assert.deepEqual(detectTranslationFrontmatterDrift(state), []);
});
```

- [ ] **Step 2: Implement.** Walk pages; if `page.meta.lang` is set and not `en`, assert all four fields present. Emit one error-severity finding per missing field (so the user sees exactly what's missing).

- [ ] **Step 3: Wire + test against real data.** Expect 0 findings post-Phase-1 (we already fixed the 18 incomplete-gedcom translations; everything else has the full set). Run to confirm.

---

## Task 5: Wire everything + CHANGELOG + plan-index

**Files:** `core/src/checks/index.ts` (final form with all 4 wired); `CHANGELOG.md`; `docs/superpowers/plans/README.md`.

- [ ] **Step 1: Confirm all 4 detectors are exported from `core/src/checks/index.ts`.**

- [ ] **Step 2: Run full test suite.** `cd core && npm test && npm run typecheck`. Expected: 498 + 4×(2..4 new tests each) = ~510+ passing.

- [ ] **Step 3: Run `wai check` against real data.** Snapshot the category counts before/after. Any new findings are either real drifts to fix or false positives indicating a detector bug.

- [ ] **Step 4: CHANGELOG entry.** Under `## [Unreleased]` → `### Added`:

```markdown
- **Quality checks Pass 2 (4 new `wai check` detectors):**
  - `name-tran-drift`: asserts NAME.TRAN values match translation page titles
  - `stale-sha-drift`: flags translations whose canonical_sha doesn't match HEAD
  - `infobox-name-drift`: asserts page `:::infobox-person.name` matches `title:`
  - `translation-frontmatter-drift`: asserts translation files have all pipeline-emitted fields
  All four wire into the existing pre-commit hook via category `data` (warn or
  error severity). Adds `canonicalHeadSha: Map<slug, sha>` to `RepoState` via
  load.ts, populated from `git log -1 --format=%H` per canonical page.
```

- [ ] **Step 5: Flip plan-index status in `docs/superpowers/plans/README.md`** from 🚧 → ✅.

- [ ] **Step 6: Commit and push.**

---

## Rollback

If any detector produces too many false positives in real data, revert just that detector's wiring in `core/src/checks/index.ts` while leaving its code + tests in place. Re-enable after tuning.

---

## Open questions / decisions

- **`stale-sha-drift` severity:** `warn` or `info`? `warn` blocks the pre-commit hook, which might be annoying if a contributor is mid-edit on a canonical. Recommend `info` to start (visible but non-blocking); upgrade if it turns out to be high-signal.
- **`infobox-name-drift` for non-person infoboxes:** the directive system has multiple infobox kinds (`infobox-person`, `infobox-company`, etc.). Start with `infobox-person` only; extend if other types accumulate.
- **Should `name-tran-drift` propose auto-fix?** Probably no — the user should choose which side wins (page edit vs GEDCOM edit). Auto-fix risks clobbering intentional manual changes.
