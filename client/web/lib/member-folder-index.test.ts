import { describe, expect, it } from 'vitest';
import { memberFolderIndex, spaceViewHere } from './member-folder-index';

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

  it('no block and no folder while the member tree does not serve pages, or is not known yet', () => {
    for (const treeServesPages of [false, undefined]) {
      for (const folderId of ['f1', null]) {
        const out = memberFolderIndex({ space: 'member', treeServesPages, folderId });
        expect(out.folderIndex).toBe(false);
        // A brain that sends the folder but serves no member pages tree: a
        // block already in the draft would only 404. Label alone, not the root.
        expect(out.folderId).toBeUndefined();
      }
    }
  });

  it("an admin's private item keeps `here` unknown, with no block", () => {
    for (const space of ['admin'] as const) {
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

describe('spaceViewHere: an own personal page shown read-only', () => {
  const member = { space: 'member' as const, treeServesPages: true as const };

  it('lists its folder, or the top level', () => {
    expect(spaceViewHere({ ...member, folderId: 'f1' })).toEqual({ folderId: 'f1' });
    expect(spaceViewHere({ ...member, folderId: null })).toEqual({ folderId: null });
  });

  it('unknown stays unknown, never the root', () => {
    const out = spaceViewHere({ ...member, folderId: undefined });
    expect(out.folderId).toBeUndefined();
    expect(out.folderId).not.toBeNull();
  });

  it("an admin's private item lists nothing", () => {
    for (const folderId of ['f1', null]) {
      expect(spaceViewHere({ space: 'admin', treeServesPages: true, folderId })).toEqual({
        folderId: undefined,
      });
    }
  });

  it('nothing while the member tree does not serve pages, or is not known yet', () => {
    for (const treeServesPages of [false, undefined]) {
      expect(spaceViewHere({ space: 'member', treeServesPages, folderId: 'f1' })).toEqual({
        folderId: undefined,
      });
    }
  });
});
