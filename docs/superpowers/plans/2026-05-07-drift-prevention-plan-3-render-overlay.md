# Drift prevention — Plan 3 of 7: render overlay (data path)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `applyCorrections` into the frontend's data path so that page corrections appear in rendered infoboxes, family-tree labels, and any other surface that consumes derived records — automatically, without per-component changes.

**Architecture:** A new `frontend/lib/corrections.ts` boundary module loads each page's frontmatter `corrections[]`, builds a `Map<recordId, Correction[]>`, and exposes a `correctRecords(records, correctionsMap)` helper. `frontend/lib/family.ts:getCachedDerivedRecords()` calls this helper before returning the records map, so every downstream consumer sees corrected values transparently.

**Tech Stack:** TypeScript, Next.js 16 (frontend), Node 22, `tsx --test`, `node:assert/strict`, `js-yaml`, `gray-matter`.

**Spec reference:** `docs/superpowers/specs/2026-05-07-drift-prevention-design.md` move 3, narrowed: this plan delivers ONLY the data-path overlay. The render-side "corrected" affordance (UI badge / tooltip on overlaid fields) is deferred — it requires UI work in `frontend/components/directives/infobox-person.tsx` which is currently in user WIP. The affordance can be added in a follow-up plan once the frontend lands.

---

## Scope

**In scope:**
- `frontend/lib/corrections.ts` — boundary module: read pages, extract corrections, build map; pure helper to apply corrections to a records map.
- `frontend/lib/family.ts` — single small addition: in `getCachedDerivedRecords()`, apply corrections after loading raw records.
- `frontend/lib/corrections.test.ts` — tests for both the loader and the apply helper.

**Out of scope (later):**
- UI affordance ("corrected — see source" badge in the infobox) — needs `infobox-person.tsx` work which is in user WIP.
- Rendering corrections on family-tree DOT labels — same UI deferral.
- Updating `frontend/components/family/sections/*` to display correction provenance — same.
- `wai promote-corrections` command — plan 4.
- `data-drift` detector — plan 5.

