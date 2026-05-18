# Multilingual support — Plan 3 of 4: Translation pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the article translation infrastructure so the editor agent can translate `pages/en/<slug>.md` into `pages/{ru,uk,he}/<slug>.md` with a paired translation talk file that captures every non-trivial editorial choice. Once Plan 3 lands, the user can run `wai i18n sync <slug> <locale>` and have a faithful translation + audit log on disk, with the article renderer detecting translation status (current / stale / review / missing) and surfacing a banner accordingly.

**Architecture:** New CLI subcommand `wai i18n` with `status` (lists every (slug, locale) with computed state) and `sync <slug> <locale>` (invokes the harness adapter with a translation prompt; writes translation + talk file). Per-locale PageStore reads from `~/whoami/pages/{locale}/`. Talk-file parser in `core/` counts unresolved `[ ]` entries. Computed-status helper returns `current | stale | review | missing` from `(canonical_sha vs HEAD, unresolved-count from talk file)`. Three new React banner components on article rendering. Editor agent gains a translation prompt template.

**Deferred to Plan 3.5** (post-smoke-test follow-on):
- `places-i18n.yml` lookup + integration through infobox/tree/search (Plan 4 articles use English place names initially; refinement comes later).
- Multilingual cite-vault rendering (original-script source above translation).
- `Intl.Collator(locale)` for sorted lists.
- `alternates.languages` exclusion of missing/review translations from hreflang.

**Tech Stack:** TypeScript, Next.js 16, React 19, `next-intl`, `tsx --test`, `node:assert/strict`. Reuses the harness adapter from `cli/src/harness/`. No new runtime deps.

**Spec reference:** `docs/superpowers/specs/2026-05-16-multilingual-support-design.md` (commit `c7a7a59`). Plan 3 implements the "Plan 3 — Article translation infrastructure" section minus the place-name / cite-vault / Collator items (those defer to Plan 3.5).

---

## Scope

**In scope:**
- Translation file frontmatter spec (`translation_of`, `canonical_sha`, `translated_at` — `translation_status` is computed, not stored).
- Translation talk file format spec (`pages/{locale}/<slug>.translation.talk.md` with `## Unresolved` / `## Resolved` sections, bracketed kind tags, checkbox-driven resolution).
- `core/src/i18n/translation-talk.ts` — talk file parser. Returns `{ unresolved: number, resolved: number, entries: TalkEntry[] }`.
- `core/src/i18n/status.ts` — computed status helper. Returns `current | stale | review | missing` from `(translationFile?, talkFile?, canonicalHeadSha)`.
- `core/src/i18n/locales.ts` — shared locale constants (so core and frontend agree).
- Extended `core/src/pages/store.ts` to accept a `locale` parameter on read/list, defaulting to canonical English.
- `frontend/lib/server-services.ts` extended to use per-locale page reads.
- `frontend/components/translation-banner.tsx` — three banner variants (stale, review, missing).
- `frontend/app/[locale]/[slug]/page.tsx` — banner integration.
- `cli/src/commands/i18n-status.ts` — `wai i18n status` command.
- `cli/src/commands/i18n-sync.ts` — `wai i18n sync <slug> <locale>` command.
- `cli/src/index.ts` — wire `wai i18n` subcommand router.
- `plugins/whoami/skills/writing-articles/prompt-templates/translate.md` — translation prompt template.
- `plugins/whoami/agents/translator.md` — new agent definition for translation work (or extend `editor.md`).
- New tests in `core/test/i18n/` and `cli/test/`.
- `frontend/AGENTS.md` — translation-rendering conventions.
- `CHANGELOG.md` — Unreleased entries.
- `docs/superpowers/plans/README.md` — plan row.

**Out of scope (Plan 3.5):**
- `~/whoami/genealogy/places-i18n.yml` data file + lookup integration.
- Multilingual cite-vault: source-original above per-locale translation.
- `Intl.Collator(locale)` for sorted lists.
- `alternates.languages` exclusion of missing/review translations.

**Out of scope (Plan 4):**
- Actual article backfill (translating all ~280 English articles into ru/uk/he).

**Out of scope entirely (per spec non-goals):**
- CLI translation, editorial-guide translation, article talk page translation.

## File structure

```
core/src/i18n/locales.ts                            NEW. Shared locale constants.
core/src/i18n/translation-talk.ts                   NEW. Talk file parser.
core/src/i18n/status.ts                             NEW. Computed status helper.
core/src/i18n/index.ts                              NEW. Public re-exports.
core/src/i18n/translation-talk.test.ts             NEW. Talk parser tests.
core/src/i18n/status.test.ts                       NEW. Status helper tests.
core/src/pages/store.ts                             MODIFY. Add `locale` param to read/list.
core/src/pages/types.ts                             MODIFY. Add TranslationFrontmatter type.
core/src/pages/frontmatter.ts                       MODIFY. Parse translation-specific fields.
frontend/lib/server-services.ts                     MODIFY. Per-locale store wiring.
frontend/components/translation-banner.tsx          NEW. Banner UI component.
frontend/app/[locale]/[slug]/page.tsx               MODIFY. Render banner based on computed status.
frontend/messages/en.json                           MODIFY. Add Page.Article banner strings.
frontend/messages/{ru,uk,he}.json                   MODIFY. Translations of banner strings.
cli/src/commands/i18n-status.ts                     NEW.
cli/src/commands/i18n-sync.ts                       NEW.
cli/src/commands/i18n-status.test.ts                NEW.
cli/src/commands/i18n-sync.test.ts                  NEW.
cli/src/index.ts                                    MODIFY. Wire `wai i18n` subcommand router.
cli/test/i18n-status.test.ts                        NEW.
cli/test/i18n-sync.test.ts                          NEW.
plugins/whoami/skills/writing-articles/prompt-templates/translate.md
                                                    NEW. Translation prompt.
plugins/whoami/agents/translator.md                 NEW. Translator agent.
frontend/AGENTS.md                                  MODIFY. Translation-rendering conventions.
CHANGELOG.md                                        MODIFY. Unreleased entries.
docs/superpowers/plans/README.md                    MODIFY. Plan row.
```

## Conventions adhered to

- `core/src/i18n/` is a NEW pure module — takes data, returns data. No file I/O above the function boundary.
- All new CLI commands export a `run<Name>` function with injected I/O for testability.
- Translation talk file is **English-only** (same as article talk files) so the user can read agent reasoning without being fluent in the target language.
- Frontmatter spec: `translation_of` (slug), `canonical_sha` (full git SHA), `translated_at` (ISO date) — these three are required on every translation file.
- `translation_status` is COMPUTED from `(canonical_sha == HEAD-of-canonical) && (talk-file-unresolved == 0)`. NOT stored.
- All four locales serve the same canonical-EN content via fallback until a translation file exists at `pages/{locale}/<slug>.md`. No 404s for missing translations.
- Match existing quote convention (Rule 11).
- Project commit hygiene Rule 13: feat commits include CHANGELOG entry in same commit.

