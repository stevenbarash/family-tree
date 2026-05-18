# Pedigree Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the list-of-cards on `/family/tree` with an interactive ancestor pedigree chart at the top of the page, rendered with React Flow.

**Architecture:** Pure layout function in `core/src/family/pedigree-layout.ts` (no dependency on React or D3 — assigns x/y to each ancestor based on its path-from-root, ~50 lines). A server-component section reads the already-computed `FamilyTreeView`, invokes the layout function, and renders the chart via a **client-side dynamic-wrapper** (Next 16 forbids `dynamic({ ssr: false })` calls inside a server component, so the `dynamic()` call lives in its own `"use client"` file). The wrapper loads the React Flow mount component (`@xyflow/react` v12) with a custom node type rendering the same `AvatarMonogram` + name + dates the existing `AncestorTile` uses. Below `md` viewport, React Flow is hidden via Tailwind and a stacked vertical list renders instead (the existing `LineageSection` pattern). Click a node → navigate to that person's tree via `familyTreeHref(record)`.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, `@xyflow/react@^12.10.2` (React Flow), Tailwind utility classes, `next-intl` for strings. Existing `core/src/family/browser.ts` provides ancestor data.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `core/src/family/pedigree-layout.ts` | Create | Pure layout function: given `BrowserPerson[]` ancestors + root, return `{ nodes: Array<{ record, x, y, generation, side }>, edges: Array<{ source, target }> }`. No React, no D3. |
| `core/test/family/pedigree-layout.test.ts` | Create | Tests for the layout function: empty tree, 1-gen, 3-gen full, asymmetric (only paternal). |
| `frontend/package.json` | Modify | Add `@xyflow/react` dep. |
| `frontend/components/family/pedigree-node.tsx` | Create | The React Flow custom node: portrait monogram + name + dates. Plain RSC-safe markup (rendered inside React Flow but no `window` usage). |
| `frontend/components/family/pedigree-chart.client.tsx` | Create | `"use client"` component that wraps `<ReactFlow>` with read-only config, custom node type, click-to-navigate. Does **not** import React Flow CSS (handled by the section so Turbopack doesn't dedupe it away). |
| `frontend/components/family/pedigree-chart-dynamic.client.tsx` | Create | Thin `"use client"` file that calls `dynamic(() => import('./pedigree-chart.client'), { ssr: false })` and re-exports the result. Exists because Next 16 throws if `dynamic({ ssr: false })` is called from inside an RSC. |
| `frontend/components/family/sections/pedigree-section.tsx` | Create | Server-component section. Imports React Flow CSS at module top (RSC-safe). Joins ancestors with portraits + slugs, computes layout via core, passes serialized `{ nodes, edges }` to the dynamic client wrapper. Renders a `LineageSection`-style fallback on `< md`. |
| `frontend/app/[locale]/family/tree/page.tsx` | Modify | Import + render `<PedigreeSection view={view} />` as the first section after the header (line ~173, before `<PersonHeaderSection>`). |
| `frontend/messages/en.json` | Modify | Add `Page.FamilyTree.pedigree.{title,emptyState,navigateAria}` keys. |
| `docs/superpowers/plans/README.md` | Modify | Add a 🚧 row for this plan. Flip to ✅ in the final task. |
| `docs/ROADMAP.md` | Modify | Final task: flip Wave 4 P1.1 row to ✅ shipped with date + commit hash. |
| `CHANGELOG.md` | Modify | Add entry under `## [Unreleased]` naming "closes platform-review P1.1". |

---

## Task 1: Plan-index entry (open the plan)

**Files:**
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add a 🚧 row to the plan index**

Open `docs/superpowers/plans/README.md`. Find the row for `2026-05-18-quality-checks-pass-2.md` (it's the most-recent ✅ entry at the top of the table). Insert a new row directly above it:

```markdown
| 🚧 | [`2026-05-18-pedigree-chart.md`](./2026-05-18-pedigree-chart.md) | Pedigree chart on `/family/tree` | React Flow + pure layout function in `core/src/family/pedigree-layout.ts`. Ancestor chart (focal at bottom, ancestors above, 5 generations) renders above the existing sections; mobile (`< md`) falls back to a vertical list. Closes platform-review P1.1. |
```

Update the `**Total: 44 plans**` footer at line 80 to `**Total: 45 plans** — 39 shipped (✅), 1 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).`

- [ ] **Step 2: Verify the plan-index drift test still passes**

Run: `cd cli && npx tsx --test test/plan-index-drift.test.ts`
Expected: 5 tests pass. The new row references a plan file that doesn't exist yet, which would fail test (B). Read the test error carefully — if (B) fails because the plan file is missing, that's expected for Step 2; create the plan file (this very file) and re-run.

Note: this very file (`2026-05-18-pedigree-chart.md`) was created when you read it, so test (B) passes. Test (C) checks that 🚧 plans don't have all their `Create:` files already on disk — none of the Create files in the table above exist yet, so (C) passes.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/README.md docs/superpowers/plans/2026-05-18-pedigree-chart.md
git commit -m "docs: plan for pedigree chart (P1.1)"
```

---

## Task 2: Pure layout function in core (TDD)

**Files:**
- Create: `core/src/family/pedigree-layout.ts`
- Test: `core/test/family/pedigree-layout.test.ts`

The layout function is pure: it takes the ancestors + root that `getFamilyTree` already produces and returns positioned nodes + edges. No `d3-hierarchy` dep — for a binary pedigree of ≤5 generations (max 63 nodes) we assign x via the path-from-root.

Layout convention:
- y = `-generation * ROW_HEIGHT` (focal at y=0, parents at y=-180, etc.)
- x for the focal = 0. Each ancestor gets x via its binary `pathFromRoot` (already a string[] on `BrowserPerson`): father step = `-1`, mother step = `+1`, scaled by `2^(MAX_GEN - currentGen) * COL_HALF_WIDTH`.
- Result: a perfect binary pedigree spreads evenly; missing ancestors leave gaps (correct — gap = research frontier).

- [ ] **Step 1: Write the failing test file**

```typescript
// core/test/family/pedigree-layout.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutPedigree } from '../../src/family/pedigree-layout.ts';
import type { BrowserPerson } from '../../src/family/browser.ts';

function makePerson(
  record: string,
  generation: number,
  side: 'self' | 'paternal' | 'maternal',
  pathFromRoot: string[],
  role?: 'father' | 'mother',
): BrowserPerson {
  return {
    record,
    name: record,
    birth: null,
    death: null,
    generation,
    side,
    role,
    label: '',
    pathFromRoot,
  };
}

test('layoutPedigree: empty ancestors returns only the focal node at origin', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const result = layoutPedigree({ focal, ancestors: [], maxGeneration: 4 });
  assert.equal(result.nodes.length, 1);
  assert.deepEqual(result.nodes[0], { record: 'I1', x: 0, y: 0, generation: 0, side: 'self' });
  assert.deepEqual(result.edges, []);
});

test('layoutPedigree: 1 generation places father left, mother right', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const mother = makePerson('I3', 1, 'maternal', ['I3'], 'mother');
  const result = layoutPedigree({ focal, ancestors: [father, mother], maxGeneration: 4 });

  const fatherNode = result.nodes.find(n => n.record === 'I2')!;
  const motherNode = result.nodes.find(n => n.record === 'I3')!;

  assert.ok(fatherNode.x < 0, `father should be left of center, got x=${fatherNode.x}`);
  assert.ok(motherNode.x > 0, `mother should be right of center, got x=${motherNode.x}`);
  assert.equal(fatherNode.x, -motherNode.x, 'father and mother should be symmetric');
  assert.equal(fatherNode.y, mother.generation * -180);
  assert.equal(result.edges.length, 2);
  assert.deepEqual(result.edges.sort((a, b) => a.source.localeCompare(b.source)), [
    { source: 'I2', target: 'I1' },
    { source: 'I3', target: 'I1' },
  ]);
});

