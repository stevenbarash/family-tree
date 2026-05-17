# Multilingual support — Plan 2 of 4: Chrome translations + RTL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the four-language message catalog (Russian, Ukrainian, Hebrew on top of Plan 1's English) so every UI chrome string renders in the user's locale; convert Tailwind directional utilities (`ml-`, `pr-`, `text-left`, etc.) to logical properties so Hebrew RTL layout flows correctly; mirror the family-tree spatial layout under `dir="rtl"`; ship a language switcher; document `<bdi>` / `<span lang>` patterns. After Plan 2, the site chrome reads cleanly in all four languages and Hebrew renders RTL correctly. Article *content* remains English-only — that's Plan 3/4.

**Architecture:** LLM-draft translations of `messages/en.json` into three new locale files (`ru.json`, `uk.json`, `he.json`) using ICU `plural` categories appropriate for each language (Slavic `one/few/many/other`, Hebrew `one/two/many/other`). Codebase-wide sweep replacing directional Tailwind classes with logical equivalents (`ml-` → `ms-`, `text-left` → `text-start`, etc.). New client-island `<LanguageSwitcher>` wrapped in a scoped `<NextIntlClientProvider messages={pick(messages, ['Chrome.LangSwitcher'])}>` to keep the client bundle slice tight. Wikipedia-style `<bdi>` wrapping for embedded foreign-script text in genealogy names/places; `<span lang="...">` markers for embedded foreign names in mixed-language contexts.

**Tech Stack:** TypeScript, Next.js 16.2.4, React 19.2.5, `next-intl` (already installed), Tailwind 4 (logical properties supported natively), `tsx --test`, `node:assert/strict`. No new runtime deps.

**Spec reference:** `docs/superpowers/specs/2026-05-16-multilingual-support-design.md` (commit `c7a7a59`). Plan 2 implements the spec's "Plan 2 — RTL + chrome translations" section.

---

## Scope

**In scope:**
- `frontend/messages/ru.json` — LLM-drafted Russian translation of all en.json strings; ICU plurals as `one/few/many/other`.
- `frontend/messages/uk.json` — LLM-drafted Ukrainian translation; ICU plurals as `one/few/many/other`.
- `frontend/messages/he.json` — LLM-drafted Hebrew translation; ICU plurals as `one/two/many/other`.
- RTL Tailwind sweep across `frontend/app/`, `frontend/components/` — convert directional utilities (`ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right`, `left-`, `right-`, `border-l`, `border-r`) to logical (`ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`, `start-`, `end-`, `border-s`, `border-e`).
- Family-tree spatial mirroring: under `dir="rtl"`, siblings should flow right-to-left (not left-to-right); vertical relationships unchanged. Directional icons (chevrons, arrows) mirror via `transform: scaleX(-1)`.
- `<LanguageSwitcher>` client island — dropdown of four locales, switches via `useRouter().replace(pathname, { locale })` from `@/i18n/navigation`. Wrapped in a scoped provider via `pick()`.
- Apply `<bdi>` to existing name-rendering sites where person names + non-name text mix (genealogy infoboxes, search results, on-this-day ribbon).
- Apply `<span lang="...">` to existing places where embedded foreign-language text appears (e.g., if an EN article references "Київ" inline — though this is rare in Plan 2 since content is still English).
- New tests: `frontend/test/messages-parity.test.ts` verifies all four locale files have the same key shape; `frontend/test/rtl-tailwind-sweep.test.ts` greps for forbidden directional classes.
- `frontend/AGENTS.md` — extend the Internationalization section with RTL conventions.
- `CHANGELOG.md` — Unreleased entries.
- `docs/superpowers/plans/README.md` — add plan row.

**Out of scope (Plan 3):**
- Article translation (`<slug>.md` in each locale).
- `wai i18n status` / `wai i18n sync` CLI commands.
- Translation talk files (the accuracy review pipeline).
- `places-i18n.yml` lookup.
- Multilingual cite-vault rendering.

**Out of scope (Plan 4):**
- Article backfill (content workflow).

**Out of scope entirely (per spec non-goals):**
- CLI translation (`wai` stays English).
- Editorial guide / plugin translation.
- Article talk page translation.
- Removing pre-existing `force-dynamic` directives (separate concern).

## File structure

