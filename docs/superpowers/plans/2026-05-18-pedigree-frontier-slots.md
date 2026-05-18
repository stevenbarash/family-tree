# Pedigree Frontier Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every missing parent of every present ancestor (up to MAX_GENERATION = 4) as a dashed-border "frontier slot" in the `/family/tree` pedigree chart, so the chart shows research gaps spatially rather than collapsing asymmetric branches.

**Architecture:** Extend the pure layout function in `core/src/family/pedigree-layout.ts` with a discriminated-union node type (`PresentNode | FrontierNode`). New `includeFrontier` config flag + `recordLookup: Map<string, DerivedRecord>` enable emission. A new React Flow custom node component (`pedigree-frontier-node.tsx`) renders frontier slots with `border-dashed border-muted-foreground/40` and a kinship label as the title. The section component (`pedigree-section.tsx`) threads `getCachedDerivedRecords()` to the layout, branches the node-mapping loop on `kind`, and dashed-styles frontier edges.

**Tech Stack:** Same as parent feature — TypeScript, `@xyflow/react@^12.10.2`, Next.js 16 RSC, `next-intl`, Tailwind. Existing `DerivedRecord.parents[]` shape (`{ record: string; role?: 'father' | 'mother' }[]`) provides the gap-detection signal.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `core/src/family/pedigree-layout.ts` | Modify | Discriminated-union `PedigreeNode = PresentNode \| FrontierNode`. New `LayoutConfig.includeFrontier?: boolean` and `LayoutConfig.recordLookup?: Map<string, DerivedRecord>`. When both are set, emit `FrontierNode` entries for missing parents of present ancestors. Layout algorithm (recursive-midpoint) treats frontier slots as full leaves. |
| `core/test/family/pedigree-layout.test.ts` | Extend | Add 4 frontier-specific test cases. The existing 7 must keep passing (no behavioral regression). |
| `frontend/components/family/pedigree-frontier-node.tsx` | Create | React Flow custom node for `kind: 'frontier'`. Dashed border, no portrait, kinship-label title. Same w-44 footprint as `PedigreeNode`. |
| `frontend/components/family/pedigree-chart.client.tsx` | Modify | Register `frontier: PedigreeFrontierNode` in `nodeTypes`. Widen `PedigreeChartProps.nodes` to a union of present/frontier shapes. Set per-edge `style.strokeDasharray` for edges whose source id starts with `frontier:`. |
| `frontend/components/family/sections/pedigree-section.tsx` | Modify | Import `getCachedDerivedRecords` from `@/lib/family`; pass `recordLookup` + `includeFrontier: true` to `layoutPedigree`. Branch the node-mapping loop on `n.kind`. Build kinship-label key from `(generation, side, role)`. Tag frontier edges with `frontier: true` in the edge-mapping so the chart wrapper can dash them. |
| `frontend/messages/{en,ru,uk,he}.json` | Modify | Add `Page.FamilyTree.pedigree.kinship.*` keys (8 fixed labels + 1 templated `unknownAncestor`). |
| `docs/superpowers/plans/README.md` | Modify | Task 1: add 🚧 row. Task 10: flip to ✅. |
| `docs/ROADMAP.md` | Modify | Task 9: flip the "F Chart frontier slots" row in the Pedigree-chart follow-ons subsection from (no status) to ✅ shipped. |
| `CHANGELOG.md` | Modify | Task 9: add entry under `## [Unreleased]` / `### Added`. Not P-numbered, so no roadmap-drift coupling. |

---

## Task 1: Plan-index entry (open the plan)

**Files:**
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add a 🚧 row to the plan index**

Open `docs/superpowers/plans/README.md`. Find the row for `2026-05-18-quality-checks-pass-2.md` (the most-recent ✅ entry at the top of the table). Insert directly above it:

```markdown
| 🚧 | [`2026-05-18-pedigree-frontier-slots.md`](./2026-05-18-pedigree-frontier-slots.md) | Pedigree frontier slots | Dashed-border placeholder nodes in `/family/tree` for missing parents of present ancestors up to MAX_GENERATION. Sub-project F (of 3) in the gap-as-frontier feature — see [spec](../specs/2026-05-18-pedigree-frontier-slots-design.md). |
```

Update the footer total (currently `**Total: 45 plans** — 40 shipped (✅), 0 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).`) to:

```
**Total: 46 plans** — 40 shipped (✅), 1 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).
```

- [ ] **Step 2: Run plan-index-drift test**

