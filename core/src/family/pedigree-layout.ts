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
 *  generation. Sized for node width `w-44` (176px) so that sibling
 *  spacing at MAX_GENERATION=4 (the deepest visible row) stays at least
 *  ~200px center-to-center — gives a ~24px gap between adjacent nodes.
 *  Formula: COL_HALF_WIDTH * 2 / 2^(N-1) = spacing at generation N. */
const COL_HALF_WIDTH = 800;

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