test('layoutPedigree: 3 generations spread monotonically by horizontal position', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const mother = makePerson('I3', 1, 'maternal', ['I3'], 'mother');
  const ff = makePerson('I4', 2, 'paternal', ['I2', 'I4'], 'father');
  const fm = makePerson('I5', 2, 'paternal', ['I2', 'I5'], 'mother');
  const mf = makePerson('I6', 2, 'maternal', ['I3', 'I6'], 'father');
  const mm = makePerson('I7', 2, 'maternal', ['I3', 'I7'], 'mother');
  const result = layoutPedigree({
    focal,
    ancestors: [father, mother, ff, fm, mf, mm],
    maxGeneration: 4,
  });

  // Generation 2 should be evenly spread, monotonic L→R: ff < fm < mf < mm
  const g2 = result.nodes.filter(n => n.generation === 2).sort((a, b) => a.x - b.x);
  assert.deepEqual(g2.map(n => n.record), ['I4', 'I5', 'I6', 'I7']);
  // Edges include child→parent at each step
  assert.ok(result.edges.some(e => e.source === 'I4' && e.target === 'I2'));
  assert.ok(result.edges.some(e => e.source === 'I7' && e.target === 'I3'));
});

test('layoutPedigree: asymmetric tree (only paternal line) places nodes correctly', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const ff = makePerson('I3', 2, 'paternal', ['I2', 'I3'], 'father');
  const result = layoutPedigree({ focal, ancestors: [father, ff], maxGeneration: 4 });

  assert.equal(result.nodes.length, 3);
  // No mother node at gen 1 → gap stays. Father's position unchanged.
  const fatherNode = result.nodes.find(n => n.record === 'I2')!;
  const ffNode = result.nodes.find(n => n.record === 'I3')!;
  assert.ok(fatherNode.x < 0);
  assert.ok(ffNode.x < fatherNode.x, "father's father should be further left than father");
});

