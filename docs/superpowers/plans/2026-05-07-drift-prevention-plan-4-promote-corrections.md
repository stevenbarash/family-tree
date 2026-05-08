# Drift prevention — Plan 4 of 7: `wai promote-corrections`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the human-gated CLI command that takes a frontmatter `Correction` and writes it back to the GEDCOM as a permanent edit (with provenance NOTE), then removes the now-redundant correction from the page.

**Architecture:** Pure `planPromote(gedcomText, pageText, correction): PromoteResult` computes the GEDCOM line edit + page rewrite without touching disk. Boundary `applyPromote` writes both files. CLI command runs standalone (no API), matching `wai check`'s precedent. After `--apply`, the user runs `wai sync-gedcom` separately to regenerate derived YAMLs (we don't auto-trigger that — keeps this command's blast radius bounded to the two files it edits).

**Tech Stack:** TypeScript, Node 22, `tsx --test`, `node:assert/strict`, `js-yaml`, `gray-matter`.

**Spec reference:** `docs/superpowers/specs/2026-05-07-drift-prevention-design.md` move 4 + the "`wai promote-corrections`" subsection.

---

## Scope

**In scope:**
- `core/src/corrections/promote.ts` — pure `planPromote` + boundary `applyPromote`
- Test fixtures + per-function tests for the GEDCOM editor and the page rewriter
- `cli/src/commands/promote-corrections.ts` — CLI command (dry-run by default; `--apply` writes)
- `cli/src/index.ts` — register `promote-corrections` subcommand + help block
- Extend `frontend/lib/corrections.ts:loadPageCorrections` to surface the source page path (per plan 3's review note)

**Out of scope:**
- Auto-triggering `wai sync-gedcom` after promote — user runs manually. Keeps this command's blast radius to two files.
- `--all` mode (promote every correction in the repo) — defer; v1 ships per-record. Adding `--all` later is a thin loop on top of the per-record path.
- Bulk corrections from non-frontmatter sources (e.g., a `corrections.yml` overlay) — out of scope for plan 4 entirely.
- Promoting `name` corrections — the field whitelist allows it but there's no obvious target line in the GEDCOM (`1 NAME` exists but renaming has cascade effects across `2 GIVN`, `2 SURN`). v1 supports `birth.date | birth.place | death.date | death.place` only; `name` raises an error suggesting manual edit.

## File structure

```
core/src/corrections/promote.ts          NEW. Pure planPromote + boundary applyPromote.
core/test/corrections/promote.test.ts    NEW. Per-function tests with inline GEDCOM/page fixtures.
cli/src/commands/promote-corrections.ts  NEW. CLI command, standalone (no API client).
cli/test/promote-corrections.test.ts     NEW. Fake-loader/writer tests.
cli/src/index.ts                         MODIFY. Register subcommand + Quality help block.
frontend/lib/corrections.ts              MODIFY. Add page-path field to returned corrections (plan-3 review note).
frontend/lib/corrections.test.ts         MODIFY. Update tests to assert page-path tracking.
```

## Conventions adhered to

- Pure module / boundary module split per `core/AGENTS.md`. `planPromote` is pure; `applyPromote` does file I/O.
- `wai promote-corrections` is the SECOND standalone CLI command (after `wai check`). No API client used. Matches the architecture-audit migration direction.
- Tests use `tsx --test` + `node:test` + `node:assert/strict`.
- The CLI shell injects `loadState` / `writeFile` for testability (same pattern as `wai check`).

---

## Task 1: Move corrections loader to `core/`, add page-source variant

The CLI cannot import from `frontend/` (dependency direction: `frontend → core`, `cli → core`, never `cli → frontend`). Plan 3's loader currently lives in `frontend/lib/corrections.ts` — move the loader part to `core/src/corrections/load.ts`, then re-export it from the frontend file so plan-3's existing callers don't break.

The pure helper `correctRecords` STAYS in frontend (it's tied to render-side use) — only the boundary loader moves.

**Files:**
- Create: `core/src/corrections/load.ts`
- Create: `core/test/corrections/load.test.ts`
- Modify: `frontend/lib/corrections.ts` (replace inline loader with re-export)
- Modify: `frontend/lib/corrections.test.ts` (update imports if needed)

- [ ] **Step 1: Create the new core module**

Create `core/src/corrections/load.ts`:

```typescript
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { parsePageMeta } from '../pages/schema.ts';
import { migrate } from '../pages/migrations/index.ts';
import type { Correction } from '../pages/types.ts';

/** A page correction with its source page path attached. */
export interface SourcedCorrection extends Correction {
  /** Absolute path of the page file the correction came from. */
  sourcePagePath: string;
}

/**
 * Walk `pagesDir`, extract each page's frontmatter `corrections[]`,
 * group by target record id (defaulted to the page's own `gedcom.record`
 * when omitted on the correction). Boundary module — does file I/O.
 *
 * Pages whose frontmatter fails Zod validation are silently skipped.
 */
export function loadPageCorrections(pagesDir: string): Map<string, Correction[]> {
  const out = new Map<string, Correction[]>();
  for (const c of loadPageCorrectionsWithSource(pagesDir)) {
    const arr = out.get(c.record!) ?? [];
    // Drop the sourcePagePath when storing in the grouped map (callers don't need it).
    const { sourcePagePath, ...rest } = c;
    arr.push(rest);
    out.set(c.record!, arr);
  }
  return out;
}

/**
 * Like `loadPageCorrections`, but returns a flat list of corrections each
 * tagged with the source page file path. Useful for tools that need to
 * rewrite the source page (e.g. `wai promote-corrections`).
 */
export function loadPageCorrectionsWithSource(pagesDir: string): SourcedCorrection[] {
  const out: SourcedCorrection[] = [];
  if (!existsSync(pagesDir)) return out;
  const entries = readdirSync(pagesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const path = join(pagesDir, entry.name);
    const raw = readFileSync(path, 'utf-8');
    const parsed = matter(raw);
    const fmRaw = parsed.data ?? {};
    const fmVersion = typeof fmRaw.schemaVersion === 'number' ? fmRaw.schemaVersion : 1;
    let meta;
    try {
      const migrated = migrate(fmRaw, fmVersion);
      meta = parsePageMeta(migrated);
    } catch {
      continue;
    }
    if (!meta.corrections || meta.corrections.length === 0) continue;
    const pageRecord = meta.gedcom?.record;
    for (const c of meta.corrections) {
      const targetId = c.record ?? pageRecord;
      if (!targetId) continue;
      const stamped = c.record ? c : { ...c, record: targetId };
      out.push({ ...stamped, sourcePagePath: path });
    }
  }
  return out;
}
```

- [ ] **Step 2: Create test for the new core module**

Create `core/test/corrections/load.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPageCorrectionsWithSource, loadPageCorrections } from '../../src/corrections/load.ts';

function tempPagesDir(pages: Array<{ slug: string; frontmatter: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), 'whoami-corrections-test-'));
  for (const p of pages) {
    writeFileSync(join(dir, `${p.slug}.md`), `---\n${p.frontmatter}\n---\n`);
  }
  return dir;
}

const VALID_PAGE = `title: Sofia
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I1, snapshot: abc }
corrections:
  - field: death.date
    value: "1989"
    source: "src"`;

test('loadPageCorrectionsWithSource: tags each correction with source page path', () => {
  const dir = tempPagesDir([{ slug: 'sofia', frontmatter: VALID_PAGE }]);
  try {
    const out = loadPageCorrectionsWithSource(dir);
    assert.equal(out.length, 1);
    assert.match(out[0]!.sourcePagePath, /sofia\.md$/);
    assert.equal(out[0]!.value, '1989');
    assert.equal(out[0]!.record, 'I1'); // stamped from page.gedcom.record
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: groups by record id', () => {
  const dir = tempPagesDir([{ slug: 'sofia', frontmatter: VALID_PAGE }]);
  try {
    const out = loadPageCorrections(dir);
    assert.equal(out.size, 1);
    assert.equal(out.get('I1')!.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrectionsWithSource: empty dir returns empty array', () => {
  const dir = tempPagesDir([]);
  try {
    assert.deepEqual(loadPageCorrectionsWithSource(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Update `frontend/lib/corrections.ts` to re-export**

Open `frontend/lib/corrections.ts`. Find the existing `loadPageCorrections` function and the `getCachedPageCorrections` wrapper. Replace the loader implementation with re-exports while keeping the cached wrapper local (since it imports `process.env`).

The new structure:

```typescript
// At the top, replace any node:fs/path/gray-matter/parsePageMeta/migrate imports
// with the re-export below. Keep the existing imports for `applyCorrections`,
// types, and `statSync`/`join` (used by the cache wrapper).

import { statSync } from 'node:fs';
import { join } from 'node:path';
import { applyCorrections } from '@core/corrections/overlay.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import type { Correction } from '@core/pages/types.ts';

// Re-export the boundary loaders from core.
export { loadPageCorrections, loadPageCorrectionsWithSource } from '@core/corrections/load.ts';
export type { SourcedCorrection } from '@core/corrections/load.ts';
import { loadPageCorrections } from '@core/corrections/load.ts';

// (Keep the existing CorrectionsMap type, correctRecords function, and
//  getCachedPageCorrections wrapper as they were — those are frontend-specific.
//  Only the inline boundary loader is replaced by the import above.)
```

The plan-3 implementation of `getCachedPageCorrections` calls `loadPageCorrections(PAGES_DIR)` — that import line above provides the function.

- [ ] **Step 4: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections/core && npx tsx --test test/corrections/load.test.ts
```

Expected: 3 pass.

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections/frontend && npm run typecheck && npm test 2>&1 | tail -5
```

Expected: typecheck pass; existing frontend corrections tests still pass (the re-export means `frontend/lib/corrections.ts` exposes the same names).

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections
git add core/src/corrections/load.ts core/test/corrections/load.test.ts frontend/lib/corrections.ts
git commit -m "refactor(core): move corrections loader to core; add SourcedCorrection variant"
```

---

## Task 2: Pure `planPromote` — locate event line + compute edits

The pure planner takes the GEDCOM text + page text + a correction, returns the planned edits without touching disk.

**Files:**
- Create: `core/src/corrections/promote.ts`
- Create: `core/test/corrections/promote.test.ts`

- [ ] **Step 1: Define types and write failing tests**

Create `core/test/corrections/promote.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPromote } from '../../src/corrections/promote.ts';

const FIXTURE_GEDCOM = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME John /Doe/
2 GIVN John
2 SURN Doe
1 BIRT
2 DATE 1900
2 PLAC Brooklyn
1 DEAT
2 DATE 1990
2 PLAC Rome
0 @I2@ INDI
1 NAME Jane /Doe/
2 GIVN Jane
2 SURN Doe
1 DEAT
2 DATE 1985
0 TRLR
`;

const FIXTURE_PAGE = `---
title: John
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom:
  file: barash-tree.ged
  record: I1
  snapshot: abc
corrections:
  - field: death.date
    value: "1989"
    source: "Find A Grave #209496149"
---
Body content here.
`;

test('planPromote: updates death.date for existing DEAT block', () => {
  const result = planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'Find A Grave #209496149',
  });
  assert.match(result.gedcomText, /1 DEAT\n2 DATE 1989\n/);
  assert.match(result.gedcomText, /2 NOTE Find A Grave #209496149/);
  assert.doesNotMatch(result.gedcomText, /2 DATE 1990/);
});

