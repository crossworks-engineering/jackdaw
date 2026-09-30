'use client';

import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { Point } from './recall-layout';

/**
 * The option edge: one card's signpost to the next.
 *
 * Two kinds. A TREE edge is the option that placed its target under its
 * source, and it draws the route recall-layout computed for it: an
 * orthogonal elbow from the option row's right edge, down to a crossbar above
 * the child band, across, and down into the child's top. Orthogonal, not
 * bezier, because a Recall map is a decision tree and a reader follows
 * corners more easily than curves that swing across each other.
 *
 * A CROSS edge is a shortcut to a card placed elsewhere (a link sideways or
 * back up the tree). It is dashed and faint, and the graph only draws it
 * while its source or target card is selected or hovered, so it can use
 * React Flow's smoothstep routing and go wherever it must without cluttering
 * the resting map.
 *
 * The label is no longer here: it lives on the option row of the card the
 * edge leaves from (recall-card-node.tsx). Every edge ends going straight
 * down into its target, so a small arrowhead is drawn there rather than
 * through React Flow's marker defs, which key their ids on a raw colour
 * string and cannot take a theme token.
 */

export const RECALL_EDGE_TYPE = 'option';

export type EdgeState = 'normal' | 'dim' | 'lit';

export interface RecallEdgeData {
  kind: 'tree' | 'cross';
  points: Point[];
  state: EdgeState;
  [key: string]: unknown;
}

/** Corner radius of a tree edge's elbows. */
const CORNER = 8;
const ARROW_W = 4;
const ARROW_H = 7;

/** An SVG path through axis-aligned points with rounded corners. A corner
 *  next to a zero-length segment is drawn square, so a route whose drop line
 *  happens to sit on the child's centre still renders. */
export function elbowPath(points: Point[], radius = CORNER): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (inLen === 0 || outLen === 0) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = {
      x: cur.x + ((prev.x - cur.x) / inLen) * r,
      y: cur.y + ((prev.y - cur.y) / inLen) * r,
    };
    const b = {
      x: cur.x + ((next.x - cur.x) / outLen) * r,
      y: cur.y + ((next.y - cur.y) / outLen) * r,
    };
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function RecallOptionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const d = data as RecallEdgeData | undefined;
  const kind = d?.kind ?? 'tree';
  const state = d?.state ?? 'normal';

  const path =
    kind === 'tree'
      ? elbowPath([{ x: sourceX, y: sourceY }, ...(d?.points ?? []), { x: targetX, y: targetY }])
      : getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          borderRadius: CORNER,
        })[0];

  // Token, not a hardcoded slate. `--border` alone is too faint to trace
  // across a big map, so the resting line is the muted ink held back to
  // roughly border weight: legible in every theme, light and dark.
  const stroke = state === 'lit' ? 'var(--primary)' : 'var(--muted-foreground)';
  const opacity = state === 'lit' ? 1 : state === 'dim' ? 0.12 : kind === 'cross' ? 0.35 : 0.45;
  const width = state === 'lit' ? 2 : 1.5;
  const arrow = `M ${targetX - ARROW_W} ${targetY - ARROW_H} L ${targetX} ${targetY} L ${targetX + ARROW_W} ${targetY - ARROW_H} Z`;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeOpacity: opacity,
          strokeWidth: width,
          strokeDasharray: kind === 'cross' ? '5 4' : undefined,
        }}
      />
      <path d={arrow} fill={stroke} fillOpacity={opacity} />
    </>
  );
}

export const recallEdgeTypes = { [RECALL_EDGE_TYPE]: RecallOptionEdge };