Run: `cd cli && npx tsx --test test/plan-index-drift.test.ts`
Expected: 5 tests pass. The new plan file already exists (this very file you're reading), so test (A) passes. Test (C) checks that 🚧 plans don't have all their Create: files already on disk — none of the new files in the table above exist yet, so (C) passes.

- [ ] **Step 3: Commit**

```bash
git -C /Users/nyetwork/dev/whoami add docs/superpowers/plans/README.md docs/superpowers/plans/2026-05-18-pedigree-frontier-slots.md
git -C /Users/nyetwork/dev/whoami commit -m "docs: plan for pedigree frontier slots (sub-project F)"
```

---

## Task 2: Layout — discriminated-union types + scaffold

**Files:**
- Modify: `core/src/family/pedigree-layout.ts`
- Modify: `core/test/family/pedigree-layout.test.ts`
- Modify: `frontend/components/family/sections/pedigree-section.tsx`

This task is a refactor + scaffold with no new visible behavior. The discriminated union and `includeFrontier` config land here; emission logic lands in Task 3. The existing 7 layout tests keep passing.

- [ ] **Step 1: Update layout types and emission scaffold**

Replace the contents of `core/src/family/pedigree-layout.ts` with:

```typescript
import type { BrowserPerson } from './browser.ts';
import type { DerivedRecord } from '../gedcom/types.ts';

/** A node for a present ancestor (or the focal person). */
export interface PresentNode {
  kind: 'present';
  record: string;
  x: number;
  y: number;
  generation: number;
  side: 'self' | 'paternal' | 'maternal';
}

/** A placeholder for a missing parent of a present ancestor. Only emitted
 *  when LayoutConfig.includeFrontier === true and a recordLookup is provided. */
export interface FrontierNode {
  kind: 'frontier';
  /** Synthetic id, stable across renders. Format: `frontier:<descendantRecord>:<role>` */
  id: string;
  /** The present ancestor whose father/mother slot this represents. */
  descendantRecord: string;
  /** Which parent slot this is. */
  role: 'father' | 'mother';
  x: number;
  y: number;
  /** Generation of THIS slot (one above the descendant). */
  generation: number;
  side: 'paternal' | 'maternal';
}

export type PedigreeNode = PresentNode | FrontierNode;

export interface PedigreeEdge {
  /** child → parent direction. For present-to-present edges: ancestor id is source.
   *  For frontier edges: `frontier:<descendant>:<role>` is the source. */
  source: string;
  target: string;
}

export interface PedigreeLayout {
  nodes: PedigreeNode[];
  edges: PedigreeEdge[];
}

export interface LayoutConfig {
  focal: BrowserPerson;
  ancestors: BrowserPerson[];
  /** Inclusive cap on generation depth. Generations beyond this are dropped. */
  maxGeneration: number;
  /** When true (and recordLookup is provided), emit FrontierNode entries for
   *  any present ancestor whose `parents[]` lacks a father or mother role. */
  includeFrontier?: boolean;
  /** Lookup from record id → DerivedRecord. Required for frontier emission. */
  recordLookup?: ReadonlyMap<string, DerivedRecord>;
}

const ROW_HEIGHT = 180;
const LEAF_SPACING = 200;

/**
 * Layout an ancestor pedigree: focal at (0, 0); ancestors above (negative y);
 * x assigned by recursive midpoint placement over the visible tree.
 *
 * If `includeFrontier` is true and `recordLookup` is set, each present
 * ancestor whose `parents[]` lacks a father or mother contributes a
 * FrontierNode at gen+1, sized into the layout as a full leaf.
 *
 * Pure: no DOM, no React, no I/O.
 */
export function layoutPedigree(cfg: LayoutConfig): PedigreeLayout {
  const visible = cfg.ancestors.filter(a => a.generation <= cfg.maxGeneration);

  // "children" in the visualization = ancestors one gen above (visually higher)
  const childrenOf = new Map<string, Array<{ id: string; record?: string; role?: 'father' | 'mother'; isFrontier: boolean; generation: number; side: 'paternal' | 'maternal' }>>();
  childrenOf.set(cfg.focal.record, []);
  for (const a of visible) childrenOf.set(a.record, []);

  // Add present-ancestor children
  for (const a of visible) {
    const descendantRecord = a.pathFromRoot.length === 1
      ? cfg.focal.record
      : a.pathFromRoot[a.pathFromRoot.length - 2]!;
    const arr = childrenOf.get(descendantRecord);
    if (arr) {
      arr.push({
        id: a.record,
        record: a.record,
        role: a.role,
        isFrontier: false,
        generation: a.generation,
        side: a.side === 'self' ? 'paternal' : a.side,
      });
    }
  }

  // Frontier emission (Task 3 fills this in)

  // Sort siblings: father (left) before mother (right). Missing role keeps input order.
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => {
      if (a.role === 'father' && b.role === 'mother') return -1;
      if (a.role === 'mother' && b.role === 'father') return 1;
      return 0;
    });
  }

  // Post-order: leaves at consecutive LEAF_SPACING positions; inner nodes at midpoint
  const xById = new Map<string, number>();
  let nextLeafX = 0;

  function place(id: string): number {
    const children = childrenOf.get(id) ?? [];
    let x: number;
    if (children.length === 0) {
      x = nextLeafX;
      nextLeafX += LEAF_SPACING;
    } else {
      const childXs = children.map(c => place(c.id));
      x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    xById.set(id, x);
    return x;
  }

  place(cfg.focal.record);
  const focalX = xById.get(cfg.focal.record) ?? 0;

  const nodes: PedigreeNode[] = [
    { kind: 'present', record: cfg.focal.record, x: 0, y: 0, generation: 0, side: 'self' },
  ];

  // Walk the placed map; emit Present or Frontier based on what's in the map.
  // We have to track which ids are frontier vs present — use childrenOf entries.
  const frontierEntries = new Map<string, { descendantRecord: string; role: 'father' | 'mother'; generation: number; side: 'paternal' | 'maternal' }>();
  for (const [parentId, children] of childrenOf) {
    for (const c of children) {
      if (c.isFrontier) {
        frontierEntries.set(c.id, {
          descendantRecord: parentId,
          role: c.role!,
          generation: c.generation,
          side: c.side,
        });
      }
    }
  }

  for (const a of visible) {
    const rawX = xById.get(a.record);
    if (rawX === undefined) continue;
    nodes.push({
      kind: 'present',
      record: a.record,
      x: rawX - focalX,
      y: -a.generation * ROW_HEIGHT,
      generation: a.generation,
      side: a.side === 'self' ? 'paternal' : a.side,
    });
  }

  for (const [id, info] of frontierEntries) {
    const rawX = xById.get(id);
    if (rawX === undefined) continue;
    nodes.push({
      kind: 'frontier',
      id,
      descendantRecord: info.descendantRecord,
      role: info.role,
      x: rawX - focalX,
      y: -info.generation * ROW_HEIGHT,
      generation: info.generation,
      side: info.side,
    });
  }

  // Edges
  const edges: PedigreeEdge[] = [];
  const visibleNodeIds = new Set<string>([cfg.focal.record]);
  for (const a of visible) visibleNodeIds.add(a.record);
  for (const id of frontierEntries.keys()) visibleNodeIds.add(id);

  for (const a of visible) {
    const childRecord = a.pathFromRoot.length === 1
      ? cfg.focal.record
      : a.pathFromRoot[a.pathFromRoot.length - 2]!;
    if (visibleNodeIds.has(childRecord)) {
      edges.push({ source: a.record, target: childRecord });
    }
  }
  for (const [id, info] of frontierEntries) {
    edges.push({ source: id, target: info.descendantRecord });
  }

  return { nodes, edges };
}
```

The frontier-emission logic stays unfilled in this task. The structure (frontierEntries, the loops, the edges) is in place so Task 3 just needs to populate `childrenOf` with frontier entries.

- [ ] **Step 2: Update test fixture's `makePerson` and all assertions for the new `kind` field**

The test fixture builds `BrowserPerson` (unchanged). But test assertions like `assert.deepEqual(result.nodes[0], { record: 'I1', x: 0, y: 0, generation: 0, side: 'self' })` now need to include `kind: 'present'`.

Open `core/test/family/pedigree-layout.test.ts` and apply these specific changes:

Change in "empty ancestors" test:
```typescript
  assert.deepEqual(result.nodes[0], { kind: 'present', record: 'I1', x: 0, y: 0, generation: 0, side: 'self' });
```

Change in "asymmetric tree" test loop:
```typescript
  for (const node of result.nodes) {
    if (node.kind !== 'present') continue;
    assert.equal(node.x, 0, `${node.record} should be on the focal's vertical column (x=0)`);
  }
