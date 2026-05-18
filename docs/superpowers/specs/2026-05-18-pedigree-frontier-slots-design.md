# Pedigree-chart frontier slots

> Renders missing-ancestor positions in the `/family/tree` pedigree chart
> as dashed-border "frontier slots" — visible placeholders for the
> father or mother of any present ancestor whose parent isn't recorded
> yet. Sub-project 1 of 3 in the pedigree-frontier feature; ships
> standalone without requiring the talk-page candidates format or the
> research drawer.

## Context

The interactive pedigree chart shipped on `feat/pedigree-chart` (commit
`299d932`, closes platform-review P1.1) renders only **present**
ancestors. The current adaptive layout (commit `178640d`) collapses
asymmetric branches — a paternal-only chain stacks vertically, no
space reserved for the missing maternal side.

This loses **gap-as-frontier** signal. Genealogical research is largely
the act of pushing the tree's edges outward (per the platform review's
P3.1 framing), and the chart's whole spatial point is to make those
edges visible. The existing `CoverageSection` already surfaces the
frontier as a flat list, but a flat list doesn't communicate *where*
in the tree the gap is.

The frontier data is already computed: `frontend/lib/family.ts:377-401`
builds `coverage.frontier` — a list of present ancestors with at least
one missing parent, tagged `{ record, name, generation, side, missing:
'father' | 'mother' | 'both' }`. Currently capped at 12 for the panel.
The chart consumes none of this.

This spec adds chart-level frontier rendering: a dashed-border
placeholder for each missing parent of each present ancestor, sized
into the existing adaptive layout so the tree's actual shape is
visible.

## Scope: sub-project 1 of 3

The full "gap-as-frontier with talk-page candidate matching" idea
decomposes into three sub-projects that ship independently:

| # | Sub-project | What it adds | Why this order |
|---|---|---|---|
| **F** | **Frontier slots in chart** (this spec) | Dashed placeholder nodes for missing parents of present ancestors. Click navigates to the present descendant's tree page. | Visual win, contained, no new data conventions. Ships the spatial gap signal immediately. |
| T | Talk-page candidates format + parser | `## Candidates` section convention in talk files. Parser in `core/`. CLI surface (`wai candidates list <slug>`). | Data layer for what could fill a frontier slot. Standalone CLI utility; no chart change required. |
| D | Research drawer | Side-panel Sheet opened on click of any chart node (present or frontier). Shows kinship, parsed candidates (if T shipped), action buttons (search wiki, note this as a question, open talk page). | Pulls F and T into a polished click-through experience. Last because it depends on both being present. |

F is fully usable without T and D. The frontier slots' click behavior
in F is the simplest thing — navigate to the descendant's tree view,
same as a `CoverageSection` link. D will later intercept the same
click to open the drawer instead; that's a single-line change in the
section's node-building code (replace href with onClick → drawer),
nothing in F needs revisiting.

## Goals

1. Every missing parent of a present ancestor — up to and including
   `MAX_GENERATION = 4` — renders as a dashed-border slot in the
   chart at its correct genealogical position.
2. The slot's label is the kinship (e.g., "Paternal grandmother",
   "Mother's father") so the reader immediately knows what's missing.
3. The slot is keyboard-focusable and clickable; activation
   navigates to the present descendant's tree page (the descendant
   whose parent is missing).
4. The adaptive layout treats frontier slots as full nodes for
   midpoint computation. A father with one present parent and one
   frontier slot is centered between them, not stacked on the present
   one.
5. Frontier slots respect dark mode and RTL (Hebrew) layout. Slot
   labels are i18n keys, not hardcoded strings.
6. The chart's per-generation `Coverage` numbers (already in the
   page's existing `CoverageSection`) match the chart's visible
   present-vs-frontier count.

## Non-goals

- **No theoretical-grid mode.** Slots only appear *adjacent to* a
  present ancestor — we don't render a fully-populated 2^MAX_GEN grid
  with 15 frontier slots when only 3 ancestors are known.
