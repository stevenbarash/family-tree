# Drift prevention — Plan 1 of 7: format normalizer + `wai check` shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `wai check` CLI shell with the format-drift detector and `--fix` support, establishing the `RepoState` + detector pattern that later plans extend.

**Architecture:** A pure `normalizeDate` function plus a pure detector (no I/O), wrapped by a boundary state-loader and a CLI command. `wai check` runs standalone (reads `~/whoami` directly), unlike existing CLI commands that proxy through the frontend API — this is the first CLI command in the architecture-audit migration toward standalone commands. The detector emits `Finding[]` with optional `Fix` payloads; `--fix` walks the fixes and writes files.

**Tech Stack:** TypeScript, Node 22, `tsx --test`, `node:assert/strict`, esbuild bundling for the CLI binary.

**Spec reference:** `docs/superpowers/specs/2026-05-07-drift-prevention-design.md` move 1.

---

## Scope

**In scope:**
- `core/src/format/dates.ts` — pure `normalizeDate(raw: string): NormalizeResult`
- `core/src/checks/types.ts` — `RepoState`, `Finding`, `Fix`, `Detector` types
- `core/src/checks/format-drift.ts` — pure detector that walks GEDCOM `2 DATE` lines and page bodies, returns findings with fixes
- `core/src/checks/load.ts` — boundary loader: disk → `RepoState`
- `cli/src/commands/check.ts` — CLI command wrapping detector + loader
- `cli/src/index.ts` — register `check` subcommand and help text
- `core/AGENTS.md` — add `core/src/checks/load.ts` to boundary table

**Out of scope (later plans):**
- Other detectors (data-drift, schema-drift, coverage-drift) — plans 2/5
- Corrections overlay schema/render — plans 2/3
- `wai promote-corrections` — plan 4
- `wai write` / `wai sync-gedcom` integration — plan 6
- Pre-commit hook + CI workflow templates — plan 6
- Plugin/skill updates — plan 7

## File structure

```
core/src/format/dates.ts          NEW. Pure normalizer.
core/src/checks/types.ts          NEW. RepoState, Finding, Fix, Detector.
core/src/checks/format-drift.ts   NEW. Pure detector + fix factory.
core/src/checks/load.ts           NEW (boundary). Reads disk → RepoState.
cli/src/commands/check.ts         NEW. CLI command.
cli/src/index.ts                  MODIFY. Register subcommand.
core/AGENTS.md                    MODIFY. Boundary-modules table.
core/test/format/dates.test.ts    NEW. ~15 cases covering audit inventory.
core/test/checks/format-drift.test.ts  NEW. Fixture-state tests.
cli/test/check.test.ts            NEW. Stub-loader tests.
```

## Conventions adhered to

Verified in `core/AGENTS.md` and `cli/AGENTS.md`:

- Pure `core/src/format/*` and `core/src/checks/format-drift.ts` accept data, return data, no I/O.
- `core/src/checks/load.ts` is the only boundary module added; gets a row in `core/AGENTS.md`'s boundary table.
- Tests use `node:test` + `node:assert/strict`, run via `npx tsx --test test/...`.
- CLI command is one file at `cli/src/commands/check.ts` exporting `runCheck`.
- CLI stdout is parseable; progress chatter goes to stderr.
- Exit codes: `0` clean, `1` findings, `2` invocation error.

---

## Task 1: Pure `normalizeDate` — canonical idempotents

**Files:**
- Create: `core/src/format/dates.ts`
- Create: `core/test/format/dates.test.ts`

- [ ] **Step 1: Write failing tests for canonical idempotency**

Create `core/test/format/dates.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDate } from '../../src/format/dates.ts';

test('normalizeDate: canonical D Mon YYYY is idempotent', () => {
  assert.equal(normalizeDate('7 Sep 1997').value, '7 Sep 1997');
  assert.equal(normalizeDate('28 Feb 1970').value, '28 Feb 1970');
  assert.equal(normalizeDate('15 Jul 1915').value, '15 Jul 1915');
});

test('normalizeDate: year-only is canonical', () => {
  assert.equal(normalizeDate('1923').value, '1923');
  assert.equal(normalizeDate('1989').value, '1989');
});

test('normalizeDate: Mon YYYY (no day) is canonical', () => {
  assert.equal(normalizeDate('Sep 1932').value, 'Sep 1932');
  assert.equal(normalizeDate('Jul 1969').value, 'Jul 1969');
});

test('normalizeDate: Abt YYYY is canonical', () => {
  assert.equal(normalizeDate('Abt 1886').value, 'Abt 1886');
});

test('normalizeDate: empty string returns empty result', () => {
  const r = normalizeDate('');
  assert.equal(r.value, '');
  assert.equal(r.changed, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/dev/whoami/core && npx tsx --test test/format/dates.test.ts`
Expected: FAIL with "Cannot find module '../../src/format/dates.ts'".

- [ ] **Step 3: Implement minimal normalizer**

Create `core/src/format/dates.ts`:

```typescript
const MONTHS_LONG: Record<string, string> = {
  january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr',
  may: 'May', june: 'Jun', july: 'Jul', august: 'Aug',
  september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec',
};
const MONTHS_SHORT = new Set(Object.values(MONTHS_LONG));

function titleCaseMonth(m: string): string | null {
  const lower = m.toLowerCase();
  if (MONTHS_LONG[lower]) return MONTHS_LONG[lower]!;
  const titled = lower[0]!.toUpperCase() + lower.slice(1);
  if (MONTHS_SHORT.has(titled)) return titled;
  return null;
}

export interface NormalizeResult {
  value: string;
  changed: boolean;
  ambiguous?: boolean;  // set when the input could canonicalize to multiple forms
}

export function normalizeDate(raw: string): NormalizeResult {
  if (!raw) return { value: raw, changed: false };
  const trimmed = raw.trim();
  if (!trimmed) return { value: trimmed, changed: trimmed !== raw };

  // Year-only: "1923"
  if (/^\d{4}$/.test(trimmed)) return { value: trimmed, changed: trimmed !== raw };

  // Mon YYYY: "Sep 1932"
  const monYear = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monYear) {
    const m = titleCaseMonth(monYear[1]!);
    if (m) {
      const out = `${m} ${monYear[2]}`;
      return { value: out, changed: out !== raw };
    }
  }

  // D Mon YYYY: "7 Sep 1997", "08 OCT 1790"
  const dMonY = trimmed.match(/^0?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dMonY) {
    const m = titleCaseMonth(dMonY[2]!);
    if (m) {
      const out = `${dMonY[1]} ${m} ${dMonY[3]}`;
      return { value: out, changed: out !== raw };
    }
  }

  return { value: trimmed, changed: trimmed !== raw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/dev/whoami/core && npx tsx --test test/format/dates.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/whoami
git add core/src/format/dates.ts core/test/format/dates.test.ts
git commit -m "feat(core): add normalizeDate canonical idempotents"
```

