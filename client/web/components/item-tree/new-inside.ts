import type { TreeFolder } from '@mantle/web-ui/types/tree';

/** What a section gives the tree so a folder's menu can start a new item in
 *  it: the item's name ("page") and the section's own create flow. */
export type NewItemInFolder = {
  label: string;
  onCreate: (folder: TreeFolder) => void;
};

/**
 * The "New <item> inside" entry of a folder's menu, or null when the menu has
 * none. Only a tree that manages (the owner's, or a member's) offers it: a
 * client reads. The rights match "New folder inside": the owner files
 * anywhere, and a member files a draft in any folder its tree shows.
 */
export function newInsideEntry(
  folder: TreeFolder,
  opts: { manage: boolean; newItemInFolder?: NewItemInFolder | undefined },
): { label: string; run: () => void } | null {
  const n = opts.newItemInFolder;
  if (!opts.manage || !n) return null;
  return { label: `New ${n.label} inside`, run: () => n.onCreate(folder) };
}