```

Change in "a sole ancestor" test:
```typescript
  const node = result.nodes.find(n => n.kind === 'present' && n.record === 'I2')!;
  assert.equal(node.x, 0, '...');
```

Change in the other tests that use `.find(n => n.record === 'IX')`: add the `kind === 'present'` filter:
```typescript
  const fatherNode = result.nodes.find(n => n.kind === 'present' && n.record === 'I2')!;
```

Apply this pattern to every `find` callback that touches `.record` (in the "1 generation", "3 generations", "asymmetric", "missing role", "edges from clamped" tests).

- [ ] **Step 3: Update `pedigree-section.tsx` to handle the union (no behavior change)**

The section currently has `layout.nodes.map((n: LayoutNode) => { ... n.record ... })`. With the union, `n.record` no longer exists on all branches. Update the map to branch on kind. Since Task 2 doesn't emit any frontier nodes (default `includeFrontier: false`), the frontier branch can be a `null` filter for this task.

In `frontend/components/family/sections/pedigree-section.tsx`, replace the `layout.nodes.map(...)` block (around line 56-78) with:

```tsx
  const nodes = layout.nodes
    .map((n) => {
      if (n.kind !== 'present') return null; // Task 6 handles 'frontier'
      const person = byRecord.get(n.record);
      const name = person?.name ?? n.record;
      const years = person ? formatYears(person) : null;
      const generationLabel = n.generation === 0
        ? t('selfLabel')
        : t('generationLabel', { n: String(n.generation) });
      return {
        id: n.record,
        position: { x: n.x - NODE_HALF_WIDTH, y: n.y - NODE_HALF_HEIGHT },
        type: 'pedigree' as const,
        data: {
          record: n.record,
          name,
          years,
          portrait: person?.portrait,
          isFocal: n.generation === 0,
          href: familyTreeHref(n.record),
        },
        ariaLabel: `${name}, ${generationLabel}${years ? `, ${years}` : ''}`,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);
```

Also update the import line at the top of `pedigree-section.tsx` to drop the `type PedigreeNode as LayoutNode` rename (no longer needed):

```typescript
import { layoutPedigree } from '@core/family/pedigree-layout.ts';
```

(If the file currently has `import { layoutPedigree, type PedigreeNode as LayoutNode } from '@core/family/pedigree-layout.ts';`, keep just the function import.)

- [ ] **Step 4: Run layout tests**

Run: `cd core && npx tsx --test test/family/pedigree-layout.test.ts 2>&1 | tail -10`
Expected: 7 tests pass.

Run: `cd core && npm test 2>&1 | tail -5`
Expected: 556 tests pass (no regressions).

- [ ] **Step 5: Run frontend typecheck and tests**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: clean.

Run: `cd frontend && npm test 2>&1 | tail -5`
Expected: 75 pass + 6 skipped (no regressions).

- [ ] **Step 6: Commit**

```bash
git -C /Users/nyetwork/dev/whoami add core/src/family/pedigree-layout.ts core/test/family/pedigree-layout.test.ts frontend/components/family/sections/pedigree-section.tsx
git -C /Users/nyetwork/dev/whoami commit -m "chore: discriminated-union pedigree layout types (scaffold for frontier slots)"
```

---

## Task 3: Layout — frontier emission (TDD)

**Files:**
- Modify: `core/src/family/pedigree-layout.ts`
- Modify: `core/test/family/pedigree-layout.test.ts`

The layout function now emits FrontierNode entries for missing parents.

- [ ] **Step 1: Write 4 failing tests**

Append to `core/test/family/pedigree-layout.test.ts`:

```typescript
import type { DerivedRecord } from '../../src/gedcom/types.ts';

function makeRecord(
  recordId: string,
  parents: Array<{ record: string; role?: 'father' | 'mother' }>,
): DerivedRecord {
  return {
    record: recordId,
    name: recordId,
    sex: null,
    birth: null,
    death: null,
    parents,
    families: [],
    children: [],
    sources: [],
    notes: [],
  };
}

test('layoutPedigree: includeFrontier=false (default) emits no frontier nodes even with missing parents', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  // father has NO parents recorded — would normally produce 2 frontier slots
  const lookup = new Map<string, DerivedRecord>([
    ['I2', makeRecord('I2', [])],
  ]);
  const result = layoutPedigree({ focal, ancestors: [father], maxGeneration: 4, recordLookup: lookup });
  // includeFrontier omitted ⇒ defaults to false
  for (const node of result.nodes) {
    assert.notEqual(node.kind, 'frontier', 'no frontier nodes should be emitted when includeFrontier is unset');
  }
});

test('layoutPedigree: includeFrontier=true emits a FrontierNode for a missing mother of a present father', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  // father has ONLY a father recorded; mother slot is missing
  const lookup = new Map<string, DerivedRecord>([
    ['I2', makeRecord('I2', [{ record: 'I4', role: 'father' }])],
  ]);
  const result = layoutPedigree({ focal, ancestors: [father], maxGeneration: 4, includeFrontier: true, recordLookup: lookup });

  const frontierNodes = result.nodes.filter(n => n.kind === 'frontier');
  assert.equal(frontierNodes.length, 1, 'should emit one frontier (the missing mother)');
  const fnode = frontierNodes[0]!;
  assert.equal(fnode.kind, 'frontier');
  if (fnode.kind !== 'frontier') throw new Error('type narrowing');
  assert.equal(fnode.descendantRecord, 'I2');
  assert.equal(fnode.role, 'mother');
  assert.equal(fnode.generation, 2);
  assert.equal(fnode.side, 'paternal');
  assert.equal(fnode.id, 'frontier:I2:mother');
});

