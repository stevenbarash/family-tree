# Drift prevention — Plan 5 of 7: data/schema/coverage detectors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the three remaining drift detectors (`data-drift`, `schema-drift`, `coverage-drift`) into `wai check`. After this plan, the spec's full detection surface is operational behind one command.

**Architecture:** Each detector is a pure function `(state: RepoState) => Finding[]` per the contract from plan 1. `data-drift` walks page corrections (already in `state.pages[].meta.corrections`) and classifies them against the raw derived record. `schema-drift` checks each page's `meta.schemaVersion` against `CURRENT_SCHEMA_VERSION`. `coverage-drift` subsumes the existing `core/src/pages/redlinks.ts:findRedlinks` core, adds unmapped-places (place strings from derived YAMLs that don't resolve via `joinCoords`), and adds orphan-derived (records without pages). All three register into `wai check`'s detector array.

**Tech Stack:** TypeScript, Node 22, `tsx --test`, `node:assert/strict`.

**Spec reference:** `docs/superpowers/specs/2026-05-07-drift-prevention-design.md` move 5.

---

## Scope

**In scope:**
- `core/src/checks/data-drift.ts` — pure detector for page corrections vs raw derived state
- `core/src/checks/schema-drift.ts` — pure detector for stale `schemaVersion`
- `core/src/checks/coverage-drift.ts` — pure detector wrapping existing `findRedlinks` + new unmapped-places + new orphan-derived checks
- Tests for each
- `cli/src/index.ts` — register the three new detectors in `wai check`'s detector array
- Help text update for any new flags or category names

**Out of scope (later or skipped):**
- Missing-portraits check inside coverage-drift — needs `assets/` dir walking which would extend `RepoState`. Defer to plan 6 or later.
- `--fix` for schema-drift via existing migration registry — defer to plan 6 (the `wai check --fix` integration with `migrate-runner.ts` requires its own design pass).
- Auto-fix for any of these new detectors — none of them are mechanically fixable. `data-drift` suggests `wai promote-corrections`; `schema-drift` suggests `wai migrate`; `coverage-drift` is suggestion-only.

## File structure

```
core/src/checks/data-drift.ts             NEW. Pure detector.
core/src/checks/schema-drift.ts           NEW. Pure detector.
core/src/checks/coverage-drift.ts         NEW. Pure detector (uses findRedlinks + joinCoords).
core/test/checks/data-drift.test.ts       NEW.
core/test/checks/schema-drift.test.ts     NEW.
core/test/checks/coverage-drift.test.ts   NEW.
cli/src/index.ts                          MODIFY. Register the three new detectors.
core/AGENTS.md                            MODIFY (small). Add to pure-modules list.
```

## Conventions adhered to

- Each detector is a pure `Detector` per `core/src/checks/types.ts`.
- Tests build inline `RepoState` fixtures; no file I/O in tests.
- `coverage-drift` reuses `core/src/pages/redlinks.ts:findRedlinks` rather than duplicating logic.
- Findings include the suggested fix command in their `message` where applicable (e.g. `wai promote-corrections --record I... --apply`).

---

## Task 1: `data-drift` detector

For each correction declared in any page's frontmatter, compare its `value` against the corresponding raw derived record field.

**Files:**
- Create: `core/src/checks/data-drift.ts`
- Create: `core/test/checks/data-drift.test.ts`

- [ ] **Step 1: Write failing tests**

