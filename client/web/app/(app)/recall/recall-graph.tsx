'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFlowColorMode } from '@mantle/web-ui/hooks/use-flow-color-mode';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { TooltipProvider } from '@mantle/web-ui/ui/tooltip';
import type { RecallMapDetailDTO, RecallNodeDTO } from '@mantle/web-ui/types/recall-v2';
import {
  RECALL_BAND_TYPE,
  RECALL_CARD_TYPE,
  RecallGraphContext,
  recallNodeTypes,
  type RecallCardData,
  type RecallCardRow,
  type RecallGraphFocus,
} from './recall-card-node';
import {
  RECALL_EDGE_TYPE,
  recallEdgeTypes,
  type EdgeState,
  type RecallEdgeData,
} from './recall-edge';
import { NODE_W, layoutRecallMap, type LayoutEdge, type RecallLayout } from './recall-layout';

/** An option line is shown without a leading "Use when", which an author
 *  sometimes types into the field themselves. */
function stripUseWhenPrefix(value: string): string {
  return value.replace(/^use when\b[:\s—–-]*/i, '').trim();
}

/**
 * The routing overview: the map as a tiered decision tree. recall-layout.ts
 * decides where everything goes (and why it is a tree first, tiers second);
 * this component draws it, fits it, and carries the focus state: which card
 * is selected, which row is hovered, and so which lines are lit, dimmed or
 * hidden.
 *
 * Fit: the old graph ran fitView once, on a container that had not settled
 * to its final width, and the first and last cards fell off both edges. Now
 * FitOnResize refits once the nodes are measured AND whenever the container
 * changes size, from a ResizeObserver on the flow's own element.
 *
 * Full and Compact (the old Labels/Dots/Off) change card heights, so they
 * change the layout. The flow is keyed on the mode and on the map version:
 * a change remounts it, so an uncontrolled React Flow measures the new
 * boxes from scratch and fits once, rather than re-measuring a fresh
 * `nodes` array in place (which it does, since 12.x, at the cost of the
 * edges vanishing for a frame and several fits; the old graph's note that
 * edges never came back described an older build). Within one mount the
 * nodes array identity is stable per map: focus rides context, never the
 * nodes.
 *
 * Selection is React Flow's own, mirrored into `selected` through
 * onSelectionChange, so a keyboard user gets the same thing a pointer does:
 * Tab to a card, Enter selects it, Enter again opens it.
 */
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
  const [mode, setMode] = useState<'full' | 'compact'>('full');
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const compact = mode === 'compact';

  const layout = useMemo(() => layoutRecallMap(map, { compact }), [map, compact]);
  const nodes = useMemo(() => buildNodes(map, layout, compact), [map, layout, compact]);

  // A selection that no longer names a card (the map changed under it) is
  // dropped rather than left pointing at nothing.
  useEffect(() => {
    if (selected && !map.nodes.some((n) => n.slug === selected)) setSelected(null);
  }, [map, selected]);

  const { edges, lit } = useMemo(
    () => decorateEdges(layout.edges, compact, selected, hoveredCard, hoveredRow),
    [layout, compact, selected, hoveredCard, hoveredRow],
  );

  const focus = useMemo<RecallGraphFocus>(
    () => ({ selected, lit, setHoveredRow }),
    [selected, lit],
  );

  const open = useCallback(
    (slug: string) => {
      const row = map.nodes.find((r) => r.slug === slug);
      if (row) onEditNode(row);
    },
    [map, onEditNode],
  );
  const selectedNode = selected ? map.nodes.find((n) => n.slug === selected) : undefined;

  // React Flow owns selection (click, and Enter or Space on a focused
  // card); this mirrors it. The band caption is not selectable, so the
  // first selected node is always a card.
  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: Node[] }) => {
    setSelected(sel[0]?.id ?? null);
  }, []);

  // Enter on a card that is ALREADY selected opens it. React Flow handles
  // the same key first (bubbling order): on an unselected card it selects,
  // and the closure still holds the previous `selected`, so the first
  // press selects and the second opens.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !selected) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.react-flow__node');
    if (el?.dataset.id === selected) open(selected);
  };

  if (map.nodes.length === 0) {
    return (
      <div className={cn('h-full min-h-0 rounded-md border border-border bg-muted/20', className)}>
        <p className="p-6 text-sm text-muted-foreground">This map has no cards.</p>
      </div>
    );
  }

  return (
    <div
      className={cn('h-full min-h-0 rounded-md border border-border bg-muted/20', className)}
      onKeyDown={onKeyDown}
    >
      <ReactFlowProvider>
        {/* Tooltips live inside the nodes, so the provider has to wrap the
            flow itself, because this app mounts them per feature. */}
        <TooltipProvider delayDuration={150}>
          <RecallGraphContext.Provider value={focus}>
            <ReactFlow
              key={`${map.id}:${map.version}:${mode}`}
              colorMode={colorMode}
              nodes={nodes}
              edges={edges}
              nodeTypes={recallNodeTypes}
              edgeTypes={recallEdgeTypes}
              onSelectionChange={onSelectionChange}
              // A single click selects, so the reader can see a card's lines
              // before leaving the graph. Opening the editor is a double
              // click, Enter on the selected card, or the Open button, since
              // it navigates to the Cards view and unmounts the graph.
              onNodeDoubleClick={(_e, n) => {
                if (n.type === RECALL_CARD_TYPE) open(n.id);
              }}
              // Double-click opens a card; it must not also zoom the canvas.
              zoomOnDoubleClick={false}
              onNodeMouseEnter={(_e, n) => {
                if (n.type === RECALL_CARD_TYPE) setHoveredCard(n.id);
              }}
              onNodeMouseLeave={() => {
                setHoveredCard(null);
                setHoveredRow(null);
              }}
              fitView
              fitViewOptions={FIT}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              // Lines are read, not edited: no tab stop per edge, and no
              // delete key.
              edgesFocusable={false}
              deleteKeyCode={null}
            >
              <FitOnResize />
              <Background gap={16} size={1} />
              <Controls showInteractive={false} />
              <Panel position="top-right">
                <ToggleGroup
                  type="single"
                  value={mode}
                  // A ToggleGroup can deselect to ''; keep the last mode rather
                  // than falling into a blank state by accident.
                  onValueChange={(v) => v && setMode(v as 'full' | 'compact')}
                  variant="outline"
                  aria-label="Card detail"
                  className="bg-card"
                >
                  <ToggleGroupItem value="full" aria-label="Show every option on its card">
                    Full
                  </ToggleGroupItem>
                  <ToggleGroupItem value="compact" aria-label="Show cards with an option count">
                    Compact
                  </ToggleGroupItem>
                </ToggleGroup>
              </Panel>
              <Panel position="bottom-right">
                {selectedNode ? (
                  <div className="flex max-w-xs items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-xs">
                    <span className="min-w-0 truncate">{selectedNode.title}</span>
                    <Button size="xs" variant="outline" onClick={() => open(selectedNode.slug)}>
                      Open card
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-md bg-card/80 px-2 py-1 text-[10px] text-muted-foreground">
                    Click a card to see its lines. Double-click to open it.
                  </p>
                )}
              </Panel>
            </ReactFlow>
          </RecallGraphContext.Provider>
        </TooltipProvider>
      </ReactFlowProvider>
    </div>
  );
}

