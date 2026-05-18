'use client';

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { AvatarMonogram } from './avatar-monogram';

export interface PedigreeNodeData extends Record<string, unknown> {
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
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
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