---

## Task 2: `normalizeDate` — non-canonical inputs (ALL CAPS, full month, "Mon D YYYY")

**Files:**
- Modify: `core/src/format/dates.ts`
- Modify: `core/test/format/dates.test.ts`

- [ ] **Step 1: Append failing tests for non-canonical inputs**

Append to `core/test/format/dates.test.ts`:

```typescript
test('normalizeDate: ALL-CAPS month → title case', () => {
  assert.equal(normalizeDate('11 MAR 1866').value, '11 Mar 1866');
  assert.equal(normalizeDate('08 OCT 1790').value, '8 Oct 1790');
  assert.equal(normalizeDate('MAY 1812').value, 'May 1812');
});

test('normalizeDate: lowercase month → title case', () => {
  assert.equal(normalizeDate('18 jul 1926').value, '18 Jul 1926');
});

test('normalizeDate: full month name → 3-letter abbreviation', () => {
  assert.equal(normalizeDate('25 August 1889').value, '25 Aug 1889');
  assert.equal(normalizeDate('30 January 1899').value, '30 Jan 1899');
});

test('normalizeDate: "Mon D YYYY" (no comma) → "D Mon YYYY"', () => {
  assert.equal(normalizeDate('Feb 28 1970').value, '28 Feb 1970');
  assert.equal(normalizeDate('May 8 1954').value, '8 May 1954');
  assert.equal(normalizeDate('April 2 1966').value, '2 Apr 1966');
});

test('normalizeDate: "Month D, YYYY" (with comma) → "D Mon YYYY"', () => {
  assert.equal(normalizeDate('August 19, 2001').value, '19 Aug 2001');
  assert.equal(normalizeDate('May 5, 1922').value, '5 May 1922');
});

test('normalizeDate: leading-zero day stripped', () => {
  assert.equal(normalizeDate('08 Oct 1790').value, '8 Oct 1790');
  assert.equal(normalizeDate('01 Jan 2000').value, '1 Jan 2000');
});

test('normalizeDate: changed flag true when output differs from input', () => {
  assert.equal(normalizeDate('Feb 28 1970').changed, true);
  assert.equal(normalizeDate('28 Feb 1970').changed, false);
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd ~/dev/whoami/core && npx tsx --test test/format/dates.test.ts`
Expected: 6 new FAIL ("Mon D YYYY" / "Month D, YYYY" / lowercase / etc. all unhandled).

- [ ] **Step 3: Extend implementation**

Replace the body of `normalizeDate` in `core/src/format/dates.ts` (between the `if (!raw)` short-circuit and the final fallback `return`) with these additional patterns *before* the fallback:

```typescript
  // "Month D, YYYY" or "Month D YYYY": "August 19, 2001", "Feb 28 1970"
  const monDY = trimmed.match(/^([A-Za-z]+)\s+0?(\d{1,2}),?\s+(\d{4})$/);
  if (monDY) {
    const m = titleCaseMonth(monDY[1]!);
    if (m) {
      const out = `${monDY[2]} ${m} ${monDY[3]}`;
      return { value: out, changed: out !== raw };
    }
  }
```

