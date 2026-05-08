# Drift prevention — Plan 2 of 7: corrections schema + overlay function

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `corrections[]` frontmatter field (Zod-validated) and a pure `applyCorrections` overlay function. This is the foundation for the corrections layer; no render or detector wiring yet.

**Architecture:** Optional `corrections[]` array in page frontmatter, schema-validated. A pure function `applyCorrections(derived, corrections): DerivedRecord` deep-merges corrections by dotted path. Plan 3 wires it into `frontend/lib/family.ts` for render-time application; plan 5 adds the data-drift detector that compares corrections against derived state.

**Tech Stack:** TypeScript, Zod 4, `tsx --test`, `node:assert/strict`.

**Spec reference:** `docs/superpowers/specs/2026-05-07-drift-prevention-design.md` move 2 + the "Corrections overlay" section.

---

## Scope

**In scope:**
- `core/src/pages/types.ts` — add `Correction` interface, add `corrections: Correction[]` to `PageMeta`
- `core/src/pages/schema.ts` — add `CorrectionSchema`, wire into `PageMetaSchema` with `.default([])`
- `core/src/corrections/overlay.ts` — pure `applyCorrections` function
- `core/src/corrections/index.ts` — barrel export (matches existing `gedcom/index.ts`, `pages/index.ts`, `checks/index.ts` pattern)
- Tests for schema validation + overlay function
- `core/AGENTS.md` — add `corrections/` to Modules table and Pure modules list

**Out of scope (later plans):**
- `frontend/lib/family.ts` integration → plan 3
- Render-side "corrected" affordance → plan 3
- `wai promote-corrections` command → plan 4
- `data-drift` detector that compares corrections against derived YAML → plan 5

## File structure

```
core/src/pages/types.ts             MODIFY. Add Correction interface + field to PageMeta.
core/src/pages/schema.ts            MODIFY. Add CorrectionSchema + wire into PageMetaSchema.
core/src/corrections/types.ts       NEW. Re-exports Correction (boundary for the corrections module).
core/src/corrections/overlay.ts     NEW. Pure applyCorrections function.
core/src/corrections/index.ts       NEW. Barrel export.
core/test/pages/schema.test.ts      MODIFY (or CREATE if missing). Tests for corrections field.
core/test/corrections/overlay.test.ts  NEW. Tests for applyCorrections.
core/AGENTS.md                      MODIFY. Add corrections/ to Modules table + Pure modules list.
```

## Conventions adhered to

- `Correction` lives in `core/src/pages/types.ts` because it's a frontmatter field type. The `corrections/` module re-exports it for callers that want to import without going through `pages/`.
- Pure modules accept data, return data; no I/O.
- Tests use `tsx --test` + `node:test` + `node:assert/strict`.
- Adding `corrections: z.array(CorrectionSchema).default([])` is non-breaking — existing v1 pages parse unchanged. No schema migration needed.
- Field whitelist matches spec: `birth.date | birth.place | death.date | death.place | name`. Extending the whitelist is a follow-up if needed.

---

## Task 1: Add `Correction` type to `core/src/pages/types.ts`

**Files:**
- Modify: `core/src/pages/types.ts`

- [ ] **Step 1: Add the Correction interface and update PageMeta**

In `core/src/pages/types.ts`, find the existing `export interface PageMeta {` block. Above it, add:

```typescript
/**
 * A frontmatter-declared correction to a derived GEDCOM record. Applied
 * at render time by `applyCorrections` (see `core/src/corrections/overlay.ts`).
 *
 * The `record` is optional and defaults to the page's own `gedcom.record`
 * when the renderer collects corrections — pages that override only their
 * own subject can omit it. Pages that correct another individual (e.g. a
 * family overview page correcting a parent's death date) must spell it out.
 *
 * Field whitelist is intentionally narrow at v1; extend the union when a
 * concrete need appears.
 */
export interface Correction {
  record?: string;
  field: 'birth.date' | 'birth.place' | 'death.date' | 'death.place' | 'name';
  value: string;
  source: string;
}
```

Then update `PageMeta` itself — find the existing block and add the `corrections` line at the end (after `deletedAt?`, before the closing `}`):

```typescript
export interface PageMeta {
  // ... existing fields unchanged ...
  deletedAt?: string;
  corrections: Correction[];
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/nyetwork/dev/whoami/core && npm run typecheck`