Create `core/test/checks/data-drift.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDataDrift } from '../../src/checks/data-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { PageMeta, Correction } from '../../src/pages/types.ts';

function metaWith(record: string, corrections: Correction[]): PageMeta {
  return {
    schemaVersion: 1,
    title: 'T',
    owner: 'x',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    gedcom: { file: 'g.ged', record, snapshot: 'abc' },
    created: '2026-01-01',
    corrections,
  };
}

function page(slug: string, record: string, corrections: Correction[]): LoadedPage {
  return {
    slug,
    path: `/tmp/x/pages/${slug}.md`,
    meta: metaWith(record, corrections),
    body: '',
    text: '',
  };
}

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

function makeState(pages: LoadedPage[], records: Map<string, DerivedRecord>): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages,
    derivedDir: '/tmp/x/d',
    derived: records,
    placesCoords: [],
  };
}

test('data-drift: no corrections → no findings', () => {
  const state = makeState([page('a', 'I1', [])], new Map([['I1', rec('I1')]]));
  assert.deepEqual(detectDataDrift(state), []);
});

test('data-drift: active correction (overlay differs from raw)', () => {
  const correction: Correction = { field: 'death.date', value: '1989', source: 'src' };
  const state = makeState(
    [page('a', 'I1', [correction])],
    new Map([['I1', rec('I1', { death: { date: '1990', place: 'Rome' } })]]),
  );
  const findings = detectDataDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'data');
  assert.match(findings[0]!.message, /active/);
  assert.match(findings[0]!.message, /1989/);
  assert.match(findings[0]!.message, /1990/);
});

test('data-drift: promotable correction (overlay matches raw)', () => {
  const correction: Correction = { field: 'death.date', value: '1989', source: 'src' };
  const state = makeState(
    [page('a', 'I1', [correction])],
    new Map([['I1', rec('I1', { death: { date: '1989', place: 'Rome' } })]]),
  );
  const findings = detectDataDrift(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /promotable/);
  assert.match(findings[0]!.message, /wai promote-corrections|drop/i);
});

test('data-drift: missing record id → finding flags it', () => {
  const correction: Correction = { record: 'I999', field: 'death.date', value: '1989', source: 'src' };
  const state = makeState([page('a', 'I1', [correction])], new Map([['I1', rec('I1')]]));
  const findings = detectDataDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'error');
  assert.match(findings[0]!.message, /I999.*not found/i);
});

test('data-drift: conflict — two pages target the same record/field with different values', () => {
  const c1: Correction = { record: 'I1', field: 'death.date', value: '1989', source: 's1' };
  const c2: Correction = { record: 'I1', field: 'death.date', value: '1988', source: 's2' };
  const state = makeState(
    [page('a', 'I1', [c1]), page('b', 'I2', [c2])],
    new Map([['I1', rec('I1')], ['I2', rec('I2')]]),
  );
  const findings = detectDataDrift(state);
  // Expect 1 conflict finding (with both pages cited) — duplicate per-correction findings
  // are de-duplicated when they merge into a single conflict.
  const conflicts = findings.filter(f => /conflict/i.test(f.message));
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.severity, 'error');
  assert.match(conflicts[0]!.message, /1988/);
  assert.match(conflicts[0]!.message, /1989/);
});

test('data-drift: correction defaults record to page own gedcom.record', () => {
  const correction: Correction = { field: 'name', value: 'Renamed', source: 'src' };
  const state = makeState(
    [page('a', 'I1', [correction])],
    new Map([['I1', rec('I1', { name: 'Original' })]]),
  );
  const findings = detectDataDrift(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /active/);
});

test('data-drift: correction with no record id and no page gedcom block → skipped (no findings)', () => {
  const meta: PageMeta = {
    schemaVersion: 1,
    title: 'T',
    owner: 'x',
    editors: [],
    type: 'meta',
    aliases: [],
    categories: [],
    created: '2026-01-01',
    corrections: [{ field: 'death.date', value: '1989', source: 'src' }],
  };
  const p: LoadedPage = { slug: 'a', path: '/tmp/x/pages/a.md', meta, body: '', text: '' };
  const state = makeState([p], new Map());
  // No record to attach correction to; detector silently skips.
  assert.deepEqual(detectDataDrift(state), []);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors/core && npx tsx --test test/checks/data-drift.test.ts
```

- [ ] **Step 3: Implement detector**

Create `core/src/checks/data-drift.ts`:

```typescript
import type { Detector, Finding, RepoState, LoadedPage } from './types.ts';
import type { Correction } from '../pages/types.ts';
import type { DerivedRecord } from '../gedcom/types.ts';

interface SourcedCorrection extends Correction {
  pagePath: string;
}

function flatCorrections(pages: ReadonlyArray<LoadedPage>): SourcedCorrection[] {
  const out: SourcedCorrection[] = [];
  for (const p of pages) {
    if (!p.meta.corrections || p.meta.corrections.length === 0) continue;
    const pageRecord = p.meta.gedcom?.record;
    for (const c of p.meta.corrections) {
      const target = c.record ?? pageRecord;
      if (!target) continue; // drop: no record to attach to
      out.push({ ...c, record: target, pagePath: p.path });
    }
  }
  return out;
}

function rawFieldValue(record: DerivedRecord, field: Correction['field']): string | null {
  switch (field) {
    case 'name': return record.name;
    case 'birth.date': return record.birth?.date ?? null;
    case 'birth.place': return record.birth?.place ?? null;
    case 'death.date': return record.death?.date ?? null;
    case 'death.place': return record.death?.place ?? null;
  }
}

export const detectDataDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  const corrections = flatCorrections(state.pages);

  // Detect conflicts: same (record, field) with different values, from different pages.
  const byKey = new Map<string, SourcedCorrection[]>();
  for (const c of corrections) {
    const key = `${c.record}::${c.field}`;
    const arr = byKey.get(key) ?? [];
    arr.push(c);
    byKey.set(key, arr);
  }

  const conflictKeys = new Set<string>();
  for (const [key, arr] of byKey) {
    const distinct = new Set(arr.map(c => c.value));
    if (distinct.size > 1) {
      conflictKeys.add(key);
      const values = [...distinct].map(v => `"${v}"`).join(' vs ');
      const sources = arr.map(c => c.pagePath).join(', ');
      findings.push({
        category: 'data',
        severity: 'error',
        message: `conflict on ${arr[0]!.record}/${arr[0]!.field}: ${values} (sources: ${sources})`,
        location: { file: arr[0]!.pagePath },
      });
    }
  }

  // Per-correction classification (skip those involved in conflicts — already reported).
  for (const c of corrections) {
    const key = `${c.record}::${c.field}`;
    if (conflictKeys.has(key)) continue;
    const record = state.derived.get(c.record!);
    if (!record) {
      findings.push({
        category: 'data',
        severity: 'error',
        message: `correction targets record ${c.record} which is not found in derived YAMLs`,
        location: { file: c.pagePath },
      });
      continue;
    }
    const raw = rawFieldValue(record, c.field);
    if (raw === c.value) {
      findings.push({
        category: 'data',
        severity: 'info',
        message: `promotable correction ${c.record}/${c.field} = "${c.value}" (GEDCOM already matches; drop or run \`wai promote-corrections --record ${c.record} --apply\`)`,
        location: { file: c.pagePath },
      });
    } else {
      findings.push({
        category: 'data',
        severity: 'info',
        message: `active correction ${c.record}/${c.field}: page "${c.value}" overlays GEDCOM "${raw ?? '(null)'}"`,
        location: { file: c.pagePath },
      });
    }
  }

  return findings;
};
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors/core && npx tsx --test test/checks/data-drift.test.ts 2>&1 | tail -8
```

Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors
git add core/src/checks/data-drift.ts core/test/checks/data-drift.test.ts
git commit -m "feat(core): data-drift detector — classify corrections active/promotable/conflict"
```

---

## Task 2: `schema-drift` detector

Reports any page whose `schemaVersion < CURRENT_SCHEMA_VERSION`. Trivial today (CURRENT_SCHEMA_VERSION = 1, so nothing fires) but gives the bump path a working signal.

**Files:**
- Create: `core/src/checks/schema-drift.ts`
- Create: `core/test/checks/schema-drift.test.ts`

- [ ] **Step 1: Write failing tests**

