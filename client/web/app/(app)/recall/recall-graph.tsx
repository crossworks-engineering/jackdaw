'use client';

import { useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  Position,
  type Edge,
  type Node,
  ReactFlowProvider,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { useFlowColorMode } from '@mantle/web-ui/hooks/use-flow-color-mode';
import { cn } from '@mantle/web-ui/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { TooltipProvider } from '@mantle/web-ui/ui/tooltip';
import type { RecallMapDetailDTO, RecallNodeDTO } from '@mantle/client-types';
import {
  LABEL_H,
  LABEL_W,
  RECALL_EDGE_TYPE,
  recallEdgeTypes,
  type LabelMode,
  type OptionEdgeData,
} from './recall-edge';

/**
 * The routing overview: nodes + option edges, laid out with dagre like the
 * trace graph. The index is the entry (primary border), prompts are
 * distinguished (info border), and orphans — the lint's warning made spatial —
 * get a dashed warning border. Built once, used twice: S5's walk replay will
 * light paths up over this same component.
 *
 * Edge labels are a custom edge (recall-edge.tsx) rather than React Flow's
 * built-in SVG `label`, which could not truncate or lift above a neighbour and
 * so piled up unreadably on any branching map. Two halves make that work: the
 * chip truncates and tooltips on hover, and the layout below RESERVES
 * LABEL_W×LABEL_H per edge so dagre routes around the label instead of
 * pretending it has no size.
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
  // Local, not URL state: how you like to read the graph is not worth a
  // navigation, and it must not survive into a shared deep link.
  const [labelMode, setLabelMode] = useState<LabelMode>('labels');

  // The layout is memoised on the MAP ALONE, deliberately, and the toggle only
  // re-decorates the edges.
  //
  // This flow is uncontrolled (no `onNodesChange`), so React Flow owns node
  // measurements internally and cannot write them back to us. Hand it a fresh
  // `nodes` array and it drops those measurements, and edges — which need both
  // endpoints measured to route — never render again. Toggling the labels used
  // to blank every edge on the map, permanently, for exactly that reason.
  //
  // Keeping the array identity stable also means node positions never jump when
  // you change how much label detail you want, which is the better behaviour
  // anyway. The cost is that `dots` and `off` keep the roomier spacing a full
  // label needs.
  const { nodes, edgeDefs } = useMemo(() => buildGraph(map), [map]);
  const edges = useMemo<Edge[]>(
    () =>
      edgeDefs.map((e, i) => ({
        id: `${e.source}__${e.target}__${i}`,
        source: e.source,
        target: e.target,
        type: RECALL_EDGE_TYPE,
        data: { label: e.label, useWhen: e.useWhen, mode: labelMode } satisfies OptionEdgeData,
        // Token, not the old hardcoded slate. `--border` alone is too faint to
        // trace across a big map, so this is the muted ink held back to roughly
        // border weight: legible in every theme, light and dark.
        style: { stroke: 'var(--muted-foreground)', strokeOpacity: 0.45, strokeWidth: 1.5 },
      })),
    [edgeDefs, labelMode],
  );

  return (
    <div className={cn('h-[420px] rounded-md border border-border bg-muted/20', className)}>
      <ReactFlowProvider>
        {/* The chips live in the edge-label layer, so the provider has to wrap
            the flow itself, because this app mounts them per feature. */}
        <TooltipProvider delayDuration={150}>
          <ReactFlow
            colorMode={colorMode}
            nodes={nodes}
            edges={edges}
            edgeTypes={recallEdgeTypes}
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
            <Panel position="top-right">
              <ToggleGroup
                type="single"
                value={labelMode}
                // A ToggleGroup can deselect to ''; keep the last mode rather
                // than falling into an unlabelled graph by accident.
                onValueChange={(v) => v && setLabelMode(v as LabelMode)}
                variant="outline"
                aria-label="Edge label detail"
                className="bg-card"
              >
                <ToggleGroupItem value="labels" aria-label="Show option labels">
                  Labels
                </ToggleGroupItem>
                <ToggleGroupItem value="dots" aria-label="Show option markers only">
                  Dots
                </ToggleGroupItem>
                <ToggleGroupItem value="off" aria-label="Hide option labels">
                  Off
                </ToggleGroupItem>
              </ToggleGroup>
            </Panel>
          </ReactFlow>
        </TooltipProvider>
      </ReactFlowProvider>
    </div>
  );
}

type EdgeDef = { source: string; target: string; label: string; useWhen: string };

function buildGraph(map: RecallMapDetailDTO): { nodes: Node[]; edgeDefs: EdgeDef[] } {
  const g = new dagre.graphlib.Graph();
  // LR, not TB: ranks run left→right, so SIBLINGS stack vertically and a map
  // grows DOWN as options multiply — breadth scrolls, depth stays on screen.
  // `ranksep` has to clear a label chip plus air on both sides, and `edgesep`
  // keeps two labels between the same pair of ranks off each other. These are
  // the numbers that stop the overlap; the chip's truncation is the backstop.
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: LABEL_W + 60, edgesep: LABEL_H + 12 });
  g.setDefaultEdgeLabel(() => ({}));

  const bySlug = new Set(map.nodes.map((n) => n.slug));
  for (const n of map.nodes) g.setNode(n.slug, { width: NODE_W, height: NODE_H });

  const targeted = new Set<string>();
  const edgeDefs: EdgeDef[] = [];
  for (const n of map.nodes) {
    for (const o of n.options) {
      // Compiled options always resolve in-map; guard anyway so a half-broken
      // payload can never crash the layout.
      if (!bySlug.has(o.targetSlug)) continue;
      targeted.add(o.targetSlug);
      edgeDefs.push({
        source: n.slug,
        target: o.targetSlug,
        label: o.label,
        useWhen: o.useWhen,
      });
      // Tell dagre the edge CARRIES something. Without a width/height here the
      // layout treats every edge as a bare line and packs ranks tight enough
      // that the labels have nowhere to go but on top of each other.
      // Always the FULL label box, whatever the toggle currently shows: the
      // layout must not depend on it (see the memo note above).
      g.setEdge(n.slug, o.targetSlug, { width: LABEL_W, height: LABEL_H, labelpos: 'c' });
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

  return { nodes, edgeDefs };
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