---

## Task 1: Core — shared locale constants

Single source of truth for the four locales, shared between core, frontend, and cli.

**Files:**
- Create: `core/src/i18n/locales.ts`

- [ ] **Step 1: Create the file**

```ts
export const LOCALES = ["en", "ru", "uk", "he"] as const;
export type Locale = (typeof LOCALES)[number];
export const CANONICAL_LOCALE: Locale = "en";
export const TARGET_LOCALES: readonly Locale[] = ["ru", "uk", "he"];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/nyetwork/dev/whoami/core && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/i18n/locales.ts
git commit -m "chore: core i18n module — shared locale constants"
```

---

## Task 2: Core — translation-talk parser

Parses a translation talk file. Returns counts and entries. The parser is pure (takes a string body, returns data).

**Files:**
- Create: `core/src/i18n/translation-talk.ts`
- Create: `core/test/i18n/translation-talk.test.ts`

- [ ] **Step 1: Write the failing test**

Create `core/test/i18n/translation-talk.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTranslationTalk } from "../../src/i18n/translation-talk.ts";

test("parseTranslationTalk: empty body returns zero counts", () => {
  const result = parseTranslationTalk("");
  assert.equal(result.unresolved, 0);
  assert.equal(result.resolved, 0);
  assert.deepEqual(result.entries, []);
});

test("parseTranslationTalk: counts unresolved [ ] entries in ## Unresolved", () => {
  const body = `
# Translation notes

## Unresolved

- [ ] **[name-transliteration]** Translated "Abby" as "Эбби".
- [ ] **[idiom]** "knack for languages" — chose colloquial form.

## Resolved

- [x] **[place-name]** "Brooklyn" as "Бруклин". *Resolved 2026-05-17.*
`;
  const result = parseTranslationTalk(body);
  assert.equal(result.unresolved, 2);
  assert.equal(result.resolved, 1);
});

test("parseTranslationTalk: parses entry kind tags", () => {
  const body = `
## Unresolved

- [ ] **[name-transliteration]** A note.
- [ ] **[idiom]** Another.
`;
  const result = parseTranslationTalk(body);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].kind, "name-transliteration");
  assert.equal(result.entries[0].resolved, false);
  assert.equal(result.entries[1].kind, "idiom");
});

test("parseTranslationTalk: entries outside ## Unresolved or ## Resolved are ignored", () => {
  const body = `
- [ ] **[other]** Should be ignored (outside sections).

## Unresolved

- [ ] **[name]** Counted.
`;
  const result = parseTranslationTalk(body);
  assert.equal(result.unresolved, 1);
});

test("parseTranslationTalk: malformed entries (no kind tag) are skipped", () => {
  const body = `
## Unresolved

- [ ] No kind tag here.
- [ ] **[valid]** Kind tagged.
`;
  const result = parseTranslationTalk(body);
  assert.equal(result.unresolved, 1);
  assert.equal(result.entries[0].kind, "valid");
});
```

- [ ] **Step 2: Run the test — confirm failure**

```bash
cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/i18n/translation-talk.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `core/src/i18n/translation-talk.ts`:
```ts
export interface TalkEntry {
  kind: string;
  resolved: boolean;
}

export interface TalkSummary {
  unresolved: number;
  resolved: number;
  entries: TalkEntry[];
}

export function parseTranslationTalk(body: string): TalkSummary {
  if (!body.trim()) return { unresolved: 0, resolved: 0, entries: [] };

  const sections = extractSections(body);
  const entries: TalkEntry[] = [];

  for (const entry of parseEntries(sections.unresolved, false)) entries.push(entry);
  for (const entry of parseEntries(sections.resolved, true)) entries.push(entry);

  return {
    unresolved: entries.filter(e => !e.resolved).length,
    resolved: entries.filter(e => e.resolved).length,
    entries,
  };
}

function extractSections(body: string): { unresolved: string; resolved: string } {
  const unresolvedMatch = body.match(/##\s+Unresolved\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const resolvedMatch = body.match(/##\s+Resolved\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return {
    unresolved: unresolvedMatch ? unresolvedMatch[1] : "",
    resolved: resolvedMatch ? resolvedMatch[1] : "",
  };
}

function parseEntries(section: string, sectionResolved: boolean): TalkEntry[] {
  const lines = section.split("\n");
  const out: TalkEntry[] = [];
  for (const line of lines) {
    // Match: "- [ ] **[kind-tag]** prose..." or "- [x] **[kind-tag]** prose..."
    const m = line.match(/^-\s*\[([ x])\]\s*\*\*\[([a-z][\w-]*)\]\*\*/i);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    const kind = m[2];
    out.push({ kind, resolved: sectionResolved ? true : checked });
  }
  return out;
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/i18n/translation-talk.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/i18n/translation-talk.ts core/test/i18n/translation-talk.test.ts
git commit -m "feat: core translation-talk file parser" -m "$(cat <<'INNER'
parseTranslationTalk(body) returns { unresolved, resolved, entries }
from the translation-talk file's ## Unresolved / ## Resolved sections.
Each entry is "- [ ] **[kind-tag]** ..." or "- [x] **[kind-tag]** ...".
Used by the computed-status helper to gate translation_status: current.

INNER
)"
```

Add CHANGELOG entry under `## [Unreleased]`:
```markdown
- **Translation talk parser:** `core/src/i18n/translation-talk.ts` parses `<slug>.translation.talk.md` files into unresolved/resolved entry counts. Foundation for the translation accuracy review gate.
```

Then re-stage:
```bash
git add CHANGELOG.md
git commit --amend --no-edit
```

(Note: amending is acceptable here because the previous commit has not been pushed.)

---

## Task 3: Core — computed translation status

Returns `current | stale | review | missing` from disk state.

**Files:**
- Create: `core/src/i18n/status.ts`
- Create: `core/test/i18n/status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `core/test/i18n/status.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTranslationStatus } from "../../src/i18n/status.ts";

test("computeTranslationStatus: missing when no translation file", () => {
  const status = computeTranslationStatus({
    translationCanonicalSha: undefined,
    canonicalHeadSha: "abc123",
    unresolvedTalkEntries: 0,
  });
  assert.equal(status, "missing");
});

test("computeTranslationStatus: stale when canonical_sha differs from HEAD", () => {
  const status = computeTranslationStatus({
    translationCanonicalSha: "old456",
    canonicalHeadSha: "new789",
    unresolvedTalkEntries: 0,
  });
  assert.equal(status, "stale");
});

