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
 * sends no `folderId` on the draft body). Unknown shows the block's label
 * alone, never the root, and offers no block.
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
  if (args.space !== 'member') return { folderId: undefined, folderIndex: false };
  return {
    folderId: args.folderId,
    folderIndex: args.treeServesPages === true && args.folderId !== undefined,
  };
}