Create `core/test/checks/schema-drift.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSchemaDrift } from '../../src/checks/schema-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';

function page(slug: string, schemaVersion: number): LoadedPage {
  const meta: PageMeta = {
    schemaVersion,
    title: 'T',
    owner: 'x',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    created: '2026-01-01',
    corrections: [],
  };
  return { slug, path: `/tmp/x/pages/${slug}.md`, meta, body: '', text: '' };
}

function makeState(pages: LoadedPage[]): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages,
    derivedDir: '/tmp/x/d',
    derived: new Map(),
    placesCoords: [],
  };
}

test('schema-drift: all pages at current version → no findings', () => {
  const state = makeState([page('a', 1), page('b', 1)]);
  assert.deepEqual(detectSchemaDrift(state), []);
});

test('schema-drift: page below current version → one finding', () => {
  // Simulate a future scenario where CURRENT_SCHEMA_VERSION has bumped to 2.
  // The detector takes CURRENT_SCHEMA_VERSION at module load — to test, we
  // construct a page with version 0 (artificially behind).
  const state = makeState([page('a', 0)]);
  const findings = detectSchemaDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'schema');
  assert.match(findings[0]!.message, /schemaVersion 0/);
  assert.match(findings[0]!.message, /wai migrate/i);
});

test('schema-drift: multiple pages below version → one finding per page', () => {
  const state = makeState([page('a', 0), page('b', 0), page('c', 1)]);
  const findings = detectSchemaDrift(state);
  assert.equal(findings.length, 2);
});
```

- [ ] **Step 2**: Run → FAIL (module not found).

- [ ] **Step 3: Implement detector**

Create `core/src/checks/schema-drift.ts`:

```typescript
import type { Detector, Finding, RepoState } from './types.ts';
import { CURRENT_SCHEMA_VERSION } from '../pages/migrations/index.ts';

export const detectSchemaDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const page of state.pages) {
    if (page.meta.schemaVersion < CURRENT_SCHEMA_VERSION) {
      findings.push({
        category: 'schema',
        severity: 'info',
        message: `page at schemaVersion ${page.meta.schemaVersion}, current is ${CURRENT_SCHEMA_VERSION} — run \`wai migrate\``,
        location: { file: page.path },
      });
    }
  }
  return findings;
};
```

- [ ] **Step 4**: Run → 3 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors
git add core/src/checks/schema-drift.ts core/test/checks/schema-drift.test.ts
git commit -m "feat(core): schema-drift detector — flag pages below CURRENT_SCHEMA_VERSION"
```

---

## Task 3: `coverage-drift` detector

Subsumes existing `findRedlinks` + adds unmapped-places + orphan-derived.

**Files:**
- Create: `core/src/checks/coverage-drift.ts`
- Create: `core/test/checks/coverage-drift.test.ts`

- [ ] **Step 1: Write failing tests**

Create `core/test/checks/coverage-drift.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCoverageDrift } from '../../src/checks/coverage-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';
import type { PlaceCoord } from '../../src/family/places-coords.ts';

function page(slug: string, opts: { record?: string; body?: string } = {}): LoadedPage {
  const meta: PageMeta = {
    schemaVersion: 1,
    title: slug,
    owner: 'x',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    gedcom: opts.record ? { file: 'g.ged', record: opts.record, snapshot: 'abc' } : undefined,
    created: '2026-01-01',
    corrections: [],
  };
  return { slug, path: `/tmp/x/pages/${slug}.md`, meta, body: opts.body ?? '', text: opts.body ?? '' };
}

function rec(id: string, place?: string): DerivedRecord {
  return {
    record: id,
    name: `Person ${id}`,
    birth: place ? { date: null, place } : null,
    death: null,
    parents: [],
    spouses: [],
    children: [],
    residences: [],
    occupations: [],
    sources: [],
  };
}

function makeState(opts: {
  pages?: LoadedPage[];
  derived?: Map<string, DerivedRecord>;
  coords?: PlaceCoord[];
}): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: opts.pages ?? [],
    derivedDir: '/tmp/x/d',
    derived: opts.derived ?? new Map(),
    placesCoords: opts.coords ?? [],
  };
}

test('coverage-drift: clean state → no findings', () => {
  assert.deepEqual(detectCoverageDrift(makeState({})), []);
});

test('coverage-drift: redlink — page links to a slug not in the page set', () => {
  const a = page('alice', { body: 'See [[Bob Smith]] for details.' });
  const findings = detectCoverageDrift(makeState({ pages: [a] }));
  const redlinks = findings.filter(f => /redlink/i.test(f.message));
  assert.equal(redlinks.length, 1);
  assert.match(redlinks[0]!.message, /Bob Smith/);
});

test('coverage-drift: unmapped place — derived record uses a place with no coord match', () => {
  const records = new Map([['I1', rec('I1', 'Atlantis, Lost')]]);
  const findings = detectCoverageDrift(makeState({ derived: records }));
  const unmapped = findings.filter(f => /unmapped place/i.test(f.message));
  assert.equal(unmapped.length, 1);
  assert.match(unmapped[0]!.message, /Atlantis/);
});

test('coverage-drift: place resolves via alias → no unmapped finding', () => {
  const records = new Map([['I1', rec('I1', 'Kiev, Ukraine')]]);
  const coords: PlaceCoord[] = [
    { name: 'Kyiv, Ukraine', lat: 50.45, lon: 30.52, aliases: ['Kiev, Ukraine'] },
  ];
  const findings = detectCoverageDrift(makeState({ derived: records, coords }));
  const unmapped = findings.filter(f => /unmapped place/i.test(f.message));
  assert.equal(unmapped.length, 0);
});

test('coverage-drift: orphan derived — record without a page', () => {
  const records = new Map([['I1', rec('I1')], ['I2', rec('I2')]]);
  const pages = [page('alice', { record: 'I1' })];
  const findings = detectCoverageDrift(makeState({ pages, derived: records }));
  const orphans = findings.filter(f => /orphan derived/i.test(f.message));
  assert.equal(orphans.length, 1);
  assert.match(orphans[0]!.message, /I2/);
});

test('coverage-drift: page covers record → no orphan', () => {
  const records = new Map([['I1', rec('I1')]]);
  const pages = [page('alice', { record: 'I1' })];
  const findings = detectCoverageDrift(makeState({ pages, derived: records }));
  const orphans = findings.filter(f => /orphan derived/i.test(f.message));
  assert.equal(orphans.length, 0);
});
```

