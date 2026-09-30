import type { ReactNode } from 'react';
import type { TreeItem, TreeKind } from '@mantle/web-ui/types/tree';

/**
 * What one kind adds to the shared tree: the item row's lead (its tile or a
 * leading control) and its status slot (at most two compact tokens). Rows,
 * folders, menus, search and the flat views are the tree's own; a new kind is
 * an adapter plus the brain's spec entry.
 */
export type TreeKindAdapter = {
  kind: TreeKind;
  /** The kind's items, for copy: "No files here yet", "The files and folders
   *  inside it move up". */
  noun: { one: string; many: string };
  lead: (item: TreeItem) => ReactNode;
  status: (item: TreeItem) => ReactNode;
};