- **No talk-page candidate counts** on frontier slots (sub-project T).
  Frontier slots in v1 just show kinship + missing indicator.
- **No drawer or sheet** on slot click (sub-project D). Click
  navigates exactly the way `CoverageSection`'s frontier list links do.
- **No frontier slots beyond `MAX_GENERATION`.** A present ancestor
  at gen 4 has missing parents at gen 5, but those are above the
  chart's vertical bound — not rendered.
- **No mobile-fallback frontier rendering.** The mobile list
  fallback (`< md`) continues to show only present ancestors. The
  flat `CoverageSection` already covers the mobile-frontier use case
  immediately below.
- **No animation / hover-card / contextual popover** on frontier
  slots. Solid focus + click affordance; nothing else.

## Architecture

Two layers, both already split between `core/` (pure layout) and
`frontend/` (presentation).

### Data layer: extend `pedigree-layout.ts` to emit frontier nodes

The pure layout function in `core/src/family/pedigree-layout.ts`
gains a new node kind: `frontier`. The output union becomes:

```typescript
export interface PresentNode {
  kind: 'present';
  record: string;
  x: number;
  y: number;
  generation: number;
  side: 'self' | 'paternal' | 'maternal';
}

export interface FrontierNode {
  kind: 'frontier';
  /** Synthetic id — stable across renders for a given (descendant, role) pair.
   *  Format: `frontier:<descendantRecord>:<father|mother>`. */
  id: string;
  /** The present ancestor whose father/mother is missing. */
  descendantRecord: string;
  /** Which slot this fills. */
  role: 'father' | 'mother';
  x: number;
  y: number;
  /** Generation of THIS slot (one above the descendant). */
  generation: number;
  side: 'paternal' | 'maternal';
}

export type PedigreeNode = PresentNode | FrontierNode;
```

Edges already use `source` / `target` record-or-id strings; the
frontier-edge case is `{ source: 'frontier:I2:mother', target: 'I2' }`
when father `I2` has a missing mother.

Input config gains an `includeFrontier: boolean` flag (default `false`
for backward-compatible test fixtures; `true` from the frontend).

Frontier-slot generation: for each present ancestor at gen `N < MAX`,
check the source `DerivedRecord` (passed in via a new optional
`recordLookup: Map<string, DerivedRecord>` config field) for whether
its `parents[]` are complete. For each missing parent role (father,
mother, or both), emit a `FrontierNode` at gen `N+1`.

The layout algorithm (recursive-midpoint, post-order) treats frontier
nodes as full leaves for x-positioning. A father with one present
ancestor (his father) and one frontier (his mother) gets centered
between the two — preserving spatial integrity.

### Presentation layer: new component variant + section join

`frontend/components/family/pedigree-frontier-node.tsx` (new) — the
custom React Flow node for `kind: 'frontier'`. Same w-44 footprint as
present nodes, but `border-dashed border-muted-foreground/40`, no
fill, muted typography. Renders the kinship label as the title (e.g.,
`Page.FamilyTree.pedigree.kinship.paternalGrandmother`) and a small
"missing" indicator beneath.

`frontend/components/family/pedigree-chart.client.tsx` (modify) —
`nodeTypes` map gains a `frontier: PedigreeFrontierNode` entry.

`frontend/components/family/sections/pedigree-section.tsx` (modify):

- Pass `getCachedDerivedRecords()` to the layout call so it can
  inspect parents
- Set `includeFrontier: true`
- The node-mapping loop branches on `kind` — present nodes build
  PedigreeNodeData as today; frontier nodes build a smaller
  FrontierNodeData (`{ descendantRecord, role, kinshipKey, href }`)
- Both kinds feed into the same React Flow nodes array

## Data flow

```
DerivedRecord (with parents[]) ─┐
                                 ├─→ layoutPedigree({ ..., includeFrontier: true, recordLookup })
BrowserPerson (ancestors)  ──────┘                  │
                                                    ▼
                                   PedigreeNode[] union (present | frontier)
                                                    │
                                                    ▼
                                   pedigree-section.tsx node-mapping
                                                    │
                                                    ▼
                                   React Flow nodes with nodeTypes = { pedigree, frontier }
```