**Conventions adhered to:**
- Boundary modules listed in `core/AGENTS.md`. (`frontend/lib/corrections.ts` lives in frontend, not core, so it's the frontend's own boundary; doesn't need a `core/AGENTS.md` row.)
- Tests use `tsx --test` + `node:test` + `node:assert/strict`.
- Cache invalidation mirrors `getCachedDerivedRecords` — uses pages-dir mtime + a TTL.
- The change to `family.ts` is intentionally minimal (≤4 lines) to keep merge surface small if the user has WIP edits there.

## File structure

```
frontend/lib/corrections.ts        NEW. Boundary loader + apply helper.
frontend/lib/corrections.test.ts   NEW. Unit tests with fixture-based input.
frontend/lib/family.ts             MODIFY. ~4 lines added inside getCachedDerivedRecords.
```

---

## Task 1: `frontend/lib/corrections.ts` — pure apply helper + types

**Files:**
- Create: `frontend/lib/corrections.ts`

- [ ] **Step 1: Implement the pure helper first (no I/O yet)**

Create `frontend/lib/corrections.ts`:

```typescript
import { applyCorrections } from '@core/corrections/overlay.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import type { Correction } from '@core/pages/types.ts';

/** Map of `record id` → list of corrections targeting that record. */
export type CorrectionsMap = ReadonlyMap<string, ReadonlyArray<Correction>>;

/**
 * Apply a corrections map to an entire `Map<recordId, DerivedRecord>`.
 * Pure — returns a new map. Records with no corrections in the map are
 * passed through unchanged (same object reference).
 */
export function correctRecords(
  records: Map<string, DerivedRecord>,
  corrections: CorrectionsMap,
): Map<string, DerivedRecord> {
  if (corrections.size === 0) return records;
  const out = new Map<string, DerivedRecord>();
  for (const [id, record] of records) {
    const cs = corrections.get(id);
    if (!cs || cs.length === 0) {
      out.set(id, record);
      continue;
    }
    out.set(id, applyCorrections(record, [...cs]));
  }
  return out;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/corrections.ts
git commit -m "feat(frontend): pure correctRecords helper for record-map overlay"
```

---

## Task 2: Tests for `correctRecords`

**Files:**
- Create: `frontend/lib/corrections.test.ts`

- [ ] **Step 1: Write the test file**

Create `frontend/lib/corrections.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctRecords, type CorrectionsMap } from './corrections.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import type { Correction } from '@core/pages/types.ts';

function rec(id: string, overrides: Partial<DerivedRecord> = {}): DerivedRecord {
  return {
    record: id,
    name: `Person ${id}`,
    birth: { date: '1900', place: 'Somewhere' },
    death: null,
    parents: [],
    spouses: [],
    children: [],
    residences: [],
    occupations: [],
    sources: [],
    ...overrides,
  };
}

test('correctRecords: empty corrections map returns the same map', () => {
  const records = new Map([['I1', rec('I1')]]);
  const out = correctRecords(records, new Map());
  assert.equal(out, records); // same reference
});

test('correctRecords: record without corrections is passed through unchanged', () => {
  const r = rec('I1');
  const records = new Map([['I1', r]]);
  const corrections: CorrectionsMap = new Map([['I999', [{ field: 'name', value: 'X', source: 's' }]]]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1'), r); // same reference
});

test('correctRecords: applies death.date correction to matching record', () => {
  const records = new Map([['I1', rec('I1')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'death.date', value: '1989', source: 'Find A Grave' }]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.death!.date, '1989');
});

test('correctRecords: does not mutate the input records map', () => {
  const r = rec('I1', { death: { date: '1990', place: 'Rome' } });
  const records = new Map([['I1', r]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'death.date', value: '1989', source: 's' }]],
  ]);
  correctRecords(records, corrections);
  assert.equal(records.get('I1')!.death!.date, '1990'); // original preserved
});

test('correctRecords: applies multiple records independently', () => {
  const records = new Map([['I1', rec('I1')], ['I2', rec('I2')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [{ field: 'name', value: 'Renamed One', source: 's' }]],
    ['I2', [{ field: 'name', value: 'Renamed Two', source: 's' }]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.name, 'Renamed One');
  assert.equal(out.get('I2')!.name, 'Renamed Two');
});

test('correctRecords: multiple corrections on the same record compose', () => {
  const records = new Map([['I1', rec('I1')]]);
  const corrections: CorrectionsMap = new Map([
    ['I1', [
      { field: 'death.date', value: '1989', source: 's1' },
      { field: 'death.place', value: 'Italy', source: 's2' },
    ]],
  ]);
  const out = correctRecords(records, corrections);
  assert.equal(out.get('I1')!.death!.date, '1989');
  assert.equal(out.get('I1')!.death!.place, 'Italy');
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npx tsx --test lib/corrections.test.ts
```

Expected: 6 pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/corrections.test.ts
git commit -m "test(frontend): correctRecords helper tests"
```

---

## Task 3: `loadPageCorrections` boundary loader + tests

**Files:**
- Modify: `frontend/lib/corrections.ts` (add the loader)
- Modify: `frontend/lib/corrections.test.ts` (add tests)

The loader walks the pages dir, extracts each page's frontmatter `corrections[]`, stamps `record` from the page's own `gedcom.record` if absent, and groups by record id.

- [ ] **Step 1: Add failing tests**

Append to `frontend/lib/corrections.test.ts`:

```typescript
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPageCorrections } from './corrections.ts';

function tempPagesDir(pages: Array<{ slug: string; frontmatter: string; body?: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), 'whoami-corrections-test-'));
  for (const p of pages) {
    const content = `---\n${p.frontmatter}\n---\n${p.body ?? ''}`;
    writeFileSync(join(dir, `${p.slug}.md`), content);
  }
  return dir;
}