test('planPromote: removes the correction from page frontmatter', () => {
  const result = planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'src',
  });
  assert.doesNotMatch(result.pageText, /corrections:/);
  assert.match(result.pageText, /title: John/);
  assert.match(result.pageText, /Body content here/);
});

test('planPromote: errors when record id is not found in GEDCOM', () => {
  assert.throws(
    () =>
      planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
        record: 'I999',
        field: 'death.date',
        value: '1989',
        source: 'src',
      }),
    /not found/i,
  );
});

test('planPromote: errors on `name` field (v1 limitation)', () => {
  assert.throws(
    () =>
      planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
        record: 'I1',
        field: 'name',
        value: 'New Name',
        source: 'src',
      }),
    /name.*not supported/i,
  );
});

test('planPromote: adds a DATE line when DEAT block has none', () => {
  const ged = `0 @I1@ INDI
1 NAME X //
1 DEAT
0 TRLR
`;
  const page = `---
title: X
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I1, snapshot: abc }
corrections:
  - field: death.date
    value: "1989"
    source: "src"
---
`;
  const result = planPromote(ged, page, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'src',
  });
  assert.match(result.gedcomText, /1 DEAT\n2 DATE 1989/);
});

test('planPromote: adds a DEAT block when none exists', () => {
  const ged = `0 @I1@ INDI
1 NAME X //
1 BIRT
2 DATE 1900
0 TRLR
`;
  const page = `---
title: X
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I1, snapshot: abc }
corrections:
  - field: death.date
    value: "1989"
    source: "src"
---
`;
  const result = planPromote(ged, page, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'src',
  });
  assert.match(result.gedcomText, /1 DEAT\n2 DATE 1989\n2 NOTE src/);
});

