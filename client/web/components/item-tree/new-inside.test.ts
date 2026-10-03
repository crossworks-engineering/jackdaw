import { describe, expect, it, vi } from 'vitest';
import type { TreeFolder } from '@mantle/web-ui/types/tree';
import { newInsideEntry } from './new-inside';

const folder: TreeFolder = {
  id: 'f1',
  path: 'pages.plans',
  name: 'Plans',
  icon: null,
  color: null,
  depth: 1,
  parentId: null,
  share: null,
  system: false,
  folderCount: 0,
  itemCount: 2,
};

describe('newInsideEntry', () => {
  it('shows "New <item> inside" and creates in that folder', () => {
    const onCreate = vi.fn();
    const entry = newInsideEntry(folder, {
      manage: true,
      newItemInFolder: { label: 'page', onCreate },
    });
    expect(entry?.label).toBe('New page inside');
    expect(onCreate).not.toHaveBeenCalled();
    entry!.run();
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(folder);
  });

  it('is absent when the section gives no create flow', () => {
    expect(newInsideEntry(folder, { manage: true })).toBeNull();
  });

  it('is absent from a tree that only reads (a client)', () => {
    const onCreate = vi.fn();
    expect(
      newInsideEntry(folder, { manage: false, newItemInFolder: { label: 'note', onCreate } }),
    ).toBeNull();
  });
});
