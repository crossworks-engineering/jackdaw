import { describe, expect, it } from 'vitest';
import { memberFolderIndex } from './member-folder-index';

describe("memberFolderIndex: a member's own draft and the Folder index", () => {
  it('offers the block when the member tree serves pages and the folder is known', () => {
    expect(memberFolderIndex({ space: 'member', treeServesPages: true, folderId: 'f1' })).toEqual({
      folderId: 'f1',
      folderIndex: true,
    });
  });

  it('the top level is a known place: null stays null and the block is offered', () => {
    expect(memberFolderIndex({ space: 'member', treeServesPages: true, folderId: null })).toEqual({
      folderId: null,
      folderIndex: true,
    });
  });

  it('an unknown folder stays undefined (never the root) and offers no block', () => {
    const out = memberFolderIndex({
      space: 'member',
      treeServesPages: true,
      folderId: undefined,
    });
    expect(out.folderIndex).toBe(false);
    expect(out.folderId).toBeUndefined();
    expect(out.folderId).not.toBeNull();
  });

  it('offers no block while the member tree does not serve pages, or is not known yet', () => {
    for (const treeServesPages of [false, undefined]) {
      const out = memberFolderIndex({ space: 'member', treeServesPages, folderId: 'f1' });
      expect(out.folderIndex).toBe(false);
      // A block already in the draft still lists its folder.
      expect(out.folderId).toBe('f1');
    }
  });

  it("an admin's private item and a client's page keep `here` unknown, with no block", () => {
    for (const space of ['admin', 'client'] as const) {
      expect(memberFolderIndex({ space, treeServesPages: true, folderId: 'f1' })).toEqual({
        folderId: undefined,
        folderIndex: false,
      });
      expect(memberFolderIndex({ space, treeServesPages: true, folderId: null })).toEqual({
        folderId: undefined,
        folderIndex: false,
      });
    }
  });
});