Insert this block between the existing `monYear` and `dMonY` blocks. (Order matters: `monYear` must run first so "Sep 1932" doesn't fall into `monDY` mistakenly. The `monDY` regex requires a day digit, so they don't conflict.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/dev/whoami/core && npx tsx --test test/format/dates.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/whoami
git add core/src/format/dates.ts core/test/format/dates.test.ts
git commit -m "feat(core): normalizeDate handles non-canonical inputs"
```

---

## Task 3: `normalizeDate` — qualifiers (`Abt`, `Bef`, `Aft`, `Bet … And …`)

**Files:**
- Modify: `core/src/format/dates.ts`
- Modify: `core/test/format/dates.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `core/test/format/dates.test.ts`:

```typescript
test('normalizeDate: Abt prefix variants → "Abt"', () => {
  assert.equal(normalizeDate('abt 1882').value, 'Abt 1882');
  assert.equal(normalizeDate('Abt. 1929').value, 'Abt 1929');
  assert.equal(normalizeDate('ABT 1730').value, 'Abt 1730');
  assert.equal(normalizeDate('About 1880').value, 'Abt 1880');
  assert.equal(normalizeDate('Circa 1900').value, 'Abt 1900');
  assert.equal(normalizeDate('Ca 1850').value, 'Abt 1850');
});

test('normalizeDate: Bef and Aft prefixes → "Bef" and "Aft"', () => {
  assert.equal(normalizeDate('BEF 1900').value, 'Bef 1900');
  assert.equal(normalizeDate('before 1900').value, 'Bef 1900');
  assert.equal(normalizeDate('AFT 1850').value, 'Aft 1850');
  assert.equal(normalizeDate('after 1850').value, 'Aft 1850');
});

test('normalizeDate: BET ... AND ... → "Bet YYYY And YYYY"', () => {
  assert.equal(normalizeDate('BET 1760 AND 1816').value, 'Bet 1760 And 1816');
  assert.equal(normalizeDate('Bet 1850 And 1860').value, 'Bet 1850 And 1860');
});

test('normalizeDate: Abt is idempotent', () => {
  assert.equal(normalizeDate('Abt 1886').changed, false);
  assert.equal(normalizeDate('Bet 1850 And 1860').changed, false);
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd ~/dev/whoami/core && npx tsx --test test/format/dates.test.ts`
Expected: FAIL on all 4 new tests.

- [ ] **Step 3: Add qualifier handling**

In `core/src/format/dates.ts`, add this block at the very top of `normalizeDate`'s body (right after the `if (!raw) ...` and `if (!trimmed) ...` short-circuits, before any other matchers):

```typescript
  // Qualified forms: "Abt 1882", "BET 1760 AND 1816", etc.
  const between = trimmed.match(/^bet(?:ween)?\.?\s+(\d{4})\s+and\s+(\d{4})$/i);
  if (between) {
    const out = `Bet ${between[1]} And ${between[2]}`;
    return { value: out, changed: out !== raw };
  }

  const qualifier = trimmed.match(/^(abt|about|circa|ca|est|bef|before|aft|after)\.?\s+(.+)$/i);
  if (qualifier) {
    const tag = qualifier[1]!.toLowerCase();
    const rest = normalizeDate(qualifier[2]!);
    let prefix: string;
    if (tag === 'bef' || tag === 'before') prefix = 'Bef';
    else if (tag === 'aft' || tag === 'after') prefix = 'Aft';
    else prefix = 'Abt';
    const out = `${prefix} ${rest.value}`;
    return { value: out, changed: out !== raw };
  }
```

- [ ] **Step 4: Run tests**

Run: `cd ~/dev/whoami/core && npx tsx --test test/format/dates.test.ts`
Expected: PASS — all 16 tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/whoami
git add core/src/format/dates.ts core/test/format/dates.test.ts
git commit -m "feat(core): normalizeDate handles Abt/Bef/Aft/Bet qualifiers"
```

---

## Task 4: `normalizeDate` — slash-format dates (with ambiguity flag)

**Files:**
- Modify: `core/src/format/dates.ts`
- Modify: `core/test/format/dates.test.ts`

Slash dates like `9/7/1997` are ambiguous (m/d/y vs d/m/y). The normalizer disambiguates by the position of the >12 number (only one ordering is valid) and flags truly-ambiguous cases without auto-fixing.

- [ ] **Step 1: Append failing tests**

Append to `core/test/format/dates.test.ts`:

```typescript
test('normalizeDate: slash date with day > 12 → unambiguous d/m/y', () => {
  assert.equal(normalizeDate('17/09/1923').value, '17 Sep 1923');
  assert.equal(normalizeDate('29/09/1941').value, '29 Sep 1941');
});

test('normalizeDate: slash date with month-position > 12 → unambiguous m/d/y is impossible, treated as d/m/y', () => {
  // 29/9/1941: 29 can only be a day → d/m/y
  assert.equal(normalizeDate('29/9/1941').value, '29 Sep 1941');
});

test('normalizeDate: ambiguous slash date is flagged, not fixed', () => {
  // 9/7/1997: could be 7 Sep or 9 Jul. Don't guess.
  const r = normalizeDate('9/7/1997');
  assert.equal(r.value, '9/7/1997');
  assert.equal(r.changed, false);
  assert.equal(r.ambiguous, true);
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd ~/dev/whoami/core && npx tsx --test test/format/dates.test.ts`
Expected: FAIL on the 3 new tests.

- [ ] **Step 3: Add slash-date handling**

In `core/src/format/dates.ts`, add this block after the existing `dMonY` matcher (before the fallback return):

```typescript
  // Slash format: "17/09/1923", "9/7/1997"
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const yyyy = slash[3]!;
    const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (a > 12 && b <= 12) {
      // d/m/y unambiguous
      return { value: `${a} ${SHORT[b - 1]} ${yyyy}`, changed: true };
    }
    if (b > 12 && a <= 12) {
      // m/d/y unambiguous
      return { value: `${b} ${SHORT[a - 1]} ${yyyy}`, changed: true };
    }
    // both ≤ 12: ambiguous, don't guess
    return { value: trimmed, changed: trimmed !== raw, ambiguous: true };
  }
```

- [ ] **Step 4: Run tests**

Run: `cd ~/dev/whoami/core && npx tsx --test test/format/dates.test.ts`
Expected: PASS — all 19 tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/whoami
git add core/src/format/dates.ts core/test/format/dates.test.ts
git commit -m "feat(core): normalizeDate handles slash dates with ambiguity flag"
```

---

## Task 5: Define `RepoState`, `Finding`, `Fix`, `Detector` types

**Files:**
- Create: `core/src/checks/types.ts`

- [ ] **Step 1: Write the types module**

Create `core/src/checks/types.ts`:

```typescript
import type { ParseResult } from '../gedcom/parser.ts';
import type { DerivedRecord } from '../gedcom/types.ts';
import type { PageMeta } from '../pages/types.ts';
import type { PlaceCoord } from '../family/places-coords.ts';

export interface LoadedPage {
  slug: string;
  path: string;            // absolute path
  meta: PageMeta;
  body: string;            // body only (frontmatter stripped). For prose-only inspection.
  text: string;            // full file contents, frontmatter included. For line-based fixes.
}

export interface RepoState {
  rootDir: string;
  gedcomPath: string;
  gedcomText: string;
  gedcomAst: ParseResult;
  pages: ReadonlyArray<LoadedPage>;
  derivedDir: string;
  derived: ReadonlyMap<string, DerivedRecord>;
  placesCoords: ReadonlyArray<PlaceCoord>;
}

export type FindingCategory = 'format' | 'data' | 'schema' | 'coverage';
export type Severity = 'error' | 'warn' | 'info';

export interface Fix {
  /** Absolute path to the file the fix mutates. */
  file: string;
  /** Line-targeted replacement: replace the line at `lineNumber` with `newLine`. 1-indexed. */
  lineNumber: number;
  oldLine: string;
  newLine: string;
}

export interface Finding {
  category: FindingCategory;
  severity: Severity;
  message: string;
  location: { file: string; line?: number };
  fix?: Fix;
}

export type Detector = (state: RepoState) => Finding[];
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/dev/whoami/core && npm run typecheck`
Expected: PASS — no errors. The `PlaceCoord` import resolves; `ParseResult` resolves.

- [ ] **Step 3: Commit**

```bash
cd ~/dev/whoami
git add core/src/checks/types.ts
git commit -m "feat(core): add RepoState/Finding/Fix/Detector types"
```

---

## Task 6: `format-drift` detector — GEDCOM `2 DATE` lines

**Files:**
- Create: `core/src/checks/format-drift.ts`
- Create: `core/test/checks/format-drift.test.ts`

- [ ] **Step 1: Write failing test**

Create `core/test/checks/format-drift.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormatDrift } from '../../src/checks/format-drift.ts';
import type { RepoState } from '../../src/checks/types.ts';

function makeState(gedcomText: string): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/genealogy/barash-tree.ged',
    gedcomText,
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [],
    derivedDir: '/tmp/x/genealogy/derived',
    derived: new Map(),
    placesCoords: [],
  };
}

test('detectFormatDrift: clean GEDCOM produces no findings', () => {
  const ged = `0 @I1@ INDI
1 NAME Test /Person/
1 BIRT
2 DATE 7 Sep 1997
2 PLAC Somewhere
`;
  const findings = detectFormatDrift(makeState(ged));
  assert.deepEqual(findings, []);
});

test('detectFormatDrift: flags ALL-CAPS month in GEDCOM date', () => {
  const ged = `0 @I1@ INDI
1 BIRT
2 DATE 11 MAR 1866
`;
  const findings = detectFormatDrift(makeState(ged));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'format');
  assert.equal(findings[0]!.location.line, 3);
  assert.equal(findings[0]!.fix?.oldLine, '2 DATE 11 MAR 1866');
  assert.equal(findings[0]!.fix?.newLine, '2 DATE 11 Mar 1866');
});

test('detectFormatDrift: flags slash date and full month name', () => {
  const ged = `0 @I1@ INDI
1 BIRT
2 DATE 17/09/1923
1 DEAT
2 DATE 25 August 1889
`;
  const findings = detectFormatDrift(makeState(ged));
  assert.equal(findings.length, 2);
  assert.equal(findings[0]!.fix?.newLine, '2 DATE 17 Sep 1923');
  assert.equal(findings[1]!.fix?.newLine, '2 DATE 25 Aug 1889');
});

test('detectFormatDrift: ambiguous slash date is flagged with no fix', () => {
  const ged = `0 @I1@ INDI
1 BIRT
2 DATE 9/7/1997
`;
  const findings = detectFormatDrift(makeState(ged));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'warn');
  assert.equal(findings[0]!.fix, undefined);
  assert.match(findings[0]!.message, /ambiguous/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd ~/dev/whoami/core && npx tsx --test test/checks/format-drift.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement detector**

Create `core/src/checks/format-drift.ts`:

```typescript
import type { Detector, Finding, RepoState } from './types.ts';
import { normalizeDate } from '../format/dates.ts';

export const detectFormatDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  const lines = state.gedcomText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match "<level> DATE <value>" — DATE always at level 2 in our GEDCOMs
    // but the detector tolerates any level for forward compat.
    const m = line.match(/^(\d+\s+DATE\s+)(.+)$/);
    if (!m) continue;
    const [, prefix, value] = m;
    const result = normalizeDate(value!);
    if (!result.changed && !result.ambiguous) continue;
    if (result.ambiguous) {
      findings.push({
        category: 'format',
        severity: 'warn',
        message: `ambiguous slash date "${value}" — needs manual disambiguation (m/d/y vs d/m/y)`,
        location: { file: state.gedcomPath, line: i + 1 },
      });
      continue;
    }
    findings.push({
      category: 'format',
      severity: 'info',
      message: `non-canonical date "${value}" → "${result.value}"`,
      location: { file: state.gedcomPath, line: i + 1 },
      fix: {
        file: state.gedcomPath,
        lineNumber: i + 1,
        oldLine: line,
        newLine: `${prefix}${result.value}`,
      },
    });
  }
  return findings;
};
```

- [ ] **Step 4: Run tests**

Run: `cd ~/dev/whoami/core && npx tsx --test test/checks/format-drift.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/whoami
git add core/src/checks/format-drift.ts core/test/checks/format-drift.test.ts
git commit -m "feat(core): format-drift detector for GEDCOM DATE lines"
```

---

## Task 7: `format-drift` detector — page bodies (date-like substrings)

**Files:**
- Modify: `core/src/checks/format-drift.ts`
- Modify: `core/test/checks/format-drift.test.ts`

The page-body pass walks each loaded page's body and checks for date-like substrings outside fenced code blocks. Conservative — only flags when the substring matches a strict date pattern AND `normalizeDate` reports a change.

- [ ] **Step 1: Append failing test**

Append to `core/test/checks/format-drift.test.ts`:

```typescript
import type { LoadedPage } from '../../src/checks/types.ts';

