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
  flattenTree,
  isOnTheWayTo,
  mergeFolderPages,
  rangeOfItems,
  type FolderLoad,
  type TreeRow,
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

describe('flattening the tree for the virtual list', () => {
  const withCounts = (f: TreeFolder, folderCount: number, itemCount: number): TreeFolder => ({
    ...f,
    folderCount,
    itemCount,
  });
  const a = withCounts(folder('a', 'files.a'), 1, 1);
  // Counts that say one item, a load that finds none (moved away meanwhile).
  const b = withCounts(folder('b', 'files.a.b'), 0, 1);
  const c = withCounts(folder('c', 'files.c'), 0, 2);
  const ok = (folders: TreeFolder[], items: TreeItem[], hasMore = false): FolderLoad => ({
    status: 'ok',
    children: { folders, items, hasMore },
    loadingMore: false,
  });
  const loads: Record<string, FolderLoad> = {
    root: ok([a, c], [item('r1')], true),
    a: ok([b], [item('a1')]),
    b: ok([], []),
    c: { status: 'pending' },
  };
  const shape = (rows: TreeRow[]) =>
    rows.map((r) => ('depth' in r ? `${r.key}@${r.depth}` : r.key));

  it('puts each open folder’s rows below it, depth first, and names what must load', () => {
    const open = new Set(['a', 'b', 'c']);
    const { rows, needed } = flattenTree(
      (id) => loads[id ?? 'root']!,
      (id) => open.has(id),
      { emptyText: 'none' },
    );
    expect(shape(rows)).toEqual([
      'f:a@0',
      'f:b@1',
      's:b@2',
      'i:a1@1',
      'f:c@0',
      's:c@1',
      'i:r1@0',
      'm:root:1@0',
    ]);
    expect(needed).toEqual([null, 'a', 'b', 'c']);
    const empty = rows.find((r) => r.key === 's:b');
    expect(empty?.type === 'status' && empty.label).toBe('Empty');
  });

  it('keeps closed folders shut and gives the picker folders only', () => {
    const { rows, needed } = flattenTree(
      (id) => loads[id ?? 'root']!,
      (id) => id === 'a',
      { foldersOnly: true, emptyText: 'none' },
    );
    expect(shape(rows)).toEqual(['f:a@0', 'f:b@1', 'f:c@0']);
    expect(needed).toEqual([null, 'a']);
  });

  it('draws an item or folder met twice (just moved, one page stale) once, where first met', () => {
    const moved: Record<string, FolderLoad> = { ...loads, a: ok([b], [item('a1'), item('r1')]) };
    const { rows } = flattenTree(
      (id) => moved[id ?? 'root']!,
      (id) => id === 'a',
      { emptyText: 'none' },
    );
    expect(shape(rows).filter((k) => k.startsWith('i:r1'))).toEqual(['i:r1@1']);
    const twice: Record<string, FolderLoad> = { ...loads, root: ok([a, c, a], []) };
    const { rows: folders } = flattenTree(
      (id) => twice[id ?? 'root']!,
      () => false,
      { emptyText: 'none' },
    );
    expect(shape(folders)).toEqual(['f:a@0', 'f:c@0']);
  });

  it('shows the root’s own loading, failure and emptiness', () => {
    const one = (load: FolderLoad) =>
      flattenTree(
        () => load,
        () => false,
        { emptyText: 'No files yet.' },
      ).rows[0];
    expect(one({ status: 'pending' })).toMatchObject({ type: 'status', busy: true });
    expect(one({ status: 'error' })).toMatchObject({ type: 'status', retry: null });
    expect(one(ok([], []))).toMatchObject({ type: 'note', text: 'No files yet.' });
  });
});

describe('picking a range', () => {
  const rowOf = (id: string, state: TreeItem['state'] = null): TreeRow => ({
    type: 'item',
    key: `i:${id}`,
    item: { ...item(id), state },
    parent: null,
    folderPath: null,
    depth: 0,
    isLast: false,
    guides: [],
  });
  const rows: TreeRow[] = [
    rowOf('1'),
    { type: 'divider', key: 'd' },
    rowOf('2', 'private'),
    rowOf('3'),
    rowOf('1'),
    rowOf('4'),
  ];
  const movable = (i: TreeItem) => i.state !== 'private';

  it('takes every movable item between the two, either way round, once each', () => {
    expect(rangeOfItems(rows, '1', '4', movable)).toEqual(['1', '3', '4']);
    expect(rangeOfItems(rows, '4', '3', movable)).toEqual(['3', '4']);
    expect(rangeOfItems(rows, 'gone', '3', movable)).toEqual(['3']);
    expect(rangeOfItems(rows, '1', '2', movable)).toEqual([]);
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
    expect(searchUrl('files', 'q', null, { level: 'team', tag: 'a b' })).toBe(
      '/api/tree/files/search?q=q&level=team&tag=a+b',
    );
  });
});

describe('which kinds a brain serves as the tree', () => {
  it('reads the shell, keeping only kinds this client knows', () => {
    expect(treeKindsOf({ treeKinds: ['files', 'boards', 7] })).toEqual(['files']);
    expect(treeKindsOf({ treeKinds: ['recall'] })).toEqual(['recall']);
    expect(treeKindsOf({})).toEqual([]);
    expect(treeKindsOf(null)).toEqual([]);
  });
});
