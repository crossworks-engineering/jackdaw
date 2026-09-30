'use client';

import { createContext, memo, useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@mantle/web-ui/lib/utils';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@mantle/web-ui/ui/tooltip';
import type { RecallNodeDTO } from '@mantle/web-ui/types/recall-v2';
import { COUNT_H, DIVIDER_H, HEADER_H, ROW_H, ROWS_PAD, type RowKind } from './recall-layout';

/**
 * One Recall card on the graph: title, slug and kind pills, then one row per
 * option. The options live ON the card, not on the edge, which is what
 * retired the floating label chips that piled up mid-edge: every row has its
 * own source handle at its right edge, so the line for an option leaves the
 * row that names it and lands on the target card's top.
 *
 * Every height here comes from recall-layout's constants, because the layout
 * routes edges to the row centres it computed. Change a height in one place
 * and the lines miss their rows.
 */

export const RECALL_CARD_TYPE = 'recall-card';
export const RECALL_BAND_TYPE = 'recall-band';

export interface RecallCardRow {
  index: number;
  kind: RowKind;
  edgeId: string | null;
  targetSlug: string;
  label: string;
  useWhen: string;
  /** The target card's title, for rows that lead to a card in this map. */
  targetTitle: string | null;
  targetMap: string | null;
}

export interface RecallCardData {
  node: RecallNodeDTO;
  rows: RecallCardRow[];
  isEntry: boolean;
  orphan: boolean;
  compact: boolean;
  [key: string]: unknown;
}

/** What the graph shell shares with its cards: what is selected or hovered,
 *  and how to report a hovered row. It rides context because the nodes array
 *  is memoised per map and must not change identity when focus does. */
export interface RecallGraphFocus {
  selected: string | null;
  /** Edge ids drawn lit right now, so a row can light its handle dot too. */
  lit: ReadonlySet<string>;
  setHoveredRow: (edgeId: string | null) => void;
}

export const RecallGraphContext = createContext<RecallGraphFocus>({
  selected: null,
  lit: new Set(),
  setHoveredRow: () => {},
});

/** The card-level handles are connection points only: invisible. */
const HIDDEN_HANDLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 'none',
  pointerEvents: 'none',
};

/** A row's handle is a small dot at the row's right edge, so the reader can
 *  see which row a line leaves from. Theme ink, never React Flow's own
 *  palette. */
function rowHandleStyle(lit: boolean): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    minWidth: 0,
    minHeight: 0,
    border: 'none',
    pointerEvents: 'none',
    background: lit ? 'var(--primary)' : 'var(--muted-foreground)',
    opacity: lit ? 1 : 0.7,
  };
}

const MARKER_TEXT: Partial<Record<RowKind, string>> = {
  entry: 'to entry',
  map: 'to another map',
  self: 'this card',
  missing: 'missing',
};