test("computeTranslationStatus: review when sha matches but talk has unresolved", () => {
  const status = computeTranslationStatus({
    translationCanonicalSha: "abc123",
    canonicalHeadSha: "abc123",
    unresolvedTalkEntries: 3,
  });
  assert.equal(status, "review");
});

test("computeTranslationStatus: current when sha matches and talk is clean", () => {
  const status = computeTranslationStatus({
    translationCanonicalSha: "abc123",
    canonicalHeadSha: "abc123",
    unresolvedTalkEntries: 0,
  });
  assert.equal(status, "current");
});

test("computeTranslationStatus: stale beats review when both apply", () => {
  // If sha is mismatched AND talk has unresolved, stale wins.
  const status = computeTranslationStatus({
    translationCanonicalSha: "old456",
    canonicalHeadSha: "new789",
    unresolvedTalkEntries: 5,
  });
  assert.equal(status, "stale");
});
```

- [ ] **Step 2: Run test — confirm failure**

```bash
cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/i18n/status.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `core/src/i18n/status.ts`:
```ts
export type TranslationStatus = "current" | "stale" | "review" | "missing";

export interface StatusInput {
  /** canonical_sha from the translation file's frontmatter, or undefined if no translation file exists. */
  translationCanonicalSha: string | undefined;
  /** The current HEAD git SHA of the canonical EN file. */
  canonicalHeadSha: string;
  /** Count of unresolved [ ] entries in the translation talk file. */
  unresolvedTalkEntries: number;
}

export function computeTranslationStatus(input: StatusInput): TranslationStatus {
  if (input.translationCanonicalSha === undefined) return "missing";
  if (input.translationCanonicalSha !== input.canonicalHeadSha) return "stale";
  if (input.unresolvedTalkEntries > 0) return "review";
  return "current";
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/i18n/status.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

Add CHANGELOG entry:
```markdown
- **Translation status helper:** `core/src/i18n/status.ts` computes `current | stale | review | missing` from `(translation canonical_sha, head canonical_sha, unresolved-talk-entries)`. Status is computed, not stored — so a user resolving a talk entry flips the rendered status without metadata edits.
```

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/i18n/status.ts core/test/i18n/status.test.ts CHANGELOG.md
git commit -m "feat: core translation status helper (current/stale/review/missing)"
```

---

## Task 4: Core — i18n module index

Re-exports the public surface of `core/src/i18n/`.

**Files:**
- Create: `core/src/i18n/index.ts`

- [ ] **Step 1: Create the index**

```ts
export * from "./locales.ts";
export * from "./translation-talk.ts";
export * from "./status.ts";
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/nyetwork/dev/whoami/core && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add core/src/i18n/index.ts
git commit -m "chore: core i18n module index — public re-exports"
```

---

## Task 5: Per-locale PageStore

Extend the page store to read from `pages/{locale}/<slug>.md`. Default locale is the canonical EN. Existing single-locale call sites are unaffected.

**Files:**
- Modify: `core/src/pages/store.ts`
- Modify: `core/test/pages/store.test.ts` (if exists; otherwise add a new test)

- [ ] **Step 1: Read the current store**

Read `core/src/pages/store.ts` to understand the current API surface (read, write, list).

- [ ] **Step 2: Write failing test for locale-aware read**

Add to a new file `core/test/pages/store-locale.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPageStore } from "../../src/pages/store.ts";

async function makeRepo() {
  const root = await mkdir(join(tmpdir(), `whoami-test-${Date.now()}`), { recursive: true });
  if (!root) throw new Error("mkdir failed");
  return root;
}

test("PageStore: reads from pages/en/<slug>.md by default", async () => {
  const root = (await mkdir(join(tmpdir(), `whoami-test-${Date.now()}`), { recursive: true }))!;
  const pagesDir = join(root, "pages");
  await mkdir(join(pagesDir, "en"), { recursive: true });
  await writeFile(
    join(pagesDir, "en", "abby.md"),
    "---\nschemaVersion: 4\ntitle: Abby\nowner: x\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nbody",
  );

  const store = createPageStore({ repoRoot: root, pagesDir: join(pagesDir, "en") });
  const page = await store.read("abby");
  assert.equal(page.meta.title, "Abby");

  await rm(root, { recursive: true });
});

test("PageStore: locale param reads from pages/{locale}/<slug>.md", async () => {
  const root = (await mkdir(join(tmpdir(), `whoami-test-${Date.now()}`), { recursive: true }))!;
  const pagesDir = join(root, "pages");
  await mkdir(join(pagesDir, "ru"), { recursive: true });
  await writeFile(
    join(pagesDir, "ru", "abby.md"),
    "---\nschemaVersion: 4\ntitle: Эбби\nlang: ru\ntranslation_of: abby\ncanonical_sha: abc\ntranslated_at: '2026-05-17'\nowner: x\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nрусский body",
  );

  const store = createPageStore({ repoRoot: root, pagesDir });
  const page = await store.read("abby", { locale: "ru" });
  assert.equal(page.meta.title, "Эбби");

  await rm(root, { recursive: true });
});
```

- [ ] **Step 3: Run test — confirm failure**

```bash
cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/pages/store-locale.test.ts
```

Expected: FAIL on second test — `store.read` doesn't accept locale option.

- [ ] **Step 4: Extend store**

Modify `core/src/pages/store.ts`. Find the `read` method. Add an optional `{ locale?: string }` parameter:

```ts
// Before:
async read(slug: string): Promise<Page> { ... }

// After:
async read(slug: string, opts?: { locale?: string }): Promise<Page> {
  const localePath = opts?.locale
    ? join(this.repoRoot, "pages", opts.locale, `${slug}.md`)
    : join(this.pagesDir, `${slug}.md`);
  // ... read from localePath
}
```

Look at the existing read implementation and adapt it minimally — preserve all existing behavior; the new locale param is opt-in.

Apply similar changes to `list()` if needed (the spec for Plan 4 will use list per-locale to enumerate translated articles).

- [ ] **Step 5: Run test — confirm pass**

```bash
cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/pages/store-locale.test.ts && npm test
```

Expected: new test passes; existing 471 core tests still pass.

- [ ] **Step 6: Commit**