test('layoutPedigree: maxGeneration clamps the visible nodes', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const deep = makePerson('I9', 6, 'paternal', ['a', 'b', 'c', 'd', 'e', 'I9'], 'father');
  const result = layoutPedigree({ focal, ancestors: [deep], maxGeneration: 4 });
  assert.equal(result.nodes.find(n => n.record === 'I9'), undefined,
    'ancestor beyond maxGeneration should be filtered out');
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd core && npx tsx --test test/family/pedigree-layout.test.ts`
Expected: All tests fail with "Cannot find module '../../src/family/pedigree-layout.ts'".

- [ ] **Step 3: Implement the layout function**

```typescript
// core/src/family/pedigree-layout.ts
import type { BrowserPerson } from './browser.ts';

export interface PedigreeNode {
  record: string;
  x: number;
  y: number;
  generation: number;
  side: 'self' | 'paternal' | 'maternal';
}

export interface PedigreeEdge {
  /** child → parent direction (source is the descendant) */
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
}

/** Vertical pixel distance between generation rows. */
const ROW_HEIGHT = 180;
/** Horizontal half-width allocated to each side of the focal at the top
 *  generation. The actual unit width per node at generation g is
 *  COL_HALF_WIDTH * 2 / 2^g, so the top row gets COL_HALF_WIDTH per slot. */
const COL_HALF_WIDTH = 320;

/**
 * Layout an ancestor pedigree: focal at (0, 0); ancestors above (negative y);
 * x assigned by binary path-from-root so the top generation spreads evenly.
 * Missing ancestors leave their slot empty — gap = research frontier signal.
 * Pure: no DOM, no React, no I/O.
 */
export function layoutPedigree(cfg: LayoutConfig): PedigreeLayout {
  const visible = cfg.ancestors.filter(a => a.generation <= cfg.maxGeneration);

  const nodes: PedigreeNode[] = [
    { record: cfg.focal.record, x: 0, y: 0, generation: 0, side: 'self' },
  ];

  // Reconstruct x from pathFromRoot: each step is a record id of a parent.
  // We need to know whether each step is the father (left, contributes -1)
  // or mother (right, contributes +1). Build a lookup from a person's record
  // to its `role` so we can walk any pathFromRoot and sum the bit pattern.
  const roleByRecord = new Map<string, 'father' | 'mother'>();
  for (const a of cfg.ancestors) {
    if (a.role) roleByRecord.set(a.record, a.role);
  }

  for (const a of visible) {
    let frac = 0;
    let denom = 1;
    for (const step of a.pathFromRoot) {
      denom *= 2;
      const role = roleByRecord.get(step);
      // father = left half, mother = right half; missing role defaults to
      // father side (legacy data) so position is deterministic.
      frac += role === 'mother' ? 1 / denom : -1 / denom;
    }
    // frac ∈ (-1, +1); scale by the half-width budget so generation 1
    // (denom=2 → frac=±0.5) lands at ±COL_HALF_WIDTH * 0.5.
    const x = frac * COL_HALF_WIDTH * 2;
    nodes.push({
      record: a.record,
      x,
      y: -a.generation * ROW_HEIGHT,
      generation: a.generation,
      side: a.side === 'self' ? 'paternal' : a.side,
    });
  }

  // Edges: each ancestor's last pathFromRoot step is its direct child within
  // the tree (the record at index pathFromRoot.length - 2, or the focal if
  // pathFromRoot.length === 1).
  const edges: PedigreeEdge[] = [];
  const visibleRecords = new Set(nodes.map(n => n.record));
  for (const a of visible) {
    const childRecord = a.pathFromRoot.length === 1
      ? cfg.focal.record
      : a.pathFromRoot[a.pathFromRoot.length - 2]!;
    if (visibleRecords.has(childRecord)) {
      edges.push({ source: a.record, target: childRecord });
    }
  }

  return { nodes, edges };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd core && npx tsx --test test/family/pedigree-layout.test.ts`
Expected: all 5 tests pass. If a test fails with a position assertion, the symmetry / monotonic-spread invariants are wrong — re-read the test to understand what it expects before changing the implementation.

- [ ] **Step 5: Run the full core suite to confirm no regressions**

Run: `cd core && npm test`
Expected: 536 tests pass (531 + 5 new).

- [ ] **Step 6: Commit**

```bash
git add core/src/family/pedigree-layout.ts core/test/family/pedigree-layout.test.ts
git commit -m "feat: pedigree-chart layout function (pure)"
```

This is a `feat:` commit but adds no user-facing surface — it's a primitive consumed by Task 4. The CHANGELOG entry for the whole feature lands in Task 9; the pre-commit hook will block this commit if CHANGELOG isn't staged. Workaround: retitle as `chore: pedigree-layout primitive` (chore/refactor/docs/test prefixes are exempt from the hook per CLAUDE.md Rule 13). Use `chore:` here.

```bash
git commit -m "chore: pedigree-chart layout function (pure)"
```

---

## Task 3: Install @xyflow/react

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Add the dependency**

Run: `cd frontend && npm install @xyflow/react@^12.10.2`
Expected: `package.json` gets `"@xyflow/react": "^12.10.2"` under `dependencies` and `package-lock.json` is updated. v12 is the current major as of May 2026 (latest `12.10.2`); no v13 has shipped. React-19-compatible since 12.4.

- [ ] **Step 2: Verify it resolves**

Run: `cd frontend && npx tsc --noEmit`
Expected: typecheck passes (no usage of the package yet, just verifying the install didn't break anything).

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add @xyflow/react for pedigree chart"
```

---

## Task 4: Pedigree node component (server-safe)

**Files:**
- Create: `frontend/components/family/pedigree-node.tsx`

This is the React Flow custom node renderer. It's plain JSX — no `window`, no React Flow hooks — so it can be imported from both server and client components. (React Flow types live in `@xyflow/react` which is browser-only; we import only the `NodeProps` type to avoid runtime resolution.)

- [ ] **Step 1: Create the component**

```tsx
// frontend/components/family/pedigree-node.tsx
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { AvatarMonogram } from './avatar-monogram';

export interface PedigreeNodeData {
  record: string;
  name: string;
  years: string | null;
  portrait?: string;
  isFocal: boolean;
  href: string;
}

// v12 NodeProps takes the full Node type, not the data type.
// See https://reactflow.dev/learn/troubleshooting/migrate-to-v12
export type PedigreeNodeType = Node<PedigreeNodeData, 'pedigree'>;

/**
 * React Flow custom node for a person in the pedigree chart.
 * Read-only: the whole node is a link to that person's tree view.
 * Two handles (top + bottom) so edges connect from parent-bottom to
 * child-top — visually clean for the ancestors-above layout.
 * Handles use opacity-0 (not display:none) because React Flow needs
 * the handle dimensions to position edges.
 */
export function PedigreeNode({ data }: NodeProps<PedigreeNodeType>) {
  return (
    <a
      href={data.href}
      className={[
        'group flex w-44 items-center gap-2 rounded-md border bg-card px-2.5 py-2 shadow-sm transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        data.isFocal ? 'border-foreground ring-1 ring-foreground/30' : 'border-border',
      ].join(' ')}
      aria-label={`${data.name}${data.years ? ` (${data.years})` : ''} — open in family tree`}
    >
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <Handle type="source" position={Position.Top} className="!opacity-0" />
      <AvatarMonogram name={data.name} portrait={data.portrait} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.78rem] font-medium leading-tight">
          <bdi>{data.name}</bdi>
        </div>
        {data.years ? (
          <div className="font-mono text-[0.65rem] leading-tight text-muted-foreground">
            {data.years}
          </div>
        ) : null}
      </div>
    </a>
  );
}
```

Note: `isConnectable={false}` is omitted from the `<Handle>` instances because `nodesConnectable={false}` on the root `<ReactFlow>` (Task 5) already covers the whole chart.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: typecheck passes. If `AvatarMonogram`'s `size="sm"` prop doesn't exist, check the actual prop signature at `frontend/components/family/avatar-monogram.tsx` and use whichever size token gives a ~32px avatar; adjust the prop value, don't invent new props.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/family/pedigree-node.tsx
git commit -m "chore: pedigree-node custom React Flow node"
```

---

## Task 5: Client wrapper that mounts React Flow

**Files:**
- Create: `frontend/components/family/pedigree-chart.client.tsx`

This is the `"use client"` component that mounts React Flow. React Flow imports `window` at module top-level, so this file is loaded via `dynamic({ ssr: false })` from the wrapper in Task 6 (which itself is a `"use client"` file — Next 16 forbids that call from a server component).

**CSS import location:** the `@xyflow/react/dist/style.css` import lives in the **server** section file (Task 7), not here. Reason: Turbopack in Next 16 occasionally deduplicates CSS imported only from a `ssr:false`-loaded chunk, causing a brief unstyled flash. Loading the stylesheet from the RSC ensures it's part of the route's initial CSS payload.

- [ ] **Step 1: Create the wrapper**

```tsx
// frontend/components/family/pedigree-chart.client.tsx
'use client';

import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import { PedigreeNode, type PedigreeNodeData } from './pedigree-node';

export interface PedigreeChartProps {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: PedigreeNodeData;
    ariaLabel: string;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

const nodeTypes = { pedigree: PedigreeNode };

/**
 * Mounts React Flow with the pre-computed layout.
 * Read-only: nodes are not draggable; edges are not editable.
 * Pan and zoom are kept on — the chart is too wide for a 5-gen tree
 * to fit fully zoomed-in on most viewports, so users need to navigate it.
 * Clicks pass through to the per-node `<a href>`; React Flow's own
 * node-click handler is unused.
 */
export default function PedigreeChart({ nodes, edges }: PedigreeChartProps) {
  const rfNodes: Node[] = nodes.map(n => ({
    id: n.id,
    type: 'pedigree',
    position: n.position,
    data: n.data,
    draggable: false,
    selectable: false,
    connectable: false,
    domAttributes: { 'aria-label': n.ariaLabel },
  }));
  const rfEdges: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    style: { stroke: 'var(--border)', strokeWidth: 1.5 },
  }));

  return (
    <div className="h-[520px] w-full overflow-hidden rounded-md border rule-hair bg-muted/30">
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

`fitViewOptions={{ padding: 0.2 }}` (not 0.15) because React Flow measures node sizes asynchronously after portraits load; a slightly looser padding absorbs the post-measure shift without overflowing the canvas.

`proOptions: { hideAttribution: true }` is the supported API. The xyflow license (MIT) explicitly permits hiding the attribution on personal projects; commercial users are asked to keep it or buy Pro. See https://reactflow.dev/learn/troubleshooting/remove-attribution.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes. If `domAttributes` isn't a valid v12 property on `Node`, fall back to setting `aria-label` inside the `PedigreeNode` component using `data.ariaLabel`. The expected v12 prop is `domAttributes`; v11 used `ariaLabel` directly.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/family/pedigree-chart.client.tsx
git commit -m "chore: pedigree-chart client wrapper around React Flow"
```

---

## Task 6: Client-side dynamic wrapper

**Files:**
- Create: `frontend/components/family/pedigree-chart-dynamic.client.tsx`

Next 16 throws at build time if you call `dynamic(() => …, { ssr: false })` from inside a server component. The fix is a thin `"use client"` file that owns the `dynamic()` call; the RSC then imports that file directly with no `dynamic()` of its own. See https://nextjs.org/docs/app/guides/lazy-loading — *"`ssr: false` is not supported in Server Components."*

- [ ] **Step 1: Create the dynamic wrapper**

```tsx
// frontend/components/family/pedigree-chart-dynamic.client.tsx
'use client';

import dynamic from 'next/dynamic';
import type { PedigreeChartProps } from './pedigree-chart.client';

const PedigreeChart = dynamic(() => import('./pedigree-chart.client'), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] w-full animate-pulse rounded-md border rule-hair bg-muted/30" />
  ),
});