function RecallCardNode({ data }: NodeProps) {
  const { node, rows, isEntry, orphan, compact } = data as RecallCardData;
  const focus = useContext(RecallGraphContext);
  const selected = focus.selected === node.slug;
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-lg bg-card text-card-foreground',
        // Status rides the BORDER; the fill stays the card surface so titles
        // are readable in every theme (trace-graph convention). It is an
        // inset outline, not a CSS border, so the box stays exactly the size
        // the layout computed: a border would push the rows down by its
        // width and pull the row handles in, and every route's first
        // segment would slant by that much.
        orphan
          ? 'outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-warning'
          : isEntry
            ? 'outline outline-[1.5px] -outline-offset-[1.5px] outline-primary'
            : node.kind === 'prompt'
              ? 'outline outline-1 -outline-offset-1 outline-info'
              : 'outline outline-1 -outline-offset-1 outline-border',
        selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
      )}
    >
      <Handle type="target" position={Position.Top} id="in" style={HIDDEN_HANDLE} />
      {compact && rows.length > 0 && (
        <Handle type="source" position={Position.Bottom} id="out" style={HIDDEN_HANDLE} />
      )}
      <div
        className="flex shrink-0 flex-col justify-center gap-0.5 px-3 text-left"
        style={{ height: HEADER_H }}
      >
        <span className="truncate text-xs font-medium leading-4">{node.title}</span>
        <span className="flex items-center gap-1.5 text-[10px] leading-[14px] text-muted-foreground">
          {isEntry && <Pill tone="primary">entry</Pill>}
          {node.kind === 'prompt' && <Pill tone="info">prompt</Pill>}
          {node.promptPending && <Pill tone="info">prompt request</Pill>}
          {orphan && <Pill tone="warning">orphan</Pill>}
          <span className="truncate font-mono">{node.slug}</span>
        </span>
      </div>
      {rows.length > 0 && (
        <div className="border-t border-border" style={{ borderTopWidth: DIVIDER_H }}>
          {compact ? (
            <p
              className="flex items-center px-3 text-[10px] text-muted-foreground"
              style={{ height: COUNT_H }}
            >
              {rows.length} {rows.length === 1 ? 'option' : 'options'}
            </p>
          ) : (
            <ul className="list-none" style={{ paddingBottom: ROWS_PAD }}>
              {rows.map((row) => (
                <OptionRow
                  key={row.index}
                  row={row}
                  lit={!!row.edgeId && focus.lit.has(row.edgeId)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ tone, children }: { tone: 'primary' | 'info' | 'warning'; children: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm px-1 font-medium leading-[14px]',
        tone === 'primary' && 'bg-primary/10 text-primary-ink',
        tone === 'info' && 'bg-info/10 text-info-ink',
        tone === 'warning' && 'bg-warning/10 text-warning-ink',
      )}
    >
      {children}
    </span>
  );
}

function OptionRow({ row, lit }: { row: RecallCardRow; lit: boolean }) {
  const { setHoveredRow } = useContext(RecallGraphContext);
  const marker = MARKER_TEXT[row.kind];
  const hasLine = row.edgeId !== null;
  const hover = hasLine ? () => setHoveredRow(row.edgeId) : undefined;
  const leave = hasLine ? () => setHoveredRow(null) : undefined;
  return (
    <li className="relative" style={{ height: ROW_H }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <RowButton
            // `nodrag nopan`: grabbing a row must not pan the canvas out from
            // under the pointer. A button, not a div, so hover AND keyboard
            // focus open the tooltip and the full label is reachable without
            // a mouse.
            className={cn(
              'nodrag nopan flex h-full w-full cursor-default items-center gap-1.5 pl-3 pr-4',
              'text-[11px] leading-none text-foreground/90 hover:bg-accent hover:text-accent-foreground',
              'focus-visible:ring-inset focus-visible:ring-offset-0',
              lit && 'bg-accent text-accent-foreground',
            )}
            onMouseEnter={hover}
            onMouseLeave={leave}
            onFocus={hover}
            onBlur={leave}
          >
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {marker && (
              <span
                className={cn(
                  'shrink-0 text-[9px] uppercase tracking-wider',
                  row.kind === 'missing' ? 'text-warning-ink' : 'text-muted-foreground',
                )}
              >
                {marker}
              </span>
            )}
          </RowButton>
        </TooltipTrigger>
        {/* The tooltip surface is `bg-primary`, so its second line takes the
            matching ink at reduced opacity, never `muted-foreground`, which is
            paired with `background` and would drop out here. */}
        <TooltipContent side="right" className="max-w-xs">
          <p className="font-medium">{row.label}</p>
          {row.useWhen && (
            <p className="mt-0.5 text-primary-foreground/80">Use when {row.useWhen}</p>
          )}
          <p className="mt-0.5 text-primary-foreground/80">{leadsTo(row)}</p>
        </TooltipContent>
      </Tooltip>
      {hasLine && (
        <Handle
          type="source"
          position={Position.Right}
          id={`opt-${row.index}`}
          isConnectable={false}
          style={rowHandleStyle(lit)}
        />
      )}
    </li>
  );
}

function leadsTo(row: RecallCardRow): string {
  switch (row.kind) {
    case 'entry':
      return 'Leads back to the entry card.';
    case 'map':
      return `Leads into another map: ${row.targetMap}.`;
    case 'self':
      return 'Leads back to this card.';
    case 'missing':
      return `No card is named ${row.targetSlug}.`;
    case 'cross':
      return `Leads to ${row.targetTitle ?? row.targetSlug} (placed under another card).`;
    default:
      return `Leads to ${row.targetTitle ?? row.targetSlug}.`;
  }
}

/** The caption over the orphan band. A node, so it scrolls and zooms with
 *  the cards it labels. */
function RecallBandNode({ data }: NodeProps) {
  return (
    <p className="flex h-full w-full items-end justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
      {String(data.text)}
    </p>
  );
}

export const recallNodeTypes = {
  [RECALL_CARD_TYPE]: memo(RecallCardNode),
  [RECALL_BAND_TYPE]: memo(RecallBandNode),
};