Expected: PASS — adding an interface and an array field to PageMeta is non-breaking at the type level (the schema parity check at `schema.ts:36` will fail until Task 2 lands, but typecheck alone should still pass — Zod's runtime check is what enforces the parity, not the type system).

If typecheck fails on `_schemaParity`, that's expected and will resolve in Task 2. **If it fails for any other reason, STOP.**

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages/types.ts
git commit -m "feat(core): add Correction type to PageMeta"
```

---

## Task 2: Wire `CorrectionSchema` into `PageMetaSchema`

**Files:**
- Modify: `core/src/pages/schema.ts`

- [ ] **Step 1: Add CorrectionSchema**

In `core/src/pages/schema.ts`, find the existing `GedcomRefSchema` declaration. Below it (and above `PageMetaSchema`), add:

```typescript
const CorrectionSchema = z.object({
  record: z.string().regex(/^I\d+$/).optional(),
  field: z.enum([
    'birth.date',
    'birth.place',
    'death.date',
    'death.place',
    'name',
  ]),
  value: z.string().min(1),
  source: z.string().min(1),
});
```

- [ ] **Step 2: Wire into PageMetaSchema**

Find the existing `PageMetaSchema = z.object({...})` block. Add the `corrections` field at the end of the object literal (after `deletedAt`, before the closing `})`):

```typescript
const PageMetaSchema = z.object({
  // ... existing fields unchanged ...
  deletedAt: z.union([
    z.string(),
    z.date().transform(d => d.toISOString().slice(0, 10))
  ]).optional(),
  corrections: z.array(CorrectionSchema).default([]),
});
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/nyetwork/dev/whoami/core && npm run typecheck`

Expected: PASS. The `_schemaParity` check should now succeed (Zod-inferred type matches `PageMeta`).

- [ ] **Step 4: Run existing test suite (regression check)**

Run: `cd /Users/nyetwork/dev/whoami/core && npm test`

Expected: existing tests pass (currently 268). The `corrections: z.array(...).default([])` means existing pages without the field continue to parse — Zod fills `[]` at parse time.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages/schema.ts
git commit -m "feat(core): wire CorrectionSchema into PageMetaSchema"
```

---

## Task 3: Schema-level tests for the corrections field

**Files:**
- Modify: `core/test/pages/schema.test.ts` (or create if missing — check first with `ls`)

- [ ] **Step 1: Check whether schema test file exists**

Run: `ls /Users/nyetwork/dev/whoami/core/test/pages/`. If `schema.test.ts` exists, append. If not, create it. The minimum surrounding boilerplate (imports + first valid-page fixture) for a NEW file:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageMeta } from '../../src/pages/schema.ts';

const MINIMAL_VALID = {
  schemaVersion: 1,
  title: 'Test',
  owner: 'steven',
  editors: [],
  type: 'person' as const,
  aliases: [],
  categories: [],
  created: '2026-05-07',
};
```

Skip the boilerplate if appending to an existing file (use that file's existing fixtures).

- [ ] **Step 2: Write failing tests**

Append (or, in a new file, add after the boilerplate above):

```typescript
test('parsePageMeta: corrections field defaults to empty array when absent', () => {
  const meta = parsePageMeta(MINIMAL_VALID);
  assert.deepEqual(meta.corrections, []);
});

test('parsePageMeta: accepts a single valid correction', () => {
  const meta = parsePageMeta({
    ...MINIMAL_VALID,
    corrections: [
      { field: 'death.date', value: '1989', source: 'Find A Grave #209496149' },
    ],
  });
  assert.equal(meta.corrections.length, 1);
  assert.equal(meta.corrections[0]!.field, 'death.date');
  assert.equal(meta.corrections[0]!.value, '1989');
  assert.equal(meta.corrections[0]!.source, 'Find A Grave #209496149');
});

test('parsePageMeta: accepts correction with explicit record id', () => {
  const meta = parsePageMeta({
    ...MINIMAL_VALID,
    corrections: [
      { record: 'I372189255251', field: 'death.date', value: '1989', source: 'src' },
    ],
  });
  assert.equal(meta.corrections[0]!.record, 'I372189255251');
});

test('parsePageMeta: rejects correction with invalid record id', () => {
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: [
        { record: 'not-a-record-id', field: 'death.date', value: '1989', source: 'src' },
      ],
    }),
  );
});

test('parsePageMeta: rejects correction with field not in whitelist', () => {
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: [
        { field: 'occupation', value: 'farmer', source: 'src' },
      ],
    }),
  );
});

