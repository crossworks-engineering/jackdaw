'use client';

import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';
import type { TreeFolder, TreeItem, TreeKind, TreeSort } from '@mantle/web-ui/types/tree';
import type { TreeKindAdapter } from './kinds/types';
import type { DropPos } from './tree-model';

/** Where an item was opened from: the folder it sits in when the tree knows
 *  it (a folder row's child), else the last crumb's id (a flat list). Null
 *  folder = the kind's root. */
export type ItemWhere = { folderId: string | null; folderPath: string | null };

/** What a drag carries: the dragged row, and for a drop target what a drop
 *  beside it needs (its parent and its siblings, for the reorder). */
export type DragData =
  | { type: 'folder'; folder: TreeFolder; parent: TreeFolder | null; siblings: TreeFolder[] }
  | { type: 'item'; item: TreeItem; parent: TreeFolder | null }
  | { type: 'root' };

export type DropHint = { over: string; pos: DropPos } | null;

/**
 * Everything a row needs from the tree it sits in. One tree renders its rows
 * recursively (each open folder asks for its own pages), so this rides in
 * context rather than through every level. The picker is the same rows with
 * its own value: folders only, a click chooses.
 */
export type TreeCtx = {
  kind: TreeKind;
  adapter: TreeKindAdapter;
  sort: TreeSort;
  /** `manage`: menus and drag; `read`: rows only; `picker`: folders only, a
   *  click chooses a destination. */
  mode: 'manage' | 'read' | 'picker';
  isOpen: (folderId: string) => boolean;
  setOpen: (folderId: string, open: boolean) => void;
  /** Unfold the folders on the way down to this path. */
  reveal: string | null;
  selectedItemId: string | null;
  selectedFolderPath: string | null;
  folderDisabled?: (folder: TreeFolder) => boolean;
  onFolderClick: (folder: TreeFolder) => void;
  /** A click on an item row; cmd, ctrl and shift pick items for a move. */
  onItemClick: (item: TreeItem, where: ItemWhere, e?: MouseEvent) => void;
  /** Items picked for a move (cmd/ctrl or shift click). */
  picked: ReadonlySet<string>;
  folderMenu?: (folder: TreeFolder, parent: TreeFolder | null, siblings: TreeFolder[]) => ReactNode;
  itemMenu?: (item: TreeItem, where: ItemWhere) => ReactNode;
  menuFor: string | null;
  setMenuFor: (key: string | null) => void;
  registerRow: (key: string, el: HTMLElement | null) => void;
  hint: DropHint;
  dragging: string | null;
};

export const TreeContext = createContext<TreeCtx | null>(null);

export function useTreeCtx(): TreeCtx {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('item-tree rows render inside an ItemTree');
  return ctx;
}