test('planPromote: updates death.place', () => {
  const result = planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
    record: 'I1',
    field: 'death.place',
    value: 'Italy',
    source: 'src',
  });
  assert.match(result.gedcomText, /1 DEAT\n2 DATE 1990\n2 PLAC Italy\n/);
  assert.doesNotMatch(result.gedcomText, /2 PLAC Rome/);
});

test('planPromote: leaves OTHER individuals’ records untouched', () => {
  const result = planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'src',
  });
  // I2's DEAT/DATE 1985 must survive
  assert.match(result.gedcomText, /0 @I2@ INDI[\s\S]+?1 DEAT\n2 DATE 1985/);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections/core && npx tsx --test test/corrections/promote.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `planPromote`**

Create `core/src/corrections/promote.ts`:

```typescript
import matter from 'gray-matter';
import yaml from 'js-yaml';

export interface PromoteInput {
  record: string;
  field: 'birth.date' | 'birth.place' | 'death.date' | 'death.place' | 'name';
  value: string;
  source: string;
}

export interface PromoteResult {
  gedcomText: string;
  pageText: string;
}

const SUPPORTED_FIELDS = new Set([
  'birth.date',
  'birth.place',
  'death.date',
  'death.place',
] as const);

/**
 * Pure planner: compute the GEDCOM and page edits for promoting one
 * correction. Does not touch disk. Returns the new file contents for both.
 *
 * Throws when:
 * - The record id is not present in the GEDCOM.
 * - The field is `name` (v1 limitation — see plan 4 scope).
 */
export function planPromote(
  gedcomText: string,
  pageText: string,
  input: PromoteInput,
): PromoteResult {
  if (input.field === 'name') {
    throw new Error(
      'planPromote: `name` field promotion is not supported in v1. ' +
        'Edit the GEDCOM 1 NAME line manually (cascade effects on 2 GIVN/SURN).',
    );
  }
  if (!SUPPORTED_FIELDS.has(input.field as Exclude<PromoteInput['field'], 'name'>)) {
    throw new Error(`planPromote: unsupported field "${input.field}"`);
  }

  const newGedcom = updateGedcomEvent(gedcomText, input);
  const newPage = removeCorrectionFromPage(pageText, input);
  return { gedcomText: newGedcom, pageText: newPage };
}

function updateGedcomEvent(text: string, input: PromoteInput): string {
  const lines = text.split('\n');
  const recordHeader = `0 @${input.record}@`;
  let recordStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith(recordHeader)) {
      recordStart = i;
      break;
    }
  }
  if (recordStart === -1) {
    throw new Error(`planPromote: record "${input.record}" not found in GEDCOM`);
  }

  // Find the end of this record (next `0 ` line or EOF)
  let recordEnd = lines.length;
  for (let i = recordStart + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('0 ')) {
      recordEnd = i;
      break;
    }
  }

  const eventTag = input.field.startsWith('birth.') ? 'BIRT' : 'DEAT';
  const subTag = input.field.endsWith('.date') ? 'DATE' : 'PLAC';

  // Find the event block within [recordStart, recordEnd)
  let eventStart = -1;
  for (let i = recordStart + 1; i < recordEnd; i++) {
    if (lines[i] === `1 ${eventTag}`) {
      eventStart = i;
      break;
    }
  }

  // If event block is missing, append before recordEnd
  if (eventStart === -1) {
    const insertion = [
      `1 ${eventTag}`,
      `2 ${subTag} ${input.value}`,
      `2 NOTE ${input.source}`,
    ];
    lines.splice(recordEnd, 0, ...insertion);
    return lines.join('\n');
  }

  // Find the end of this event block (next `1 ` line or recordEnd)
  let eventEnd = recordEnd;
  for (let i = eventStart + 1; i < recordEnd; i++) {
    if (lines[i]!.startsWith('1 ')) {
      eventEnd = i;
      break;
    }
  }

  // Find the existing sub-tag line within [eventStart+1, eventEnd)
  let subLineIdx = -1;
  for (let i = eventStart + 1; i < eventEnd; i++) {
    if (lines[i]!.startsWith(`2 ${subTag} `) || lines[i] === `2 ${subTag}`) {
      subLineIdx = i;
      break;
    }
  }

  if (subLineIdx === -1) {
    // Sub-tag missing — insert it right after the `1 EVENT` line
    lines.splice(eventStart + 1, 0, `2 ${subTag} ${input.value}`);
    eventEnd += 1;
  } else {
    lines[subLineIdx] = `2 ${subTag} ${input.value}`;
  }

  // Append a NOTE line at the end of the event block
  lines.splice(eventEnd, 0, `2 NOTE ${input.source}`);

  return lines.join('\n');
}

function removeCorrectionFromPage(pageText: string, input: PromoteInput): string {
  const parsed = matter(pageText);
  const data = parsed.data as { corrections?: Array<{ record?: string; field: string; value: string; source: string }> };
  if (!Array.isArray(data.corrections)) return pageText;
  const filtered = data.corrections.filter(c => {
    const target = c.record ?? (parsed.data as any).gedcom?.record;
    return !(
      target === input.record &&
      c.field === input.field &&
      c.value === input.value &&
      c.source === input.source
    );
  });
  if (filtered.length === data.corrections.length) {
    // No matching correction found — leave page untouched.
    return pageText;
  }
  if (filtered.length === 0) {
    delete data.corrections;
  } else {
    (data as any).corrections = filtered;
  }
  return matter.stringify(parsed.content, data, { lineWidth: -1 });
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections/core && npx tsx --test test/corrections/promote.test.ts 2>&1 | tail -8
```

