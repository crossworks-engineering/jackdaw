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

/** What the cache holds for one folder's pages. */
export type FolderLoad =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'ok'; children: FolderChildren; loadingMore: boolean };

/**
 * One line of the tree as the list renders it. The tree is flattened, open
 * folders' children inline below their row, so a single virtual list draws
 * whatever is on screen however deep and long the folders get.
 */
export type TreeRow =
  | {
      type: 'folder';
      key: string;
      folder: TreeFolder;
      parent: TreeFolder | null;
      siblings: TreeFolder[];
      depth: number;
      isLast: boolean;
      guides: readonly boolean[];
      open: boolean;
      hasChildren: boolean;
    }
  | {
      type: 'item';
      key: string;
      item: TreeItem;
      /** The folder it sits in, when the row is inside the tree. */
      parent: TreeFolder | null;
      folderPath: string | null;
      depth: number;
      isLast: boolean;
      guides: readonly boolean[];
      /** A flat list's row (pins, Recent, search): where the item lives. */
      crumbs?: readonly TreeCrumb[];
    }
  | { type: 'hit'; key: string; folder: TreeFolder; crumbs: readonly TreeCrumb[] }
  | { type: 'root'; key: string }
  | { type: 'divider'; key: string }
  | { type: 'note'; key: string; text: string }
  | {
      type: 'status';
      key: string;
      depth: number;
      guides: readonly boolean[];
      label: string;
      busy?: boolean;
      /** The folder to ask again (a failed load); undefined = no retry. */
      retry?: string | null;
    }
  | {
      type: 'more';
      /** Carries the count loaded so far, so the row is new after each page
       *  and asks again if it is still in view. */
      key: string;
      /** The folder whose next page it loads; 'flat' = the flat list's. */
      source: string | null;
      depth: number;
      guides: readonly boolean[];
      loading: boolean;
    };

/**
 * The rows of a folder tree: the root's children, and below every open
 * folder its own, depth first. `load` reads what the cache holds for a folder
 * (null = the root). Also returns every folder whose pages the rows need (the
 * root and each open folder on screen), so the caller keeps those loading.
 * `foldersOnly` is the picker.
 */
export function flattenTree(
  load: (folderId: string | null) => FolderLoad,
  isOpen: (folderId: string) => boolean,
  opts: { foldersOnly?: boolean; emptyText: string },
): { rows: TreeRow[]; needed: Array<string | null> } {
  const rows: TreeRow[] = [];
  const needed: Array<string | null> = [];
  const foldersOnly = opts.foldersOnly ?? false;

  const walk = (folder: TreeFolder | null, depth: number, guides: readonly boolean[]) => {
    const folderId = folder?.id ?? null;
    const base = folderId ?? 'root';
    needed.push(folderId);
    const st = load(folderId);
    if (st.status === 'pending') {
      rows.push({ type: 'status', key: `s:${base}`, depth, guides, label: 'Loading…', busy: true });
      return;
    }
    if (st.status === 'error') {
      rows.push({
        type: 'status',
        key: `s:${base}`,
        depth,
        guides,
        label: 'Couldn’t load this folder.',
        retry: folderId,
      });
      return;
    }
    const { children } = st;
    const entries = childEntries(children, foldersOnly);
    if (!entries.length) {
      if (foldersOnly) return;
      rows.push(
        depth === 0
          ? { type: 'note', key: `s:${base}`, text: opts.emptyText }
          : { type: 'status', key: `s:${base}`, depth, guides, label: 'Empty' },
      );
      return;
    }
    for (const e of entries) {
      if (e.type === 'item') {
        rows.push({
          type: 'item',
          key: `i:${e.item.id}`,
          item: e.item,
          parent: folder,
          folderPath: folder?.path ?? null,
          depth,
          isLast: e.isLast,
          guides,
        });
        continue;
      }
      const f = e.folder;
      const hasChildren = foldersOnly ? f.folderCount > 0 : f.folderCount + f.itemCount > 0;
      const open = hasChildren && isOpen(f.id);
      rows.push({
        type: 'folder',
        key: `f:${f.id}`,
        folder: f,
        parent: folder,
        siblings: children.folders,
        depth,
        isLast: e.isLast,
        guides,
        open,
        hasChildren,
      });
      if (open) walk(f, depth + 1, childGuides(guides, e.isLast));
    }
    if (!foldersOnly && children.hasMore) {
      rows.push({
        type: 'more',
        key: `m:${base}:${children.items.length}`,
        source: folderId,
        depth,
        guides,
        loading: st.loadingMore,
      });
    }
  };

  walk(null, 0, []);
  return { rows, needed };
}

/** The items a shift-click selects: every movable item row from the anchor
 *  to the clicked one, in the order on screen, once each. */
export function rangeOfItems(
  rows: readonly TreeRow[],
  anchorId: string,
  toId: string,
  movable: (item: TreeItem) => boolean,
): string[] {
  const ids: string[] = [];
  for (const r of rows) {
    if (r.type === 'item' && movable(r.item) && !ids.includes(r.item.id)) ids.push(r.item.id);
  }
  const a = ids.indexOf(anchorId);
  const b = ids.indexOf(toId);
  if (a < 0 || b < 0) return b < 0 ? [] : [toId];
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
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
