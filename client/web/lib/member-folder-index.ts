/**
 * What a personal page's editor tells PageEditor about the Folder index
 * block (folder phase 7): the folder `folder:here` means, and whether the
 * slash menu offers the block.
 *
 * Only a member's own draft has a place in a tree the editor can list: it
 * sits in a folder of the member's tree (its own folder or a brain folder
 * it sees), or at the member's top level, and the block reads
 * /api/member/tree/pages. An admin's private item and a client's own page
 * sit in no folder the editor lists, so their `here` stays unknown and the
 * block is not offered.
 *
 * `folderId` keeps three states, and they must not collapse: a string is a
 * folder, null is the top level, undefined is "not known" (a brain that
 * sends no `folderId` on the draft body, or whose member tree does not serve
 * pages: the folder could not be listed, so it is not passed on). Unknown
 * shows the block's label alone, never the root, and offers no block.
 *
 * Pure: pinned by member-folder-index.test.ts.
 */
export type PersonalSpace = 'member' | 'admin' | 'client';

export function memberFolderIndex(args: {
  space: PersonalSpace;
  /** The member shell names `pages` in `treeKinds` (undefined: not known). */
  treeServesPages: boolean | undefined;
  /** `folderId` as the draft body carries it. */
  folderId: string | null | undefined;
}): { folderId: string | null | undefined; folderIndex: boolean } {
  if (args.space !== 'member' || args.treeServesPages !== true) {
    return { folderId: undefined, folderIndex: false };
  }
  return { folderId: args.folderId, folderIndex: args.folderId !== undefined };
}

/**
 * The same for a personal page shown READ-ONLY (SpaceItemView): an own item
 * that is frozen, a teammate's shared draft, a client's submitted item.
 *
 * Only a member's view has a tree to list. A teammate's draft may sit in its
 * author's own private folder, which this reader's tree does not hold: that
 * is `quietHere` (the block shows its label alone, not "not shared with
 * you"). The reader's own frozen draft keeps the plain 404 line: it should
 * hold its own folder, and if it does not (an admin unshared the brain
 * folder above it) the line is true. `noFolder`: the item is in no folder a
 * tree lists (a client wrote it).
 */
export function spaceViewHere(args: {
  space: PersonalSpace;
  source: 'mine' | 'team';
  treeServesPages: boolean | undefined;
  folderId: string | null | undefined;
  noFolder?: boolean;
}): { folderId: string | null | undefined; quietHere: boolean } {
  if (args.noFolder || args.space !== 'member' || args.treeServesPages !== true) {
    return { folderId: undefined, quietHere: false };
  }
  return { folderId: args.folderId, quietHere: args.source === 'team' };
}
