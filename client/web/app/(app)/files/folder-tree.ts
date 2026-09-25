/**
 * The Files tree's shape, kept pure so it can be tested without a DOM: the
 * brain hands over a flat list of folders keyed by ltree path, and the rail
 * draws them as the /apps tree does, with dotted guides from each child back
 * to its parent and folders that fold away.
 */
import { FILES_ROOT } from './files-shared';
import type { FolderRow } from './files-shared';

export type FolderTreeRow = {
  folder: FolderRow;
  /** 0 = a direct child of the files root. */
  depth: number;
  /** Last child of its parent: draws └ instead of ├. */
  isLast: boolean;
  /** Per ancestor level, whether that ancestor was the last child of ITS
   *  parent (no continuing │ at that level). Same contract as AppNavRow. */
  guides: boolean[];
  hasChildren: boolean;
};

const parentOf = (path: string) => {
  const i = path.lastIndexOf('.');
  return i > 0 ? path.slice(0, i) : null;
};

/** Every ancestor path of `path`, root first, excluding `path` itself. */
export function ancestorPaths(path: string): string[] {
  const segs = path.split('.');
  return segs.slice(1).map((_, i) => segs.slice(0, i + 1).join('.'));
}

/**
 * Flatten the folders under the files root into display rows, descending only
 * into folders `isOpen` reports as expanded.
 *
 * With a `filter`, a folder whose slug or path contains it is kept along with
 * every ancestor (so the result still reads as a tree, not a list of orphans),
 * and everything kept is shown expanded: a match hidden inside a folded
 * parent is no match at all.
 */
export function flattenFolderTree(
  tree: readonly FolderRow[],
  isOpen: (folder: FolderRow) => boolean,
  filter = '',
): FolderTreeRow[] {
  const kids = new Map<string, FolderRow[]>();
  for (const f of tree) {
    const parent = parentOf(f.path);
    if (parent === null) continue;
    const list = kids.get(parent);
    if (list) list.push(f);
    else kids.set(parent, [f]);
  }
  for (const list of kids.values()) {
    list.sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));
  }

  const q = filter.trim().toLowerCase();
  let keep: Set<string> | null = null;
  if (q) {
    keep = new Set();
    for (const f of tree) {
      if (!f.path.toLowerCase().includes(q) && !f.slug.toLowerCase().includes(q)) continue;
      keep.add(f.path);
      for (const a of ancestorPaths(f.path)) keep.add(a);
    }
  }

  const rows: FolderTreeRow[] = [];
  const walk = (parent: string, depth: number, guides: boolean[]) => {
    const list = (kids.get(parent) ?? []).filter((f) => !keep || keep.has(f.path));
    list.forEach((folder, i) => {
      const isLast = i === list.length - 1;
      const hasChildren = (kids.get(folder.path) ?? []).some((c) => !keep || keep.has(c.path));
      rows.push({ folder, depth, isLast, guides, hasChildren });
      if (hasChildren && (keep !== null || isOpen(folder))) {
        walk(folder.path, depth + 1, [...guides, isLast]);
      }
    });
  };
  walk(FILES_ROOT, 0, []);
  return rows;
}