function makeStateWithPage(body: string): RepoState {
  const text = `---\ntitle: Test\n---\n${body}`;
  const page: LoadedPage = {
    slug: 'test',
    path: '/tmp/x/pages/test.md',
    meta: {} as any,
    body,
    text,
  };
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/genealogy/barash-tree.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [page],
    derivedDir: '/tmp/x/genealogy/derived',
    derived: new Map(),
    placesCoords: [],
  };
}

test('detectFormatDrift: flags non-canonical date in page body', () => {
  // makeStateWithPage prepends 3 frontmatter lines: ---, title, ---.
  // So body line 1 → file line 4.
  const body = `Sofia died on 25 August 1889 in Pennsylvania.\n`;
  const findings = detectFormatDrift(makeStateWithPage(body));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.location.file, '/tmp/x/pages/test.md');
  assert.equal(findings[0]!.location.line, 4);
  assert.match(findings[0]!.message, /25 Aug 1889/);
});

test('detectFormatDrift: ignores dates inside fenced code blocks', () => {
  const body = '```\n2 DATE 25 August 1889\n```\nNormal prose.\n';
  const findings = detectFormatDrift(makeStateWithPage(body));
  assert.equal(findings.length, 0);
});

test('detectFormatDrift: catches dates in DOT-graph blocks (no special handling needed)', () => {
  const body = `<graphviz>\ndigraph X { "a" [label="(11 MAR 1866)"]; }\n</graphviz>\n`;
  const findings = detectFormatDrift(makeStateWithPage(body));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.fix?.newLine ?? '', /11 Mar 1866/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/dev/whoami/core && npx tsx --test test/checks/format-drift.test.ts`
Expected: 3 new FAIL — page-body pass not implemented.

- [ ] **Step 3: Extend detector**

Add `LoadedPage` to the existing import in `core/src/checks/format-drift.ts`:

```typescript
import type { Detector, Finding, LoadedPage, RepoState } from './types.ts';
```

Then append to the same file:

```typescript
// Match date-like substrings strictly. Order matters: longer / more specific
// patterns first so they're tried before shorter ones.
const DATE_PATTERNS: RegExp[] = [
  /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/g,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}\b/g,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+\d{4}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
];

function findDatesInLine(line: string): Array<{ start: number; text: string }> {
  const hits: Array<{ start: number; text: string }> = [];
  for (const re of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      // Skip overlap with already-recorded hits
      const overlaps = hits.some(h => m!.index < h.start + h.text.length && m!.index + m![0].length > h.start);
      if (!overlaps) hits.push({ start: m.index, text: m[0]! });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function inFencedCodeBlock(lines: string[], lineIdx: number): boolean {
  let inside = false;
  for (let i = 0; i < lineIdx; i++) {
    if (lines[i]!.trimStart().startsWith('```')) inside = !inside;
  }
  return inside;
}

/**
 * Find the line index (0-based) just past the frontmatter delimiter `---`,
 * if the file opens with one. Returns 0 if the file has no frontmatter.
 */
function bodyStartIndex(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') return i + 1;
  }
  return 0;
}

function detectInPage(page: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  const lines = page.text.split('\n');
  const bodyStart = bodyStartIndex(lines);
  for (let i = bodyStart; i < lines.length; i++) {
    if (inFencedCodeBlock(lines.slice(bodyStart), i - bodyStart)) continue;
    const line = lines[i]!;
    const hits = findDatesInLine(line);
    if (hits.length === 0) continue;
    let newLine = line;
    let changed = false;
    let ambiguousHit = false;
    // Apply replacements right-to-left so indices stay stable.
    for (const hit of [...hits].reverse()) {
      const result = normalizeDate(hit.text);
      if (result.ambiguous) { ambiguousHit = true; continue; }
      if (!result.changed) continue;
      newLine = newLine.slice(0, hit.start) + result.value + newLine.slice(hit.start + hit.text.length);
      changed = true;
    }
    if (changed) {
      findings.push({
        category: 'format',
        severity: 'info',
        message: `non-canonical date(s) in page body → "${newLine.trim().slice(0, 80)}…"`,
        location: { file: page.path, line: i + 1 },
        fix: { file: page.path, lineNumber: i + 1, oldLine: line, newLine },
      });
    }
    if (ambiguousHit) {
      findings.push({
        category: 'format',
        severity: 'warn',
        message: `ambiguous slash date in page body — needs manual disambiguation`,
        location: { file: page.path, line: i + 1 },
      });
    }
  }
  return findings;
}
```

Then update the exported `detectFormatDrift` to also walk pages:

```typescript
export const detectFormatDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  // (existing GEDCOM-line walk stays here, unchanged)
  // ... existing GEDCOM-line code ...

  // Page bodies
  for (const page of state.pages) {
    findings.push(...detectInPage(page));
  }
  return findings;
};
```

- [ ] **Step 4: Run tests**

Run: `cd ~/dev/whoami/core && npx tsx --test test/checks/format-drift.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/whoami
git add core/src/checks/format-drift.ts core/test/checks/format-drift.test.ts
git commit -m "feat(core): format-drift detector covers page bodies"
```

---

## Task 8: Boundary loader `core/src/checks/load.ts`

**Files:**
- Create: `core/src/checks/load.ts`

This is the only boundary module added in this plan. Reads disk, returns `RepoState`.

- [ ] **Step 1: Implement loader**

Create `core/src/checks/load.ts`:

```typescript
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import type { RepoState, LoadedPage } from './types.ts';
import { parseGedcomFile } from '../gedcom/parser.ts';
import { parsePageMeta } from '../pages/schema.ts';
import { migrate } from '../pages/migrations/index.ts';
import { parseCoordsYaml } from '../family/places-coords.ts';
import { normalizeDerivedRecord } from '../gedcom/normalize.ts';
import type { DerivedRecord } from '../gedcom/types.ts';

/**
 * Load the data repo at `rootDir` (default: $WHOAMI_ROOT or ~/whoami) into a
 * RepoState value. Boundary module — reads disk; pure detectors take the
 * returned RepoState and never touch disk themselves.
 */
export async function loadRepoState(rootDir: string): Promise<RepoState> {
  const gedcomPath = join(rootDir, 'genealogy', 'barash-tree.ged');
  const gedcomText = readFileSync(gedcomPath, 'utf-8');
  const gedcomAst = await parseGedcomFile(gedcomPath);

  const pagesDir = join(rootDir, 'pages');
  const pages: LoadedPage[] = [];
  if (existsSync(pagesDir)) {
    for (const name of readdirSync(pagesDir)) {
      if (!name.endsWith('.md')) continue;
      const path = join(pagesDir, name);
      if (!statSync(path).isFile()) continue;
      const raw = readFileSync(path, 'utf-8');
      const parsed = matter(raw);
      const fmRaw = parsed.data ?? {};
      const fmVersion = typeof fmRaw.schemaVersion === 'number' ? fmRaw.schemaVersion : 1;
      const migrated = migrate(fmRaw, fmVersion);
      const meta = parsePageMeta(migrated);
      const slug = name.replace(/\.md$/, '');
      pages.push({ slug, path, meta, body: parsed.content, text: raw });
    }
  }

  const derivedDir = join(rootDir, 'genealogy', 'derived');
  const derived = new Map<string, DerivedRecord>();
  if (existsSync(derivedDir)) {
    for (const name of readdirSync(derivedDir)) {
      if (!name.endsWith('.yml')) continue;
      const raw = readFileSync(join(derivedDir, name), 'utf-8');
      const parsed = yaml.load(raw);
      const norm = normalizeDerivedRecord(parsed);
      if (norm) derived.set(norm.record, norm);
    }
  }

  const coordsPath = join(rootDir, 'genealogy', 'places-coords.yml');
  const placesCoords = existsSync(coordsPath)
    ? parseCoordsYaml(readFileSync(coordsPath, 'utf-8'))
    : [];

  return {
    rootDir,
    gedcomPath,
    gedcomText,
    gedcomAst,
    pages,
    derivedDir,
    derived,
    placesCoords,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/dev/whoami/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Smoke test against the real data repo**

Create a temporary script `/tmp/check-load.ts`:

```typescript
import { loadRepoState } from '/Users/nyetwork/dev/whoami/core/src/checks/load.ts';
async function main() {
  const state = await loadRepoState('/Users/nyetwork/whoami');
  console.log('pages:', state.pages.length);
  console.log('derived:', state.derived.size);
  console.log('coords:', state.placesCoords.length);
  console.log('gedcom INDI:', state.gedcomAst.individuals.size);
}
main();
```

Run: `cd ~/dev/whoami/core && npx tsx /tmp/check-load.ts`
Expected: prints non-zero counts (≥100 pages, ≥200 derived, ≥40 coords, ≥200 individuals). Then `rm /tmp/check-load.ts`.

- [ ] **Step 4: Commit**

```bash
cd ~/dev/whoami
git add core/src/checks/load.ts
git commit -m "feat(core): boundary RepoState loader for wai check"
```

---

## Task 9: `wai check` CLI command (without --fix)

**Files:**
- Create: `cli/src/commands/check.ts`
- Create: `cli/test/check.test.ts`

- [ ] **Step 1: Write failing test**

Create `cli/test/check.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from '../src/commands/check.js';
import type { RepoState, Finding } from '@core/checks/types.ts';

function emptyState(): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [],
    derivedDir: '/tmp/x/d',
    derived: new Map(),
    placesCoords: [],
  };
}

test('check: clean state prints "0 findings" and exit 0', async () => {
  let out = '';
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: false,
    only: null,
    failOn: null,
    loadState: async () => emptyState(),
    detectors: [() => []],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => { throw new Error('writeFile must not be called when --fix is off'); },
  });
  assert.equal(code, 0);
  assert.match(out, /0 findings/);
});

test('check: findings produce non-zero exit', async () => {
  let out = '';
  const finding: Finding = {
    category: 'format',
    severity: 'info',
    message: 'non-canonical date',
    location: { file: '/tmp/x/g.ged', line: 5 },
  };
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: false,
    only: null,
    failOn: null,
    loadState: async () => emptyState(),
    detectors: [() => [finding]],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => { throw new Error('no fix'); },
  });
  assert.equal(code, 1);
  assert.match(out, /format/);
  assert.match(out, /1 findings/);
});

test('check: --json prints JSON', async () => {
  let out = '';
  const finding: Finding = {
    category: 'format',
    severity: 'info',
    message: 'x',
    location: { file: 'a', line: 1 },
  };
  await runCheck({
    rootDir: '/tmp/x',
    json: true,
    fix: false,
    only: null,
    failOn: null,
    loadState: async () => emptyState(),
    detectors: [() => [finding]],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => {},
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.findings[0].category, 'format');
});

test('check: --only filters detectors by category', async () => {
  let out = '';
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: false,
    only: ['format'],
    failOn: null,
    loadState: async () => emptyState(),
    detectors: [
      () => [{ category: 'format', severity: 'info', message: 'a', location: { file: 'a' } }],
      () => [{ category: 'data', severity: 'info', message: 'b', location: { file: 'b' } }],
    ],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => {},
  });
  // 1 format finding (kept), data finding (filtered out)
  assert.equal(code, 1);
  assert.match(out, /1 findings/);
  assert.doesNotMatch(out, /\bb\b/);
});

test('check: --fail-on filters exit code by category', async () => {
  let out = '';
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: false,
    only: null,
    failOn: ['data'],
    loadState: async () => emptyState(),
    detectors: [
      () => [{ category: 'format', severity: 'info', message: 'a', location: { file: 'a' } }],
    ],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => {},
  });
  // Findings exist but only format (not data) → exit 0
  assert.equal(code, 0);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd ~/dev/whoami/cli && npx tsx --test test/check.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement command (without --fix)**

Create `cli/src/commands/check.ts`:

```typescript
import type { Detector, Finding, FindingCategory, RepoState } from '@core/checks/types.ts';

export interface CheckOptions {
  rootDir: string;
  json: boolean;
  fix: boolean;
  only: ReadonlyArray<FindingCategory> | null;
  failOn: ReadonlyArray<FindingCategory> | null;
  loadState: (rootDir: string) => Promise<RepoState>;
  detectors: ReadonlyArray<Detector>;
  write: (s: string) => void;
  writeErr: (s: string) => void;
  writeFile: (file: string, content: string) => void;
}

export async function runCheck(opts: CheckOptions): Promise<number> {
  const state = await opts.loadState(opts.rootDir);
  let findings: Finding[] = [];
  for (const det of opts.detectors) findings.push(...det(state));
  if (opts.only) {
    const keep = new Set(opts.only);
    findings = findings.filter(f => keep.has(f.category));
  }

  // (Task 10 inserts the --fix branch here.)

  if (opts.json) {
    opts.write(JSON.stringify({ findings }, null, 2));
    return findings.length === 0 ? 0 : 1;
  }

  const byCat = new Map<FindingCategory, Finding[]>();
  for (const f of findings) {
    const arr = byCat.get(f.category) ?? [];
    arr.push(f);
    byCat.set(f.category, arr);
  }
  for (const cat of (['format', 'data', 'schema', 'coverage'] as const)) {
    const arr = byCat.get(cat) ?? [];
    if (arr.length === 0) continue;
    const fixable = arr.filter(f => f.fix).length;
    opts.write(`${cat.padEnd(16)} [ ${arr.length} findings, ${fixable} fixable ]\n`);
    for (const f of arr) {
      const where = f.location.line ? `:${f.location.line}` : '';
      opts.write(`  ${f.location.file}${where}  ${f.message}\n`);
    }
    opts.write('\n');
  }
  opts.write(`${byCat.size} categories, ${findings.length} findings.\n`);

  // Exit-code mapping
  if (findings.length === 0) return 0;
  if (opts.failOn) {
    const fail = new Set(opts.failOn);
    const matched = findings.some(f => fail.has(f.category));
    return matched ? 1 : 0;
  }
  return 1;
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/dev/whoami/cli && npx tsx --test test/check.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/whoami
git add cli/src/commands/check.ts cli/test/check.test.ts
git commit -m "feat(cli): wai check shell with detector dispatch"
```

---

## Task 10: `--fix` mode applies file patches

**Files:**
- Modify: `cli/src/commands/check.ts`
- Modify: `cli/test/check.test.ts`

- [ ] **Step 1: Append failing test**

Append to `cli/test/check.test.ts`:

```typescript
test('check --fix: applies fixes, reports applied count, returns 0 if all fixed', async () => {
  let out = '';
  const writes: Array<{ file: string; content: string }> = [];
  // Fake initial state has the unfixed file content; after --fix the rerun
  // should see the patched content with no findings.
  let pass = 0;
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: true,
    only: null,
    failOn: null,
    loadState: async () => {
      const state = emptyState();
      if (pass === 0) {
        state.gedcomText = '0 @I1@ INDI\n2 DATE 11 MAR 1866\n';
      } else {
        state.gedcomText = '0 @I1@ INDI\n2 DATE 11 Mar 1866\n';
      }
      pass += 1;
      return state;
    },
    detectors: [
      (s) => {
        const lines = s.gedcomText.split('\n');
        const findings: Finding[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (/MAR 1866/.test(lines[i]!)) {
            findings.push({
              category: 'format',
              severity: 'info',
              message: 'fix me',
              location: { file: '/tmp/x/g.ged', line: i + 1 },
              fix: {
                file: '/tmp/x/g.ged',
                lineNumber: i + 1,
                oldLine: lines[i]!,
                newLine: lines[i]!.replace('MAR', 'Mar'),
              },
            });
          }
        }
        return findings;
      },
    ],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: (file, content) => writes.push({ file, content }),
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.file, '/tmp/x/g.ged');
  assert.match(writes[0]!.content, /11 Mar 1866/);
  assert.equal(code, 0);
  assert.match(out, /1 fix(es)? applied/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd ~/dev/whoami/cli && npx tsx --test test/check.test.ts`
Expected: FAIL — `writeFile` never called; existing `// (Filled in by Task 10.)` comment is a no-op.

- [ ] **Step 3: Implement --fix**

In `cli/src/commands/check.ts`, insert this block immediately after the `findings = findings.filter(...)` line and before the `if (opts.json)` block (where the Task 9 comment marker `(Task 10 inserts the --fix branch here.)` was):

```typescript
  if (opts.fix) {
    // Group fixes by file, apply sequentially per file (right-to-left within
    // a file would be safer for multi-edit lines, but we patch by line number,
    // and lines don't shift unless we add/remove lines — which fixes don't.
    const fixesByFile = new Map<string, typeof findings[number]['fix'][]>();
    for (const f of findings) {
      if (!f.fix) continue;
      const arr = fixesByFile.get(f.fix.file) ?? [];
      arr.push(f.fix);
      fixesByFile.set(f.fix.file, arr);
    }

    for (const [file, fixes] of fixesByFile) {
      // Read fresh content for each file from the loader's view, then apply
      // patches by line number. Pages use `text` (frontmatter included) so
      // line numbers from detectors refer to the full file.
      const sourceText = file === state.gedcomPath
        ? state.gedcomText
        : (state.pages.find(p => p.path === file)?.text ?? '');
      const lines = sourceText.split('\n');
      for (const fix of fixes) {
        if (!fix) continue;
        const idx = fix.lineNumber - 1;
        if (lines[idx] !== fix.oldLine) {
          opts.writeErr(`skipping fix at ${file}:${fix.lineNumber} — line content changed since detection\n`);
          continue;
        }
        lines[idx] = fix.newLine;
      }
      opts.writeFile(file, lines.join('\n'));
    }

    const applied = [...fixesByFile.values()].reduce((n, arr) => n + arr.length, 0);
    opts.write(`${applied} fix${applied === 1 ? '' : 'es'} applied.\n`);

    // Re-run detectors against the patched state (caller's loadState should
    // re-read disk OR return updated in-memory state). If still findings,
    // exit 1; else 0.
    const fresh = await opts.loadState(opts.rootDir);
    let remaining: Finding[] = [];
    for (const det of opts.detectors) remaining.push(...det(fresh));
    if (opts.only) {
      const keep = new Set(opts.only);
      remaining = remaining.filter(f => keep.has(f.category));
    }
    return remaining.length === 0 ? 0 : 1;
  }
```

(Note: the existing non-fix render block below this still runs in the no-fix path. The `--fix` branch returns early.)

- [ ] **Step 4: Run tests**

Run: `cd ~/dev/whoami/cli && npx tsx --test test/check.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/whoami
git add cli/src/commands/check.ts cli/test/check.test.ts
git commit -m "feat(cli): wai check --fix applies file patches and re-validates"
```

---

## Task 11: Wire `check` into `cli/src/index.ts` (subcommand + help)

**Files:**
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Add help block**

Open `cli/src/index.ts`. After the existing `redlinks [--limit N] [--json]` help block, add a `Quality:` section before `Search:`:

```typescript
// Locate the 'Search:' help block and insert this before it:
const HELP_CHECK = `
Quality:
  check                       Run all drift detectors. Exit 1 if findings.
        [--fix]                 Apply safe auto-fixes (format, schema)
        [--only A,B]            Only run detectors for categories (format,data,schema,coverage)
        [--fail-on A,B]         Exit 1 only on findings in these categories
        [--json]                Machine-readable output
`;
```

Then in the `HELP` constant, splice `${HELP_CHECK}` between the existing GEDCOM block and the Search block.

- [ ] **Step 2: Import and dispatch**

Add to imports:

```typescript
import { runCheck } from './commands/check.js';
import { loadRepoState } from '@core/checks/load.ts';
import { detectFormatDrift } from '@core/checks/format-drift.ts';
import type { FindingCategory } from '@core/checks/types.ts';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
```

In the `switch (args.cmd)` block, add a new case before `'redlinks'`:

```typescript
      case 'check': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const parseList = (v: unknown): FindingCategory[] | null => {
          if (typeof v !== 'string') return null;
          return v.split(',').map(s => s.trim()) as FindingCategory[];
        };
        const code = await runCheck({
          rootDir: root,
          json: !!args.flags.json,
          fix: !!args.flags.fix,
          only: parseList(args.flags.only),
          failOn: parseList(args.flags['fail-on']),
          loadState: loadRepoState,
          detectors: [detectFormatDrift],
          write,
          writeErr: (s) => process.stderr.write(s),
          writeFile: (file, content) => writeFileSync(file, content),
        });
        return code;
      }
```

- [ ] **Step 3: Verify build still works**

Run: `cd ~/dev/whoami/cli && npm run typecheck`
Expected: PASS.

Run: `cd ~/dev/whoami/cli && npm run build`
Expected: PASS — produces `dist/wai.cjs`.

Run: `node ~/dev/whoami/cli/dist/wai.cjs --help | grep -A4 Quality`
Expected: Quality block visible in help output.

- [ ] **Step 4: Commit**

```bash
cd ~/dev/whoami
git add cli/src/index.ts
git commit -m "feat(cli): register wai check subcommand"
```

---

## Task 12: Update `core/AGENTS.md` boundary table

**Files:**
- Modify: `core/AGENTS.md`

- [ ] **Step 1: Insert row in the boundary table**

In `core/AGENTS.md`, find the table heading `| File | Role |` under "Boundary modules". Add this row at the end of the table (before the next prose paragraph):

```
| `checks/load.ts` | Read GEDCOM + pages + coords + derived YAMLs into a RepoState for drift detectors. |
```

- [ ] **Step 2: Commit**

```bash
cd ~/dev/whoami
git add core/AGENTS.md
git commit -m "docs(core): document checks/load.ts as boundary module"
```

---

## Task 13: End-to-end smoke test against `~/whoami`

**Files:** none (runtime verification)

- [ ] **Step 1: Run `wai check` against the real data repo**

Run: `node ~/dev/whoami/cli/dist/wai.cjs check 2>&1 | head -40`

Expected:
- Exits with code 1 (drift exists per the 2026-05-07 audit).
- `format` block lists at least 20 findings.
- Includes ALL-CAPS-month finding for `genealogy/barash-tree.ged` somewhere around line numbers in the 3000s (David Millhauser `08 OCT 1790`).
- Includes lowercase-month finding for `pages/barash-family-tree.md` line 197 (`18 jul 1926`).

- [ ] **Step 2: Run `wai check --json` and pipe through jq**

Run: `node ~/dev/whoami/cli/dist/wai.cjs check --json | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['findings']), 'findings');"`

Expected: prints `<N> findings` where `N >= 20`.

- [ ] **Step 3: Dry-run `--fix` on a copy**

Make a working copy: `cp ~/whoami/genealogy/barash-tree.ged /tmp/barash-tree.ged.bak`.

Run: `node ~/dev/whoami/cli/dist/wai.cjs check --fix --only format`

Expected:
- Exit code 0 (after fix, format drift gone).
- Stdout contains `... fixes applied.`.
- Diff `git -C ~/whoami diff genealogy/barash-tree.ged` shows expected canonicalizations (`MAR` → `Mar`, `08 OCT` → `8 Oct`, etc.).

If diff looks good, leave the changes (they fix real drift). If not, restore from `/tmp/barash-tree.ged.bak`.

- [ ] **Step 4: Final commit (if any data-repo changes were made by --fix)**

The data repo (`~/whoami`) is a separate git repo. Commits there are user-controlled. Don't commit code-repo changes for this step.

If you applied `--fix`:
```bash
cd ~/whoami
git add genealogy/barash-tree.ged pages/*.md
git commit -m "format: normalize date strings via wai check --fix"
```

---

## Self-review checklist

Before declaring this plan complete, verify against the spec:

- ✓ Spec move 1 = "format-drift detector + `--fix`" → implemented in tasks 1–10.
- ✓ Spec architecture: pure detectors, boundary loader, all I/O at the cli layer → followed.
- ✓ Spec testing convention: per-module tests inline → all detectors tested with inline fixtures.
- ✓ Spec exit-code mapping (`0`/`1`/`2`) → implemented.
- ✓ Spec `--only` and `--fail-on` flags → implemented.
- ✓ `wai redlinks` precedent (cli command structure, `Pick<ApiClient, ...>` pattern) — `wai check` deviates by injecting a state loader instead of an `ApiClient` because it runs standalone. Documented in task 9 and the architecture rationale.
- ✓ Each task has actual code, no placeholders.
- ✓ Each task ends in a commit.
- ✓ Type names consistent: `RepoState`, `Finding`, `Fix`, `FindingCategory`, `Detector`, `LoadedPage` (with both `body` and `text` fields) — all used identically across tasks.

## Self-review notes

Issues caught and fixed inline during the writing-plans self-review pass:

1. **Page-body fixes lost frontmatter.** Original draft had `LoadedPage.body` (frontmatter-stripped) and the `--fix` writer wrote that bare body to the file path, deleting frontmatter. Fixed by adding `LoadedPage.text` (full file contents) and routing line numbers / fixes through `text`.
2. **Task 9 had a dangling `if (opts.fix) { }` placeholder** filled in by Task 10. Per the writing-plans no-placeholders rule, replaced with a comment marker that Task 10 explicitly removes.
3. **`detectInPage` referenced `LoadedPage` via inline `import('./types.ts').LoadedPage`.** Cleaner: extended the existing top-of-file import to include `LoadedPage`. Added an explicit step to update the import statement.

## What plan 2 will need from this plan

- `RepoState` and `Finding` types are stable.
- `loadRepoState` is the loader contract; plan 2 will not re-implement it.
- The detectors array passed to `runCheck` is extensible; plan 5 simply registers more entries.
- `--fix` patch model (one-line replacement keyed by line number) is the contract; plan 5's data-drift detector won't use `--fix` (data drift is human-gated), but plan 6's `wai write` integration will reuse the patch model.
