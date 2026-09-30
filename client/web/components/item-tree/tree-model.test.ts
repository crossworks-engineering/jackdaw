import { describe, expect, it } from 'vitest';
import type { TreeFolder, TreeFolderPage, TreeItem } from '@mantle/web-ui/types/tree';
import {
  afterFor,
  afterForStep,
  canNestFolder,
  childEntries,
  childGuides,
  crumbLine,
  dropPosition,
  isOnTheWayTo,
  mergeFolderPages,
} from './tree-model';
import { folderUrl, searchUrl } from './tree-api';
import { treeKindsOf } from './use-tree-kinds';

const folder = (id: string, path: string): TreeFolder => ({
  id,
  path,
  name: id,
  icon: null,
  color: null,
  depth: path.split('.').length - 1,
  parentId: null,
  share: null,
  system: false,
  folderCount: 0,
  itemCount: 0,
});

const item = (id: string): TreeItem => ({
  id,
  title: id,
  icon: null,
  color: null,
  subtype: null,
  level: 'admin',
  state: null,
  updatedAt: '2026-09-30T00:00:00.000Z',
});

const page = (
  folders: TreeFolder[],
  items: TreeItem[],
  nextCursor: string | null,
): TreeFolderPage => ({
  kind: 'files',
  folder: null,
  crumbs: [],
  folders,
  items,
  sort: 'name',
  nextCursor,
});

describe('folder pages', () => {
  it('merges item pages in order, once each, with the folders of the first', () => {
    const a = folder('a', 'files.a');
    const merged = mergeFolderPages([
      page([a], [item('1'), item('2')], 'c1'),
      page([], [item('2'), item('3')], null),
    ]);
    expect(merged.folders).toEqual([a]);
    expect(merged.items.map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(merged.hasMore).toBe(false);
    expect(mergeFolderPages(undefined)).toEqual({ folders: [], items: [], hasMore: false });
  });

  it('lists folders first and closes the last row only when nothing is left to load', () => {
    const done = childEntries({
      folders: [folder('a', 'files.a')],
      items: [item('1')],
      hasMore: false,
    });
    expect(done.map((e) => [e.type, e.isLast])).toEqual([
      ['folder', false],
      ['item', true],
    ]);
    const more = childEntries({ folders: [], items: [item('1')], hasMore: true });
    expect(more.map((e) => e.isLast)).toEqual([false]);
    const picker = childEntries(
      { folders: [folder('a', 'files.a')], items: [item('1')], hasMore: true },
      true,
    );
    expect(picker.map((e) => [e.type, e.isLast])).toEqual([['folder', true]]);
  });

  it('carries the guides down one level', () => {
    expect(childGuides([], true)).toEqual([true]);
    expect(childGuides([false], false)).toEqual([false, false]);
  });

  it('writes crumbs as one line', () => {
    expect(crumbLine([])).toBe('');
    expect(
      crumbLine([
        { id: '1', name: 'Clients' },
        { id: '2', name: 'Acme' },
      ]),
    ).toBe('Clients / Acme');
  });

  it('opens the folders on the way to a target, and no sibling that shares a prefix', () => {
    expect(isOnTheWayTo('files.a.b', 'files.a')).toBe(true);
    expect(isOnTheWayTo('files.a.b', 'files.a.b')).toBe(true);
    expect(isOnTheWayTo('files.ab', 'files.a')).toBe(false);
    expect(isOnTheWayTo(null, 'files.a')).toBe(false);
  });
});

describe('dragging', () => {
  it('drops an item into a folder anywhere over it, a folder beside it at the edges', () => {
    expect(dropPosition(0.1, 'item')).toBe('inside');
    expect(dropPosition(0.1, 'folder')).toBe('before');
    expect(dropPosition(0.5, 'folder')).toBe('inside');
    expect(dropPosition(0.9, 'folder')).toBe('after');
  });

  it('never nests a folder in itself, below itself, or past the third level', () => {
    const a = folder('a', 'files.a');
    expect(canNestFolder(a, a)).toBe(false);
    expect(canNestFolder(a, folder('b', 'files.a.b'))).toBe(false);
    expect(canNestFolder(a, folder('x', 'files.ab'))).toBe(true);
    expect(canNestFolder(a, folder('d', 'files.x.y.z'))).toBe(false);
    expect(canNestFolder(a, null)).toBe(true);
  });

  it('places a folder after the target, or after what precedes it', () => {
    const sibs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(afterFor(sibs, 'c', 'a', 'before')).toBeNull();
    expect(afterFor(sibs, 'c', 'b', 'before')).toBe('a');
    expect(afterFor(sibs, 'a', 'b', 'before')).toBeNull();
    expect(afterFor(sibs, 'a', 'c', 'after')).toBe('c');
  });

  it('steps a folder up or down among its siblings', () => {
    const sibs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(afterForStep(sibs, 'b', -1)).toBeNull();
    expect(afterForStep(sibs, 'c', -1)).toBe('a');
    expect(afterForStep(sibs, 'a', 1)).toBe('b');
    expect(afterForStep(sibs, 'b', 1)).toBe('c');
    expect(afterForStep(sibs, 'a', -1)).toBeUndefined();
    expect(afterForStep(sibs, 'c', 1)).toBeUndefined();
  });
});

describe('urls', () => {
  it('asks for a folder page and a search, the empty search being A to Z', () => {
    expect(folderUrl('files', null, 'name', null)).toBe('/api/tree/files?sort=name');
    expect(folderUrl('files', 'f1', 'updated', 'c/1')).toBe(
      '/api/tree/files?folder=f1&sort=updated&cursor=c%2F1',
    );
    expect(searchUrl('files', ' acme ', null)).toBe('/api/tree/files/search?q=acme');
    expect(searchUrl('files', '', 'x')).toBe('/api/tree/files/search?q=&cursor=x');
  });
});

describe('which kinds a brain serves as the tree', () => {
  it('reads the shell, keeping only kinds this client knows', () => {
    expect(treeKindsOf({ treeKinds: ['files', 'recall', 7] })).toEqual(['files']);
    expect(treeKindsOf({})).toEqual([]);
    expect(treeKindsOf(null)).toEqual([]);
  });
});