Add CHANGELOG entry:
```markdown
- **Per-locale PageStore reads:** `PageStore.read(slug, { locale })` reads from `pages/{locale}/<slug>.md`. Existing callers (no locale) are unchanged — they continue reading from the store's configured pagesDir.
```

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages/store.ts core/test/pages/store-locale.test.ts CHANGELOG.md
git commit -m "feat: per-locale read on PageStore"
```

---

## Task 6: Translation frontmatter parsing

The translation-specific frontmatter fields (`translation_of`, `canonical_sha`, `translated_at`, `lang`) need to be parsed and surfaced on PageMeta.

**Files:**
- Modify: `core/src/pages/types.ts`
- Modify: `core/src/pages/schema.ts`
- Modify: `core/src/pages/frontmatter.ts`
- Modify: `core/test/pages/frontmatter.test.ts` (extend existing test)

- [ ] **Step 1: Read the current types/schema/frontmatter parser**

```bash
grep -n "title\|schemaVersion" /Users/nyetwork/dev/whoami/core/src/pages/types.ts
```

Understand how existing meta fields are typed and parsed.

- [ ] **Step 2: Extend PageMeta with optional translation fields**

In `core/src/pages/types.ts`, add to the PageMeta interface:
```ts
export interface PageMeta {
  // ... existing fields
  /** Set on translation files only — points to the canonical slug. */
  translationOf?: string;
  /** Git SHA of the canonical EN file at translation time. Translation files only. */
  canonicalSha?: string;
  /** ISO date when this translation was generated. Translation files only. */
  translatedAt?: string;
  /** ISO 639 language code; defaults to "en" on canonical files. */
  lang?: string;
}
```

- [ ] **Step 3: Update Zod schema (if used)**

In `core/src/pages/schema.ts`, extend the schema with optional fields:
```ts
translation_of: z.string().optional(),
canonical_sha: z.string().optional(),
translated_at: z.string().optional(),
lang: z.string().optional(),
```

- [ ] **Step 4: Update frontmatter parser**

In `core/src/pages/frontmatter.ts`, ensure the parser surfaces these fields. They use snake_case in YAML; camelCase in the TS type.

Add a failing test to `core/test/pages/frontmatter.test.ts`:
```ts
test("parsePage: extracts translation_of and canonical_sha from translation file", () => {
  const md = `---
schemaVersion: 4
title: Эбби
lang: ru
translation_of: abby-rickelman
canonical_sha: a3f2c19abc
translated_at: '2026-05-17'
owner: x
type: person
aliases: []
categories: []
created: '2026-05-01'
corrections: []
---
русский body`;
  const page = parsePage(md, "abby-rickelman");
  assert.equal(page.meta.translationOf, "abby-rickelman");
  assert.equal(page.meta.canonicalSha, "a3f2c19abc");
  assert.equal(page.meta.translatedAt, "2026-05-17");
  assert.equal(page.meta.lang, "ru");
});
```

Run, confirm fails, implement, confirm passes.

- [ ] **Step 5: Run full core suite**

```bash
cd /Users/nyetwork/dev/whoami/core && npm test
```

Expected: 471+ tests pass (new test added).

- [ ] **Step 6: Commit**

Add CHANGELOG entry:
```markdown
- **Translation frontmatter:** `translation_of`, `canonical_sha`, `translated_at`, `lang` fields are now parsed off translation files into PageMeta. Used by the computed-status helper to detect stale translations.
```

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages CHANGELOG.md
git commit -m "feat: parse translation_of/canonical_sha/translated_at/lang frontmatter"
```

---

## Task 7: Frontend — translation banner component

Three banner variants: stale, review, missing. Each surfaces the relevant message + action.

**Files:**
- Create: `frontend/components/translation-banner.tsx`
- Modify: `frontend/messages/en.json` (add `Page.Article.banners` namespace)
- Modify: `frontend/messages/{ru,uk,he}.json` (matching translations)

- [ ] **Step 1: Add banner strings to messages/en.json**

Read `frontend/messages/en.json`. Find `Page.Article` (currently empty). Add `banners`:
```json
"Article": {
  "banners": {
    "stale": "This translation reflects an earlier version of the article. An updated translation is in progress.",
    "review": "This translation is under review. The agent flagged {count, plural, one {# editorial choice} other {# editorial choices}} for your confirmation.",
    "missing": "This article hasn't been translated to {language} yet. Showing the English version.",
    "viewCanonical": "View the English version"
  }
}
```

- [ ] **Step 2: Add to ru.json, uk.json, he.json**

Add equivalent translations under `Page.Article.banners` in each. Preserve the `{count}` and `{language}` placeholders verbatim. Use correct ICU plural categories per language. Example for ru.json:
```json
"banners": {
  "stale": "Этот перевод отражает более раннюю версию статьи. Обновление в процессе.",
  "review": "Перевод на проверке. Агент отметил {count, plural, one {# редакторский выбор} few {# редакторских выбора} many {# редакторских выборов} other {# редакторских выбора}} для вашего подтверждения.",
  "missing": "Эта статья ещё не переведена на {language}. Показана английская версия.",
  "viewCanonical": "Открыть английскую версию"
}
```

For uk.json (same plural shape as ru):
```json
"banners": {
  "stale": "Цей переклад відображає старішу версію статті. Оновлення триває.",
  "review": "Переклад на перегляді. Агент позначив {count, plural, one {# редакторський вибір} few {# редакторських вибори} many {# редакторських виборів} other {# редакторських вибори}} для вашого підтвердження.",
  "missing": "Цю статтю ще не перекладено {language}. Показано англійську версію.",
  "viewCanonical": "Відкрити англійську версію"
}
```

For he.json (Hebrew categories):
```json
"banners": {
  "stale": "תרגום זה משקף גרסה מוקדמת יותר של המאמר. תרגום מעודכן בעבודה.",
  "review": "התרגום בתהליך סקירה. הסוכן ציין {count, plural, one {החלטה עריכתית אחת} two {שתי החלטות עריכתיות} many {# החלטות עריכתיות} other {# החלטות עריכתיות}} לאישורך.",
  "missing": "המאמר טרם תורגם ל{language}. מוצגת הגרסה האנגלית.",
  "viewCanonical": "פתח את הגרסה האנגלית"
}
```

- [ ] **Step 3: Run messages parity test**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npx tsx --test test/messages-parity.test.ts
```

Expected: PASS (all four files have matching key shape).

- [ ] **Step 4: Create the banner component**

Create `frontend/components/translation-banner.tsx`:
```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { TranslationStatus } from "@core/i18n/index.ts";

interface Props {
  status: TranslationStatus;
  slug: string;
  unresolvedCount?: number;
  locale: string;
}

export async function TranslationBanner({ status, slug, unresolvedCount = 0, locale }: Props) {
  if (status === "current") return null;

  const t = await getTranslations({ locale, namespace: "Page.Article.banners" });
  const languageName = await getLanguageName(locale);

  const message =
    status === "stale" ? t("stale")
    : status === "review" ? t("review", { count: unresolvedCount })
    : t("missing", { language: languageName });

  return (
    <aside
      className="my-4 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 ps-4 pe-4 py-3 text-sm"
      role="note"
    >
      <p>{message}</p>
      {status !== "missing" && (
        <p className="mt-2">
          <Link href={`/${slug}`} locale="en" className="underline">
            {t("viewCanonical")}
          </Link>
        </p>
      )}
    </aside>
  );
}

