/**
 * The item tree's pure half: how loaded folder pages become rows, where a
 * drag would land, and what a reorder sends. No React, so the rules are
 * pinned by tests.
 */
import type { TreeCrumb, TreeFolder, TreeFolderPage, TreeItem } from '@mantle/web-ui/types/tree';
import { TREE_MAX_DEPTH } from '@mantle/web-ui/types/tree';

/** One folder's children as loaded so far: its subfolders (they all come
 *  with the first page) and every item page fetched, in order. */
export type FolderChildren = {
  folders: TreeFolder[];
  items: TreeItem[];
  /** More items wait behind the next cursor. */
  hasMore: boolean;
};

export function mergeFolderPages(pages: readonly TreeFolderPage[] | undefined): FolderChildren {
  if (!pages?.length) return { folders: [], items: [], hasMore: false };
  const seen = new Set<string>();
  const items: TreeItem[] = [];
  // A page refetched while another is added can repeat an item at the seam;
  // show it once.
  for (const p of pages) {
    for (const it of p.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
    }
  }
  return { folders: pages[0]!.folders, items, hasMore: pages.at(-1)!.nextCursor !== null };
}

export type ChildEntry =
  | { type: 'folder'; folder: TreeFolder; isLast: boolean }
  | { type: 'item'; item: TreeItem; isLast: boolean };

/** The rows under a folder, folders first. The last row draws the closing
 *  elbow only when nothing more is still to load below it. `foldersOnly` is
 *  the picker, which lists where things can go. */
export function childEntries(children: FolderChildren, foldersOnly = false): ChildEntry[] {
  const rows: ChildEntry[] = [
    ...children.folders.map((folder) => ({ type: 'folder' as const, folder, isLast: false })),
    ...(foldersOnly
      ? []
      : children.items.map((item) => ({ type: 'item' as const, item, isLast: false }))),
  ];
  const more = !foldersOnly && children.hasMore;
  if (rows.length && !more) rows[rows.length - 1]!.isLast = true;
  return rows;
}

/** The guide flags for a folder's children: its own, plus whether it was the
 *  last child of its parent (TreeGuides). */
export function childGuides(guides: readonly boolean[], isLast: boolean): boolean[] {
  return [...guides, isLast];
}

/** Where a folder, item or search hit lives, as one line. */
export function crumbLine(crumbs: readonly TreeCrumb[]): string {
  return crumbs.map((c) => c.name).join(' / ');
}

/** Whether `path` is `folder` itself or sits somewhere below it. */
export function isAtOrBelow(path: string, folderPath: string): boolean {
  return path === folderPath || path.startsWith(`${folderPath}.`);
}

/** Whether a folder at `path` must be open to show `target` (it is one of
 *  the folders on the way down to it, or the folder itself). */
export function isOnTheWayTo(target: string | null | undefined, path: string): boolean {
  return !!target && isAtOrBelow(target, path);
}

export type DropPos = 'before' | 'after' | 'inside';

/** What a pointer over a folder row means: the top and bottom thirds place a
 *  dragged folder beside it, the middle drops into it. An item has no manual
 *  order, so anywhere over a folder is into it. */
export function dropPosition(rel: number, dragging: 'folder' | 'item'): DropPos {
  if (dragging === 'item') return 'inside';
  return rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'inside';
}

/** A dragged folder may land in `target` when that is not itself, not one of
 *  its own subfolders, and not already at the deepest level. The brain still
 *  checks the moved subtree's full depth. */
export function canNestFolder(moving: TreeFolder, target: TreeFolder | null): boolean {
  if (!target) return true;
  if (isAtOrBelow(target.path, moving.path)) return false;
  return target.depth < TREE_MAX_DEPTH;
}

/**
 * The `after` a reorder sends to put `movingId` beside `targetId` among
 * `siblings` (the target's siblings, in order): after the target, or after
 * whatever precedes it (null = first).
 */
export function afterFor(
  siblings: readonly { id: string }[],
  movingId: string,
  targetId: string,
  pos: 'before' | 'after',
): string | null {
  const rest = siblings.filter((s) => s.id !== movingId);
  if (pos === 'after') return targetId;
  const at = rest.findIndex((s) => s.id === targetId);
  return at > 0 ? rest[at - 1]!.id : null;
}

/** The `after` for Move up / Move down, or undefined when it cannot move
 *  that way. */
export function afterForStep(
  siblings: readonly { id: string }[],
  id: string,
  dir: -1 | 1,
): string | null | undefined {
  const at = siblings.findIndex((s) => s.id === id);
  if (at < 0) return undefined;
  const to = at + dir;
  if (to < 0 || to >= siblings.length) return undefined;
  const rest = siblings.filter((s) => s.id !== id);
  return to === 0 ? null : rest[to - 1]!.id;
}
