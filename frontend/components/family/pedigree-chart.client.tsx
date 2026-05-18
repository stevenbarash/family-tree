'use client';

import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import { PedigreeNode, type PedigreeNodeData } from './pedigree-node';

export interface PedigreeChartProps {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: PedigreeNodeData;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
  ariaLabel: string;
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
export default function PedigreeChart({ nodes, edges, ariaLabel }: PedigreeChartProps) {
  const rfNodes: Node<PedigreeNodeData & Record<string, unknown>>[] = nodes.map(n => ({
    id: n.id,
    type: 'pedigree',
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
    style: { stroke: 'var(--border)', strokeWidth: 1.5 },
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
