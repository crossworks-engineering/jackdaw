import { describe, expect, it } from 'vitest';
import {
  HEADER_H,
  MAX_PER_ROW,
  NODE_W,
  cardHeight,
  layoutRecallMap,
  rowCenterY,
  type LayoutCard,
  type LayoutMap,
  type LayoutNode,
} from './recall-layout';

function card(slug: string, targets: string[] = [], kind: LayoutNode['kind'] = 'knowledge') {
  return { slug, kind, options: targets.map((t) => ({ targetSlug: t })) } satisfies LayoutNode;
}

function mapOf(...nodes: LayoutNode[]): LayoutMap {
  return { nodes };
}

function overlaps(a: LayoutCard, b: LayoutCard): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function expectNoOverlap(cards: LayoutCard[]) {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      expect(overlaps(cards[i]!, cards[j]!), `${cards[i]!.slug} overlaps ${cards[j]!.slug}`).toBe(
        false,
      );
    }
  }
}

function centreX(c: LayoutCard): number {
  return c.x + c.width / 2;
}

describe('layoutRecallMap', () => {
  it('survives an empty map and a one-card map', () => {
    expect(layoutRecallMap(mapOf())).toEqual({
      entry: null,
      cards: [],
      edges: [],
      width: 0,
      height: 0,
      orphanBandY: null,
    });
    const one = layoutRecallMap(mapOf(card('start', [], 'index')));
    expect(one.entry).toBe('start');
    expect(one.cards).toHaveLength(1);
    expect(one.cards[0]).toMatchObject({ x: 0, y: 0, depth: 0, parent: null, orphan: false });
    expect(one.cards[0]!.height).toBe(HEADER_H);
    expect(one.edges).toEqual([]);
  });

  it('is deterministic', () => {
    const map = mapOf(
      card('start', ['a', 'b', 'c'], 'index'),
      card('a', ['a1', 'a2']),
      card('b', ['start']),
      card('c'),
      card('a1'),
      card('a2', ['b']),
      card('lost', ['a']),
    );
    expect(layoutRecallMap(map)).toEqual(layoutRecallMap(map));
  });

  it('lays the Architecture shape (entry plus 4 leaves) as one row under the entry', () => {
    const out = layoutRecallMap(
      mapOf(
        card('start', ['a', 'b', 'c', 'd'], 'index'),
        card('a'),
        card('b'),
        card('c'),
        card('d'),
      ),
    );
    const entry = out.cards.find((c) => c.slug === 'start')!;
    const leaves = out.cards.filter((c) => c.slug !== 'start');
    expect(leaves.every((c) => c.depth === 1 && c.parent === 'start')).toBe(true);
    // One row: same y, below the entry, x increasing in option order.
    expect(new Set(leaves.map((c) => c.y)).size).toBe(1);
    expect(leaves[0]!.y).toBeGreaterThan(entry.y + entry.height);
    expect(leaves.map((c) => c.x)).toEqual([...leaves.map((c) => c.x)].sort((p, q) => p - q));
    // Centred under the entry.
    const mid = (leaves[0]!.x + leaves[3]!.x + NODE_W) / 2;
    expect(Math.abs(centreX(entry) - mid)).toBeLessThanOrEqual(1);
    expectNoOverlap(out.cards);
    expect(out.edges.filter((e) => e.kind === 'tree')).toHaveLength(4);
    expect(out.orphanBandY).toBeNull();
  });

  it('wraps a run of leaves at MAX_PER_ROW', () => {
    const leaves = Array.from({ length: MAX_PER_ROW + 2 }, (_, i) => `l${i}`);
    const out = layoutRecallMap(
      mapOf(card('start', leaves, 'index'), ...leaves.map((l) => card(l))),
    );
    const placed = out.cards.filter((c) => c.depth === 1);
    const rows = new Map<number, LayoutCard[]>();
    for (const c of placed) rows.set(c.y, [...(rows.get(c.y) ?? []), c]);
    const ys = [...rows.keys()].sort((p, q) => p - q);
    expect(ys).toHaveLength(2);
    expect(rows.get(ys[0]!)).toHaveLength(MAX_PER_ROW);
    expect(rows.get(ys[1]!)).toHaveLength(2);
    expectNoOverlap(out.cards);
    // Every wrapped card still has a tree edge, routed with axis-aligned
    // segments that end above the child's top centre.
    for (const c of placed) {
      const e = out.edges.find((x) => x.target === c.slug && x.kind === 'tree')!;
      expect(e).toBeDefined();
      const last = e.points.at(-1)!;
      expect(last.x).toBe(centreX(c));
      expect(last.y).toBeLessThan(c.y);
      for (let i = 1; i < e.points.length; i++) {
        const a = e.points[i - 1]!;
        const b = e.points[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
  });

  it('puts unreached cards in a band under the tree', () => {
    const out = layoutRecallMap(
      mapOf(card('start', ['a'], 'index'), card('a'), card('lost1', ['a']), card('lost2')),
    );
    const tree = out.cards.filter((c) => !c.orphan);
    const orphans = out.cards.filter((c) => c.orphan);
    expect(orphans.map((c) => c.slug)).toEqual(['lost1', 'lost2']);
    expect(orphans.every((c) => c.depth === null && c.parent === null)).toBe(true);
    const treeBottom = Math.max(...tree.map((c) => c.y + c.height));
    expect(out.orphanBandY).toBeGreaterThan(treeBottom);
    expect(orphans.every((c) => c.y >= out.orphanBandY!)).toBe(true);
    // An orphan's option to a placed card is a cross-link, never a tree edge.
    expect(out.edges.find((e) => e.source === 'lost1')).toMatchObject({
      kind: 'cross',
      target: 'a',
    });
    expectNoOverlap(out.cards);
  });

  it('keeps one tree parent per card and marks the rest', () => {
    const out = layoutRecallMap({
      nodes: [
        card('start', ['a', 'b'], 'index'),
        card('a', ['c', 'start', 'a', 'gone']),
        card('b', ['c']),
        { slug: 'c', kind: 'prompt', options: [{ targetSlug: 'other', targetMap: 'other-map' }] },
      ],
    });
    const c = out.cards.find((x) => x.slug === 'c')!;
    // Breadth-first: a is visited before b, so a placed c.
    expect(c.parent).toBe('a');
    expect(c.depth).toBe(2);
    const a = out.cards.find((x) => x.slug === 'a')!;
    expect(a.rows.map((r) => r.kind)).toEqual(['tree', 'entry', 'self', 'missing']);
    expect(a.rows.slice(1).every((r) => r.edgeId === null)).toBe(true);
    const b = out.cards.find((x) => x.slug === 'b')!;
    expect(b.rows[0]).toMatchObject({ kind: 'cross', targetSlug: 'c' });
    expect(c.rows[0]).toMatchObject({ kind: 'map', targetMap: 'other-map', edgeId: null });
    // Only two lines shape the map plus the one cross-link; markers draw none.
    expect(out.edges.map((e) => `${e.kind}:${e.source}>${e.target}`).sort()).toEqual([
      'cross:b>c',
      'tree:a>c',
      'tree:start>a',
      'tree:start>b',
    ]);
  });

  it('never overlaps on a deep map that mixes subtrees and wrapped runs', () => {
    const nodes: LayoutNode[] = [
      card('start', ['hub1', 'x1', 'x2', 'hub2', 'x3', 'x4', 'x5', 'x6'], 'index'),
    ];
    nodes.push(
      card('hub1', ['h1a', 'h1b', 'h1c']),
      card('h1a', ['deep']),
      card('h1b'),
      card('h1c'),
    );
    nodes.push(card('deep', ['start', 'hub2']));
    nodes.push(card('hub2', ['h2a', 'h2b', 'h2c', 'h2d', 'h2e', 'h2f', 'h2g']));
    for (const l of ['h2a', 'h2b', 'h2c', 'h2d', 'h2e', 'h2f', 'h2g'])
      nodes.push(card(l, ['start']));
    for (const l of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6']) nodes.push(card(l));
    nodes.push(card('orphan-a', ['hub1']), card('orphan-b'));
    for (const compact of [false, true]) {
      const out = layoutRecallMap({ nodes }, { compact });
      expectNoOverlap(out.cards);
      expect(out.cards.filter((c) => c.orphan).map((c) => c.slug)).toEqual([
        'orphan-a',
        'orphan-b',
      ]);
      // Depth bands stack downward.
      const byDepth = new Map<number, number[]>();
      for (const c of out.cards)
        if (c.depth !== null) byDepth.set(c.depth, [...(byDepth.get(c.depth) ?? []), c.y]);
      for (let d = 1; byDepth.has(d); d++) {
        expect(Math.min(...byDepth.get(d)!)).toBeGreaterThan(Math.max(...byDepth.get(d - 1)!));
      }
      // Every tree edge's route stays axis-aligned.
      for (const e of out.edges.filter((x) => x.kind === 'tree')) {
        for (let i = 1; i < e.points.length; i++) {
          const a = e.points[i - 1]!;
          const b = e.points[i]!;
          expect(a.x === b.x || a.y === b.y).toBe(true);
        }
      }
    }
  });

  it('sizes cards from their option count, smaller in compact mode', () => {
    expect(cardHeight(0, false)).toBe(HEADER_H);
    expect(cardHeight(0, true)).toBe(HEADER_H);
    expect(cardHeight(3, true)).toBeLessThan(cardHeight(3, false));
    expect(cardHeight(6, true)).toBe(cardHeight(1, true));
    expect(rowCenterY(1) - rowCenterY(0)).toBe(cardHeight(2, false) - cardHeight(1, false));
    const full = layoutRecallMap(mapOf(card('start', ['a', 'b'], 'index'), card('a'), card('b')));
    const compact = layoutRecallMap(
      mapOf(card('start', ['a', 'b'], 'index'), card('a'), card('b')),
      { compact: true },
    );
    expect(compact.height).toBeLessThan(full.height);
    // Compact routes leave from the card's bottom centre and share a crossbar.
    const bars = new Set(compact.edges.map((e) => e.points[0]!.y));
    expect(bars.size).toBe(1);
    const entryCx = centreX(compact.cards.find((c) => c.slug === 'start')!);
    expect(compact.edges.every((e) => e.points[0]!.x === entryCx)).toBe(true);
    // Full routes leave from their own row and nest: the top row steps out
    // furthest.
    const [top, bottom] = full.edges.map((e) => e.points[0]!);
    expect(top!.x).toBeGreaterThan(bottom!.x);
    expect(top!.y).toBe(rowCenterY(0));
    expect(bottom!.y).toBe(rowCenterY(1));
  });
});