Expected: 8 pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections
git add core/src/corrections/promote.ts core/test/corrections/promote.test.ts
git commit -m "feat(core): planPromote — pure GEDCOM editor for correction promotion"
```

---

## Task 3: Boundary `applyPromote`

The boundary wrapper writes the planned changes to disk.

**Files:**
- Modify: `core/src/corrections/promote.ts`

- [ ] **Step 1: Append boundary function**

Add at the bottom of `core/src/corrections/promote.ts`:

```typescript
import { readFileSync, writeFileSync } from 'node:fs';

export interface ApplyPromoteOptions extends PromoteInput {
  gedcomPath: string;
  pagePath: string;
}

/**
 * Boundary: read the GEDCOM and page from disk, plan the promotion,
 * and write the changes back. Returns the planned result for inspection.
 *
 * Caller is responsible for triggering `wai sync-gedcom` afterwards
 * to regenerate `derived/*.yml`.
 */
export function applyPromote(opts: ApplyPromoteOptions): PromoteResult {
  const gedcomText = readFileSync(opts.gedcomPath, 'utf-8');
  const pageText = readFileSync(opts.pagePath, 'utf-8');
  const result = planPromote(gedcomText, pageText, opts);
  writeFileSync(opts.gedcomPath, result.gedcomText);
  writeFileSync(opts.pagePath, result.pageText);
  return result;
}
```

Note: the `import` at the top of the file should be moved to the top with the other imports. Reorganize so all imports are at the top of the file.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections/core && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections
git add core/src/corrections/promote.ts
git commit -m "feat(core): applyPromote boundary that writes planPromote results"
```

