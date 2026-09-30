/**
 * The Recall map layout: a pure function from a map to card boxes and edge
 * routes, with nothing from React or React Flow in it, so it can be unit
 * tested and so the graph component only has to draw what comes out.
 *
 * Why not dagre over every edge (what the graph did before): a Recall map is
 * a decision tree with a few shortcuts. Fed every option edge, dagre treated
 * the "back to the entry" and "see also" links as structure, so the ranks
 * warped, back-links looped across the whole map and nothing read as a path.
 *
 * What this does instead:
 *
 *  1. Walks the map breadth-first from the entry card over in-map options.
 *     The first reach of a card is its tree parent; only those tree edges
 *     shape the layout. Every other option is a cross-link, drawn faintly
 *     and only on demand, or a marker on the option row (back to the entry,
 *     another map, itself, a missing target) with no line at all.
 *
 *  2. Tiers the tree top to bottom the Studio way: the entry at the top,
 *     depth 1 in a band below it, and so on. A card's children sit centred
 *     under it and siblings stay together. A run of leaf siblings wraps at
 *     MAX_PER_ROW into stacked rows so a card with many options does not
 *     force the whole map into an unreadable zoom.
 *
 *  3. Routes each tree edge as an orthogonal elbow from the option row's
 *     right edge to the child's top, with its own small offsets so the lines
 *     from one card nest instead of piling on each other.
 *
 *  4. Puts the cards the walk never reached (orphans) in a band under the
 *     tree.
 *
 * Every card box is computed from the constants below, and the node
 * component renders from the same constants, so an edge's route and the row
 * it leaves from agree to the pixel.
 */

/** Card width. Wider than the old 220 to give an option label room. */
export const NODE_W = 240;
/** The title block: title line, then slug and pills. */
export const HEADER_H = 46;
/** One option row. */
export const ROW_H = 22;
/** The hairline between the title block and the rows. */
export const DIVIDER_H = 1;
/** Air under the last row. */
export const ROWS_PAD = 6;
/** Compact mode: the one "n options" line that stands in for the rows. */
export const COUNT_H = 22;

/**
 * Cards per row before a run of leaf siblings wraps. Copied from
 * studio-canvas.tsx (its MAX_PER_ROW) rather than imported: the two canvases
 * are independent features and a shared constant would couple them for one
 * number. Keep the two in step by hand.
 */
export const MAX_PER_ROW = 5;

/** Horizontal gap between cards in one wrapped run. */
const CARD_GAP_X = 24;
/** Horizontal gap between sibling blocks (a subtree, or a run of leaves). It
 *  is the aisle the routes to a run's second row and beyond drop through, so
 *  it has to fit two aisles (one per neighbouring run) with their steps. */
const BLOCK_GAP_X = 64;
/** Vertical gap between the rows of one wrapped run. The routes into a lower
 *  row cross it, staggered by ROW_AISLE_STEP, so it must fit MAX_PER_ROW
 *  of those plus air. */
const RUN_ROW_GAP_Y = 36;
/** Least vertical gap between one depth band and the next. */
const BAND_GAP_MIN = 40;
/** Per option row, how much further out its route steps than the row under
 *  it, so the lines from one card nest rather than overlap. */
const STAGGER = 7;
/** Gap between the tree's lowest card and the orphan band. */
const ORPHAN_GAP_Y = 96;
/** A route's first step to the right of its card. */
const ELBOW_X = 10;
/** A route's crossbar sits this far above the child band. */
const ELBOW_Y = 10;
/** A route into a wrapped run's lower row drops through the aisle beside the
 *  run, this far out, plus a step per row so the drops do not overlap. */
const AISLE_X = 8;
const AISLE_STEP = 6;
/** Inside a run, the route into a lower-row card runs this far above the
 *  card, plus a step per column from the aisle so the runs nest. */
const ROW_AISLE_Y = 6;
const ROW_AISLE_STEP = 4;

/** Air kept between the outermost route and the neighbouring block. */
const ROUTE_CLEARANCE = 8;