```
frontend/messages/ru.json                          NEW. Russian translation of en.json.
frontend/messages/uk.json                          NEW. Ukrainian translation.
frontend/messages/he.json                          NEW. Hebrew translation.
frontend/components/language-switcher.tsx          NEW. Client-island dropdown.
frontend/app/[locale]/layout.tsx                   MODIFY. Mount language switcher in header; wrap with scoped NextIntlClientProvider.
frontend/messages/en.json                          MODIFY. Add `Chrome.LangSwitcher` namespace (label per locale).
frontend/app/[locale]/family/tree/page.tsx         MODIFY. RTL mirroring for siblings layout.
frontend/components/family/sections/*              MODIFY. Directional Tailwind class sweep.
frontend/components/family/family-row.tsx          MODIFY. Directional class sweep (if exists).
frontend/components/family/tile.tsx                MODIFY. Directional class sweep (if exists).
frontend/components/directives/infobox-person.tsx  MODIFY. Wrap person-name spans in `<bdi>` for genealogy data.
frontend/components/directives/on-this-day-ribbon.tsx
                                                   MODIFY. Wrap name spans in `<bdi>`.
frontend/app/[locale]/search/page.tsx              MODIFY. Wrap result titles in `<bdi>`.
frontend/test/messages-parity.test.ts              NEW. All four locale files have same key shape.
frontend/test/rtl-tailwind-sweep.test.ts           NEW. Grep test: no directional Tailwind classes remain.
frontend/AGENTS.md                                 MODIFY. Add RTL conventions.
CHANGELOG.md                                       MODIFY. Unreleased entries.
docs/superpowers/plans/README.md                   MODIFY. Plan row.
```

## Conventions adhered to

- **Translation quality:** LLM-drafted is acceptable per spec. Translations should preserve ICU placeholders (`{count}`, `{date}`, `<code>...</code>`) exactly. Russian/Ukrainian: use neutral encyclopedia register, not colloquial. Hebrew: use standard modern register (not Biblical). Cyrillic for Russian/Ukrainian; Hebrew script for he.
- **Plural categories:** `Intl.PluralRules` decides which categories a language uses. Author all of them:
  - English: `one`, `other`
  - Russian, Ukrainian: `one`, `few`, `many`, `other`
  - Hebrew: `one`, `two`, `many`, `other`
- **Logical properties:** never use `ml-/mr-/pl-/pr-/text-left/text-right/left-/right-/border-l/border-r` in new code. Always `ms-/me-/ps-/pe-/text-start/text-end/start-/end-/border-s/border-e`. The grep test enforces this.
- **`<bdi>` for embedded mixed-script text** — wrap any rendered person/place name that may contain non-Latin script in `<bdi>`. This isolates the directionality so embedded Cyrillic/Hebrew names don't bleed direction into the surrounding text.
- **`<span lang="...">`** for embedded foreign-language text in a different-language context — affects screen readers, hyphenation, search.
- **Language switcher:** client island with scoped `pick()` provider for messages. Keep the slice tight to `Chrome.LangSwitcher` only.
- Match existing file quote convention (Rule 11).
- Project commit hygiene (Rule 13): `feat:` commits MUST include CHANGELOG entry in same commit.

---

## Task 1: Create LangSwitcher message namespace

Adds the `Chrome.LangSwitcher` keys to `en.json` before any other locale file exists. Translators will then have something to translate.

**Files:**
- Modify: `frontend/messages/en.json`

- [ ] **Step 1: Add Chrome.LangSwitcher namespace**

Read `frontend/messages/en.json`. Find the `Chrome` namespace (currently has `skipToContent`). Add `LangSwitcher`:

```json
"Chrome": {
  "skipToContent": "Skip to content",
  "LangSwitcher": {
    "label": "Language",
    "en": "English",
    "ru": "Русский",
    "uk": "Українська",
    "he": "עברית"
  }
}
```