test('loadPageCorrections: empty pages dir returns empty map', () => {
  const dir = tempPagesDir([]);
  try {
    const out = loadPageCorrections(dir);
    assert.equal(out.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: extracts a correction with explicit record id', () => {
  const dir = tempPagesDir([
    {
      slug: 'a',
      frontmatter: `title: A
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
  - record: I1
    field: death.date
    value: "1989"
    source: "src"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    const cs = out.get('I1');
    assert.ok(cs);
    assert.equal(cs!.length, 1);
    assert.equal(cs![0]!.value, '1989');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: stamps record from page gedcom.record when correction omits it', () => {
  const dir = tempPagesDir([
    {
      slug: 'sofia',
      frontmatter: `title: Sofia
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom:
  file: barash-tree.ged
  record: I372189255251
  snapshot: abc
corrections:
  - field: death.date
    value: "1989"
    source: "src"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    assert.equal(out.size, 1);
    assert.ok(out.get('I372189255251'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: skips correction when record is absent and page has no gedcom block', () => {
  const dir = tempPagesDir([
    {
      slug: 'meta',
      frontmatter: `title: Meta page
owner: x
editors: []
type: meta
aliases: []
categories: []
created: 2026-01-01
corrections:
  - field: death.date
    value: "1989"
    source: "src"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    assert.equal(out.size, 0); // no record id available, correction dropped
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: groups multiple pages targeting the same record', () => {
  const dir = tempPagesDir([
    {
      slug: 'a',
      frontmatter: `title: A
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
    source: "src1"`,
    },
    {
      slug: 'b',
      frontmatter: `title: B
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I2, snapshot: abc }
corrections:
  - record: I1
    field: death.place
    value: "Italy"
    source: "src2"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    const cs = out.get('I1');
    assert.ok(cs);
    assert.equal(cs!.length, 2); // one from page A's own subject, one cross-referenced from B
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPageCorrections: skips pages whose frontmatter fails Zod validation', () => {
  const dir = tempPagesDir([
    { slug: 'broken', frontmatter: `title: ""` }, // invalid: empty title
    {
      slug: 'good',
      frontmatter: `title: Good
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
    source: "src"`,
    },
  ]);
  try {
    const out = loadPageCorrections(dir);
    assert.ok(out.get('I1')); // good page parsed
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify failure**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npx tsx --test lib/corrections.test.ts
```

Expected: 6 new tests fail (`loadPageCorrections` not exported yet).

- [ ] **Step 3: Implement the loader**

Add to the TOP of `frontend/lib/corrections.ts` (the existing imports, then below them — keep existing exports):

```typescript
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { parsePageMeta } from '@core/pages/schema.ts';
import { migrate } from '@core/pages/migrations/index.ts';
```

Append the loader function at the bottom of the file:

```typescript
/**
 * Read all pages in `pagesDir`, extract their frontmatter `corrections[]`,
 * group by target record id (defaulted to the page's own `gedcom.record`
 * when omitted on the correction), and return the resulting map.
 *
 * Boundary module: does file I/O at its public surface. Consumers should
 * call this once per request (or via the cached wrapper) — it walks the
 * pages directory each invocation.
 *
 * Pages whose frontmatter fails schema validation are silently skipped
 * (matches the loader convention in `core/src/checks/load.ts`). A single
 * malformed page does not break the rest of the corrections layer.
 */
export function loadPageCorrections(pagesDir: string): Map<string, Correction[]> {
  const out = new Map<string, Correction[]>();
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
      if (!targetId) continue; // no record to attach this correction to
      const stamped = c.record ? c : { ...c, record: targetId };
      const arr = out.get(targetId) ?? [];
      arr.push(stamped);
      out.set(targetId, arr);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npx tsx --test lib/corrections.test.ts
```

Expected: 12 tests pass (6 prior `correctRecords` + 6 new `loadPageCorrections`).

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/corrections.ts frontend/lib/corrections.test.ts
git commit -m "feat(frontend): loadPageCorrections boundary loader + tests"
```

---

## Task 4: Cached wrapper `getCachedPageCorrections`

**Files:**
- Modify: `frontend/lib/corrections.ts`

Mirror the caching pattern in `frontend/lib/family.ts:getCachedDerivedRecords` so the loader is invoked at most once per request and stays in sync with on-disk pages.

- [ ] **Step 1: Add cached wrapper**

Append to `frontend/lib/corrections.ts`:

```typescript
const PAGES_DIR = join(process.env.WHOAMI_ROOT || join(process.env.HOME || '/tmp', 'whoami'), 'pages');
const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  corrections: Map<string, Correction[]>;
  expiresAt: number;
  mtimeMs: number;
}

let _cache: CacheEntry | null = null;

/**
 * Cached wrapper around `loadPageCorrections`. Reuses the cached map until
 * the pages dir mtime changes or the TTL expires, mirroring the
 * `getCachedDerivedRecords` pattern in `frontend/lib/family.ts`.
 */
export function getCachedPageCorrections(): Map<string, Correction[]> {
  const now = Date.now();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(PAGES_DIR).mtimeMs;
  } catch {
    return new Map();
  }
  if (_cache && _cache.expiresAt > now && _cache.mtimeMs === mtimeMs) {
    return _cache.corrections;
  }
  const corrections = loadPageCorrections(PAGES_DIR);
  _cache = { corrections, expiresAt: now + CACHE_TTL_MS, mtimeMs };
  return corrections;
}
```

- [ ] **Step 2: Typecheck + test**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm run typecheck && npx tsx --test lib/corrections.test.ts
```

Expected: typecheck pass; 12 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/corrections.ts
git commit -m "feat(frontend): getCachedPageCorrections wrapper with mtime+TTL invalidation"
```

---

## Task 5: Wire into `getCachedDerivedRecords()`

**Files:**
- Modify: `frontend/lib/family.ts`

Single small edit — apply corrections to the cached records map before returning.

- [ ] **Step 1: Verify the existing function shape**

Read `frontend/lib/family.ts` lines 273–287 (the `getCachedDerivedRecords` function). Confirm the shape matches:

```typescript
export function getCachedDerivedRecords(): Map<string, DerivedRecord> {
  const now = Date.now();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(DERIVED_DIR).mtimeMs;
  } catch {
    return new Map();
  }
  if (_derivedRecordsCache && _derivedRecordsCache.expiresAt > now && _derivedRecordsCache.mtimeMs === mtimeMs) {
    return _derivedRecordsCache.records;
  }
  const records = loadDerivedRecordsForTree();
  _derivedRecordsCache = { records, expiresAt: now + FILE_CACHE_TTL_MS, mtimeMs };
  return records;
}
```

If the surrounding code differs (different mtimeMs check, different cache structure), adapt the edits below to match — but keep the conceptual change identical.

- [ ] **Step 2: Add imports**

In `frontend/lib/family.ts`, add to the existing imports near the top:

```typescript
import { correctRecords, getCachedPageCorrections } from './corrections.ts';
```

- [ ] **Step 3: Apply corrections in `getCachedDerivedRecords`**

Replace the existing function body with this version:

```typescript
export function getCachedDerivedRecords(): Map<string, DerivedRecord> {
  const now = Date.now();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(DERIVED_DIR).mtimeMs;
  } catch {
    return new Map();
  }
  if (_derivedRecordsCache && _derivedRecordsCache.expiresAt > now && _derivedRecordsCache.mtimeMs === mtimeMs) {
    return _derivedRecordsCache.records;
  }
  const raw = loadDerivedRecordsForTree();
  const records = correctRecords(raw, getCachedPageCorrections());
  _derivedRecordsCache = { records, expiresAt: now + FILE_CACHE_TTL_MS, mtimeMs };
  return records;
}
```

The change: `loadDerivedRecordsForTree()` returns `raw`; we then call `correctRecords(raw, getCachedPageCorrections())` to apply corrections, and cache + return the corrected version.

Note: the cache key still uses derived dir mtime only — page edits won't invalidate the cache for `CACHE_TTL_MS` seconds. This is acceptable because page corrections are rare and the TTL is short. If staler-than-acceptable becomes an issue, plan 6's `wai write` integration can invalidate the cache explicitly.

- [ ] **Step 4: Typecheck + frontend tests**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm run typecheck && npm test 2>&1 | tail -8
```

Expected: typecheck pass; full frontend suite pass (existing + 12 new corrections tests).

- [ ] **Step 5: Smoke test against ~/whoami**

Reset to a known state by adding a small correction to a page, then verify `getCachedDerivedRecords` returns the corrected value.

```bash
cd /Users/nyetwork/dev/whoami/frontend && WHOAMI_ROOT=/Users/nyetwork/whoami npx tsx -e "
import { getCachedDerivedRecords } from './lib/family.ts';
const r = getCachedDerivedRecords();
const sofia = r.get('I372189255251');
console.log('Sofia Krasnova death:', sofia?.death);
"
```

Expected: prints `Sofia Krasnova death: { date: '1989', place: 'Rome, Roma, Lazio, Italy' }` — the corrected value (which already came from the GEDCOM, since plan 1's smoke test fixed the underlying GEDCOM). If the user later adds a `corrections:` entry to `pages/sofia-krasnova.md`, the corrected value would appear here even if the GEDCOM hasn't been updated.

- [ ] **Step 6: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/family.ts
git commit -m "feat(frontend): apply page corrections in getCachedDerivedRecords"
```

---

## Self-review checklist

- ✓ `correctRecords` is pure; no I/O.
- ✓ `loadPageCorrections` is a boundary module (file I/O); skips invalid pages defensively.
- ✓ `getCachedPageCorrections` mirrors the existing `getCachedDerivedRecords` cache pattern (mtime + TTL).
- ✓ The change to `family.ts` is ~3-4 lines (imports + 2 lines in the cached-records function body).
- ✓ Tests cover: empty input, identity passthrough, single correction, multiple records, multi-correction composition, immutability, cross-referenced corrections, malformed page skipping, default-record-stamp behavior.
- ✓ No UI changes — affordance deferred per spec narrowing.

## What plan 4+ will need from this plan

- `loadPageCorrections` and `correctRecords` are the public API for downstream consumers.
- Plan 4's `wai promote-corrections` will use `loadPageCorrections` to enumerate corrections needing promotion.
- Plan 5's `data-drift` detector will compare each correction's `value` against the corresponding field on the *raw* derived record (pre-overlay) to determine if the correction is "active" (overlay required, GEDCOM disagrees) or "promotable" (GEDCOM and page already agree, drop the correction).
- The correction's `record` field is always populated after `loadPageCorrections` (stamped from page's own `gedcom.record` if absent), so downstream consumers don't need to do that defaulting themselves.