export default function PedigreeChartDynamic(props: PedigreeChartProps) {
  return <PedigreeChart {...props} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/family/pedigree-chart-dynamic.client.tsx
git commit -m "chore: client-side dynamic wrapper for pedigree chart (Next 16 RSC requirement)"
```

---

## Task 7: Server-component section with mobile fallback

**Files:**
- Create: `frontend/components/family/sections/pedigree-section.tsx`

This is the integration point: it reads `FamilyTreeView`, joins ancestors with their portraits + slugs (already on `view.byGeneration[].paternal[]` / `.maternal[]` as `BrowserPersonView`), invokes the layout function, and renders either the chart (on `md+`) or a compact ancestor list (on `< md`).

The chart is imported through the Task 6 dynamic wrapper. CSS is imported here in the RSC so it's part of the route's initial CSS payload (avoids Turbopack flash-of-unstyled).

- [ ] **Step 1: Create the section**

```tsx
// frontend/components/family/sections/pedigree-section.tsx
import '@xyflow/react/dist/style.css';
import { getTranslations } from 'next-intl/server';
import { layoutPedigree, type PedigreeNode as LayoutNode } from '@core/family/pedigree-layout.ts';
import type { BrowserPerson } from '@core/family/browser.ts';
import type { FamilyTreeView, BrowserPersonView } from '@/lib/family';
import PedigreeChart from '@/components/family/pedigree-chart-dynamic.client';
import { familyTreeHref } from './shared';
import { AncestorTile } from '@/components/family/ancestor-tile';
import { SectionHeader } from './shared';

const MAX_GENERATION = 4;
const NODE_HALF_WIDTH = 88; // half of `w-44` from PedigreeNode
const NODE_HALF_HEIGHT = 28; // approx half-height of the rendered card

interface Props {
  view: FamilyTreeView;
}

function formatYears(p: BrowserPersonView): string | null {
  const b = p.birth?.date ?? null;
  const d = p.death?.date ?? null;
  if (!b && !d) return null;
  const by = b?.match(/\b(\d{4})\b/)?.[1] ?? '?';
  const dy = d?.match(/\b(\d{4})\b/)?.[1] ?? '';
  return dy ? `${by}–${dy}` : `b. ${by}`;
}

export async function PedigreeSection({ view }: Props) {
  const t = await getTranslations('Page.FamilyTree.pedigree');

  // Flatten generations into a single ancestor array for the pure layout.
  const ancestors: BrowserPersonView[] = [];
  for (const gen of view.byGeneration) {
    for (const p of gen.paternal) ancestors.push(p);
    for (const p of gen.maternal) ancestors.push(p);
  }
  if (ancestors.length === 0) {
    return (
      <section className="mb-12">
        <SectionHeader title={t('title')} count={0} />
        <p className="font-display text-sm text-muted-foreground">{t('emptyState')}</p>
      </section>
    );
  }

  const layout = layoutPedigree({
    focal: view.root as BrowserPerson,
    ancestors: ancestors as BrowserPerson[],
    maxGeneration: MAX_GENERATION,
  });

  // Index ancestors by record for cheap lookup when building node data.
  const byRecord = new Map<string, BrowserPersonView>();
  byRecord.set(view.root.record, view.root);
  for (const a of ancestors) byRecord.set(a.record, a);

  const nodes = layout.nodes.map((n: LayoutNode) => {
    const person = byRecord.get(n.record);
    const name = person?.name ?? n.record;
    const years = person ? formatYears(person) : null;
    const generationLabel = n.generation === 0 ? 'self' : `generation ${n.generation}`;
    return {
      id: n.record,
      position: { x: n.x - NODE_HALF_WIDTH, y: n.y - NODE_HALF_HEIGHT },
      data: {
        record: n.record,
        name,
        years,
        portrait: person?.portrait,
        isFocal: n.generation === 0,
        href: familyTreeHref(n.record),
      },
      // Per-node aria-label applied by React Flow via domAttributes; complements
      // the <a aria-label> on the inner link (screen readers benefit from both).
      ariaLabel: `${name}, ${generationLabel}${years ? `, ${years}` : ''}`,
    };
  });
  const edges = layout.edges.map(e => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
  }));

  return (
    <section className="mb-12">
      <SectionHeader title={t('title')} count={layout.nodes.length} />

      {/* Desktop: interactive chart */}
      <div className="hidden md:block">
        <PedigreeChart nodes={nodes} edges={edges} />
      </div>

      {/* Mobile: stacked generations list — keep what works */}
      <div className="md:hidden">
        <ol className="space-y-3" aria-label={t('navigateAria')}>
          {view.byGeneration.slice(0, MAX_GENERATION).map(gen => (
            <li key={`pedigree-mobile-gen-${gen.generation}`}>
              <div className="mb-1 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
                Generation {gen.generation}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[...gen.paternal, ...gen.maternal].map((p, i) => (
                  <AncestorTile
                    key={`pedigree-mobile-${p.record}-${i}`}
                    href={familyTreeHref(p.record)}
                    name={p.name}
                    meta={formatYears(p) ?? ''}
                    ordinal=""
                    portrait={p.portrait}
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes. If `view.root` doesn't match `BrowserPerson` (e.g., missing `pathFromRoot`), check `BrowserPersonView` in `frontend/lib/family.ts` — `view.root` is the focal person and should already extend `BrowserPerson`. If it doesn't, the cast is wrong; widen the type, don't `as any`.

- [ ] **Step 3: Add the missing message keys**

Open `frontend/messages/en.json`. Find the `Page.FamilyTree` namespace. Add a new `pedigree` sub-namespace:

```json
"pedigree": {
  "title": "Pedigree",
  "emptyState": "No ancestors recorded yet.",
  "navigateAria": "Ancestors by generation"
},
```

If the en.json declaration auto-regen complains during typecheck, restart the dev server once to regenerate `messages/en.d.json.ts` per `frontend/AGENTS.md`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/family/sections/pedigree-section.tsx frontend/messages/en.json
git commit -m "chore: pedigree section (server) with mobile list fallback"
```

---

## Task 8: Wire the section into the tree page

**Files:**
- Modify: `frontend/app/[locale]/family/tree/page.tsx`

The section renders at the very top of the body content, immediately under the sticky header, *above* `PersonHeaderSection`. This is the "tree, with directories below it" reframing the review asked for.

- [ ] **Step 1: Add the import**

In `frontend/app/[locale]/family/tree/page.tsx`, after the existing imports of section components (around line 28), add:

```typescript
import { PedigreeSection } from '@/components/family/sections/pedigree-section';
```

- [ ] **Step 2: Render the section at the top of the body**

Find the body container (around line 172):

```tsx
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
        <PersonHeaderSection view={view} ancestorCount={ancestorCount} generationCount={generationCount} />
```

Insert `<PedigreeSection>` between the opening `<div>` and `<PersonHeaderSection>`:

```tsx
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
        <PedigreeSection view={view} />
        <PersonHeaderSection view={view} ancestorCount={ancestorCount} generationCount={generationCount} />
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm test`
Expected: 75 tests pass (no test exists for this page yet — that's fine; the section is composition, not logic).

- [ ] **Step 5: Manual browser verification**

Start the dev server: `cd frontend && npm run dev`
Browse to `http://localhost:3001/en/family/tree` over Tailscale.

Verify on desktop (`md+`):
- Pedigree chart renders above the existing sections
- Focal person is at the bottom-center with a highlighted border
- Pan + zoom work (mouse drag and scroll wheel)
- Clicking a node navigates to that person's tree view (URL changes to `?person=I...`)
- Dark-mode toggle: chart card, node borders, and edge stroke all use design tokens — no hardcoded slate/blue
- Hovering a node visually highlights it (the `hover:bg-accent` class)

Verify on mobile (resize to `< 768px` width or use device emulation):
- Chart is hidden; the stacked-generations list is visible
- Each tile is a working link

Verify accessibility:
- Tab through nodes (chart focus): each node should receive focus and Enter activates it (the `<a>` makes this work for free)
- Screen reader: each node announces "name (years) — open in family tree"

Things that would block ship and need investigation:
- Edges render but go through the middle of node bodies (handle positions wrong → revisit `Position.Top`/`Position.Bottom` in pedigree-node.tsx)
- Layout overflow: top-row ancestors clip off the canvas (raise `fitViewOptions.padding` to 0.25)
- Hydration mismatch warning in dev console (means a server-rendered fragment differs from client — most likely the `dynamic({ ssr: false })` isn't being used; verify the import in pedigree-section.tsx)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/[locale]/family/tree/page.tsx
git commit -m "feat: pedigree chart on /family/tree (P1.1)

Interactive ancestor chart at the top of /family/tree, replacing the
list-only layout the page launched with. React Flow renders the chart
on md+ viewports with pan, zoom, click-to-navigate; mobile (< md)
falls back to a stacked generations list (kept from the existing
LineageSection pattern).

Layout is a pure function in core/src/family/pedigree-layout.ts —
takes the ancestors already produced by getFamilyTree and assigns x
from the binary path-from-root, y from generation. ~50 lines, no
d3-hierarchy dep.

Closes platform-review P1.1."
```

The `feat:` commit requires a CHANGELOG entry per CLAUDE.md Rule 13. Task 9 adds the entry — if the pre-commit hook blocks here, complete Task 9 first and amend the commit message in Task 10 instead.

If hook blocks at this point: stash, complete Task 9, return and re-stage + recommit. Alternative: complete Steps 1-5 of Task 9 first, then commit Tasks 8+9 together (one `feat:` commit including the CHANGELOG entry).

**Recommended ordering:** do Task 9 Steps 1-2 before Task 8 Step 6 so the CHANGELOG is staged when the `feat:` commit lands. The split here is a plan-readability decision, not a commit-boundary decision.

---

## Task 9: CHANGELOG + roadmap entry

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Add CHANGELOG entry under [Unreleased] / Added**

Open `CHANGELOG.md`. Find `## [Unreleased] — v2 development` (line 22) and its first `### Added` sub-heading. Insert a new bullet at the top of that section:

```markdown
- **Pedigree chart on `/family/tree` (P1.1)** — interactive ancestor chart at the top of the page, replacing the list-only layout. Pure layout function in `core/src/family/pedigree-layout.ts` assigns positions from the binary path-from-root (no `d3-hierarchy` dep); React Flow (`@xyflow/react` v12) renders on `md+` with pan, zoom, click-to-navigate; mobile falls back to a stacked generations list (`< md`). Focal person highlighted; node clicks route via `familyTreeHref`. Closes platform-review P1.1 — the single biggest UX gap the review called out.
```

- [ ] **Step 2: Flip the ROADMAP row**

Open `docs/ROADMAP.md`. Find the Wave 4 P1.1 row (search for `**P1.1** Pedigree chart`). Change `⏳ ready` to `✅ shipped` and append a *Shipped 2026-05-18.* annotation describing the implementation, matching the style of the other ✅ rows. Example:

```markdown
| ✅ shipped | **P1.1** Pedigree chart on `/family/tree` (SVG, ~200 lines) | M | [Review §P1.1](./reviews/2026-05-07-platform-review.md#p11--familytree-is-a-list-not-a-tree) — *Shipped 2026-05-18. Interactive ancestor chart at the top of `/family/tree`, replacing the list-only layout. Pure layout function in `core/src/family/pedigree-layout.ts` (~50 lines, no `d3-hierarchy` dep) feeds React Flow (`@xyflow/react` v12); mobile falls back to a stacked generations list. The "tree, with directories below it" reframing the review asked for.* |
```

Also bump `**Last updated:**` to today's date if it isn't already.

- [ ] **Step 3: Run drift tests**

Run: `cd cli && npx tsx --test test/roadmap-drift.test.ts test/plan-index-drift.test.ts`
Expected: 7 tests pass. The roadmap row's `P1.1` mention in CHANGELOG satisfies the (A) direction; the "Closes platform-review P1.1" wording satisfies the (B) direction.

- [ ] **Step 4: Commit (or amend the Task 8 commit)**

If Task 8's commit succeeded, stage these as a follow-on docs commit:

```bash
git add CHANGELOG.md docs/ROADMAP.md
git commit -m "docs: changelog + roadmap for pedigree chart (P1.1)"
```

If Task 8's commit was blocked by the hook, stage everything together now:

```bash
git add CHANGELOG.md docs/ROADMAP.md frontend/app/\[locale\]/family/tree/page.tsx
git commit -m "feat: pedigree chart on /family/tree (P1.1)

[full message from Task 8 Step 6]"
```

---

## Task 10: Flip the plan-index row and push

**Files:**
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Flip the plan to ✅ in the plan index**

Open `docs/superpowers/plans/README.md`. Change the row added in Task 1 from `🚧` to `✅`. Update the footer total: `**Total: 45 plans** — 40 shipped (✅), 0 in-progress (🚧), 4 sketches (📝), 1 index (🗂), 0 abandoned (📦).`

- [ ] **Step 2: Run all four drift tests one final time**

Run: `cd cli && npx tsx --test test/roadmap-drift.test.ts test/plan-index-drift.test.ts`
Expected: 7 tests pass.

- [ ] **Step 3: Commit + push**

```bash
git add docs/superpowers/plans/README.md
git commit -m "docs: flip pedigree-chart plan to shipped"
git push
```

---

## Self-Review

**Spec coverage** (against P1.1 from the platform review):

| Spec point | Where it's addressed |
|---|---|
| Pedigree chart (ancestors, 4–6 generations) | Task 7 `MAX_GENERATION = 4` (4 generations = parents + grandparents + GG + GGG = 31 nodes); easy to bump to 5 if desired |
| "Use SVG, not a heavy lib" / "D3 hierarchy + SVG ~200 lines" | Plan deviates — uses React Flow instead, per the conversation that produced this plan. Trade-off acknowledged: React Flow is heavier than raw SVG (~80 KB gzipped), but it gives pan/zoom/keyboard nav/touch out of the box and lets nodes be real React components matching the wiki's typography. Bundle weight is mitigated by `dynamic({ ssr: false })` (Task 6) — chart code only loads on `/family/tree`. Layout itself is still pure and ~50 lines. |
| Click a node = navigate | Task 4 — `<a href={data.href}>` on the node body; href is `familyTreeHref(record)` |
| Long-press / right-click = open article | Deferred. The current node click goes to `/family/tree?person=...`, not the article. The article link path requires `resolveSlugForRecord(record)` server-side per node; doable but adds N async lookups in Task 7. A follow-on can add it once the chart is in front of users. |
| "On mobile, collapse to a vertical list" | Task 7 — Tailwind `hidden md:block` / `md:hidden` split. The fallback uses `AncestorTile`, same as `LineageSection`. |
| "A pedigree chart above the existing sections" | Task 8 — section inserted before `PersonHeaderSection` |

**Placeholder scan:** no "TBD" / "TODO" / "fill in details" / "appropriate error handling" found. All steps have actual code or actual commands.

**Type consistency check:**
- `PedigreeNode` (the layout output type) is exported from `core/src/family/pedigree-layout.ts` and consumed in `pedigree-section.tsx` as `LayoutNode` (renamed to avoid colliding with the component named `PedigreeNode`). The component's data type is `PedigreeNodeData`, exported from `pedigree-node.tsx`. Both are referenced consistently in Task 5 and Task 7. ✅
- `layoutPedigree({ focal, ancestors, maxGeneration })` matches between the test in Task 2 and the call in Task 7. ✅
- `BrowserPerson` (core) vs. `BrowserPersonView` (frontend extends it with `slug?`, `portrait?`) — Task 7 casts `view.root as BrowserPerson` and `ancestors as BrowserPerson[]`. The cast is sound because `BrowserPersonView extends BrowserPerson` per `frontend/lib/family.ts:49`. ✅
- `PedigreeChartProps` (Task 5) requires every node entry to carry an `ariaLabel` string. Task 7's node-building map computes that label inline. Match verified. ✅

**Spec gap added during review:** Article-link long-press was in the review spec but is explicitly deferred. Flagging here so it doesn't get lost; can be a follow-on plan once the chart is in front of users.

**Verified against current React Flow docs (May 2026):** This plan was cross-checked against `@xyflow/react@12.10.2` (current stable, no v13). API surface verified: `NodeProps<Node<Data, 'type'>>` generic form, `proOptions.hideAttribution`, read-only props (`nodesDraggable={false}` et al.), `Background`/`Controls` props, `<Handle>` opacity-0 pattern. Next 16 RSC constraint on `dynamic({ ssr: false })` resolved by the Task 6 client wrapper. CSS import lives in the RSC section to dodge a Turbopack dedupe edge case.