- [ ] **Step 2**: Run → FAIL.

- [ ] **Step 3: Implement detector**

Create `core/src/checks/coverage-drift.ts`:

```typescript
import type { Detector, Finding, RepoState } from './types.ts';
import { findRedlinks } from '../pages/redlinks.ts';
import { joinCoords, type PlacesPerson } from '../family/places-coords.ts';
import { canonical } from '../pages/wikilinks.ts';

export const detectCoverageDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];

  // 1. Redlinks
  const resolvable = new Set<string>();
  for (const p of state.pages) resolvable.add(canonical(p.slug.replace(/-/g, ' ')));
  for (const p of state.pages) resolvable.add(canonical(p.meta.title));

  const redlinks = findRedlinks(
    state.pages.map(p => ({ slug: p.slug, body: p.body })),
    resolvable,
  );
  for (const r of redlinks) {
    findings.push({
      category: 'coverage',
      severity: 'info',
      message: `redlink: [[${r.target}]] referenced by ${r.count} page${r.count === 1 ? '' : 's'} (${r.sources.slice(0, 3).join(', ')}${r.sources.length > 3 ? '…' : ''})`,
      location: { file: state.rootDir },
    });
  }

  // 2. Unmapped places — every place string from derived YAMLs that doesn't resolve via joinCoords.
  const people: PlacesPerson[] = [];
  for (const [, record] of state.derived) {
    if (record.birth?.place) {
      people.push({ place: record.birth.place, record: record.record, name: record.name, kind: 'birth' });
    }
    if (record.death?.place) {
      people.push({ place: record.death.place, record: record.record, name: record.name, kind: 'death' });
    }
  }
  const { unmapped } = joinCoords({ coords: state.placesCoords, people });
  for (const u of unmapped) {
    findings.push({
      category: 'coverage',
      severity: 'info',
      message: `unmapped place: "${u.place}" referenced by ${u.people.length} record${u.people.length === 1 ? '' : 's'} (add an alias or new entry to genealogy/places-coords.yml)`,
      location: { file: state.rootDir },
    });
  }

  // 3. Orphan derived — derived records with no page covering them.
  const recordsWithPages = new Set<string>();
  for (const p of state.pages) {
    if (p.meta.gedcom?.record) recordsWithPages.add(p.meta.gedcom.record);
  }
  for (const [id] of state.derived) {
    if (!recordsWithPages.has(id)) {
      findings.push({
        category: 'coverage',
        severity: 'info',
        message: `orphan derived: ${id} (${state.derived.get(id)!.name}) has no page`,
        location: { file: state.rootDir },
      });
    }
  }

  return findings;
};
```

