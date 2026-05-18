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