(Note: native names per locale, kept consistent across all four locale files. Each language file will repeat these same native names — `en` is always "English", `he` is always "עברית" — because they're language identifiers, not translatable strings.)

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

Add to `CHANGELOG.md` under `## [Unreleased]`:
```markdown
- **Language switcher messages:** `Chrome.LangSwitcher` namespace in `messages/en.json` (native names per locale).
```

```bash
git add frontend/messages/en.json CHANGELOG.md
git commit -m "feat: add Chrome.LangSwitcher message namespace"
```

---

## Task 2: Draft Russian translation (messages/ru.json)

Translate every string in `messages/en.json` to Russian. ICU plurals use Russian categories (`one/few/many/other`). LLM-drafted, then committed for human review later.

**Files:**
- Create: `frontend/messages/ru.json`

- [ ] **Step 1: Read the full en.json catalog**

```bash
cat /Users/nyetwork/dev/whoami/frontend/messages/en.json
```

Note: the file should have these top-level namespaces — `Chrome`, `Page`, `Months`, `Directives`, `Errors`. Inside each, sub-namespaces by page or context.

- [ ] **Step 2: Author messages/ru.json**

Translate every key. Preserve all ICU placeholders (`{count}`, `{date}`, `{name}`, etc.). For plurals, REPLACE the English `{count, plural, one {...} other {...}}` with the Russian `{count, plural, one {...} few {...} many {...} other {...}}`. Russian plural rule:
- `one`: 1, 21, 31 (ending in 1, except 11)
- `few`: 2-4, 22-24 (ending in 2-4, except 12-14)
- `many`: 0, 5-20, 25-30 (ending in 5-9, 0, or 11-14)
- `other`: fractional (e.g., 1.5)

Example pattern for "N articles":
- en: `{count, plural, one {# article} other {# articles}}`
- ru: `{count, plural, one {# статья} few {# статьи} many {# статей} other {# статьи}}`

Tone: encyclopedia / Wikipedia register. Neutral. Past tense for life events ("родился"/"родилась" — but for genealogy stick to neutral "родился" as default; gendered forms add complexity). Avoid colloquialisms.

For the `Chrome.LangSwitcher` namespace, keep the native language names IDENTICAL across all locale files:
```json
"LangSwitcher": {
  "label": "Язык",
  "en": "English",
  "ru": "Русский",
  "uk": "Українська",
  "he": "עברית"
}
```

Place names in the `Page.*` / `Directives.*` namespaces stay in the user's preferred language for that locale (Russian transliterations of standard places, e.g., "Брайтон-Бич" for Brighton Beach).

Person-name strings (if any appear in the chrome) use Russian transliteration norms.

Write the complete `frontend/messages/ru.json` file.

- [ ] **Step 3: Validate JSON parses and ICU syntax is correct**

```bash
cd /Users/nyetwork/dev/whoami/frontend && node -e "JSON.parse(require('fs').readFileSync('messages/ru.json'))" && echo "valid JSON"
```

Expected: "valid JSON".

Then check ICU syntax via a quick parse with `Intl.PluralRules`:
```bash
node -e "
const msgs = JSON.parse(require('fs').readFileSync('/Users/nyetwork/dev/whoami/frontend/messages/ru.json'));
const pluralKeys = JSON.stringify(msgs).match(/plural,[^}]+}+/g) || [];
console.log('plural occurrences:', pluralKeys.length);
pluralKeys.forEach(k => console.log(k.slice(0, 80)));
"
```

Each plural should contain at least `one`, `few`, `many`, `other` keywords.

- [ ] **Step 4: Run frontend tests + typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm test
cd /Users/nyetwork/dev/whoami/frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit
```

Expected: 71 pass / 6 skip / 0 fail (same as Plan 1 baseline). Typecheck clean.

- [ ] **Step 5: Commit**

Add to `CHANGELOG.md` under `## [Unreleased]`:
```markdown
- **Russian translation:** `frontend/messages/ru.json` — LLM-drafted translation of all UI chrome strings; Slavic ICU plural categories (one/few/many/other). Human review pending.
```

```bash
git add frontend/messages/ru.json CHANGELOG.md
git commit -m "feat: LLM-drafted Russian message catalog (ru.json)"
```

---

## Task 3: Draft Ukrainian translation (messages/uk.json)

Same as Task 2, for Ukrainian. ICU plurals use Ukrainian categories (`one/few/many/other` — same shape as Russian).

**Files:**
- Create: `frontend/messages/uk.json`

- [ ] **Step 1: Author messages/uk.json**

Same approach as Task 2. Ukrainian translation. ICU plurals identical category shape to Russian (`one/few/many/other`), but the actual rule numbers differ slightly:
- `one`: 1, 21, 31 (ending in 1 but not 11)
- `few`: 2-4, 22-24 (ending in 2-4 but not 12-14)
- `many`: 0, 5-20 (the rest)
- `other`: fractional

Same example for "N articles":
- uk: `{count, plural, one {# стаття} few {# статті} many {# статей} other {# статті}}`

Native names in `LangSwitcher`:
```json
"LangSwitcher": {
  "label": "Мова",
  "en": "English",
  "ru": "Русский",
  "uk": "Українська",
  "he": "עברית"
}
```

Place names: Ukrainian endonyms preferred ("Київ" not "Киев").

- [ ] **Step 2: Validate**

```bash
cd /Users/nyetwork/dev/whoami/frontend && node -e "JSON.parse(require('fs').readFileSync('messages/uk.json'))" && echo "valid JSON"
```

- [ ] **Step 3: Run tests + typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm test && npx tsc --noEmit
```

Expected: same baseline.

- [ ] **Step 4: Commit**

Add to CHANGELOG:
```markdown
- **Ukrainian translation:** `frontend/messages/uk.json` — LLM-drafted; Slavic ICU plural categories. Human review pending.
```

```bash
git add frontend/messages/uk.json CHANGELOG.md
git commit -m "feat: LLM-drafted Ukrainian message catalog (uk.json)"
```

---

## Task 4: Draft Hebrew translation (messages/he.json)

Hebrew with RTL script. ICU plurals use Hebrew categories (`one/two/many/other` — DIFFERENT from Slavic).

**Files:**
- Create: `frontend/messages/he.json`

- [ ] **Step 1: Author messages/he.json**

Hebrew translation. ICU plural categories per CLDR:
- `one`: exactly 1
- `two`: exactly 2
- `many`: 0, 10, 20, ... (multiples of 10 from 10)
- `other`: everything else (3-9, 11-19, 21-29, etc.)

Example for "N articles":
- he: `{count, plural, one {מאמר אחד} two {שני מאמרים} many {# מאמרים} other {# מאמרים}}`

(Note Hebrew often uses non-numeric forms for `one` and `two`: "מאמר אחד" = "one article", "שני מאמרים" = "two articles". `#` placeholder used in `many`/`other`.)

Native names in `LangSwitcher`:
```json
"LangSwitcher": {
  "label": "שפה",
  "en": "English",
  "ru": "Русский",
  "uk": "Українська",
  "he": "עברית"
}
```

Place names: Hebrew transliteration (e.g., "ניו יורק" for New York, "ירושלים" for Jerusalem).

Tone: modern Hebrew, encyclopedia register. Avoid Biblical phrasing.

- [ ] **Step 2: Validate JSON parses**

```bash
cd /Users/nyetwork/dev/whoami/frontend && node -e "JSON.parse(require('fs').readFileSync('messages/he.json'))" && echo "valid JSON"
```

- [ ] **Step 3: Run tests + typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm test && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

Add to CHANGELOG:
```markdown
- **Hebrew translation:** `frontend/messages/he.json` — LLM-drafted; Hebrew ICU plural categories (one/two/many/other); RTL script. Human review pending.
```

```bash
git add frontend/messages/he.json CHANGELOG.md
git commit -m "feat: LLM-drafted Hebrew message catalog (he.json)"
```

---

## Task 5: Messages-parity test

Test asserting all four locale files share the same key shape. Catches "translator forgot a key" regressions.

**Files:**
- Create: `frontend/test/messages-parity.test.ts`

- [ ] **Step 1: Write the test**

Create `frontend/test/messages-parity.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "..", "messages");

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v as Record<string, unknown>, key));
    } else {
      out.push(key);
    }
  }
  return out.sort();
}

function loadLocale(locale: string): string[] {
  const raw = readFileSync(join(messagesDir, `${locale}.json`), "utf8");
  return flatten(JSON.parse(raw));
}

test("messages: ru.json has the same key shape as en.json", () => {
  const enKeys = loadLocale("en");
  const ruKeys = loadLocale("ru");
  assert.deepEqual(ruKeys, enKeys, `ru is missing or has extra keys vs en`);
});

test("messages: uk.json has the same key shape as en.json", () => {
  const enKeys = loadLocale("en");
  const ukKeys = loadLocale("uk");
  assert.deepEqual(ukKeys, enKeys, `uk is missing or has extra keys vs en`);
});

test("messages: he.json has the same key shape as en.json", () => {
  const enKeys = loadLocale("en");
  const heKeys = loadLocale("he");
  assert.deepEqual(heKeys, enKeys, `he is missing or has extra keys vs en`);
});
```

- [ ] **Step 2: Run the test**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npx tsx --test test/messages-parity.test.ts
```

Expected: 3 PASS. If a test FAILS, the diff in the error message identifies the missing/extra keys — fix the offending locale file and re-run.

- [ ] **Step 3: Commit**

```bash
git add frontend/test/messages-parity.test.ts
git commit -m "test: assert all four locale message files have identical key shape"
```

---

## Task 6: RTL Tailwind sweep — directional → logical

Convert directional Tailwind utility classes to logical equivalents so Hebrew RTL layout flows correctly. Map:

- `ml-N` → `ms-N` (margin-inline-start)
- `mr-N` → `me-N` (margin-inline-end)
- `pl-N` → `ps-N`
- `pr-N` → `pe-N`
- `text-left` → `text-start`
- `text-right` → `text-end`
- `left-N` → `start-N`
- `right-N` → `end-N`
- `border-l` → `border-s`
- `border-r` → `border-e`
- `rounded-l-*` → `rounded-s-*`
- `rounded-r-*` → `rounded-e-*`

**Files:**
- Modify: every `.tsx` file under `frontend/app/` and `frontend/components/` that uses directional classes.

- [ ] **Step 1: Audit — list every directional class usage**

```bash
cd /Users/nyetwork/dev/whoami
grep -rn -E "\b(ml-|mr-|pl-|pr-|text-left|text-right|\bleft-|\bright-|border-l|border-r|rounded-l|rounded-r)" frontend/app frontend/components --include="*.tsx" --include="*.ts" | sort -u > /tmp/rtl-audit.txt
cat /tmp/rtl-audit.txt
wc -l /tmp/rtl-audit.txt
```

Expected: roughly 48 lines (this is the pre-Plan-2 count; may vary slightly as Plan 1 work adjusted some files).

The audit identifies every file × line that needs touching.

- [ ] **Step 2: File-by-file conversion**

For each file in the audit:

1. Read the file
2. For each affected line, replace the directional class with its logical equivalent
3. Save

**Critical: do NOT change `top-`, `bottom-`, `mt-`, `mb-`, `pt-`, `pb-`** — those are vertical, unaffected by RTL.

**Edge cases:**
- `left-1/2` and `right-1/2` (fractional) — convert to `start-1/2` and `end-1/2`.
- `-left-1` and `-right-1` (negative) — convert to `-start-1` and `-end-1`.
- `lg:ml-4` and other responsive prefixes — keep the prefix, swap the class: `lg:ms-4`.
- `hover:text-right` — keep the prefix: `hover:text-end`.
- Comments containing "left" or "right" — leave them alone unless they're confusing under RTL.

Use this approach: read each file, identify each directional class, edit it.

After each file, run typecheck:
```bash
cd /Users/nyetwork/dev/whoami/frontend && npx tsc --noEmit
```

If a file becomes broken, stop and surface what went wrong.

- [ ] **Step 3: Verify zero directional classes remain**

```bash
cd /Users/nyetwork/dev/whoami
grep -rn -E "\b(ml-|mr-|pl-|pr-|text-left|text-right|\bleft-|\bright-|border-l|border-r|rounded-l|rounded-r)" frontend/app frontend/components --include="*.tsx" --include="*.ts"
```

Expected: zero output. (If output appears, fix those instances.)

- [ ] **Step 4: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm test
```

Expected: same baseline (71 pass / 6 skip / 0 fail).

- [ ] **Step 5: Commit**

Add to CHANGELOG:
```markdown
- **RTL-ready Tailwind:** converted ~48 directional utility class usages (ml-/mr-/pl-/pr-/text-left/text-right/left-/right-/border-l/border-r) across `frontend/app/` and `frontend/components/` to logical equivalents (ms-/me-/ps-/pe-/text-start/text-end/start-/end-/border-s/border-e). Layout now flows correctly under `dir="rtl"` for Hebrew.
```

```bash
git add frontend/app frontend/components CHANGELOG.md
git commit -m "feat: convert directional Tailwind classes to logical for RTL"
```

---

## Task 7: RTL grep-test guard

Test that fails if any directional Tailwind class re-appears in `frontend/app/` or `frontend/components/`. Catches future regressions.

**Files:**
- Create: `frontend/test/rtl-tailwind-sweep.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, "..");

const FORBIDDEN_PATTERNS = [
  "\\b(ml-|mr-|pl-|pr-|text-left|text-right|border-l|border-r|rounded-l|rounded-r)\\b",
  "\\b(left-|right-)\\d"
];

test("rtl: no directional Tailwind classes remain in app/ or components/", () => {
  for (const pattern of FORBIDDEN_PATTERNS) {
    let stdout = "";
    try {
      stdout = execSync(
        `grep -rn -E '${pattern}' app components --include='*.tsx' --include='*.ts' || true`,
        { cwd: frontendRoot, encoding: "utf8" }
      );
    } catch (e) {
      // grep returns exit 1 when no matches — that's success here.
      stdout = "";
    }

    assert.equal(
      stdout.trim(),
      "",
      `Found directional Tailwind classes matching ${pattern}:\n${stdout}\nUse logical equivalents (ms-/me-/ps-/pe-/text-start/text-end/start-/end-/border-s/border-e/rounded-s/rounded-e).`
    );
  }
});
```

- [ ] **Step 2: Run the test**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npx tsx --test test/rtl-tailwind-sweep.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/test/rtl-tailwind-sweep.test.ts
git commit -m "test: guard against directional Tailwind class regressions"
```

---

## Task 8: Family-tree RTL mirroring

Under `dir="rtl"`, the family tree's siblings row should flow right-to-left (so "older sibling on the right" feels natural in Hebrew). Vertical relationships (ancestors above, descendants below) stay the same. Directional icons (chevrons, arrows) mirror via `transform: scaleX(-1)`.

The Tailwind sweep in Task 6 handled spacing/padding. This task handles **flexbox direction** and **icon mirroring** — the parts where logical properties don't apply.

**Files:**
- Modify: `frontend/components/family/family-row.tsx` (or wherever the siblings row layout lives)
- Modify: `frontend/components/family/sections/*` (any section with directional flexbox)
- Possibly modify: `frontend/components/family/tile.tsx` for chevron mirroring

- [ ] **Step 1: Identify directional flexbox usage**

```bash
cd /Users/nyetwork/dev/whoami
grep -rn "flex-row\b\|flex-row-reverse\|justify-start\|justify-end" frontend/components/family --include="*.tsx"
```

Note where `flex-row`, `flex-row-reverse`, `justify-start`, `justify-end` appear. These behave correctly under RTL by default (logical `flex-row` flips automatically). But explicit `flex-row-reverse` does NOT auto-flip — that's a hardcoded reversal regardless of locale.

If you find `flex-row-reverse` being used to mean "show in reverse order under LTR", consider whether the intent should change under RTL. Most likely it should NOT (the reversal is independent of locale).

- [ ] **Step 2: Identify chevron / arrow icon usage**

```bash
cd /Users/nyetwork/dev/whoami
grep -rn "Chevron\|ArrowRight\|ArrowLeft" frontend/components/family --include="*.tsx"
```

For directional icons (`ChevronRight`, `ArrowLeft`, etc.), add a `rtl:scale-x-[-1]` class so they mirror under RTL:

```tsx
// Before:
<ChevronRight className="h-4 w-4" />

// After:
<ChevronRight className="h-4 w-4 rtl:scale-x-[-1]" />
```

The `rtl:` prefix is Tailwind 4's RTL variant. Activates when `<html dir="rtl">` (which our LOCALE_DIR map handles for he).

- [ ] **Step 3: Verify by manual smoke test**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm run build 2>&1 | tail -10
```

Build should succeed.

(A full visual regression test would require Playwright or similar; out of scope for Plan 2. Manual smoke at `/he/family/tree` is the verification.)

- [ ] **Step 4: Commit**

Add to CHANGELOG:
```markdown
- **RTL family-tree mirroring:** directional icons (chevrons, arrows) under family tree now mirror with `rtl:scale-x-[-1]` so Hebrew layout reads naturally right-to-left.
```

```bash
git add frontend/components/family CHANGELOG.md
git commit -m "feat: family tree icons mirror under RTL"
```

---

## Task 9: Language switcher component

Client island. Dropdown of the four locales; switching navigates via `useRouter().replace(pathname, { locale })` from `@/i18n/navigation` (which preserves the path).

**Files:**
- Create: `frontend/components/language-switcher.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/components/language-switcher.tsx`:
```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTransition } from "react";
import type { Locale } from "@/i18n/routing";

const LOCALES: Locale[] = ["en", "ru", "uk", "he"];

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const t = useTranslations("Chrome.LangSwitcher");
  const [isPending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as Locale;
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t("label")}</span>
      <select
        value={currentLocale}
        onChange={handleChange}
        disabled={isPending}
        className="border-1 border-foreground/20 rounded ps-2 pe-1 py-1 bg-background text-foreground text-sm"
        aria-label={t("label")}
      >
        {LOCALES.map(locale => (
          <option key={locale} value={locale}>
            {t(locale)}
          </option>
        ))}
      </select>
    </label>
  );
}
```

Match the file's existing quote convention (double quotes preferred per Task 1 quote-style review of Plan 1).

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/language-switcher.tsx
git commit -m "chore: language switcher client component"
```

(chore — not yet mounted; no user-facing change.)

---

## Task 10: Mount language switcher in layout

Mount the language switcher inside `app/[locale]/layout.tsx` with a scoped `<NextIntlClientProvider>` carrying only the `Chrome.LangSwitcher` namespace (per Plan 1's "pick" discipline).

**Files:**
- Modify: `frontend/app/[locale]/layout.tsx`

- [ ] **Step 1: Update layout**

Read `frontend/app/[locale]/layout.tsx`. Add one import and mount the switcher. Plan 1 already added `<NextIntlClientProvider>` wrapping `{children}` with full messages; that provider also covers the switcher since the switcher mounts inside `<body>` adjacent to children. **Reuse the existing single provider** — don't add a second scoped one. (Scoped `pick()` discipline is a Plan 3 concern once more client islands appear.)

Imports to add (top of file):
```tsx
import { LanguageSwitcher } from "@/components/language-switcher";
```

Mount the switcher inside `<body>`, just before the `#main-content` div. The switcher's `useTranslations("Chrome.LangSwitcher")` resolves against the existing `<NextIntlClientProvider>` already wrapping `{children}` — so the switcher must mount INSIDE that provider too.

Restructure `<body>` so the provider wraps both the switcher and the main content:

```tsx
<body className="min-h-full flex flex-col">
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-foreground focus:px-3 focus:py-2 focus:text-background focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
  >
    {t("skipToContent")}
  </a>
  <NextIntlClientProvider>
    <div className="border-b border-foreground/10 px-4 py-2 flex justify-end">
      <LanguageSwitcher />
    </div>
    <div id="main-content" tabIndex={-1} className="contents">
      {children}
    </div>
  </NextIntlClientProvider>
</body>
```

The skip-to-content link stays outside the provider — it's a static server-rendered string and doesn't need provider access.

Match the existing layout's exact `focus:` class chain (read the file first; the chain may include classes not shown here).

- [ ] **Step 2: Typecheck and run tests**

```bash
cd /Users/nyetwork/dev/whoami/frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit && npm test
```

Expected: PASS.

- [ ] **Step 3: Manual smoke test**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm run build 2>&1 | tail -10
```

Build should succeed. The switcher will be visible at the top of every page across all four locales.

- [ ] **Step 4: Commit**

Add to CHANGELOG:
```markdown
- **Language switcher:** dropdown mounted in root layout. Available on every page across all four locales (en/ru/uk/he). Switching preserves the current path.
```

```bash
git add "frontend/app/[locale]/layout.tsx" CHANGELOG.md
git commit -m "feat: mount language switcher in root layout"
```

---

## Task 11: Apply `<bdi>` to person-name rendering sites

Person names in a genealogy wiki may contain non-Latin script (Cyrillic, Hebrew, etc.). When rendered inline with other text, wrap them in `<bdi>` to isolate bidirectional behavior.

Per W3C bidi guidance: `<bdi>` (bidirectional isolate) prevents the embedded text from affecting surrounding direction. Plain `<span dir="ltr">` does NOT isolate — `<bdi>` is the correct primitive.

**Files:**
- Modify: `frontend/components/directives/infobox-person.tsx`
- Modify: `frontend/components/directives/on-this-day-ribbon.tsx`
- Modify: `frontend/app/[locale]/search/page.tsx`

- [ ] **Step 1: Identify person-name rendering in infobox-person.tsx**

Read `frontend/components/directives/infobox-person.tsx`. Find every place where a person name is rendered inline (e.g., parent names, spouse names, children names). Wrap each in `<bdi>`:

```tsx
// Before:
<span>{person.name}</span>

// After:
<bdi>{person.name}</bdi>
```

(If a name is the SOLE content of a block element, `<bdi>` is less critical — the block boundary already isolates. Focus on names that appear inline with other text.)

- [ ] **Step 2: Apply same in on-this-day-ribbon.tsx**

Same treatment: wrap any inline person name in `<bdi>`.

- [ ] **Step 3: Apply same in search/page.tsx**

Search results show person titles inline with type labels. Wrap each title in `<bdi>`.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm test
```

Expected: baseline.

- [ ] **Step 6: Commit**

Add to CHANGELOG:
```markdown
- **`<bdi>` for inline person names:** infobox-person, on-this-day-ribbon, and search results now wrap inline person names in `<bdi>` for correct bidirectional rendering when mixing Latin and non-Latin scripts.
```

```bash
git add frontend/components/directives frontend/app/[locale]/search/page.tsx CHANGELOG.md
git commit -m "feat: wrap inline person names in <bdi> for bidi isolation"
```

---

## Task 12: Update frontend/AGENTS.md with RTL conventions

Extend Plan 1's Internationalization section with RTL-specific guidance.

**Files:**
- Modify: `frontend/AGENTS.md`

- [ ] **Step 1: Extend the Internationalization section**

Read `frontend/AGENTS.md`. Find the "Internationalization (next-intl)" section (added in Plan 1, Task 20). Append a new sub-section "RTL conventions":

```markdown
**RTL conventions (Hebrew):**

- **Use logical Tailwind utilities only.** `ms-`/`me-` not `ml-`/`mr-`; `ps-`/`pe-` not `pl-`/`pr-`; `text-start`/`text-end` not `text-left`/`text-right`; `start-`/`end-` not `left-`/`right-`; `border-s`/`border-e` not `border-l`/`border-r`. The grep test in `frontend/test/rtl-tailwind-sweep.test.ts` blocks new directional usages.
- **`<bdi>` for inline embedded foreign-script text.** Person names, place names, GEDCOM IDs, dates, and any other strings that may render in a different script than the surrounding text must be wrapped in `<bdi>`. Plain `<span dir="ltr">` does NOT isolate — it lets neighboring strong-directional characters bleed in. (Source: W3C "Inline markup and bidirectional text in HTML".)
- **`<span lang="...">` for embedded foreign-language text.** A Russian name in an English paragraph: `<span lang="ru">Светлана</span>`. Affects screen readers, hyphenation, font selection, and search indexing.
- **Directional icons mirror under RTL.** Add `rtl:scale-x-[-1]` to chevrons, arrows, and other directional iconography. Non-directional icons (clock, search magnifier) do NOT mirror — leave them alone.
- **Family-tree spatial mirroring.** Siblings flow horizontally; under `dir="rtl"`, default `flex-row` reverses automatically. Vertical relationships (ancestors above, descendants below) are unaffected.
- **Hebrew calendar dates** are NOT default. `Intl.DateTimeFormat("he", { ... })` renders Gregorian dates in Hebrew script — that's the current default. Hebrew calendar (`{ calendar: 'hebrew' }`) is per-page or per-event opt-in (e.g., yahrzeit dates).
```

- [ ] **Step 2: Commit**

```bash
git add frontend/AGENTS.md
git commit -m "docs: RTL conventions in frontend/AGENTS.md"
```

(docs prefix — no CHANGELOG needed.)

---

## Task 13: Plan-index README + final verification

Add the Plan 2 row to the plan-index README. Update the total footer. Verify full test suite passes.

**Files:**
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add Plan 2 row near the top of the Plans table**

Read `docs/superpowers/plans/README.md`. Locate the Plans table (starts around line 33). Add a new row after Plan 1:

```markdown
| ✅ | [`2026-05-17-multilingual-support-plan-2-chrome-translations.md`](./2026-05-17-multilingual-support-plan-2-chrome-translations.md) | Multilingual support — Plan 2: Chrome translations + RTL | LLM-drafted ru/uk/he message files (ICU plurals correct for each language), Tailwind directional-class sweep to logical properties, family-tree RTL mirroring, `<bdi>` patterns on person-name renders, language switcher mounted in layout. Site chrome reads in all four languages; Hebrew renders RTL. |
```

- [ ] **Step 2: Update the total footer**

Find the line:
```markdown
**Total: 40 plans** — 35 shipped (✅), 0 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).
```

Change to:
```markdown
**Total: 41 plans** — 36 shipped (✅), 0 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).
```

- [ ] **Step 3: Verify everything**

```bash
cd /Users/nyetwork/dev/whoami
( cd core && npm test ) && ( cd frontend && npm test ) && ( cd cli && npm test )
cd frontend && rm -rf .next/types .next/dev/types && npx tsc --noEmit
```

Expected: all tests green; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/README.md
git commit -m "docs: mark multilingual Plan 2 shipped in plan-index"
```

---

## Acceptance criteria

After all 13 tasks complete:

1. **Build green:** `( cd frontend && npm run build )` succeeds.
2. **Typecheck green:** `npx tsc --noEmit` clean.
3. **Full test suite passes:** core + frontend + cli, including the new `messages-parity.test.ts` and `rtl-tailwind-sweep.test.ts`.
4. **Site chrome reads in four languages.** Manually visit `/en/`, `/ru/`, `/uk/`, `/he/` (and each section: family, family/tree, search, changelog) — every chrome string appears in the correct language.
5. **Hebrew renders RTL.** Visit `/he/` — text reads right-to-left, layout mirrors, family-tree icons mirror, chevrons point the right direction.
6. **Language switcher works.** Dropdown on every page; selecting a different language navigates to the same path under the new locale.
7. **All four locale files have identical key shape** (asserted by `messages-parity.test.ts`).
8. **No directional Tailwind classes** in `frontend/app/` or `frontend/components/` (asserted by `rtl-tailwind-sweep.test.ts`).
9. **CHANGELOG complete:** every `feat:` commit has an entry under `## [Unreleased]`.
10. **Plan-index row added** with ✅ status.