/**
 * The drop-line stagger for a card with `n` option rows. STAGGER when it
 * fits; smaller when the card has so many rows that the outermost drop
 * (ELBOW_X + stagger * (n - 1)) would step past BLOCK_GAP_X into the next
 * block. A card with children is never in a run, so BLOCK_GAP_X is the
 * least free space to its right. With a dozen rows the lines sit 4px
 * apart; with fifty they overlap, which is the honest answer to a card
 * that no reader can follow anyway.
 */
export function dropStagger(n: number): number {
  if (n <= 1) return STAGGER;
  return Math.max(
    0,
    Math.min(STAGGER, Math.floor((BLOCK_GAP_X - ELBOW_X - ROUTE_CLEARANCE) / (n - 1))),
  );
}

/**
 * The aisle step for a run of `rows` wrapped rows, bounded the same way:
 * each neighbouring run may take half of BLOCK_GAP_X for its aisle.
 */
export function aisleStep(rows: number): number {
  if (rows <= 1) return AISLE_STEP;
  return Math.max(
    0,
    Math.min(AISLE_STEP, Math.floor((BLOCK_GAP_X / 2 - AISLE_X - ROUTE_CLEARANCE) / (rows - 1))),
  );
}

/** What the layout needs of a map: the wire shape carries far more. */
export interface LayoutMap {
  nodes: LayoutNode[];
}
export interface LayoutNode {
  slug: string;
  kind: 'index' | 'knowledge' | 'prompt';
  options: LayoutOption[];
}
export interface LayoutOption {
  targetSlug: string;
  targetMap?: string;
}

/**
 * What an option row means on the graph.
 *  - `tree`: the edge that placed its target; drawn solid.
 *  - `cross`: a shortcut to a card placed elsewhere; drawn dashed, on demand.
 *  - `entry`: back to the entry card; a marker, no line (these were the
 *    worst loops on the old graph).
 *  - `map`: leads into another map; a marker, no line, as before.
 *  - `self`: the card points at itself; a marker.
 *  - `missing`: no card by that slug; a marker.
 */
export type RowKind = 'tree' | 'cross' | 'entry' | 'map' | 'self' | 'missing';

export interface LayoutRow {
  index: number;
  kind: RowKind;
  /** The edge this row owns, for `tree` and `cross` rows. */
  edgeId: string | null;
  targetSlug: string;
  targetMap: string | null;
}

export interface LayoutCard {
  slug: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tree depth from the entry (0), or null for an orphan. */
  depth: number | null;
  /** The card whose option first reached this one; null for the entry and
   *  for orphans. */
  parent: string | null;
  orphan: boolean;
  rows: LayoutRow[];
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  sourceRow: number;
  target: string;
  kind: 'tree' | 'cross';
  /** For a tree edge: the interior waypoints of its elbow route, in flow
   *  coordinates, between the row's right edge and the child's top centre.
   *  Every consecutive pair shares an x or a y. Empty for a cross edge, which
   *  the edge component routes itself. */
  points: Point[];
}

export interface RecallLayout {
  entry: string | null;
  cards: LayoutCard[];
  edges: LayoutEdge[];
  /** Extent of everything placed, from the origin. */
  width: number;
  height: number;
  /** Top of the orphan band, or null when every card was reached. */
  orphanBandY: number | null;
}

export interface LayoutOptions {
  /** Compact cards: no option rows, one count line; edges leave from the
   *  card's bottom centre and share one crossbar per parent. */
  compact?: boolean;
}

/** A card's height for its option count. The node renders these same parts
 *  at these same heights. */
export function cardHeight(optionCount: number, compact: boolean): number {
  if (optionCount === 0) return HEADER_H;
  if (compact) return HEADER_H + DIVIDER_H + COUNT_H;
  return HEADER_H + DIVIDER_H + optionCount * ROW_H + ROWS_PAD;
}

/** The vertical centre of option row `i`, from the card's top. */
export function rowCenterY(i: number): number {
  return HEADER_H + DIVIDER_H + i * ROW_H + ROW_H / 2;
}

export function edgeId(source: string, row: number): string {
  return `${source}#${row}`;
}