test('parsePageMeta: rejects correction with empty value or source', () => {
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: [{ field: 'name', value: '', source: 'src' }],
    }),
  );
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: [{ field: 'name', value: 'X', source: '' }],
    }),
  );
});

test('parsePageMeta: corrections is an array — single object rejected', () => {
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: { field: 'name', value: 'X', source: 's' },
    }),
  );
});
```

- [ ] **Step 3: Run the test file**

Run: `cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/pages/schema.test.ts`

Expected: 7 new tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/test/pages/schema.test.ts
git commit -m "test(core): schema-level tests for corrections field"
```

---

## Task 4: `applyCorrections` overlay function — single-field cases

**Files:**
- Create: `core/src/corrections/overlay.ts`
- Create: `core/test/corrections/overlay.test.ts`

- [ ] **Step 1: Write failing tests**

Create `core/test/corrections/overlay.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCorrections } from '../../src/corrections/overlay.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { Correction } from '../../src/pages/types.ts';

function baseRecord(overrides: Partial<DerivedRecord> = {}): DerivedRecord {
  return {
    record: 'I1',
    name: 'Test Person',
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

test('applyCorrections: empty list returns input unchanged', () => {
  const r = baseRecord();
  const out = applyCorrections(r, []);
  assert.deepEqual(out, r);
});

test('applyCorrections: overrides death.date when death is null', () => {
  const r = baseRecord({ death: null });
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1989', source: 'src' },
  ]);
  assert.equal(out.death!.date, '1989');
  assert.equal(out.death!.place, null);
});

test('applyCorrections: overrides death.date when death already exists', () => {
  const r = baseRecord({ death: { date: '1990', place: 'Rome' } });
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1989', source: 'src' },
  ]);
  assert.equal(out.death!.date, '1989');
  assert.equal(out.death!.place, 'Rome'); // preserved
});

test('applyCorrections: overrides birth.place', () => {
  const r = baseRecord({ birth: { date: '1900', place: 'OldName' } });
  const out = applyCorrections(r, [
    { field: 'birth.place', value: 'NewName', source: 'src' },
  ]);
  assert.equal(out.birth!.place, 'NewName');
  assert.equal(out.birth!.date, '1900'); // preserved
});

test('applyCorrections: overrides name', () => {
  const r = baseRecord({ name: 'Old Name' });
  const out = applyCorrections(r, [
    { field: 'name', value: 'New Name', source: 'src' },
  ]);
  assert.equal(out.name, 'New Name');
});

test('applyCorrections: returns a new object — does not mutate input', () => {
  const r = baseRecord({ death: { date: '1990', place: 'Rome' } });
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1989', source: 'src' },
  ]);
  assert.notEqual(out, r);                    // top-level is new
  assert.notEqual(out.death, r.death);        // sub-object is new
  assert.equal(r.death!.date, '1990');        // input preserved
});
```

- [ ] **Step 2: Run the test (verify failure)**

Run: `cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/corrections/overlay.test.ts`

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement applyCorrections**

Create `core/src/corrections/overlay.ts`:

```typescript
import type { DerivedRecord } from '../gedcom/types.ts';
import type { Correction } from '../pages/types.ts';

/**
 * Overlay a list of corrections onto a derived record, returning a new
 * record with the corrections applied. Pure — does not mutate the input.
 *
 * The caller is responsible for filtering corrections to those targeting
 * this record id; ALL corrections passed in are applied unconditionally.
 * (Plan 3's renderer integration will do the filtering.)
 *
 * Corrections apply in list order; later corrections override earlier ones
 * for the same field.
 */
export function applyCorrections(
  derived: DerivedRecord,
  corrections: Correction[],
): DerivedRecord {
  let result = derived;
  for (const c of corrections) {
    result = applyOne(result, c);
  }
  return result;
}

function applyOne(record: DerivedRecord, c: Correction): DerivedRecord {
  switch (c.field) {
    case 'name':
      return { ...record, name: c.value };
    case 'birth.date':
      return {
        ...record,
        birth: { ...(record.birth ?? { date: null, place: null }), date: c.value },
      };
    case 'birth.place':
      return {
        ...record,
        birth: { ...(record.birth ?? { date: null, place: null }), place: c.value },
      };
    case 'death.date':
      return {
        ...record,
        death: { ...(record.death ?? { date: null, place: null }), date: c.value },
      };
    case 'death.place':
      return {
        ...record,
        death: { ...(record.death ?? { date: null, place: null }), place: c.value },
      };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/corrections/overlay.test.ts`

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/corrections/overlay.ts core/test/corrections/overlay.test.ts
git commit -m "feat(core): pure applyCorrections overlay function"
```

---

## Task 5: `applyCorrections` — multi-correction cases

**Files:**
- Modify: `core/test/corrections/overlay.test.ts`

- [ ] **Step 1: Append tests**

```typescript
test('applyCorrections: multiple corrections on different fields compose', () => {
  const r = baseRecord();
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1989', source: 's1' },
    { field: 'death.place', value: 'Italy', source: 's2' },
  ]);
  assert.equal(out.death!.date, '1989');
  assert.equal(out.death!.place, 'Italy');
});

