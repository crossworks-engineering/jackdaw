import { describe, expect, it } from 'vitest';
import { MEMBER_HIDDEN, PRIVATE_HIDDEN, folderIndexGate, getSlashItems } from './slash-menu';
import { memberFolderIndex } from '../../lib/member-folder-index';

describe('getSlashItems for a member', () => {
  it('hides the items that create or upload into the brain, by id', () => {
    const member = getSlashItems('', { member: true }).map((i) => i.id);
    for (const id of MEMBER_HIDDEN) expect(member).not.toContain(id);
    expect(member).toContain('text');
    expect(member).toContain('table');
    // Search does not bring them back either.
    for (const q of ['image', 'upload', 'draw', 'page', 'file']) {
      const ids = getSlashItems(q, { member: true }).map((i) => i.id);
      for (const id of MEMBER_HIDDEN) expect(ids, q).not.toContain(id);
    }
  });

  it('still hides them when their display titles change', () => {
    const all = getSlashItems('');
    const hidden = all.filter((i) => MEMBER_HIDDEN.has(i.id));
    expect(hidden.map((i) => i.id).sort()).toEqual(['drawing', 'file', 'image', 'new-page']);
    const titles = hidden.map((i) => i.title);
    try {
      for (const i of hidden) i.title = `${i.title} (renamed)`;
      const member = getSlashItems('', { member: true }).map((i) => i.id);
      for (const id of MEMBER_HIDDEN) expect(member).not.toContain(id);
    } finally {
      hidden.forEach((i, n) => (i.title = titles[n]!));
    }
  });

  it('leaves the admin list whole', () => {
    const ids = getSlashItems('').map((i) => i.id);
    for (const id of MEMBER_HIDDEN) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getSlashItems for an admin's private item (Phase 7)", () => {
  it('hides only the new page and the folder index: embeds of brain items stay', () => {
    const ids = getSlashItems('', { privateItem: true }).map((i) => i.id);
    for (const id of PRIVATE_HIDDEN) expect(ids).not.toContain(id);
    expect([...PRIVATE_HIDDEN]).toEqual(['new-page', 'folder-index']);
    for (const id of ['image', 'drawing', 'file', 'text']) expect(ids).toContain(id);
    expect(getSlashItems('page', { privateItem: true }).map((i) => i.id)).not.toContain('new-page');
  });

  it('a member stays on the member list either way', () => {
    const both = getSlashItems('', { member: true, privateItem: true }).map((i) => i.id);
    for (const id of MEMBER_HIDDEN) expect(both).not.toContain(id);
  });
});

describe('getSlashItems and the Folder index for a member', () => {
  const ids = (q: string, opts: Parameters<typeof getSlashItems>[1]) =>
    getSlashItems(q, opts).map((i) => i.id);

  it('is not one of the hidden ids: it creates nothing in the brain', () => {
    expect(MEMBER_HIDDEN.has('folder-index')).toBe(false);
  });

  it('a member sees it only when the editor says yes', () => {
    expect(ids('', { member: true, folderIndex: true })).toContain('folder-index');
    expect(ids('folder', { member: true, folderIndex: true })).toContain('folder-index');
    // Not said, or said no: no item, and search does not bring it back.
    expect(ids('', { member: true })).not.toContain('folder-index');
    expect(ids('', { member: true, folderIndex: false })).not.toContain('folder-index');
    for (const q of ['folder', 'index', 'pages', 'toc']) {
      expect(ids(q, { member: true }), q).not.toContain('folder-index');
      expect(ids(q, { member: true, folderIndex: false }), q).not.toContain('folder-index');
    }
  });

  it('turning it on for a member brings back nothing else', () => {
    const on = ids('', { member: true, folderIndex: true });
    for (const id of MEMBER_HIDDEN) expect(on).not.toContain(id);
    expect(on.filter((id) => id !== 'folder-index')).toEqual(ids('', { member: true }));
  });

  it("an admin's private item never gets it, whatever the editor says", () => {
    expect(ids('', { privateItem: true, folderIndex: true })).not.toContain('folder-index');
  });
});

describe('getSlashItems and the Folder index', () => {
  it('offers the Folder index only where the brain serves the pages tree', () => {
    expect(getSlashItems('').map((i) => i.id)).toContain('folder-index');
    expect(getSlashItems('', { folderIndex: true }).map((i) => i.id)).toContain('folder-index');
    expect(getSlashItems('', { folderIndex: false }).map((i) => i.id)).not.toContain(
      'folder-index',
    );
    expect(getSlashItems('folder', { folderIndex: false }).map((i) => i.id)).not.toContain(
      'folder-index',
    );
  });
});

describe('folderIndexGate: what an editor hands the slash command by default', () => {
  const ids = (opts: Parameters<typeof getSlashItems>[1]) =>
    getSlashItems('', opts).map((i) => i.id);

  it('is on only when the caller said so: left out is off', () => {
    expect(folderIndexGate(true)).toBe(true);
    expect(folderIndexGate(false)).toBe(false);
    expect(folderIndexGate(undefined)).toBe(false);
  });

  it('an editor given no gate offers no Folder index, member or owner', () => {
    // A client's own page editor is a member editor that passes no gate.
    expect(ids({ member: true, folderIndex: folderIndexGate(undefined) })).not.toContain(
      'folder-index',
    );
    // The owner editor on a brain before the pages tree.
    expect(ids({ folderIndex: folderIndexGate(undefined) })).not.toContain('folder-index');
  });

  it('a client, and a member on an older brain, get no item through the whole chain', () => {
    const through = (args: Parameters<typeof memberFolderIndex>[0]) =>
      ids({ member: true, folderIndex: folderIndexGate(memberFolderIndex(args).folderIndex) });
    expect(through({ space: 'client', treeServesPages: true, folderId: 'f1' })).not.toContain(
      'folder-index',
    );
    // No pages tree for members.
    expect(through({ space: 'member', treeServesPages: false, folderId: 'f1' })).not.toContain(
      'folder-index',
    );
    expect(through({ space: 'member', treeServesPages: undefined, folderId: 'f1' })).not.toContain(
      'folder-index',
    );
    // No `folderId` on the draft body.
    expect(through({ space: 'member', treeServesPages: true, folderId: undefined })).not.toContain(
      'folder-index',
    );
    // And the one case that does.
    expect(through({ space: 'member', treeServesPages: true, folderId: null })).toContain(
      'folder-index',
    );
  });
});