async function getLanguageName(locale: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Chrome.LangSwitcher" });
  return t(locale as "en" | "ru" | "uk" | "he");
}
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

Add CHANGELOG entry:
```markdown
- **Translation banners:** new `frontend/components/translation-banner.tsx` renders stale / review / missing notices on translated article pages. Strings localized across all four locale files with correct ICU plural categories.
```

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/components/translation-banner.tsx frontend/messages CHANGELOG.md
git commit -m "feat: translation status banner component"
```

---

## Task 8: Frontend — wire computed status into article page

The article page at `app/[locale]/[slug]/page.tsx` needs to detect the translation status and render the banner.

**Files:**
- Modify: `frontend/app/[locale]/[slug]/page.tsx`
- Modify: `frontend/lib/server-services.ts`

- [ ] **Step 1: Add a `getTranslationStatus` helper to server-services.ts**

In `frontend/lib/server-services.ts`, add:
```ts
import { computeTranslationStatus, parseTranslationTalk, type TranslationStatus } from "@core/i18n/index.ts";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface TranslationInfo {
  status: TranslationStatus;
  unresolvedCount: number;
  /** The PageStore page to render (translation if available, canonical EN otherwise). */
  page: Page;
}

export async function getTranslationInfo(slug: string, locale: string): Promise<TranslationInfo> {
  if (locale === "en") {
    const page = await getPageStore().read(slug);
    return { status: "current", unresolvedCount: 0, page };
  }

  let translationPage: Page | undefined;
  try {
    translationPage = await getPageStore().read(slug, { locale });
  } catch {
    translationPage = undefined;
  }

  const canonicalHeadSha = getCanonicalHeadSha(slug);
  const translationCanonicalSha = translationPage?.meta.canonicalSha;

  const talkPath = join(WHOAMI_ROOT, "pages", locale, `${slug}.translation.talk.md`);
  const talkBody = existsSync(talkPath) ? readFileSync(talkPath, "utf8") : "";
  const talkSummary = parseTranslationTalk(talkBody);

  const status = computeTranslationStatus({
    translationCanonicalSha,
    canonicalHeadSha,
    unresolvedTalkEntries: talkSummary.unresolved,
  });

  // For missing or stale, fall back to canonical EN content.
  const page = (status === "missing" || translationPage === undefined)
    ? await getPageStore().read(slug)
    : translationPage;

  return { status, unresolvedCount: talkSummary.unresolved, page };
}

