import type { BrowserPerson } from './browser.ts';

export interface PedigreeNode {
  record: string;
  x: number;
  y: number;
  generation: number;
  side: 'self' | 'paternal' | 'maternal';
}

export interface PedigreeEdge {
  /** child → parent direction (source is the ancestor at higher generation,
   *  target is the descendant one generation closer to focal) */
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

/** Horizontal pixel distance between adjacent leaves. The chart's total
 *  width is roughly LEAF_SPACING × (visible_leaf_count − 1). Tune for the
 *  node width in `pedigree-node.tsx` (`w-44` = 176px) plus a small gap. */
const LEAF_SPACING = 200;

/**
 * Layout an ancestor pedigree: focal at (0, 0); ancestors above (negative y);
 * x assigned by recursive midpoint placement over the visible tree.
 *
 *   - Leaves (deepest visible ancestor along each branch) get consecutive
 *     positions at LEAF_SPACING intervals (post-order, left-to-right).
 *   - Inner nodes get x = midpoint of their visible children.
 *   - The whole layout is then re-centered so focal.x = 0.
 *
 * Result: asymmetric trees (one branch deep, one shallow) use only the
 * space they need. A single-lineage chain (only paternal ancestors)
 * collapses to a vertical column below the focal — no wasted whitespace.
 *
 * Pure: no DOM, no React, no I/O.
 */
export function layoutPedigree(cfg: LayoutConfig): PedigreeLayout {
  const visible = cfg.ancestors.filter(a => a.generation <= cfg.maxGeneration);

  // Build a map from each node's record → its "visual children" (the
  // ancestors one generation above that are this node's parents). The
  // focal's visual children are its parents; an ancestor's visual children
  // are its parents (the next generation deeper).
  const childrenOf = new Map<string, BrowserPerson[]>();
  childrenOf.set(cfg.focal.record, []);
  for (const a of visible) childrenOf.set(a.record, []);

  for (const a of visible) {
    const descendantRecord = a.pathFromRoot.length === 1
      ? cfg.focal.record
      : a.pathFromRoot[a.pathFromRoot.length - 2]!;
    const arr = childrenOf.get(descendantRecord);
    if (arr) arr.push(a);
  }

  // Order siblings: father (left) before mother (right). Missing role keeps
  // input order so the result is still deterministic.
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => {
      if (a.role === 'father' && b.role === 'mother') return -1;
      if (a.role === 'mother' && b.role === 'father') return 1;
      return 0;
    });
  }

  // Post-order traversal: place leaves at consecutive LEAF_SPACING positions,
  // then inner nodes at midpoint of their children's positions.
  const xByRecord = new Map<string, number>();
  let nextLeafX = 0;

  function place(record: string): number {
    const children = childrenOf.get(record) ?? [];
    let x: number;
    if (children.length === 0) {
      x = nextLeafX;
      nextLeafX += LEAF_SPACING;
    } else {
      const childXs = children.map(c => place(c.record));
      x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    xByRecord.set(record, x);
    return x;
  }

  place(cfg.focal.record);

  // Re-center on focal at x = 0.
  const focalX = xByRecord.get(cfg.focal.record) ?? 0;

  const nodes: PedigreeNode[] = [
    { record: cfg.focal.record, x: 0, y: 0, generation: 0, side: 'self' },
  ];
  for (const a of visible) {
    const rawX = xByRecord.get(a.record);
    if (rawX === undefined) continue;
    nodes.push({
      record: a.record,
      x: rawX - focalX,
      y: -a.generation * ROW_HEIGHT,
      generation: a.generation,
      side: a.side === 'self' ? 'paternal' : a.side,
    });
  }

  // Edges: each visible ancestor connects to its descendant (one gen toward
  // focal). Filter to ensure both endpoints are in the visible set.
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