type RunInfo = {
  id: string;
  row: number;
  col: number;
  cols: number;
  rows: number;
  left: number;
  right: number;
  /** Which side of the run the aisle is on: the side nearer the parent's
   *  centre, so the drop does not have to cross the run. */
  side: 'left' | 'right';
};

type Block = { kind: 'sub'; slug: string } | { kind: 'run'; id: string; slugs: string[] };

function rowWidth(n: number): number {
  return n > 0 ? n * NODE_W + (n - 1) * CARD_GAP_X : 0;
}

function runWidth(n: number): number {
  return rowWidth(Math.min(n, MAX_PER_ROW));
}

function chunkRows<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += MAX_PER_ROW) rows.push(items.slice(i, i + MAX_PER_ROW));
  return rows;
}

export function layoutRecallMap(map: LayoutMap, options: LayoutOptions = {}): RecallLayout {
  const compact = options.compact === true;
  // The server never serves two cards with one slug; a half-broken payload
  // could, and two cards on one spot with one edge id would be worse than
  // dropping the second. First wins.
  const seen = new Set<string>();
  const nodes = map.nodes.filter((n) => !seen.has(n.slug) && (seen.add(n.slug), true));
  if (nodes.length === 0) {
    return { entry: null, cards: [], edges: [], width: 0, height: 0, orphanBandY: null };
  }
  const bySlug = new Map(nodes.map((n) => [n.slug, n]));
  // The entry is the index card; a map without one (should not happen, but
  // a half-written payload might) starts from its first card.
  const entry = nodes.find((n) => n.kind === 'index') ?? nodes[0]!;

  // 1. Breadth-first walk: depth and first-reach parent per card.
  const depthOf = new Map<string, number>([[entry.slug, 0]]);
  const parentOf = new Map<string, { slug: string; row: number }>();
  const childrenOf = new Map<string, string[]>();
  const queue = [entry.slug];
  while (queue.length > 0) {
    const slug = queue.shift()!;
    const node = bySlug.get(slug)!;
    const kids: string[] = [];
    node.options.forEach((o, i) => {
      if (o.targetMap) return;
      const t = o.targetSlug;
      if (!bySlug.has(t) || t === slug || depthOf.has(t)) return;
      depthOf.set(t, depthOf.get(slug)! + 1);
      parentOf.set(t, { slug, row: i });
      kids.push(t);
      queue.push(t);
    });
    childrenOf.set(slug, kids);
  }

  // Row kinds, and the edge list (routes are filled in once positions exist).
  const rowsOf = new Map<string, LayoutRow[]>();
  const edges: LayoutEdge[] = [];
  for (const n of nodes) {
    const rows: LayoutRow[] = n.options.map((o, i) => {
      const base = { index: i, targetSlug: o.targetSlug, targetMap: o.targetMap ?? null };
      let kind: RowKind;
      if (o.targetMap) kind = 'map';
      else if (!bySlug.has(o.targetSlug)) kind = 'missing';
      else if (o.targetSlug === n.slug) kind = 'self';
      else if (o.targetSlug === entry.slug) kind = 'entry';
      else {
        const p = parentOf.get(o.targetSlug);
        kind = p && p.slug === n.slug && p.row === i ? 'tree' : 'cross';
      }
      if (kind !== 'tree' && kind !== 'cross') return { ...base, kind, edgeId: null };
      const id = edgeId(n.slug, i);
      edges.push({ id, source: n.slug, sourceRow: i, target: o.targetSlug, kind, points: [] });
      return { ...base, kind, edgeId: id };
    });
    rowsOf.set(n.slug, rows);
  }

  // 2. Blocks under each reached card: a child with children of its own is
  //    a subtree block; consecutive leaf children form one run that wraps.
  //    Option order is kept, so a parent's rows still read top to bottom as
  //    left to right below it.
  const blocksOf = new Map<string, Block[]>();
  for (const [slug, kids] of childrenOf) {
    const blocks: Block[] = [];
    let run: string[] | null = null;
    kids.forEach((k) => {
      const isLeaf = (childrenOf.get(k)?.length ?? 0) === 0;
      if (isLeaf) {
        if (!run) {
          run = [];
          blocks.push({ kind: 'run', id: `${slug}#${blocks.length}`, slugs: run });
        }
        run.push(k);
      } else {
        run = null;
        blocks.push({ kind: 'sub', slug: k });
      }
    });
    blocksOf.set(slug, blocks);
  }

  const widthMemo = new Map<string, number>();
  function blockWidths(slug: string): number[] {
    return (blocksOf.get(slug) ?? []).map((b) =>
      b.kind === 'sub' ? subtreeWidth(b.slug) : runWidth(b.slugs.length),
    );
  }
  function subtreeWidth(slug: string): number {
    const memo = widthMemo.get(slug);
    if (memo !== undefined) return memo;
    const ws = blockWidths(slug);
    const total = ws.reduce((a, w) => a + w, 0) + BLOCK_GAP_X * Math.max(0, ws.length - 1);
    const w = Math.max(NODE_W, total);
    widthMemo.set(slug, w);
    return w;
  }

  // 3. x positions, top down: a card centres over its children block.
  const xOf = new Map<string, number>();
  const runOf = new Map<string, RunInfo>();
  const runRows = new Map<string, string[][]>();
  function placeX(slug: string, left: number): void {
    const w = subtreeWidth(slug);
    const cx = left + w / 2;
    xOf.set(slug, Math.round(cx - NODE_W / 2));
    const blocks = blocksOf.get(slug) ?? [];
    const ws = blockWidths(slug);
    const total = ws.reduce((a, x) => a + x, 0) + BLOCK_GAP_X * Math.max(0, ws.length - 1);
    let bx = left + (w - total) / 2;
    blocks.forEach((b, bi) => {
      const bw = ws[bi]!;
      if (b.kind === 'sub') {
        placeX(b.slug, bx);
      } else {
        const rows = chunkRows(b.slugs);
        runRows.set(b.id, rows);
        const side: RunInfo['side'] = bx + bw / 2 <= cx ? 'right' : 'left';
        rows.forEach((row, r) => {
          const start = bx + (bw - rowWidth(row.length)) / 2;
          row.forEach((s, c) => {
            xOf.set(s, Math.round(start + c * (NODE_W + CARD_GAP_X)));
            runOf.set(s, {
              id: b.id,
              row: r,
              col: c,
              cols: row.length,
              rows: rows.length,
              left: bx,
              right: bx + bw,
              side,
            });
          });
        });
      }
      bx += bw + BLOCK_GAP_X;
    });
  }
  placeX(entry.slug, 0);

  // 4. Band heights, then y positions. A card in a run's lower row sits
  //    below the rows above it; the band is as tall as its tallest stack.
  const heightOf = new Map<string, number>();
  for (const n of nodes) heightOf.set(n.slug, cardHeight(n.options.length, compact));
  const rowMaxH = new Map<string, number[]>();
  for (const [id, rows] of runRows) {
    rowMaxH.set(
      id,
      rows.map((row) => Math.max(...row.map((s) => heightOf.get(s)!))),
    );
  }
  function rowOffset(slug: string): number {
    const run = runOf.get(slug);
    if (!run) return 0;
    const maxes = rowMaxH.get(run.id)!;
    let off = 0;
    for (let k = 0; k < run.row; k++) off += maxes[k]! + RUN_ROW_GAP_Y;
    return off;
  }
  const byDepth: string[][] = [];
  for (const [slug, d] of depthOf) (byDepth[d] ??= []).push(slug);
  const bandY: number[] = [];
  let y = 0;
  byDepth.forEach((slugs, d) => {
    bandY[d] = y;
    const bandH = Math.max(...slugs.map((s) => rowOffset(s) + heightOf.get(s)!));
    // The gap below has to fit the crossbars of every parent in this band,
    // nested one STAGGER apart per option row.
    const maxRows = compact
      ? 0
      : Math.max(
          0,
          ...slugs
            .filter((s) => (childrenOf.get(s)?.length ?? 0) > 0)
            .map((s) => bySlug.get(s)!.options.length),
        );
    y += bandH + BAND_GAP_MIN + STAGGER * maxRows;
  });

  const placed = new Map<string, { x: number; y: number; h: number }>();
  for (const [slug, d] of depthOf) {
    placed.set(slug, { x: xOf.get(slug)!, y: bandY[d]! + rowOffset(slug), h: heightOf.get(slug)! });
  }

  // 5. Orphans: wrapped rows centred under the tree.
  const orphans = nodes.filter((n) => !depthOf.has(n.slug)).map((n) => n.slug);
  let orphanBandY: number | null = null;
  if (orphans.length > 0) {
    const treeBottom = Math.max(...[...placed.values()].map((p) => p.y + p.h));
    orphanBandY = treeBottom + ORPHAN_GAP_Y;
    const treeCx = subtreeWidth(entry.slug) / 2;
    let oy = orphanBandY;
    for (const row of chunkRows(orphans)) {
      const start = treeCx - rowWidth(row.length) / 2;
      row.forEach((s, c) => {
        placed.set(s, {
          x: Math.round(start + c * (NODE_W + CARD_GAP_X)),
          y: oy,
          h: heightOf.get(s)!,
        });
      });
      oy += Math.max(...row.map((s) => heightOf.get(s)!)) + RUN_ROW_GAP_Y;
    }
  }

  // 6. Tree edge routes. From the option row's right edge (or, compact, the
  //    card's bottom centre) out to a drop line, down to a crossbar above the
  //    child band, across to the child's centre, and down into its top. A
  //    child in a run's lower row is reached through the aisle beside the run
  //    instead of through the cards above it.
  for (const e of edges) {
    if (e.kind !== 'tree') continue;
    const P = placed.get(e.source)!;
    const C = placed.get(e.target)!;
    const n = bySlug.get(e.source)!.options.length;
    const k = compact ? 0 : n - 1 - e.sourceRow;
    const sx = compact ? P.x + NODE_W / 2 : P.x + NODE_W;
    const sy = compact ? P.y + P.h : P.y + rowCenterY(e.sourceRow);
    const dropX = compact ? sx : P.x + NODE_W + ELBOW_X + dropStagger(n) * k;
    const bar = bandY[depthOf.get(e.target)!]! - ELBOW_Y - STAGGER * k;
    const tcx = C.x + NODE_W / 2;
    const pts: Point[] = compact
      ? [{ x: sx, y: bar }]
      : [
          { x: dropX, y: sy },
          { x: dropX, y: bar },
        ];
    const run = runOf.get(e.target);
    if (run && run.row > 0) {
      const step = aisleStep(run.rows);
      const aisleX =
        run.side === 'right'
          ? run.right + AISLE_X + step * run.row
          : run.left - AISLE_X - step * run.row;
      const dist = run.side === 'right' ? run.cols - 1 - run.col : run.col;
      const rowBar = C.y - ROW_AISLE_Y - ROW_AISLE_STEP * dist;
      pts.push({ x: aisleX, y: bar }, { x: aisleX, y: rowBar }, { x: tcx, y: rowBar });
    } else {
      pts.push({ x: tcx, y: bar });
    }
    e.points = pts;
  }

  // The orphan band can be wider than the tree and start left of it: shift
  // everything so the leftmost card sits at x = 0 and `width` is the extent.
  const minX = Math.min(...[...placed.values()].map((p) => p.x));
  if (minX !== 0) {
    for (const p of placed.values()) p.x -= minX;
    for (const e of edges) for (const pt of e.points) pt.x -= minX;
  }
  const cards: LayoutCard[] = nodes.map((n) => {
    const p = placed.get(n.slug)!;
    const d = depthOf.get(n.slug);
    return {
      slug: n.slug,
      x: p.x,
      y: p.y,
      width: NODE_W,
      height: p.h,
      depth: d ?? null,
      parent: parentOf.get(n.slug)?.slug ?? null,
      orphan: d === undefined,
      rows: rowsOf.get(n.slug)!,
    };
  });
  const width = Math.max(...cards.map((c) => c.x + c.width));
  const height = Math.max(...cards.map((c) => c.y + c.height));
  return { entry: entry.slug, cards, edges, width, height, orphanBandY };
}