test('layoutPedigree: frontier slot is positioned as a full leaf — present sibling and frontier are spread around their parent', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const ff = makePerson('I3', 2, 'paternal', ['I2', 'I3'], 'father');
  // father has a recorded father (I3 = ff) but a missing mother
  const lookup = new Map<string, DerivedRecord>([
    ['I2', makeRecord('I2', [{ record: 'I3', role: 'father' }])],
  ]);
  const result = layoutPedigree({ focal, ancestors: [father, ff], maxGeneration: 4, includeFrontier: true, recordLookup: lookup });

  // father should be at midpoint of [ff, frontier_mother]
  const fatherNode = result.nodes.find(n => n.kind === 'present' && n.record === 'I2')!;
  const ffNode = result.nodes.find(n => n.kind === 'present' && n.record === 'I3')!;
  const frontierMother = result.nodes.find(n => n.kind === 'frontier')!;
  if (frontierMother.kind !== 'frontier') throw new Error('type narrowing');

  assert.ok(ffNode.x < fatherNode.x, 'father (left) sibling is to the left of father');
  assert.ok(frontierMother.x > fatherNode.x, 'mother (right) frontier is to the right of father');
  assert.equal(fatherNode.x, (ffNode.x + frontierMother.x) / 2,
    'father should be at midpoint of its two children — present + frontier');
});

test('layoutPedigree: frontier slots are NOT emitted for missing parents of ancestors at maxGeneration', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const ff = makePerson('I3', 2, 'paternal', ['I2', 'I3'], 'father');
  const fff = makePerson('I4', 3, 'paternal', ['I2', 'I3', 'I4'], 'father');
  // I4 (gen 3 — the deepest visible at maxGeneration=3) has missing parents.
  // Frontier slots for them would sit at gen 4, OUTSIDE the chart bound.
  // So they must not be emitted.
  const lookup = new Map<string, DerivedRecord>([
    ['I4', makeRecord('I4', [])],
  ]);
  const result = layoutPedigree({
    focal,
    ancestors: [father, ff, fff],
    maxGeneration: 3,
    includeFrontier: true,
    recordLookup: lookup,
  });
  for (const node of result.nodes) {
    assert.notEqual(node.kind, 'frontier',
      'frontier slots above maxGeneration must not be emitted');
  }
});
```

- [ ] **Step 2: Run tests and watch them fail**

Run: `cd core && npx tsx --test test/family/pedigree-layout.test.ts 2>&1 | tail -15`
Expected: 4 new tests fail (the 7 existing pass). Failures should look like "expected one frontier (the missing mother), got 0."

- [ ] **Step 3: Implement frontier emission in the layout function**

In `core/src/family/pedigree-layout.ts`, the existing function has a comment `// Frontier emission (Task 3 fills this in)`. Replace that line with:

```typescript
  // Frontier emission: for each visible present ancestor whose recordLookup
  // entry exists and whose parents[] lacks a father or mother role, emit a
  // FrontierNode at gen+1 (provided gen+1 <= maxGeneration).
  if (cfg.includeFrontier && cfg.recordLookup) {
    for (const a of visible) {
      if (a.generation >= cfg.maxGeneration) continue; // frontier above bound is dropped
      const rec = cfg.recordLookup.get(a.record);
      if (!rec) continue;
      const hasFather = rec.parents.some(p => p.role === 'father');
      const hasMother = rec.parents.some(p => p.role === 'mother');
      // The frontier slot inherits the descendant's side (so a paternal
      // grandparent's missing father is still paternal).
      const childSide = a.side === 'self' ? 'paternal' : a.side;
      const slots: Array<'father' | 'mother'> = [];
      if (!hasFather) slots.push('father');
      if (!hasMother) slots.push('mother');
      for (const role of slots) {
        const id = `frontier:${a.record}:${role}`;
        const arr = childrenOf.get(a.record)!;
        arr.push({
          id,
          role,
          isFrontier: true,
          generation: a.generation + 1,
          side: childSide,
        });
        // Initialize an empty children list for the frontier node so the
        // post-order traversal recognises it as a leaf (no recursion past it).
        childrenOf.set(id, []);
      }
    }
  }
```

- [ ] **Step 4: Run tests and watch them pass**

Run: `cd core && npx tsx --test test/family/pedigree-layout.test.ts 2>&1 | tail -15`
Expected: all 11 tests pass (7 original + 4 new).

Run: `cd core && npm test 2>&1 | tail -5`
Expected: 560 tests pass (was 556).

- [ ] **Step 5: Commit**

```bash
git -C /Users/nyetwork/dev/whoami add core/src/family/pedigree-layout.ts core/test/family/pedigree-layout.test.ts
git -C /Users/nyetwork/dev/whoami commit -m "feat: emit frontier-slot nodes for missing parents in pedigree layout"
```

This is a `feat:` commit — the changelog-nudge pre-commit hook will block unless CHANGELOG.md is staged. Since the user-facing change (frontier slots visible in the chart) requires Tasks 4-8 too, the proper CHANGELOG entry lands in Task 9. Use `chore:` here:

```bash
git -C /Users/nyetwork/dev/whoami commit -m "chore: emit frontier-slot nodes for missing parents in pedigree layout"
```

---

## Task 4: Frontier node component

**Files:**
- Create: `frontend/components/family/pedigree-frontier-node.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/components/family/pedigree-frontier-node.tsx
'use client';

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';

export interface PedigreeFrontierNodeData extends Record<string, unknown> {
  /** Kinship label (already-translated string), e.g. "Paternal grandmother" */
  kinshipLabel: string;
  /** The record of the present descendant whose parent slot this is. */
  descendantRecord: string;
  /** Where clicking the slot navigates. Set by the section. */
  href: string;
}

export type PedigreeFrontierNodeType = Node<PedigreeFrontierNodeData, 'frontier'>;

/**
 * React Flow custom node for a frontier slot — a missing parent of a
 * present ancestor. Dashed border + muted typography signal "this is
 * a slot waiting to be filled," not a person. Click navigates to the
 * descendant's tree page (where the frontier list / talk page lives).
 */
export function PedigreeFrontierNode({ data }: NodeProps<PedigreeFrontierNodeType>) {
  return (
    <a
      href={data.href}
      className="group flex w-44 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 bg-transparent px-2.5 py-3 transition-colors hover:bg-muted/30 hover:border-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${data.kinshipLabel} — missing, open research notes`}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div className="min-w-0 flex-1 text-center">
        <div className="truncate text-[0.72rem] font-medium leading-tight text-muted-foreground/80">
          <bdi>{data.kinshipLabel}</bdi>
        </div>
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground/50">
          missing
        </div>
      </div>
    </a>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git -C /Users/nyetwork/dev/whoami add frontend/components/family/pedigree-frontier-node.tsx
git -C /Users/nyetwork/dev/whoami commit -m "chore: pedigree-frontier-node custom React Flow node"
```

---

## Task 5: Register frontier node type + widen chart props + dashed edges

**Files:**
- Modify: `frontend/components/family/pedigree-chart.client.tsx`

- [ ] **Step 1: Update the file**

Replace `frontend/components/family/pedigree-chart.client.tsx` with:

```tsx
'use client';

import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import { PedigreeNode, type PedigreeNodeData } from './pedigree-node';
import { PedigreeFrontierNode, type PedigreeFrontierNodeData } from './pedigree-frontier-node';

/** Discriminated-union shape for the props — matches the layout's node kinds. */
type PedigreeChartNode =
  | {
      id: string;
      type: 'pedigree';
      position: { x: number; y: number };
      data: PedigreeNodeData;
    }
  | {
      id: string;
      type: 'frontier';
      position: { x: number; y: number };
      data: PedigreeFrontierNodeData;
    };

export interface PedigreeChartProps {
  nodes: PedigreeChartNode[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
    /** Marks edges originating from a frontier slot, for dashed styling. */
    frontier?: boolean;
  }>;
  ariaLabel: string;
}

const nodeTypes = {
  pedigree: PedigreeNode,
  frontier: PedigreeFrontierNode,
};

/**
 * Mounts React Flow with the pre-computed layout.
 * Read-only: nodes are not draggable; edges are not editable.
 * Frontier edges (those originating from a frontier slot) render dashed
 * to communicate "this edge is to a slot, not a person."
 */
export default function PedigreeChart({ nodes, edges, ariaLabel }: PedigreeChartProps) {
  const rfNodes: Node[] = nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    draggable: false,
    selectable: false,
    connectable: false,
  }));
  const rfEdges: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    style: e.frontier
      ? { stroke: 'var(--border)', strokeWidth: 1.5, strokeDasharray: '4 4' }
      : { stroke: 'var(--border)', strokeWidth: 1.5 },
  }));

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="h-[520px] w-full overflow-hidden rounded-md border rule-hair bg-muted/30"
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background gap={24} size={1} color="var(--border)" />
        <Controls showInteractive={false} className="!bg-card !border-border" />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: passes. If TypeScript complains about the discriminated-union prop accepted by `rfNodes.map`, the discriminator should be inferred — both arms have `id`, `position`, distinct `type`, and distinct `data`. If errors persist, log them; do not collapse the union to `any`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/nyetwork/dev/whoami add frontend/components/family/pedigree-chart.client.tsx