---

## Task 4: CLI command `wai promote-corrections`

**Files:**
- Create: `cli/src/commands/promote-corrections.ts`
- Create: `cli/test/promote-corrections.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/test/promote-corrections.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPromoteCorrections } from '../src/commands/promote-corrections.js';
import type { SourcedCorrection } from '@core/corrections/promote.ts';

const sample: SourcedCorrection = {
  record: 'I1',
  field: 'death.date',
  value: '1989',
  source: 'Find A Grave #209496149',
  sourcePagePath: '/tmp/x/pages/sofia.md',
};

test('promote-corrections: dry-run prints planned diff and does not write', async () => {
  let out = '';
  let writes = 0;
  const code = await runPromoteCorrections({
    record: 'I1',
    apply: false,
    gedcomPath: '/tmp/x/g.ged',
    pagesDir: '/tmp/x/pages',
    loadCorrections: () => [sample],
    readFile: (path) => {
      if (path === '/tmp/x/g.ged') return '0 @I1@ INDI\n1 DEAT\n2 DATE 1990\n0 TRLR\n';
      if (path === '/tmp/x/pages/sofia.md') return '---\ntitle: X\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: 2026-01-01\ngedcom: { file: barash-tree.ged, record: I1, snapshot: abc }\ncorrections:\n  - field: death.date\n    value: "1989"\n    source: "Find A Grave #209496149"\n---\n';
      throw new Error('unknown path: ' + path);
    },
    writeFile: () => { writes += 1; },
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(writes, 0);
  assert.match(out, /1989/);
  assert.match(out, /Find A Grave/);
  assert.match(out, /dry-run|would write/i);
});

test('promote-corrections --apply: writes both files and reports', async () => {
  let out = '';
  const writes: Array<{ path: string; content: string }> = [];
  const code = await runPromoteCorrections({
    record: 'I1',
    apply: true,
    gedcomPath: '/tmp/x/g.ged',
    pagesDir: '/tmp/x/pages',
    loadCorrections: () => [sample],
    readFile: (path) => {
      if (path === '/tmp/x/g.ged') return '0 @I1@ INDI\n1 DEAT\n2 DATE 1990\n0 TRLR\n';
      if (path === '/tmp/x/pages/sofia.md') return '---\ntitle: X\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: 2026-01-01\ngedcom: { file: barash-tree.ged, record: I1, snapshot: abc }\ncorrections:\n  - field: death.date\n    value: "1989"\n    source: "Find A Grave #209496149"\n---\n';
      throw new Error('unknown path: ' + path);
    },
    writeFile: (path, content) => writes.push({ path, content }),
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(writes.length, 2);
  assert.ok(writes.find(w => w.path === '/tmp/x/g.ged' && /2 DATE 1989/.test(w.content)));
  assert.ok(writes.find(w => w.path.endsWith('.md') && !/corrections:/.test(w.content)));
  assert.match(out, /promoted/i);
});

test('promote-corrections: exits 1 when no correction matches the record', async () => {
  let outErr = '';
  const code = await runPromoteCorrections({
    record: 'I999',
    apply: false,
    gedcomPath: '/tmp/x/g.ged',
    pagesDir: '/tmp/x/pages',
    loadCorrections: () => [sample],
    readFile: () => '',
    writeFile: () => {},
    write: () => {},
    writeErr: (s) => { outErr += s; },
  });
  assert.equal(code, 1);
  assert.match(outErr, /no.*correction.*found/i);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections/cli && npx tsx --test test/promote-corrections.test.ts
```

