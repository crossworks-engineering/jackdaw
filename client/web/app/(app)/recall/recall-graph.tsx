'use client';

import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Position,
  type Edge,
  type Node,
  ReactFlowProvider,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { useFlowColorMode } from '@mantle/web-ui/hooks/use-flow-color-mode';
import { cn } from '@mantle/web-ui/lib/utils';
import type { RecallMapDetailDTO, RecallNodeDTO } from '@mantle/client-types';

/**
 * The routing overview: nodes + option edges, laid out with dagre like the
 * trace graph. The index is the entry (primary border), prompts are
 * distinguished (info border), and orphans — the lint's warning made spatial —
 * get a dashed warning border. Built once, used twice: S5's walk replay will
 * light paths up over this same component.
 */

const NODE_W = 220;
const NODE_H = 64;

export function RecallGraph({
  map,
  onEditNode,
  className,
}: {
  map: RecallMapDetailDTO;
  onEditNode: (node: RecallNodeDTO) => void;
  className?: string;
}) {
  const colorMode = useFlowColorMode();
  const { nodes, edges } = useMemo(() => buildGraph(map), [map]);

  return (
    <div className={cn('h-[420px] rounded-md border border-border bg-muted/20', className)}>
      <ReactFlowProvider>
        <ReactFlow
          colorMode={colorMode}
          nodes={nodes}
          edges={edges}
          onNodeClick={(_e, n) => {
            const row = map.nodes.find((r) => r.slug === n.id);
            if (row) onEditNode(row);
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
        >
          <Background gap={16} size={1} />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

function buildGraph(map: RecallMapDetailDTO): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  // LR, not TB: ranks run left→right, so SIBLINGS stack vertically and a map
  // grows DOWN as options multiply — breadth scrolls, depth stays on screen.
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  const bySlug = new Set(map.nodes.map((n) => n.slug));
  for (const n of map.nodes) g.setNode(n.slug, { width: NODE_W, height: NODE_H });

  const targeted = new Set<string>();
  const edgeDefs: { source: string; target: string; label: string }[] = [];
  for (const n of map.nodes) {
    for (const o of n.options) {
      // Compiled options always resolve in-map; guard anyway so a half-broken
      // payload can never crash the layout.
      if (!bySlug.has(o.targetSlug)) continue;
      targeted.add(o.targetSlug);
      edgeDefs.push({ source: n.slug, target: o.targetSlug, label: o.label });
      g.setEdge(n.slug, o.targetSlug);
    }
  }

  dagre.layout(g);

  const indexSlug = map.nodes.find((n) => n.kind === 'index')?.slug;
  const nodes: Node[] = map.nodes.map((n) => {
    const pos = g.node(n.slug);
    const orphan = n.kind !== 'index' && !targeted.has(n.slug);
    return {
      id: n.slug,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      // LR layout: edges leave the right edge and land on the left one.
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: <NodeLabel node={n} orphan={orphan} isEntry={n.slug === indexSlug} /> },
      style: {
        width: NODE_W,
        height: NODE_H,
        borderRadius: 8,
        // Status rides the BORDER; the fill stays the theme card surface so
        // titles are readable in every theme (trace-graph convention).
        border: orphan
          ? '1.5px dashed var(--warning)'
          : n.kind === 'index'
            ? '1.5px solid var(--primary)'
            : n.kind === 'prompt'
              ? '1px solid var(--info)'
              : '1px solid var(--border)',
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        padding: 0,
      },
    };
  });

  const edges: Edge[] = edgeDefs.map((e, i) => ({
    id: `${e.source}__${e.target}__${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
    labelStyle: { fontSize: 10, fill: 'var(--muted-foreground)' },
    labelBgStyle: { fill: 'var(--background)', fillOpacity: 0.85 },
    style: { stroke: 'rgb(148 163 184)', strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

function NodeLabel({
  node,
  orphan,
  isEntry,
}: {
  node: RecallNodeDTO;
  orphan: boolean;
  isEntry: boolean;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-0.5 px-3 py-2 text-left">
      <span className="truncate text-xs font-medium">{node.title}</span>
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {isEntry && <span className="font-medium text-primary-ink">entry</span>}
        {node.kind === 'prompt' && <span className="text-info-ink">prompt</span>}
        {orphan && <span className="text-warning-ink">orphan</span>}
        <span className="truncate font-mono">{node.slug}</span>
      </span>
    </div>
  );
}
