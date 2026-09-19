import { describe, expect, it } from 'vitest';
import {
  buildChildrenIndex,
  pagePath,
  sortBySubtreeEdit,
  subtreeEditedAt,
  type TreeInput,
} from './page-tree';

const p = (id: string, parentId: string | null, title: string): TreeInput => ({
  id,
  parentId,
  title,
});

describe('buildChildrenIndex', () => {
  it('groups children under their parent and top-level pages under null', () => {
    const idx = buildChildrenIndex([
      p('a', null, 'Alpha'),
      p('b', 'a', 'Beta'),
      p('c', 'a', 'Gamma'),
    ]);
    expect(idx.get(null)?.map((n) => n.id)).toEqual(['a']);
    expect(idx.get('a')?.map((n) => n.id)).toEqual(['b', 'c']);
  });

  it('preserves input (server-sorted) sibling order', () => {
    const idx = buildChildrenIndex([
      p('a', null, 'Zeta'),
      p('b', null, 'Alpha'),
      p('c', null, 'Mu'),
    ]);
    // Order is whatever the server returned — buildChildrenIndex does not re-sort.
    expect(idx.get(null)?.map((n) => n.title)).toEqual(['Zeta', 'Alpha', 'Mu']);
  });

  it('treats a page with an unresolvable parent as a root (orphan-as-root)', () => {
    // 'b' points at a parent that isn't in the loaded set (e.g. beyond the
    // load limit) — it must still surface, as a top-level row.
    const idx = buildChildrenIndex([p('a', null, 'Alpha'), p('b', 'missing', 'Beta')]);
    expect(
      idx
        .get(null)
        ?.map((n) => n.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('handles deep nesting (grandchildren)', () => {
    const idx = buildChildrenIndex([
      p('a', null, 'Root'),
      p('b', 'a', 'Child'),
      p('c', 'b', 'Grandchild'),
    ]);
    expect(idx.get('a')?.map((n) => n.id)).toEqual(['b']);
    expect(idx.get('b')?.map((n) => n.id)).toEqual(['c']);
  });

  it('is cycle-safe: a mutual parent cycle yields no roots (renderer never recurses into it)', () => {
    // A.parent=B, B.parent=A — both resolve, so neither is a root. The tree
    // renderer starts from null and thus never reaches them: no infinite loop.
    const idx = buildChildrenIndex([p('a', 'b', 'A'), p('b', 'a', 'B')]);
    expect(idx.get(null) ?? []).toEqual([]);
  });

  it('returns an empty index for no pages', () => {
    expect(buildChildrenIndex([]).size).toBe(0);
  });
});

const e = (id: string, parentId: string | null, updatedAt: string, title = id) => ({
  id,
  parentId,
  title,
  updatedAt,
});
const T = (n: number) => `2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`;

describe('subtreeEditedAt', () => {
  it('lifts the newest edit up a deep chain, naming the page it happened on', () => {
    const pages = [e('a', null, T(1)), e('b', 'a', T(2)), e('c', 'b', T(3)), e('d', 'c', T(9))];
    const r = subtreeEditedAt(pages);
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(r.get(id)?.at).toBe(T(9));
      expect(r.get(id)?.page.id).toBe('d');
    }
  });

  it("keeps a page's own time when it is newer than everything under it", () => {
    const r = subtreeEditedAt([e('a', null, T(9)), e('b', 'a', T(2))]);
    expect(r.get('a')).toMatchObject({ at: T(9), page: { id: 'a' } });
    expect(r.get('b')).toMatchObject({ at: T(2), page: { id: 'b' } });
  });

  it('takes the newest of several siblings and does not leak across branches', () => {
    const r = subtreeEditedAt([
      e('a', null, T(1)),
      e('a1', 'a', T(4)),
      e('a2', 'a', T(7)),
      e('b', null, T(2)),
      e('b1', 'b', T(3)),
    ]);
    expect(r.get('a')).toMatchObject({ at: T(7), page: { id: 'a2' } });
    expect(r.get('b')).toMatchObject({ at: T(3), page: { id: 'b1' } });
  });

  it('treats an orphan as a root and still rolls its own subtree up', () => {
    const r = subtreeEditedAt([e('o', 'not-loaded', T(1)), e('o1', 'o', T(5))]);
    expect(r.get('o')).toMatchObject({ at: T(5), page: { id: 'o1' } });
  });

  it('survives a parent cycle: every page still gets its own time', () => {
    const r = subtreeEditedAt([e('a', 'b', T(1)), e('b', 'a', T(2)), e('c', null, T(3))]);
    expect(r.get('a')?.at).toBe(T(1));
    expect(r.get('b')?.at).toBe(T(2));
    expect(r.get('c')?.at).toBe(T(3));
  });

  it('on a tie the page itself wins over a descendant', () => {
    const r = subtreeEditedAt([e('a', null, T(5)), e('b', 'a', T(5))]);
    expect(r.get('a')?.page.id).toBe('a');
  });

  it('handles a chain deeper than the call stack would allow', () => {
    const pages = Array.from({ length: 20_000 }, (_, i) =>
      e(`p${i}`, i === 0 ? null : `p${i - 1}`, i === 19_999 ? T(9) : T(1)),
    );
    expect(subtreeEditedAt(pages).get('p0')?.at).toBe(T(9));
  });
});

describe('sortBySubtreeEdit', () => {
  it('puts the parent of a freshly edited sub-page first', () => {
    const pages = [
      e('fresh', null, T(8)),
      e('stale-parent', null, T(1)),
      e('child', 'stale-parent', T(9)),
    ];
    const idx = buildChildrenIndex(pages);
    const level = sortBySubtreeEdit(idx.get(null) ?? [], subtreeEditedAt(pages, idx));
    expect(level.map((p) => p.id)).toEqual(['stale-parent', 'fresh']);
  });

  it('breaks ties on own edit time, then title, and does not mutate its input', () => {
    const level = [e('z', null, T(5), 'Zeta'), e('a', null, T(5), 'Alpha'), e('n', null, T(6))];
    const rollup = subtreeEditedAt([...level, e('zc', 'z', T(6))]);
    // z and n both roll up to T(6); n's OWN time is newer. a trails at T(5).
    const sorted = sortBySubtreeEdit(level, rollup);
    expect(sorted.map((p) => p.id)).toEqual(['n', 'z', 'a']);
    expect(level.map((p) => p.id)).toEqual(['z', 'a', 'n']);
  });
});

describe('pagePath', () => {
  it('lists titles from the top level down to the page', () => {
    const pages = [p('a', null, 'Alpha'), p('b', 'a', 'Beta'), p('c', 'b', 'Gamma')];
    expect(pagePath(pages, 'c')).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('stops at an unloaded parent and at a cycle', () => {
    expect(pagePath([p('b', 'gone', 'Beta')], 'b')).toEqual(['Beta']);
    expect(pagePath([p('a', 'b', 'A'), p('b', 'a', 'B')], 'a')).toEqual(['B', 'A']);
  });
});