- [ ] **Step 4**: Run → 6 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors
git add core/src/checks/coverage-drift.ts core/test/checks/coverage-drift.test.ts
git commit -m "feat(core): coverage-drift — redlinks + unmapped-places + orphan-derived"
```

---

## Task 4: Wire all three detectors into `wai check`

**Files:** Modify: `cli/src/index.ts`.

- [ ] **Step 1: Update imports**

Find the existing detector imports near the top of `cli/src/index.ts`:

```typescript
import { detectFormatDrift } from '@core/checks/format-drift.ts';
```

Add the three new ones:

```typescript
import { detectFormatDrift } from '@core/checks/format-drift.ts';
import { detectDataDrift } from '@core/checks/data-drift.ts';
import { detectSchemaDrift } from '@core/checks/schema-drift.ts';
import { detectCoverageDrift } from '@core/checks/coverage-drift.ts';
```

- [ ] **Step 2: Register in the detectors array**

Find the existing `runCheck` invocation in the `case 'check':` block. The `detectors:` field currently contains only `[detectFormatDrift]`. Update to:

```typescript
          detectors: [
            detectFormatDrift,
            detectDataDrift,
            detectSchemaDrift,
            detectCoverageDrift,
          ],
```

- [ ] **Step 3: Build + smoke-test against ~/whoami**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors/cli && npm run typecheck && npm run build
```

```bash
WHOAMI_ROOT=/Users/nyetwork/whoami node /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors/cli/dist/wai.cjs check 2>&1 | head -40
```

Expected:
- Format drift: 0 findings (already normalized).
- Data drift: 0 findings (no `corrections:` entries in any page today).
- Schema drift: 0 findings (CURRENT_SCHEMA_VERSION = 1, all pages at v1).
- Coverage drift: many findings — redlinks (~223 from the original audit), unmapped places, orphan-derived records (~20 per the audit).

Capture the coverage finding count to confirm it's reporting reasonably.

- [ ] **Step 4: Update help text**

The help text from plan 1 already lists the 4 categories under `--only` and `--fail-on`: `format,data,schema,coverage`. No update needed unless the existing text is stale.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors
git add cli/src/index.ts
git commit -m "feat(cli): register data/schema/coverage detectors in wai check"
```

---

## Task 5: AGENTS.md docs

**Files:** Modify: `core/AGENTS.md`.

- [ ] **Step 1: Add detector files to Pure modules list**

Find the Pure modules list. Currently includes `core/src/checks/types.ts, format-drift.ts`. Update to include the three new detectors:

```
- `core/src/checks/types.ts`, `format-drift.ts`, `data-drift.ts`, `schema-drift.ts`, `coverage-drift.ts`.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-5-detectors
git add core/AGENTS.md
git commit -m "docs(core): add new drift detectors to pure modules list"
```

---

## Self-review checklist

- ✓ Each detector is a pure function `(state: RepoState) => Finding[]`. No I/O.
- ✓ `data-drift` handles: empty corrections (no findings), active (overlay differs), promotable (overlay matches), unknown record id (error), conflict (different values for same record/field across pages), and the "no record stamp available" skip path.
- ✓ `schema-drift` reports one finding per page below `CURRENT_SCHEMA_VERSION`. Today fires 0 (since version = 1), but works when bumped.
- ✓ `coverage-drift` reuses `findRedlinks` rather than reimplementing wikilink discovery.
- ✓ `unmapped places` uses the existing `joinCoords` function.
- ✓ Tests build inline `RepoState` fixtures; no file I/O.
- ✓ All three detectors registered in `wai check`'s detector array; existing format-drift unchanged.
- ✓ `wai redlinks` standalone command stays as-is (its core is now also used by `coverage-drift`, no logic duplication).

## What plan 6+ will need

- Plan 6's `wai write` integration may want to pass `--only format` to `wai check --fix` so the auto-fix at write time doesn't surface coverage findings (which are non-actionable in a single-page write context).
- Plan 6's pre-commit hook template will use `wai check --fail-on format,schema,data` (coverage drift is non-blocking).
- Plan 7's eval suite will compare detector output before/after agent edits to score drift introduction.