function getCanonicalHeadSha(slug: string): string {
  try {
    return execSync(`git -C "${WHOAMI_ROOT}" log -1 --format=%H -- pages/en/${slug}.md`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
```

(The `execSync` git call runs once per article render; in a future optimization this could be cached. For Plan 3 it's acceptable.)

- [ ] **Step 2: Update the article page to call getTranslationInfo and render banner**

In `frontend/app/[locale]/[slug]/page.tsx`, replace the direct `getPageStore().read(slug)` call:

```tsx
// Before:
const page = await getPageStore().read(slug);

// After:
import { getTranslationInfo } from "@/lib/server-services";
import { TranslationBanner } from "@/components/translation-banner";

const { status, unresolvedCount, page } = await getTranslationInfo(slug, locale);
```

Then, in the JSX, render the banner above the article body:
```tsx
return (
  <article>
    <TranslationBanner status={status} slug={slug} unresolvedCount={unresolvedCount} locale={locale} />
    {/* existing article rendering */}
  </article>
);
```

(Adapt to the existing JSX structure — the article element / heading / body layout is project-specific.)

- [ ] **Step 3: Typecheck + tests**

```bash
cd /Users/nyetwork/dev/whoami/frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit && npm test
```

Expected: clean.

- [ ] **Step 4: Build check**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

Add CHANGELOG entry:
```markdown
- **Article translation status detection:** `app/[locale]/[slug]/page.tsx` now resolves translation status (current / stale / review / missing) per request and renders the appropriate banner. Missing translations fall back to canonical EN content.
```

```bash
cd /Users/nyetwork/dev/whoami
git add frontend CHANGELOG.md
git commit -m "feat: article page detects translation status and renders banner"
```

---

## Task 9: CLI — `wai i18n status` command

Lists every (slug, locale) pair with its computed translation status.

**Files:**
- Create: `cli/src/commands/i18n-status.ts`
- Create: `cli/test/i18n-status.test.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `cli/test/i18n-status.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runI18nStatus } from "../src/commands/i18n-status.ts";

test("wai i18n status: lists missing translations for slugs without translation files", async () => {
  const root = join(tmpdir(), `whoami-i18n-${Date.now()}`);
  await mkdir(join(root, "pages", "en"), { recursive: true });
  await writeFile(
    join(root, "pages", "en", "abby.md"),
    "---\nschemaVersion: 4\ntitle: Abby\nowner: x\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nbody",
  );
  execSync(`git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`);

  let stdout = "";
  await runI18nStatus({
    rootDir: root,
    write: (s) => { stdout += s; },
  });

  // Three target locales × 1 article = 3 missing entries.
  assert.match(stdout, /abby\s+ru\s+missing/);
  assert.match(stdout, /abby\s+uk\s+missing/);
  assert.match(stdout, /abby\s+he\s+missing/);

  await rm(root, { recursive: true });
});
```

- [ ] **Step 2: Implement**

Create `cli/src/commands/i18n-status.ts`:
```ts
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parseTranslationTalk, computeTranslationStatus, TARGET_LOCALES, type TranslationStatus } from "@core/i18n/index.ts";
import { parsePage } from "@core/pages/frontmatter.ts";

export interface RunI18nStatusOpts {
  rootDir: string;
  write: (s: string) => void;
}

export async function runI18nStatus(opts: RunI18nStatusOpts): Promise<void> {
  const pagesEnDir = join(opts.rootDir, "pages", "en");
  if (!existsSync(pagesEnDir)) {
    opts.write(`pages/en/ not found in ${opts.rootDir}\n`);
    return;
  }

  const slugs = readdirSync(pagesEnDir)
    .filter(f => f.endsWith(".md") && !f.includes(".talk."))
    .map(f => f.replace(/\.md$/, ""));

  opts.write("slug\tlocale\tstatus\tunresolved\n");

  for (const slug of slugs) {
    const canonicalSha = getCanonicalSha(opts.rootDir, slug);

    for (const locale of TARGET_LOCALES) {
      const translationPath = join(opts.rootDir, "pages", locale, `${slug}.md`);
      const talkPath = join(opts.rootDir, "pages", locale, `${slug}.translation.talk.md`);

      let translationCanonicalSha: string | undefined;
      if (existsSync(translationPath)) {
        const body = readFileSync(translationPath, "utf8");
        try {
          const page = parsePage(body, slug);
          translationCanonicalSha = page.meta.canonicalSha;
        } catch {
          // ignore parse errors
        }
      }

      const talkSummary = existsSync(talkPath)
        ? parseTranslationTalk(readFileSync(talkPath, "utf8"))
        : { unresolved: 0, resolved: 0, entries: [] };

      const status = computeTranslationStatus({
        translationCanonicalSha,
        canonicalHeadSha: canonicalSha,
        unresolvedTalkEntries: talkSummary.unresolved,
      });

      opts.write(`${slug}\t${locale}\t${status}\t${talkSummary.unresolved}\n`);
    }
  }
}

function getCanonicalSha(rootDir: string, slug: string): string {
  try {
    return execSync(`git -C "${rootDir}" log -1 --format=%H -- pages/en/${slug}.md`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
```

- [ ] **Step 3: Wire into cli/src/index.ts**

Find the existing subcommand router. Add an `i18n` subcommand with a `status` action:

```ts
import { runI18nStatus } from "./commands/i18n-status.ts";

// Inside the existing dispatch:
case "i18n": {
  const action = argv[1];
  if (action === "status") {
    await runI18nStatus({
      rootDir: process.env.WHOAMI_ROOT ?? join(process.env.HOME!, "whoami"),
      write: (s) => process.stdout.write(s),
    });
    process.exit(0);
  } else {
    console.error("Unknown i18n action. Try: wai i18n status");
    process.exit(2);
  }
  break;
}
```

(Adapt to the actual CLI's dispatch pattern — read `cli/src/index.ts` to see how other subcommands are wired.)

- [ ] **Step 4: Run test — confirm pass**

```bash
cd /Users/nyetwork/dev/whoami/cli && npx tsx --test test/i18n-status.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Add CHANGELOG entry:
```markdown
- **`wai i18n status`:** new CLI command lists every (slug × locale) pair with its computed translation status (current / stale / review / missing) and unresolved-entry count. Output is tab-separated for easy grep/sort.
```

```bash
cd /Users/nyetwork/dev/whoami
git add cli CHANGELOG.md
git commit -m "feat: wai i18n status — list translation state for every (slug, locale)"
```

---

## Task 10: CLI — `wai i18n sync <slug> <locale>` stub

Wire the command end-to-end with a STUB translator (echoes the canonical content, prepends a notice). Real agent invocation is Task 11.

**Files:**
- Create: `cli/src/commands/i18n-sync.ts`
- Create: `cli/test/i18n-sync.test.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Test for the stub behavior**

Create `cli/test/i18n-sync.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runI18nSync } from "../src/commands/i18n-sync.ts";

test("wai i18n sync: writes pages/{locale}/<slug>.md with translation frontmatter (stub)", async () => {
  const root = join(tmpdir(), `whoami-i18n-sync-${Date.now()}`);
  await mkdir(join(root, "pages", "en"), { recursive: true });
  await writeFile(
    join(root, "pages", "en", "abby.md"),
    "---\nschemaVersion: 4\ntitle: Abby\nowner: x\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nEnglish body",
  );
  execSync(`git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`);

  let stdout = "";
  await runI18nSync({
    rootDir: root,
    slug: "abby",
    locale: "ru",
    translator: stubTranslator,
    write: (s) => { stdout += s; },
  });

  const translationPath = join(root, "pages", "ru", "abby.md");
  const content = await readFile(translationPath, "utf8");
  assert.match(content, /translation_of:\s*abby/);
  assert.match(content, /canonical_sha:\s*[a-f0-9]+/);
  assert.match(content, /translated_at:\s*'?\d{4}-\d{2}-\d{2}/);
  assert.match(content, /English body/);  // stub echoes

  const talkPath = join(root, "pages", "ru", "abby.translation.talk.md");
  const talkContent = await readFile(talkPath, "utf8");
  assert.match(talkContent, /## Unresolved/);
  assert.match(talkContent, /## Resolved/);

  await rm(root, { recursive: true });
});

async function stubTranslator(req: {
  canonicalBody: string;
  canonicalMeta: Record<string, unknown>;
  locale: string;
}): Promise<{ body: string; talk: string; titleTranslation: string }> {
  return {
    body: req.canonicalBody,
    talk: "## Unresolved\n\n- [ ] **[stub]** Stub translator used; real agent translation will replace.\n\n## Resolved\n\n",
    titleTranslation: `[${req.locale}] ${req.canonicalMeta.title}`,
  };
}
```

- [ ] **Step 2: Implement runI18nSync**

Create `cli/src/commands/i18n-sync.ts`:
```ts
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parsePage } from "@core/pages/frontmatter.ts";
import { isLocale, TARGET_LOCALES, type Locale } from "@core/i18n/index.ts";

export interface TranslateRequest {
  canonicalBody: string;
  canonicalMeta: Record<string, unknown>;
  locale: Locale;
  existingTranslation?: string;
  existingTalkResolved?: string;
}

export interface TranslateResponse {
  body: string;
  talk: string;
  titleTranslation: string;
}

export type Translator = (req: TranslateRequest) => Promise<TranslateResponse>;

export interface RunI18nSyncOpts {
  rootDir: string;
  slug: string;
  locale: string;
  translator: Translator;
  write: (s: string) => void;
}

export async function runI18nSync(opts: RunI18nSyncOpts): Promise<void> {
  if (!isLocale(opts.locale)) {
    opts.write(`unknown locale: ${opts.locale}. Valid: ${TARGET_LOCALES.join(", ")}\n`);
    return;
  }
  if (opts.locale === "en") {
    opts.write(`cannot sync canonical locale (en)\n`);
    return;
  }

  const canonicalPath = join(opts.rootDir, "pages", "en", `${opts.slug}.md`);
  if (!existsSync(canonicalPath)) {
    opts.write(`canonical not found: pages/en/${opts.slug}.md\n`);
    return;
  }

  const canonicalRaw = await readFile(canonicalPath, "utf8");
  const canonicalPage = parsePage(canonicalRaw, opts.slug);
  const canonicalSha = execSync(
    `git -C "${opts.rootDir}" log -1 --format=%H -- pages/en/${opts.slug}.md`,
    { encoding: "utf8" }
  ).trim();

  const existingTranslationPath = join(opts.rootDir, "pages", opts.locale, `${opts.slug}.md`);
  const existingTalkPath = join(opts.rootDir, "pages", opts.locale, `${opts.slug}.translation.talk.md`);
  const existingTranslation = existsSync(existingTranslationPath)
    ? await readFile(existingTranslationPath, "utf8")
    : undefined;
  const existingTalkResolved = existsSync(existingTalkPath)
    ? extractResolvedSection(await readFile(existingTalkPath, "utf8"))
    : undefined;

  opts.write(`translating ${opts.slug} → ${opts.locale}...\n`);

  const response = await opts.translator({
    canonicalBody: canonicalPage.body,
    canonicalMeta: canonicalPage.meta as unknown as Record<string, unknown>,
    locale: opts.locale,
    existingTranslation,
    existingTalkResolved,
  });

  const today = new Date().toISOString().slice(0, 10);
  const frontmatter = `---
schemaVersion: ${canonicalPage.meta.schemaVersion}
title: ${response.titleTranslation}
lang: ${opts.locale}
translation_of: ${opts.slug}
canonical_sha: ${canonicalSha}
translated_at: '${today}'
---
`;
  const translationFile = `${frontmatter}${response.body}`;
  const talkFrontmatter = `---
type: translation-talk
translation_of: ${opts.slug}
lang: ${opts.locale}
canonical_sha_when_logged: ${canonicalSha}
synced_at: '${today}'
---

# Translation notes — ${opts.locale} (${response.titleTranslation})

${response.talk}
`;

  await mkdir(join(opts.rootDir, "pages", opts.locale), { recursive: true });
  await writeFile(existingTranslationPath, translationFile);
  await writeFile(existingTalkPath, talkFrontmatter);

  opts.write(`wrote pages/${opts.locale}/${opts.slug}.md\n`);
  opts.write(`wrote pages/${opts.locale}/${opts.slug}.translation.talk.md\n`);
}

function extractResolvedSection(talkBody: string): string | undefined {
  const match = talkBody.match(/##\s+Resolved\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return match ? match[1].trim() : undefined;
}
```

- [ ] **Step 3: Wire into cli/src/index.ts**

Extend the i18n subcommand:
```ts
case "i18n": {
  const action = argv[1];
  if (action === "status") {
    // ... existing status wiring
  } else if (action === "sync") {
    const slug = argv[2];
    const locale = argv[3];
    if (!slug || !locale) {
      console.error("Usage: wai i18n sync <slug> <locale>");
      process.exit(2);
    }
    const { stubTranslator } = await import("./commands/i18n-sync-stub.ts");  // see Task 11
    await runI18nSync({
      rootDir: process.env.WHOAMI_ROOT ?? join(process.env.HOME!, "whoami"),
      slug, locale,
      translator: stubTranslator,
      write: (s) => process.stdout.write(s),
    });
    process.exit(0);
  }
  break;
}
```

For Plan 3 Task 10, also create the stub:
```ts
// cli/src/commands/i18n-sync-stub.ts
import type { Translator } from "./i18n-sync.ts";

export const stubTranslator: Translator = async (req) => ({
  body: req.canonicalBody,
  talk: `## Unresolved

- [ ] **[stub]** Stub translator used; real agent translation pipeline lands in Plan 3 Task 11.

## Resolved
`,
  titleTranslation: `[${req.locale}] ${req.canonicalMeta.title}`,
});
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/cli && npx tsx --test test/i18n-sync.test.ts && npm test
```

Expected: new test passes; existing cli tests still pass.

- [ ] **Step 5: Commit**

Add CHANGELOG entry:
```markdown
- **`wai i18n sync <slug> <locale>`:** new CLI command writes `pages/{locale}/<slug>.md` + `pages/{locale}/<slug>.translation.talk.md` from the canonical EN article. Plan 3 ships a stub translator; the real agent pipeline lands in Plan 3 Task 11.
```

```bash
cd /Users/nyetwork/dev/whoami
git add cli CHANGELOG.md
git commit -m "feat: wai i18n sync command (stub translator)"
```

---

## Task 11: Real agent translation via harness adapter

Replace the stub translator with a real agent invocation. Reuses the harness adapter pattern from `cli/src/harness/` (the same surface `wai author` and `wai interview` use).

**Files:**
- Create: `plugins/whoami/skills/writing-articles/prompt-templates/translate.md`
- Modify: `cli/src/commands/i18n-sync.ts` (or create a new `agent-translator.ts` exporting a Translator)
- Modify: `cli/src/index.ts` to default to the real translator

- [ ] **Step 1: Author the translation prompt template**

Create `plugins/whoami/skills/writing-articles/prompt-templates/translate.md`:
```markdown
# Translation prompt template

You are translating an article from English (canonical) into {{LOCALE}}.

## Source article

Title: {{TITLE}}
Slug: {{SLUG}}
Frontmatter: {{FRONTMATTER_JSON}}

Body (markdown):

{{BODY}}

## Prior translation (if any)

{{EXISTING_TRANSLATION_OR_NONE}}

## Prior talk file — Resolved decisions

{{EXISTING_TALK_RESOLVED_OR_NONE}}

## Your task

1. Translate the article body into {{LOCALE}} faithfully. Preserve every `[[wikilink]]`, `::cite-vault{ref="..."}` directive, and any other markdown structure VERBATIM.
2. Produce a translated title (one line).
3. For every non-trivial editorial choice (name transliterations, idioms, ambiguous historical place names, register, citations whose nuance shifts), append an entry to the talk file's `## Unresolved` section in this format:

   ```
   - [ ] **[kind-tag]** Canonical: "..." Translated as: "..." Alternative: "..." Reason: ...
   ```

   Kind tags: name-transliteration, idiom, place-name, place-historical, register, date-format, citation-nuance, cultural, other.

4. For routine sentence-level translation (no real choice), produce no entry.

5. PRESERVE the prior `## Resolved` section verbatim (don't re-litigate decisions the user already made).

## Output format

Return a JSON object with three keys:
- `titleTranslation`: string
- `body`: string (the translated markdown body, no frontmatter)
- `talk`: string (the talk file content from `## Unresolved` onward — include the `## Unresolved` and `## Resolved` headers)
```

- [ ] **Step 2: Implement the agent translator using the harness adapter**

Read `cli/src/harness/index.ts` and `cli/src/harness/claude-code.ts` (created in Plan 1 of the article-pipeline track). Use the same pattern.

Create `cli/src/commands/agent-translator.ts`:
```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { getHarness } from "../harness/index.ts";
import type { Translator } from "./i18n-sync.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const agentTranslator: Translator = async (req) => {
  const templatePath = join(__dirname, "..", "..", "..", "plugins", "whoami", "skills", "writing-articles", "prompt-templates", "translate.md");
  const template = await readFile(templatePath, "utf8");

  const prompt = template
    .replace("{{LOCALE}}", req.locale)
    .replace("{{TITLE}}", String(req.canonicalMeta.title ?? ""))
    .replace("{{SLUG}}", String(req.canonicalMeta.slug ?? ""))
    .replace("{{FRONTMATTER_JSON}}", JSON.stringify(req.canonicalMeta, null, 2))
    .replace("{{BODY}}", req.canonicalBody)
    .replace("{{EXISTING_TRANSLATION_OR_NONE}}", req.existingTranslation ?? "(none)")
    .replace("{{EXISTING_TALK_RESOLVED_OR_NONE}}", req.existingTalkResolved ?? "(none)");

  const harness = getHarness();
  const response = await harness.invokeJson(prompt);

  return {
    body: response.body,
    talk: response.talk,
    titleTranslation: response.titleTranslation,
  };
};
```

(Adapt `invokeJson` to match the actual harness adapter's API. If the harness returns plain text, parse JSON from it.)

- [ ] **Step 3: Wire as the default translator**

In `cli/src/index.ts`, change the i18n sync subcommand to use `agentTranslator` by default, with `stubTranslator` as a `--stub` flag:

```ts
} else if (action === "sync") {
  const slug = argv[2];
  const locale = argv[3];
  const useStub = argv.includes("--stub");
  if (!slug || !locale) {
    console.error("Usage: wai i18n sync <slug> <locale> [--stub]");
    process.exit(2);
  }
  const { stubTranslator } = await import("./commands/i18n-sync-stub.ts");
  const { agentTranslator } = await import("./commands/agent-translator.ts");
  await runI18nSync({
    rootDir: process.env.WHOAMI_ROOT ?? join(process.env.HOME!, "whoami"),
    slug, locale,
    translator: useStub ? stubTranslator : agentTranslator,
    write: (s) => process.stdout.write(s),
  });
  process.exit(0);
}
```

- [ ] **Step 4: Manual smoke test (gated)**

Cannot fully test agent invocation in a subagent context. Document the manual smoke test:
```bash
WHOAMI_ROOT=$HOME/whoami WHOAMI_HARNESS=claude-code wai i18n sync abby-rickelman ru --stub  # stub-mode round trip
WHOAMI_ROOT=$HOME/whoami WHOAMI_HARNESS=claude-code wai i18n sync abby-rickelman ru          # real agent
```

For the implementer's verification, run the stub mode to confirm wiring:
```bash
# In a temp test dir, set up a fake whoami repo and test
# (or just verify the stub test from Task 10 still passes)
cd /Users/nyetwork/dev/whoami/cli && npm test
```

Expected: cli tests all pass.

- [ ] **Step 5: Commit**

Add CHANGELOG entry:
```markdown
- **Agent translator:** `wai i18n sync` defaults to invoking the editor agent via the harness adapter (same pattern as `wai author`). Use `--stub` for offline/dry-run testing. Translation prompt template at `plugins/whoami/skills/writing-articles/prompt-templates/translate.md`.
```

```bash
cd /Users/nyetwork/dev/whoami
git add cli plugins/whoami CHANGELOG.md
git commit -m "feat: agent translator behind wai i18n sync (default)"
```

---

## Task 12: AGENTS.md + plan-index + final verify

Document the translation pipeline conventions; flip the plan-index row.

**Files:**
- Modify: `frontend/AGENTS.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Extend frontend/AGENTS.md with translation-rendering conventions**

In the Internationalization section, append:
```markdown
**Translation pipeline (Plan 3):**

- **Translation file frontmatter** carries `translation_of: <slug>`, `canonical_sha: <full-git-sha>`, `translated_at: <iso-date>`, `lang: <locale>`. `translation_status` is COMPUTED at render time, not stored.
- **Status is computed** by `core/src/i18n/status.ts` from `(translation canonical_sha, head canonical_sha, unresolved-talk-entries)`. Returns `current | stale | review | missing`.
- **Talk files** at `pages/{locale}/<slug>.translation.talk.md` are English-only audit logs of agent editorial choices. Users resolve entries by ticking `[ ]` → `[x]`. Once unresolved-count hits zero, status flips to `current` on next render.
- **Missing translations fall back** to canonical EN content; rendered with a missing-translation banner.
- **Use `getTranslationInfo(slug, locale)` from `lib/server-services`** when rendering an article — it returns `{ status, unresolvedCount, page }` ready to pass to the banner + body.
```

- [ ] **Step 2: Flip plan-index row to ✅**

In `docs/superpowers/plans/README.md`, find the Plan 3 row (you may need to add it now if it doesn't exist):

Add at the top of the Plans table (assuming it doesn't exist yet):
```markdown
| ✅ | [`2026-05-17-multilingual-support-plan-3-translation-pipeline.md`](./2026-05-17-multilingual-support-plan-3-translation-pipeline.md) | Multilingual support — Plan 3: Translation pipeline | Per-locale PageStore reads, translation frontmatter parsing, computed status helper (current/stale/review/missing), `wai i18n status` + `wai i18n sync <slug> <locale>` CLI, agent translator with talk-file accuracy gate, translation banner component, missing-translation fallback to canonical EN. Places + cite-vault + Collator deferred to Plan 3.5. |
```

Update the total footer:
```markdown
**Total: 42 plans** — 37 shipped (✅), 0 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).
```

(Counts depend on whether Plan 2 has been merged when you read this — recount if needed.)

- [ ] **Step 3: Final verify**

```bash
cd /Users/nyetwork/dev/whoami
( cd core && npm test ) && ( cd frontend && npm test ) && ( cd cli && npm test )
( cd frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit )
```

Expected: all tests green; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/AGENTS.md docs/superpowers/plans/README.md
git commit -m "docs: translation pipeline conventions + plan-index"
```

---

## Acceptance criteria

After all 12 tasks complete:

1. **Build green:** `( cd frontend && npm run build )` succeeds.
2. **Typecheck green:** `npx tsc --noEmit` clean in all packages.
3. **Full test suite passes** across core / frontend / cli, including new i18n unit tests.
4. **`wai i18n status`** runs and lists every (slug × locale) with status.
5. **`wai i18n sync <slug> <locale> --stub`** writes a translation file + talk file to `pages/{locale}/`.
6. **`wai i18n sync <slug> <locale>`** (no --stub) invokes the agent translator and produces a real translation + talk file with unresolved entries.
7. **The article page** at `/ru/<slug>` (or any other target locale) renders the canonical EN content with a missing-translation banner when no translation file exists.
8. **The article page** renders the translated content with a review-translation banner when the talk file has unresolved entries.
9. **The article page** renders the translated content with no banner when status is `current`.
10. **All locale message files** have `Page.Article.banners` keys with correct ICU plural categories.
11. **CHANGELOG complete:** every `feat:` commit has an entry under `## [Unreleased]`.
12. **Plan-index row added** with ✅ status.