- [ ] **Step 3: Implement command**

Create `cli/src/commands/promote-corrections.ts`:

```typescript
import { planPromote, type PromoteInput } from '@core/corrections/promote.ts';
import type { SourcedCorrection } from '@core/corrections/promote.ts';

export interface PromoteCorrectionsOptions {
  record: string;
  apply: boolean;
  gedcomPath: string;
  pagesDir: string;
  loadCorrections: (pagesDir: string) => SourcedCorrection[];
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runPromoteCorrections(opts: PromoteCorrectionsOptions): Promise<number> {
  const all = opts.loadCorrections(opts.pagesDir);
  const matching = all.filter(c => c.record === opts.record);
  if (matching.length === 0) {
    opts.writeErr(`no corrections found for record ${opts.record}\n`);
    return 1;
  }

  const gedcomText = opts.readFile(opts.gedcomPath);
  let promoted = 0;
  for (const c of matching) {
    const pageText = opts.readFile(c.sourcePagePath);
    const input: PromoteInput = {
      record: c.record!,
      field: c.field,
      value: c.value,
      source: c.source,
    };
    let result;
    try {
      result = planPromote(gedcomText, pageText, input);
    } catch (e) {
      opts.writeErr(`failed to plan ${c.record} ${c.field}: ${(e as Error).message}\n`);
      continue;
    }

    if (opts.apply) {
      opts.writeFile(opts.gedcomPath, result.gedcomText);
      opts.writeFile(c.sourcePagePath, result.pageText);
      opts.write(`promoted ${c.record} ${c.field} = "${c.value}" → ${c.sourcePagePath}\n`);
      promoted += 1;
    } else {
      opts.write(`would write ${c.record} ${c.field} = "${c.value}" (dry-run)\n`);
      opts.write(`  source: ${c.source}\n`);
      opts.write(`  page:   ${c.sourcePagePath}\n`);
    }
  }

  if (!opts.apply) {
    opts.write(`\n${matching.length} correction${matching.length === 1 ? '' : 's'} ready to promote. Re-run with --apply.\n`);
  } else if (promoted > 0) {
    opts.write(`\nRun \`wai sync-gedcom\` to regenerate derived/*.yml from the updated GEDCOM.\n`);
  }

  return 0;
}
```

- [ ] **Step 4: Run tests**

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections
git add cli/src/commands/promote-corrections.ts cli/test/promote-corrections.test.ts
git commit -m "feat(cli): wai promote-corrections command (dry-run + --apply)"
```