The frontier data already passes through `lib/family.ts`'s
`getCachedDerivedRecords()` — the section just needs to thread the
map down to the layout call rather than computing frontier separately.

## Components

| Path | Status | Responsibility |
|---|---|---|
| `core/src/family/pedigree-layout.ts` | Extend | Add `FrontierNode` discriminated-union variant; add `includeFrontier` + `recordLookup` config; emit frontier slots for missing parents up to `maxGeneration`. |
| `core/test/family/pedigree-layout.test.ts` | Extend | Add 3-4 frontier-specific test cases (no frontier when `includeFrontier=false`, frontier emitted for missing mother of present father, layout centers parent between present + frontier sibling, frontier at gen `MAX` is NOT emitted because slots above `MAX` are out of bounds). |
| `frontend/components/family/pedigree-frontier-node.tsx` | Create | Custom React Flow node for `kind: 'frontier'`. Dashed border, kinship-label title, no portrait. Server-safe JSX (no `'use client'`; only loaded inside the client chart). |
| `frontend/components/family/pedigree-chart.client.tsx` | Modify | Register `frontier` in `nodeTypes`. Widen `PedigreeChartProps.nodes` to accept both kinds. |
| `frontend/components/family/sections/pedigree-section.tsx` | Modify | Thread derived-records map into the layout call. Branch the node-mapping loop on `kind`. Frontier nodes get `href = familyTreeHref(descendantRecord)` (the descendant whose parent is missing). |
| `frontend/messages/{en,ru,uk,he}.json` | Extend | Add kinship-label keys under `Page.FamilyTree.pedigree.kinship.*` (e.g. `paternalGrandmother`, `mothersFather`, `father`, `mother`, etc.). |

## Kinship label generation

The slot's label is determined by the `(generation, side, role)` of
the slot itself, not the descendant. A 4×3×2 matrix exists in
principle but in practice we use only 8-10 labels (English samples):

| gen | side | role | label key | English text |
|---|---|---|---|---|
| 1 | paternal | father | `father` | Father |
| 1 | maternal | mother | `mother` | Mother |
| 2 | paternal | father | `paternalGrandfather` | Paternal grandfather |
| 2 | paternal | mother | `paternalGrandmother` | Paternal grandmother |
| 2 | maternal | father | `maternalGrandfather` | Maternal grandfather |
| 2 | maternal | mother | `maternalGrandmother` | Maternal grandmother |
| 3+ | * | * | `unknownAncestor` | Unknown {generation}-great-grandparent |

For gen 3 and 4 the "X-great-grandfather/mother" pattern proliferates;
v1 uses a single `unknownAncestor` template with the
generation-prefix interpolated. Sub-project T (later) can refine this
when candidate-name surfaces are available.

## Layout integration: how frontier slots affect spacing

The recursive-midpoint algorithm currently:

1. Builds a `childrenOf` map: each node → its visible "children"
   (ancestors one gen above)
2. Post-order traversal places leaves at consecutive `LEAF_SPACING`
   positions; inner nodes get midpoint of children's positions