/** A small map is not blown up past its natural size: the cards are
 *  designed to read at 1x. */
const FIT = { padding: 0.15, maxZoom: 1 };

/**
 * Fits the view once the nodes are measured and again whenever the flow's
 * element changes size. The observer fires once on observe, which is the
 * "after the container settled" fit the `fitView` prop alone could not
 * promise; the fit itself is deferred a frame so React Flow's own resize
 * handler has written the new width and height to its store first.
 */
function FitOnResize() {
  const { fitView } = useReactFlow();
  const store = useStoreApi();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized) return;
    const el = store.getState().domNode;
    if (!el) return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void fitView({ ...FIT, duration: 0 }));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [initialized, fitView, store]);
  return null;
}

function buildNodes(map: RecallMapDetailDTO, layout: RecallLayout, compact: boolean): Node[] {
  const titles = new Map(map.nodes.map((n) => [n.slug, n.title]));
  const bySlug = new Map(map.nodes.map((n) => [n.slug, n]));
  const nodes: Node[] = layout.cards.map((card) => {
    const node = bySlug.get(card.slug)!;
    const rows: RecallCardRow[] = card.rows.map((r) => {
      const o = node.options[r.index]!;
      return {
        ...r,
        label: o.label,
        // An option's use-when is the raw text after the dash, and the
        // routing editor seeds every new row with the literal words "use
        // when", so most real options carry the prefix already. The tooltip
        // supplies its own, so strip it here or every existing map reads
        // "Use when use when logging into a box".
        useWhen: stripUseWhenPrefix(o.useWhen),
        targetTitle: r.targetMap ? null : (titles.get(r.targetSlug) ?? null),
      };
    });
    return {
      id: card.slug,
      type: RECALL_CARD_TYPE,
      position: { x: card.x, y: card.y },
      width: card.width,
      height: card.height,
      ariaLabel: node.title,
      data: {
        node,
        rows,
        isEntry: card.slug === layout.entry,
        orphan: card.orphan,
        compact,
      } satisfies RecallCardData,
    };
  });
  if (layout.orphanBandY !== null) {
    const cx =
      layout.cards.filter((c) => !c.orphan).reduce((a, c) => Math.max(a, c.x + c.width), 0) / 2;
    nodes.push({
      id: '__orphan-band',
      type: RECALL_BAND_TYPE,
      position: { x: cx - NODE_W, y: layout.orphanBandY - 28 },
      width: NODE_W * 2,
      height: 20,
      selectable: false,
      focusable: false,
      data: { text: 'Not reached from the entry card' },
    });
  }
  return nodes;
}

