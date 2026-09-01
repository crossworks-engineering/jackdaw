'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@mantle/web-ui/ui/tooltip';
import { cn } from '@mantle/web-ui/lib/utils';

/**
 * The option edge: one map node's signpost to the next.
 *
 * Why a custom edge at all: React Flow's built-in `label` is an SVG `<text>`
 * painted inside the edge layer. It cannot truncate, it cannot raise itself
 * above a neighbour, and it takes raw fills rather than theme tokens, so on
 * any map with a few branches the labels collided into an unreadable pile.
 *
 * `EdgeLabelRenderer` puts the label in a DOM layer ABOVE the SVG instead, so
 * it is an ordinary element: a fixed-width chip that truncates, and lifts on
 * hover or keyboard focus to show the label plus its "use when" line in full.
 * Truncation is what keeps chips from colliding; the tooltip is what keeps
 * them informative. The layout half of the fix lives in recall-graph.tsx,
 * which reserves LABEL_W/LABEL_H of dagre space per edge.
 */

/** Must match the space recall-graph reserves in the dagre layout. */
export const LABEL_W = 148;
export const LABEL_H = 22;

/** What the graph toolbar's toggle sets. `dots` keeps the anchor (so a dense
 *  map still says "there is a condition here") without the text. */
export type LabelMode = 'labels' | 'dots' | 'off';

export type OptionEdgeData = {
  label: string;
  useWhen: string;
  mode: LabelMode;
};

export const RECALL_EDGE_TYPE = 'option';

export function RecallOptionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const d = data as OptionEdgeData | undefined;
  const mode = d?.mode ?? 'labels';

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {mode !== 'off' && d && (
        <EdgeLabelRenderer>
          <div
            // `nodrag nopan` so grabbing a chip does not drag the canvas out
            // from under the pointer. pointer-events must be re-enabled: the
            // label layer sets `none` so edges below stay clickable.
            className={cn(
              'nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2',
              'hover:z-50 focus-within:z-50',
            )}
            style={{ left: labelX, top: labelY }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  // A button, not a div: hover AND keyboard focus both open
                  // the tooltip, so the full text is reachable without a mouse.
                  //
                  // In `dots` mode the BUTTON stays a normal-sized target and
                  // only the painted dot inside it is small. A 10px control is
                  // fiddly with a mouse and unusable with a finger, and the dot
                  // is the only way to read a label in that mode.
                  className={cn(
                    'group/chip flex cursor-default items-center justify-center transition-colors',
                    'focus-visible:outline-none',
                    mode === 'dots'
                      ? 'size-6 rounded-full'
                      : [
                          'truncate rounded-full border border-border bg-card px-2 py-1',
                          'text-[10px] leading-none text-muted-foreground shadow-xs',
                          'hover:border-primary/60 hover:text-foreground',
                          'focus-visible:border-primary/60',
                        ],
                  )}
                  // The one source of truth for the chip's width: the same
                  // constant the dagre layout reserves space with. Tailwind v4
                  // forbids a computed class, so it rides the style attribute
                  // rather than drifting as a second hardcoded number.
                  style={mode === 'dots' ? undefined : { maxWidth: LABEL_W }}
                >
                  {mode === 'dots' ? (
                    <>
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full border border-border bg-card shadow-xs transition-colors group-hover/chip:border-primary/60 group-focus-visible/chip:border-primary/60"
                      />
                      <span className="sr-only">{d.label}</span>
                    </>
                  ) : (
                    <span className="block truncate">{d.label}</span>
                  )}
                </button>
              </TooltipTrigger>
              {/* The tooltip surface is `bg-primary`, so its second line takes
                  the matching ink at reduced opacity, never `muted-foreground`,
                  which is paired with `background` and would drop out here. */}
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-medium">{d.label}</p>
                {/* The graph strips any "use when" the author already wrote,
                    so this prefix is added exactly once. */}
                {d.useWhen && (
                  <p className="mt-0.5 text-primary-foreground/80">Use when {d.useWhen}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const recallEdgeTypes = { [RECALL_EDGE_TYPE]: RecallOptionEdge };