---

## Task 5: Wire into `cli/src/index.ts`

**Files:**
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Add help block**

In the `HELP` constant, locate the `Quality:` section (added in plan 1). Add a `promote-corrections` row to it:

```
Quality:
  check                       Run all drift detectors. Exit 1 if findings.
        [--fix]                 Apply safe auto-fixes (format, schema)
        [--only A,B]            Only run detectors for categories
        [--fail-on A,B]         Exit 1 only on findings in these categories
        [--json]                Machine-readable output
  promote-corrections         Promote a frontmatter correction to the GEDCOM.
        --record I...           Record id whose corrections to promote
        [--apply]               Write changes (default: dry-run)
```

- [ ] **Step 2: Add imports**

Task 1 moved the loader to core, so the CLI imports from there:

```typescript
import { runPromoteCorrections } from './commands/promote-corrections.js';
import { loadPageCorrectionsWithSource } from '@core/corrections/load.ts';
```

`readFileSync`, `writeFileSync`, and `resolve` are already imported from plan 1's `check` wiring — don't duplicate. If `writeFileSync` is missing, add it to the existing `node:fs` import; same for `resolve` from `node:path`.

- [ ] **Step 3: Add dispatch case**

Add a new case in the switch, near the `check` case:

```typescript
      case 'promote-corrections': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const recordArg = args.flags.record;
        if (typeof recordArg !== 'string' || !/^I\d+$/.test(recordArg)) {
          process.stderr.write('promote-corrections: --record I<digits> required\n');
          return 2;
        }
        const code = await runPromoteCorrections({
          record: recordArg,
          apply: !!args.flags.apply,
          gedcomPath: resolve(root, 'genealogy', 'barash-tree.ged'),
          pagesDir: resolve(root, 'pages'),
          loadCorrections: loadPageCorrectionsWithSource,
          readFile: (p) => readFileSync(p, 'utf-8'),
          writeFile: (p, c) => writeFileSync(p, c),
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        return code;
      }
```

- [ ] **Step 4: Build + smoke test**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections/cli && npm run typecheck && npm run build
```

Then manual smoke against `~/whoami` (won't have any active corrections today since plan 1 already promoted everything via direct GEDCOM edits, but the no-corrections path should exit 1 cleanly):

```bash
WHOAMI_ROOT=/Users/nyetwork/whoami node /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections/cli/dist/wai.cjs promote-corrections --record I372189255251
```

Expected: stderr `no corrections found for record I372189255251`, exit code 1.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-4-promote-corrections
git add cli/src/index.ts
git commit -m "feat(cli): register wai promote-corrections subcommand"
```

---

## Self-review checklist

- ✓ `planPromote` is pure (no I/O, no fs/process imports above the function).
- ✓ `applyPromote` is the only boundary in `promote.ts`.
- ✓ Field whitelist: birth.date, birth.place, death.date, death.place. `name` errors with a clear message.
- ✓ Tests cover: existing event-block update, missing-DATE add, missing-event-block add, place updates, multiple-individual non-interference, page-frontmatter rewrite, name error, unknown-record error.
- ✓ CLI: dry-run by default, `--apply` writes, exits 1 on no-match.
- ✓ `cli` doesn't import from `frontend`. The shared loader (`loadPageCorrectionsWithSource`) lives in `core`.
- ✓ `core/AGENTS.md` boundary table gets `corrections/load.ts` and `corrections/promote.ts` rows (do this in the final commit).
- ✓ The CLI command does NOT auto-trigger `wai sync-gedcom`; the user runs that manually after promote.

## What plan 5+ will need

- Plan 5's `data-drift` detector enumerates corrections via `loadPageCorrectionsWithSource`, compares each value to the corresponding raw `DerivedRecord` field, and classifies as "active" (overlay required) or "promotable" (drop or run promote). Plan 5's report can suggest the exact `wai promote-corrections --record I...` invocation.
- Plan 6's `wai write` integration may want to invalidate `getCachedPageCorrections`'s cache when a page is written — easy follow-up.