git -C /Users/nyetwork/dev/whoami commit -m "chore: register frontier node type + dashed-edge styling in pedigree chart"
```

---

## Task 6: Section — thread derived records, build frontier nodes, kinship label, dashed edges

**Files:**
- Modify: `frontend/components/family/sections/pedigree-section.tsx`

- [ ] **Step 1: Add a kinship-label helper at module scope**

Above the `interface Props {` declaration in `pedigree-section.tsx`, add:

```typescript
function kinshipLabelKey(
  generation: number,
  side: 'paternal' | 'maternal',
  role: 'father' | 'mother',
): { key: string; vars?: Record<string, string> } {
  if (generation === 1) {
    return { key: role === 'father' ? 'kinship.father' : 'kinship.mother' };
  }
  if (generation === 2) {
    const map = {
      'paternal-father': 'kinship.paternalGrandfather',
      'paternal-mother': 'kinship.paternalGrandmother',
      'maternal-father': 'kinship.maternalGrandfather',
      'maternal-mother': 'kinship.maternalGrandmother',
    } as const;
    return { key: map[`${side}-${role}` as keyof typeof map] };
  }
  // gen 3+: generic template "Unknown {n}-great-grandparent"
  return { key: 'kinship.unknownAncestor', vars: { n: String(generation - 2) } };
}
```

- [ ] **Step 2: Thread `getCachedDerivedRecords()` and pass `recordLookup` + `includeFrontier`**

Update the imports at the top of `pedigree-section.tsx`:

```typescript
import '@xyflow/react/dist/style.css';
import { getTranslations } from 'next-intl/server';
import { layoutPedigree } from '@core/family/pedigree-layout.ts';
import type { BrowserPerson } from '@core/family/browser.ts';
import { getCachedDerivedRecords } from '@/lib/family';
import type { FamilyTreeView, BrowserPersonView } from '@/lib/family';
import PedigreeChart from '@/components/family/pedigree-chart-dynamic.client';
import { familyTreeHref } from './shared';
import { AncestorTile } from '@/components/family/ancestor-tile';
import { SectionHeader } from './shared';
```

Then in the function body, replace the `const layout = layoutPedigree({ ... })` call with:

```tsx
  const recordLookup = getCachedDerivedRecords();
  const layout = layoutPedigree({
    focal: view.root as BrowserPerson,
    ancestors: ancestors as BrowserPerson[],
    maxGeneration: MAX_GENERATION,
    includeFrontier: true,
    recordLookup,
  });
```

- [ ] **Step 3: Branch the node-mapping loop on `n.kind`**

Replace the entire `nodes` and `edges` construction (the existing `layout.nodes.map(...)` filter + `layout.edges.map(...)`) with:

```tsx
  const nodes = layout.nodes.map((n) => {
    if (n.kind === 'present') {
      const person = byRecord.get(n.record);
      const name = person?.name ?? n.record;
      const years = person ? formatYears(person) : null;
      const generationLabel = n.generation === 0
        ? t('selfLabel')
        : t('generationLabel', { n: String(n.generation) });
      return {
        id: n.record,
        type: 'pedigree' as const,
        position: { x: n.x - NODE_HALF_WIDTH, y: n.y - NODE_HALF_HEIGHT },
        data: {
          record: n.record,
          name,
          years,
          portrait: person?.portrait,
          isFocal: n.generation === 0,
          href: familyTreeHref(n.record),
        },
      };
    }
    // Frontier node — render a dashed placeholder for the missing parent.
    const labelSpec = kinshipLabelKey(n.generation, n.side, n.role);
    const kinshipLabel = t(labelSpec.key, labelSpec.vars);
    return {
      id: n.id,
      type: 'frontier' as const,
      position: { x: n.x - NODE_HALF_WIDTH, y: n.y - NODE_HALF_HEIGHT },
      data: {
        kinshipLabel,
        descendantRecord: n.descendantRecord,
        href: familyTreeHref(n.descendantRecord),
      },
    };
  });

  const edges = layout.edges.map(e => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    frontier: e.source.startsWith('frontier:'),
  }));
```

- [ ] **Step 4: Update the `<PedigreeChart>` invocation** (the `ariaLabel` prop should already exist from the prior `chartAriaLabel` work):

```tsx
        <PedigreeChart
          nodes={nodes}
          edges={edges}
          ariaLabel={t('chartAriaLabel', { n: String(layout.nodes.filter(n => n.kind === 'present').length) })}
        />
```

The `chartAriaLabel` interpolation now reflects the count of *present* ancestors only (frontier slots aren't ancestors).

- [ ] **Step 5: Typecheck (will fail on missing i18n keys until Task 7)**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`
Expected: TypeScript errors about missing message keys (`kinship.father`, `kinship.paternalGrandmother`, etc.). This is expected — Task 7 adds them. Note the errors and proceed to Task 7 in the same session. If you can't proceed to Task 7 immediately, stage the changes but don't commit yet.