Frontier slots are added to `childrenOf` for any present ancestor
with missing parents. The traversal then treats them identically to
present nodes — each frontier slot is a leaf (it has no children of
its own, since we don't render frontier-of-frontier), and gets
`LEAF_SPACING` worth of x-budget.

Result: a father with one present ancestor (his father) and one
frontier (his missing mother) is centered between them at midpoint,
visually spreading them on either side. The asymmetric collapse from
the current algorithm no longer happens for branches with detectable
gaps.

## Test plan

Pure layout tests in `core/test/family/pedigree-layout.test.ts`:

1. `includeFrontier: false` (default) produces no frontier nodes
   even when present ancestors have missing parents.
2. `includeFrontier: true` emits a `FrontierNode` for the missing
   mother of a present father (whose `DerivedRecord.parents` lacks
   the mother role).
3. Layout centers the inner node between a present sibling and a
   frontier sibling (no asymmetric collapse).
4. Frontier slots are NOT emitted for missing parents of an ancestor
   at `MAX_GENERATION` — those would sit above the chart bound.
5. Stable frontier id format: `frontier:<descendantRecord>:<role>` so
   the same slot has the same id across renders.

Frontend integration: no unit tests for the new components or section
modifications. The project's existing pattern is no unit tests on
section composition; the pure layout's expanded test coverage is
sufficient.

Manual verification (Task list in implementation plan):

- Pedigree chart renders dashed slots where ancestors are missing
- Dark mode: dashed border + muted text remain readable
- Hebrew RTL: kinship labels render in Hebrew script (right-aligned
  within the slot card). The chart's spatial convention
  (left=father / right=mother) is **not** mirrored — genealogy is
  direction-agnostic and the React Flow canvas is LTR-oriented. If
  user feedback flags this as confusing in Hebrew, explicit mirroring
  can land as a follow-on.
- Clicking a frontier slot navigates to the descendant's tree
- Keyboard tab: focus reaches frontier slots in the same order as
  present nodes

## Open questions / risks

1. **`recordLookup` passing across the boundary.** The layout
   function is pure (`core/`); passing in a `Map<string,
   DerivedRecord>` is fine. The section component calls
   `getCachedDerivedRecords()` (which is a `lib/family.ts` server
   helper); make sure this doesn't accidentally cross the
   server/client boundary as a function prop.

2. **Asymmetric collapse persistence.** A branch where BOTH parents
   are unknown (no present ancestor on that side) still collapses —
   we have no way to emit frontier slots without at least one present
   ancestor to anchor on. Acceptable for v1; future "show theoretical
   slots up to MAX" mode could remove this.

3. **What if the present ancestor's `parents[]` has a parent record
   id that points to someone NOT in the visible tree (e.g., they
   exist in the GEDCOM but are at gen `> MAX_GENERATION`)?** Treat
   the parent as present in the GEDCOM but invisible in the chart —
   so no frontier slot for that role. (Frontier means *unknown*, not
   *off-screen*.) Test case 4 above covers the boundary.

4. **Performance.** A tree with many gen-4 present ancestors could
   produce up to 32 frontier slots. Total node count caps at
   ~31 + 32 = 63. React Flow handles thousands; no concern.

## Implementation details (not open questions)

- **Frontier edges** render dashed to match the slot's visual.
  Section's edge-mapping sets `style: { strokeDasharray: '4 4',
  stroke: 'var(--border)' }` for any edge whose `source` starts with
  `frontier:`. Present-to-present edges keep the current solid style.

## Implementation order

A single implementation plan covers this sub-project end-to-end.
Tasks roughly:

1. Extend layout function's types + algorithm
2. Add pure-layout tests for frontier emission
3. Create `pedigree-frontier-node.tsx` component
4. Register `frontier` in chart's `nodeTypes`, widen prop types
5. Update section to thread `getCachedDerivedRecords()` + flag
6. Add kinship label keys to all 4 locales
7. Manual browser verification
8. CHANGELOG + ROADMAP triad update

Estimated: 1-2 sittings.

## See also

- [`2026-05-18-pedigree-chart.md`](../plans/2026-05-18-pedigree-chart.md) — the implementation plan that shipped F's predecessor (pedigree chart, P1.1).
- [Sub-project T] — Talk-page candidates format + parser (next spec).
- [Sub-project D] — Research drawer side-panel (third spec).
- `frontend/lib/family.ts:377-401` — existing frontier computation that feeds `CoverageSection`. This sub-project doesn't consume `coverage.frontier` directly because the layout function needs raw `parents[]` data to position slots; the panel and the chart will end up with two parallel derivations of the same idea. Acceptable for v1; can DRY up later.
- `frontend/components/family/sections/coverage-section.tsx` — the flat-list frontier UI; F adds the spatial-chart frontier UI as a complement, not a replacement.
