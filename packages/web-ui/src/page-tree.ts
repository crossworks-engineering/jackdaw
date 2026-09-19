/**
 * Tree helpers for the /pages hierarchy view (Phase 4a sub-pages). Pure so the
 * grouping rules — top-level detection, orphan-as-root, child ordering — are
 * unit-testable without rendering the client component.
 */

export interface TreeInput {
  id: string;
  parentId: string | null;
  title: string;
}

/**
 * Group pages by parent id for the collapsible tree. The `null` key holds the
 * top-level pages. A page whose `parentId` doesn't resolve to a loaded page is
 * treated as a root (defensive — e.g. its parent fell outside the load limit),
 * so nothing is ever silently dropped from the tree. Sibling order is
 * PRESERVED from the input — the server already returns pages in the chosen
 * sort order (last edited / newest / title / …), so the tree honours it.
 *
 * Cycle-safety: if two pages point at each other (A.parent=B, B.parent=A),
 * both have a resolvable parent so neither lands under the `null` key — the
 * recursive renderer starts from `null` and simply never reaches them, so a
 * cycle can't cause infinite recursion (it just hides the cycle). The current
 * API can't create such a cycle, but the renderer stays safe regardless.
 */
export function buildChildrenIndex<T extends TreeInput>(pages: T[]): Map<string | null, T[]> {
  const ids = new Set(pages.map((p) => p.id));
  const m = new Map<string | null, T[]>();
  for (const p of pages) {
    const key = p.parentId && ids.has(p.parentId) ? p.parentId : null;
    const arr = m.get(key) ?? [];
    arr.push(p);
    m.set(key, arr);
  }
  return m;
}

export interface EditedTreeInput extends TreeInput {
  /** ISO timestamp (`toISOString`), so plain string comparison orders it. */
  updatedAt: string;
}

/** The newest edit anywhere in a page's subtree, and the page it happened on. */
export interface SubtreeEdit<T> {
  /** The latest `updatedAt` among the page and all its descendants. */
  at: string;
  /** The page that carries it: the page itself, or a descendant at any depth. */
  page: T;
}

/**
 * For every page, the newest edit in its SUBTREE: the max of its own
 * `updatedAt` and every descendant's. This is what "Last edited" sorts a level
 * by, so that editing a sub-page lifts each of its ancestors within their own
 * level, and the fresh edit is visible from the top instead of only after
 * drilling in.
 *
 * It is computed here, from timestamps the server already sends, and NOT by
 * bumping the ancestors' `updated_at` on the server. That would lie about when
 * the parent changed, re-trigger indexing and summaries for pages nobody
 * touched, and pollute "recently edited" everywhere else it is read.
 *
 * Walks down from the roots of `buildChildrenIndex`, so it inherits that
 * index's rules: an orphan counts as a root, and the members of a parent cycle
 * are never reached. Those fall back to their own timestamp, so every input
 * page has an entry. Iterative, so a very deep chain cannot overflow the stack.
 */
export function subtreeEditedAt<T extends EditedTreeInput>(
  pages: T[],
  index: Map<string | null, T[]> = buildChildrenIndex(pages),
): Map<string, SubtreeEdit<T>> {
  const out = new Map<string, SubtreeEdit<T>>();
  // Pre-order from the roots; reversed, it visits every child before its parent.
  const order: T[] = [];
  const stack: T[] = [...(index.get(null) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const p = stack.pop() as T;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    order.push(p);
    for (const c of index.get(p.id) ?? []) stack.push(c);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const p = order[i] as T;
    let best: SubtreeEdit<T> = { at: p.updatedAt, page: p };
    for (const c of index.get(p.id) ?? []) {
      const sub = out.get(c.id);
      if (sub && sub.at > best.at) best = sub;
    }
    out.set(p.id, best);
  }
  for (const p of pages) if (!out.has(p.id)) out.set(p.id, { at: p.updatedAt, page: p });
  return out;
}

/**
 * One level of the tree in "Last edited" order: newest subtree activity first.
 * Ties fall to the page's own edit time, then its title, so the order is total
 * and does not shuffle between renders. Returns a new array.
 */
export function sortBySubtreeEdit<T extends EditedTreeInput>(
  level: T[],
  rollup: Map<string, SubtreeEdit<T>>,
): T[] {
  const at = (p: T) => rollup.get(p.id)?.at ?? p.updatedAt;
  return [...level].sort((a, b) => {
    const [sa, sb] = [at(a), at(b)];
    if (sa !== sb) return sa < sb ? 1 : -1;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

/** The titles from a top-level page down to `id`, for saying where a page
 *  lives. Stops at an unloaded parent or a cycle rather than looping. */
export function pagePath<T extends TreeInput>(pages: T[], id: string): string[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const path: string[] = [];
  const seen = new Set<string>();
  for (
    let p = byId.get(id);
    p && !seen.has(p.id);
    p = p.parentId ? byId.get(p.parentId) : undefined
  ) {
    seen.add(p.id);
    path.unshift(p.title);
  }
  return path;
}