/**
 * Decorates the layout's edges with the focus state and drops the ones that
 * should not draw. A lit edge is painted last so it sits above its
 * neighbours (React Flow paints edges in array order).
 *
 *  - Hovering a row lights that one line and nothing else: a row sits
 *    inside its card, so the card counts as hovered too, and the row has
 *    to win or every row on the card would light with it.
 *  - Selecting or hovering a card lights its outgoing lines and shows the
 *    line that reaches it; with a card selected, every other line dims.
 *  - A cross-link draws only while its source or target card has focus.
 */
function decorateEdges(
  all: LayoutEdge[],
  compact: boolean,
  selected: string | null,
  hoveredCard: string | null,
  hoveredRow: string | null,
): { edges: Edge[]; lit: Set<string> } {
  const focused = (slug: string) => slug === selected || slug === hoveredCard;
  const lit = new Set<string>();
  const out: { edge: Edge; order: number }[] = [];
  for (const e of all) {
    let state: EdgeState;
    if (hoveredRow === e.id) state = 'lit';
    else if (focused(e.source)) state = hoveredRow ? 'normal' : 'lit';
    else if (focused(e.target)) state = 'normal';
    else if (e.kind === 'cross') continue;
    else state = selected ? 'dim' : 'normal';
    if (state === 'lit') lit.add(e.id);
    out.push({
      order: state === 'lit' ? 2 : state === 'normal' ? 1 : 0,
      edge: {
        id: e.id,
        source: e.source,
        sourceHandle: compact ? 'out' : `opt-${e.sourceRow}`,
        target: e.target,
        targetHandle: 'in',
        type: RECALL_EDGE_TYPE,
        data: { kind: e.kind, points: e.points, state } satisfies RecallEdgeData,
      },
    });
  }
  out.sort((a, b) => a.order - b.order);
  return { edges: out.map((o) => o.edge), lit };
}