If for some reason typecheck PASSES (e.g., the auto-generated `messages/en.d.json.ts` is stale and doesn't enforce key existence), that's also fine — proceed to Task 7 to make the keys actually present.

- [ ] **Step 6: Defer commit to Task 7**

Don't commit yet — Task 7 adds the i18n keys that make the section's `t('kinship.*')` calls valid. Tasks 6 + 7 commit together.

---

## Task 7: Kinship label i18n keys (all 4 locales)

**Files:**
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ru.json`
- Modify: `frontend/messages/uk.json`
- Modify: `frontend/messages/he.json`

- [ ] **Step 1: Add keys to en.json**

Open `frontend/messages/en.json`. Find the `Page.FamilyTree.pedigree` namespace (which currently has `title`, `emptyState`, `navigateAria`, `selfLabel`, `generationLabel`, `mobileGenerationHeader`, `chartAriaLabel`). Add a `kinship` sub-namespace as a sibling of those keys:

```json
"kinship": {
  "father": "Father",
  "mother": "Mother",
  "paternalGrandfather": "Paternal grandfather",
  "paternalGrandmother": "Paternal grandmother",
  "maternalGrandfather": "Maternal grandfather",
  "maternalGrandmother": "Maternal grandmother",
  "unknownAncestor": "Unknown {n}-great-grandparent"
}
```

- [ ] **Step 2: Add corresponding keys to ru.json**

Stub translations (the translator agent can refine via `wai i18n sync` later):

```json
"kinship": {
  "father": "Отец",
  "mother": "Мать",
  "paternalGrandfather": "Дед по отцу",
  "paternalGrandmother": "Бабушка по отцу",
  "maternalGrandfather": "Дед по матери",
  "maternalGrandmother": "Бабушка по матери",
  "unknownAncestor": "Неизвестный пра-{n}-пра-родственник"
}
```

- [ ] **Step 3: Add corresponding keys to uk.json**

```json
"kinship": {
  "father": "Батько",
  "mother": "Мати",
  "paternalGrandfather": "Дід по батькові",
  "paternalGrandmother": "Бабуся по батькові",
  "maternalGrandfather": "Дід по матері",
  "maternalGrandmother": "Бабуся по матері",
  "unknownAncestor": "Невідомий пра-{n}-пра-родич"
}
```

- [ ] **Step 4: Add corresponding keys to he.json**

```json
"kinship": {
  "father": "אבא",
  "mother": "אמא",
  "paternalGrandfather": "סבא מצד אבא",
  "paternalGrandmother": "סבתא מצד אבא",
  "maternalGrandfather": "סבא מצד אמא",
  "maternalGrandmother": "סבתא מצד אמא",
  "unknownAncestor": "אב קדמון לא ידוע ({n} דורות)"
}
```

- [ ] **Step 5: Restart dev server / regenerate type declaration**

The auto-generated `messages/en.d.json.ts` needs to be refreshed for tsc to recognize the new keys. Run a quick build to regenerate:

```bash
cd /Users/nyetwork/dev/whoami/frontend && npx next build 2>&1 | tail -10
```

If the build fails for unrelated reasons, manually add the new `kinship.*` keys to `messages/en.d.json.ts` (the file is gitignored — manual edits are fine for unblocking, will be overwritten on next build/dev). DO NOT stage `en.d.json.ts` for commit.

- [ ] **Step 6: Typecheck**

Run: `cd /Users/nyetwork/dev/whoami/frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: clean. The Task 6 errors about missing `kinship.*` keys are now resolved.

- [ ] **Step 7: Run all frontend tests**

Run: `cd /Users/nyetwork/dev/whoami/frontend && npm test 2>&1 | tail -10`
Expected: 75 pass + 6 skipped. The messages-parity test should pass since all 4 locale files have the same key shape.

- [ ] **Step 8: Commit Tasks 6 + 7 together**

```bash
git -C /Users/nyetwork/dev/whoami add \
  frontend/components/family/sections/pedigree-section.tsx \
  frontend/messages/en.json \
  frontend/messages/ru.json \
  frontend/messages/uk.json \
  frontend/messages/he.json
git -C /Users/nyetwork/dev/whoami commit -m "chore: render pedigree frontier slots with kinship labels in section"
```

---

## Task 8: Manual browser verification

The implementer subagent cannot operate a browser. This task is the controller's responsibility. The implementer should report a no-op DONE status for this task with a verification checklist for the controller/user to execute.

**Checklist for the user/controller (NOT for the implementer subagent to perform):**

- [ ] Start the dev server (`cd frontend && npm run dev`) and browse to `http://localhost:3001/en/family/tree` via Tailscale
- [ ] Verify: dashed-border slots appear in the chart wherever a present ancestor has a missing parent (look at the focal's known-incomplete branches)
- [ ] Verify: kinship labels read correctly ("Paternal grandmother", "Mother's father" style — actual rendering is "Paternal grandmother" etc.)
- [ ] Verify: dashed edges connect the frontier slots to their descendants (not solid)
- [ ] Verify: clicking a dashed slot navigates to the descendant's tree page (`?person=<record>`)
- [ ] Verify: dark mode renders the dashed border + muted text legibly
- [ ] Verify: Hebrew (`/he/family/tree`) renders the kinship labels in Hebrew; chart spatial layout (left=father / right=mother) is intentionally NOT mirrored
- [ ] Verify: focal-person side: tab through the chart; frontier slots receive focus in expected order; pressing Enter activates the link
- [ ] Compare against the `CoverageSection`'s research-frontier list below the chart — the slots in the chart should correspond to frontier entries in the list (one slot per missing parent)

**For the implementer subagent's report on this task:** mark as DONE with a verification checklist for the user.

---

## Task 9: CHANGELOG entry + ROADMAP flip (single feat commit)

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Add CHANGELOG entry**

Open `CHANGELOG.md`. Find `## [Unreleased] — v2 development` (around line 22). Under the first `### Added` sub-heading, insert at the TOP:

```markdown
- **Pedigree chart frontier slots** — every present ancestor whose `parents[]` lacks a father or mother now produces a dashed-border placeholder node in the `/family/tree` chart at the missing parent's position. Click a slot to open the descendant's tree page (where the existing research-frontier list lives). Sub-project F of 3 in the gap-as-frontier feature (T = talk-page candidate parsing, D = research drawer — both deferred). New `kinship.*` i18n keys in all 4 locales. The recursive-midpoint layout treats frontier slots as full leaves, so asymmetric branches with detectable gaps spread spatially instead of collapsing.
```

This entry has no P-number reference (the parent feature P1.1 is already closed). The roadmap-drift test only enforces P-ID coupling, so a non-P entry is fine and doesn't require a corresponding roadmap row to be flipped.

- [ ] **Step 2: Flip the F row on the roadmap to ✅**

Open `docs/ROADMAP.md`. Find the row in the "Pedigree-chart follow-ons (extends P1.1)" subsection that reads:

```markdown
| **F** Chart frontier slots | S | [`pedigree-frontier-slots-design`](./superpowers/specs/2026-05-18-pedigree-frontier-slots-design.md) | Dashed-border placeholder nodes in the chart for any missing parent of a present ancestor (up to MAX_GENERATION). Kinship label as title, click navigates to descendant's tree. Standalone — no talk-page integration. **Ship first.** |
```

Add a status column at the start. Since this subsection's table doesn't have a status column today, prepend one to the header AND every row in that table. The header becomes:

```markdown
| Status | Item | Lift | Spec | Notes |
|---|---|---|---|---|
```

The F row becomes:

```markdown
| ✅ shipped | **F** Chart frontier slots | S | [`pedigree-frontier-slots-design`](./superpowers/specs/2026-05-18-pedigree-frontier-slots-design.md) | *Shipped 2026-05-18 — recursive-midpoint layout now treats frontier slots as full leaves so asymmetric branches with detectable gaps spread spatially. Kinship labels in all 4 locales. Click navigates to descendant's tree; the research drawer (sub-project D) will later intercept the same click.* |
```

The T and D rows get a placeholder `⏳ ready` status (preserving the existing notes):

```markdown
| ⏳ ready | **T** Talk-page candidates format + parser | M | (spec TBD when picked up) | `## Candidates` section convention in talk files; parser in `core/`; CLI surface (`wai candidates list <slug>`). Standalone data utility — no chart change required. **Ship second.** |
| ⏳ ready | **D** Research drawer | M | (spec TBD when picked up) | Side-panel Sheet opened on click of any chart node (present or frontier). Shows kinship, parsed candidates from T if shipped, action buttons (search wiki, note this as a question, open talk page). **Ship third — depends on F + benefits from T.** |
```

Also bump `**Last updated:**` to today's date (2026-05-18 may already be there).

- [ ] **Step 3: Run drift tests**

Run: `cd /Users/nyetwork/dev/whoami/cli && npx tsx --test test/roadmap-drift.test.ts test/plan-index-drift.test.ts 2>&1 | tail -10`
Expected: 7 tests pass. The new "F" roadmap row uses ✅ shipped but doesn't have a P-number, so the roadmap-drift A check doesn't apply to it. The plan-index-drift C check still fires because the plan is 🚧 with all Create files present — that's fixed in Task 10.

If drift test (C) is the only failure, that's expected at this point.

- [ ] **Step 4: Commit as feat: (CHANGELOG is staged so the hook is satisfied)**

```bash
git -C /Users/nyetwork/dev/whoami add CHANGELOG.md docs/ROADMAP.md
git -C /Users/nyetwork/dev/whoami commit -m "$(cat <<'EOF'
feat: pedigree chart frontier slots (gap-as-frontier sub-project F)

Every present ancestor whose parents[] lacks a father or mother
produces a dashed-border placeholder node in the /family/tree chart
at the missing parent's position. Click a slot to open the
descendant's tree page (where the existing research-frontier list
lives).

Recursive-midpoint layout now treats frontier slots as full leaves,
so asymmetric branches with detectable gaps spread spatially
instead of collapsing — the chart shows research gaps directly
rather than hiding them.

Sub-project F of 3 in the gap-as-frontier feature. T (talk-page
candidate parsing) and D (research drawer) ship as separate
follow-ons.

Spec: docs/superpowers/specs/2026-05-18-pedigree-frontier-slots-design.md
EOF
)"
```

---

## Task 10: Flip plan-index to ✅ and push

**Files:**
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Flip the plan row to ✅**

Open `docs/superpowers/plans/README.md`. Find the row from Task 1 (the `2026-05-18-pedigree-frontier-slots.md` row) and change `🚧` to `✅`. Update the footer:

```
**Total: 46 plans** — 41 shipped (✅), 0 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).
```

- [ ] **Step 2: Run all drift tests**

Run: `cd /Users/nyetwork/dev/whoami/cli && npx tsx --test test/roadmap-drift.test.ts test/plan-index-drift.test.ts 2>&1 | tail -10`
Expected: 7 tests pass.

- [ ] **Step 3: Commit + push**

```bash
git -C /Users/nyetwork/dev/whoami add docs/superpowers/plans/README.md
git -C /Users/nyetwork/dev/whoami commit -m "docs: flip pedigree-frontier-slots plan to shipped"
git -C /Users/nyetwork/dev/whoami push -u origin feat/pedigree-frontier-slots
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-05-18-pedigree-frontier-slots-design.md`):

| Spec section | Task(s) |
|---|---|
| `kind: 'present' \| 'frontier'` discriminated union | Task 2 |
| `includeFrontier` + `recordLookup` config | Task 2 (scaffold) + Task 3 (emission) |
| Frontier-node emission for missing parents | Task 3 |
| `FrontierNode` rendered with dashed border + kinship label | Task 4 + Task 6 |
| Layout treats frontier slots as full leaves | Task 3 (algorithm uses `childrenOf` map that includes frontier entries) |
| Kinship labels in all 4 locales | Task 7 |
| Dashed edges from frontier slots | Task 5 (chart wrapper) + Task 6 (section tags edges) |
| Slots NOT emitted above MAX_GENERATION | Task 3 (explicit `if (a.generation >= cfg.maxGeneration) continue`) + Task 3 test 4 |
| Click navigates to descendant's tree | Task 4 (`href={data.href}`) + Task 6 (`href: familyTreeHref(n.descendantRecord)`) |
| Stable frontier id format `frontier:<descendantRecord>:<role>` | Task 3 |
| Hebrew RTL: labels in Hebrew, spatial convention not mirrored | Task 7 (Hebrew translations) + acceptance via no-op (React Flow canvas is LTR) |
| Mobile fallback continues to show only present ancestors | Implicit — Task 6 only modifies the desktop chart path; the mobile `md:hidden` block is untouched |
| Manual verification checklist | Task 8 (controller-level) |
| Per-generation Coverage numbers match chart present-vs-frontier count | No explicit task — the chart and `CoverageSection` derive from the same `parents[]` data, so this is structurally true. Manual verification in Task 8. |

**Placeholder scan:** no "TBD" / "TODO" / "fill in details" found in task steps. Code blocks present at every code step. The "spec TBD when picked up" strings in Task 9's roadmap edit are placeholder text *in the roadmap*, not in the plan — those refer to T and D's future specs, which haven't been written yet. Accept.

**Type consistency:**
- `PresentNode`, `FrontierNode`, `PedigreeNode = PresentNode | FrontierNode` defined in Task 2, used consistently in Tasks 3, 5, 6. ✓
- `LayoutConfig.includeFrontier?: boolean`, `LayoutConfig.recordLookup?: ReadonlyMap<string, DerivedRecord>` defined Task 2, used Task 3 + 6. ✓
- Frontier id format `frontier:<record>:<role>` consistent between Task 3 (emission) and Task 6 (`e.source.startsWith('frontier:')`). ✓
- `PedigreeFrontierNodeData` defined in Task 4, used in Task 5's chart prop union and Task 6's section building. ✓
- `PedigreeChartProps` widened in Task 5; consumed by Task 6's `<PedigreeChart>` call. ✓
- The chart wrapper exports `ariaLabel` as a top-level prop (consistent with the prior task that added it). Task 6 passes it. ✓
- `t('kinship.father')` etc. — keys added in Task 7 across all 4 locales. ✓

**One spec requirement with a structural answer (not a task):** "Per-generation Coverage numbers match chart present-vs-frontier count." Both derive from the same `parents[]` field on the same `DerivedRecord` set — they can't disagree unless the layout function and `lib/family.ts`'s frontier computation diverge in their interpretation of "missing parent." The two sites are now parallel (a DRY-up that's flagged in the spec as future work). Task 8's manual verification spot-checks this.
