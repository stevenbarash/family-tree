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
