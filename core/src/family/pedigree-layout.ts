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