test('applyCorrections: later correction on the same field wins', () => {
  const r = baseRecord();
  const out = applyCorrections(r, [
    { field: 'death.date', value: '1988', source: 's1' },
    { field: 'death.date', value: '1989', source: 's2' },
  ]);
  assert.equal(out.death!.date, '1989');
});

test('applyCorrections: idempotent — applying the same list twice yields the same result', () => {
  const r = baseRecord();
  const corrections: Correction[] = [
    { field: 'death.date', value: '1989', source: 's' },
    { field: 'name', value: 'Renamed', source: 's' },
  ];
  const once = applyCorrections(r, corrections);
  const twice = applyCorrections(once, corrections);
  assert.deepEqual(twice, once);
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/nyetwork/dev/whoami/core && npx tsx --test test/corrections/overlay.test.ts`

Expected: 9 tests pass (6 prior + 3 new).

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/test/corrections/overlay.test.ts
git commit -m "test(core): applyCorrections multi-correction and idempotency"
```

---

## Task 6: Barrel export + AGENTS.md docs

**Files:**
- Create: `core/src/corrections/index.ts`
- Modify: `core/AGENTS.md`

- [ ] **Step 1: Create barrel**

Create `core/src/corrections/index.ts`:

```typescript
export * from './overlay.ts';
```

(Mirror the minimal-barrel pattern from `core/src/checks/index.ts` — re-exports only what the module ships. The `Correction` type lives in `core/src/pages/types.ts` and is imported from there by callers; we don't re-export it here to keep the source-of-truth single.)

- [ ] **Step 2: Update `core/AGENTS.md`**

In the `## Modules` table, add a row for `corrections/`. Insert it after `checks/` (or near it — between `checks/` and `format/`):

```
| `corrections/`  | Pure overlay logic for page-frontmatter corrections (`applyCorrections`). |
```

In the `## Pure modules vs. boundary modules` section's "Pure" list, find where `checks/format-drift.ts` is listed and add a bullet for `core/src/corrections/overlay.ts` adjacent to it.

- [ ] **Step 3: Verify**

Run: `cd /Users/nyetwork/dev/whoami/core && npm test 2>&1 | tail -8`

Expected: full suite pass — `268 prior + 7 schema + 9 overlay = 284 tests` (or thereabouts; small drift is fine if your prior count differed).

- [ ] **Step 4: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/corrections/index.ts core/AGENTS.md
git commit -m "docs(core): document corrections module in AGENTS.md"
```

---

## Self-review checklist

Verify against the plan and spec before declaring complete:

- ✓ `Correction` interface is in `core/src/pages/types.ts` (single source of truth) and re-imported elsewhere; no duplication.
- ✓ `corrections` field is `z.array(...).default([])` — non-breaking; existing pages parse unchanged.
- ✓ Field whitelist matches spec: 5 specific dotted paths.
- ✓ `record:` is optional in the schema (caller stamps from `page.gedcom.record` at integration time).
- ✓ `applyCorrections` is a pure function — no I/O, no mutation, returns new object.
- ✓ Tests cover: defaults, valid/invalid corrections at the schema level, all 5 field paths, multi-correction composition, idempotency, immutability.
- ✓ Barrel export at `core/src/corrections/index.ts` matches the existing pattern.
- ✓ `AGENTS.md` Modules table and Pure modules list both updated.
- ✓ Each task ends in a single commit with a clear message.

## What plan 3 will need from this plan

- `Correction` type stable, importable from `core/src/pages/types.ts`.
- `applyCorrections(derived, corrections): DerivedRecord` is the contract; plan 3 calls it from `frontend/lib/family.ts` after collecting corrections from all pages and filtering by record id.
- The `record:` optional default is intentional — plan 3's collector stamps `record = page.gedcom.record` when absent before filtering.
- Schema validation already rejects malformed corrections at page-load time, so the renderer can trust its inputs.
