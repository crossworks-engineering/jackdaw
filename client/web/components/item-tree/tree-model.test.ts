import { describe, expect, it } from 'vitest';
import type { TreeFolder, TreeFolderPage, TreeItem } from '@mantle/web-ui/types/tree';
import {
  acceptedSince,
  afterFor,
  afterForStep,
  canNestFolder,
  childEntries,
  childGuides,
  crumbLine,
  dropPosition,
  flattenTree,
  isOnTheWayTo,
  liveFolder,
  mergeFolderPages,
  ownDraftIds,
  pickedAfterMove,
  rangeOfItems,
  submittedDrafts,
  type CachedFolderPages,
  type FolderLoad,
  type TreeRow,
} from './tree-model';
import { folderKey, folderUrl, searchUrl, treeKey } from './tree-api';
import { treeKindOfItem, treeKindsOf } from './use-tree-kinds';

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

  it('says a folder the brain no longer shows is gone, with no Retry that would fail', () => {
    const rows = (load: FolderLoad, goneText?: string) =>
      flattenTree(
        () => load,
        () => false,
        { emptyText: 'x', goneText },
      ).rows;
    const gone = rows({ status: 'error', gone: true }, 'No longer shared.')[0]!;
    expect(gone).toMatchObject({ type: 'status', label: 'No longer shared.' });
    expect(gone).not.toHaveProperty('retry');
    expect(rows({ status: 'error', gone: true })[0]).toMatchObject({ label: 'No longer here.' });
    expect(rows({ status: 'error' })[0]).toMatchObject({
      label: 'Couldn’t load this folder.',
      retry: null,
    });
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

  it('asks a member’s and a client’s own tree, whose search takes no level or tag', () => {
    expect(folderUrl('notes', 'f1', 'name', null, 'member')).toBe(
      '/api/member/tree/notes?folder=f1&sort=name',
    );
    expect(folderUrl('notes', null, 'name', null, 'client')).toBe(
      '/api/client/tree/notes?sort=name',
    );
    expect(searchUrl('notes', 'q', 'x', { level: 'team', tag: 't' }, 'client')).toBe(
      '/api/client/tree/notes/search?q=q&cursor=x',
    );
  });

  it('keeps each reader’s cached folders apart, the owner’s keys unchanged', () => {
    expect(treeKey('notes')).toEqual(['tree', 'notes']);
    expect(treeKey('notes', 'client')).toEqual(['tree', 'client:notes']);
    expect(folderKey('notes', null, 'name', 'member')).toEqual([
      'tree',
      'member:notes',
      'folder',
      'root',
      'name',
    ]);
  });

  it('maps a Library kind to its tree kind', () => {
    expect(treeKindOfItem('note')).toBe('notes');
    expect(treeKindOfItem('file')).toBe('files');
    expect(treeKindOfItem('nope')).toBeNull();
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

describe('pickedAfterMove', () => {
  it('keeps the items that did not move picked, in pick order', () => {
    const items = [item('a'), item('b'), item('c')];
    const failed: Array<{ id: string; error: string }> = [
      { id: 'c', error: 'x' },
      { id: 'a', error: 'y' },
    ];
    const left = pickedAfterMove(items, failed);
    expect([...left.keys()]).toEqual(['a', 'c']);
  });
  it('keeps nothing when all moved', () => {
    expect(pickedAfterMove([item('a')], []).size).toBe(0);
  });
});

describe('liveFolder (the member tree’s New and Upload target)', () => {
  const page = (folders: TreeFolder[], of: TreeFolder | null = null): TreeFolderPage => ({
    kind: 'notes',
    folder: of,
    crumbs: [],
    folders,
    items: [],
    sort: 'updated',
    nextCursor: null,
  });
  const target = { ...folder('t', 'notes.a.t'), parentId: 'a' };

  it('follows a rename in its parent’s listing', () => {
    const renamed = { ...target, name: 'Renamed' };
    const cache: CachedFolderPages[] = [
      { folderId: 'a', ok: true, notFound: false, pages: [page([renamed])] },
    ];
    expect(liveFolder(cache, target)).toBe(renamed);
  });
  it('is gone when its parent loads without it', () => {
    const cache: CachedFolderPages[] = [
      { folderId: 'a', ok: true, notFound: false, pages: [page([])] },
    ];
    expect(liveFolder(cache, target)).toBeNull();
  });
  it('is gone when its own pages answer 404', () => {
    const cache: CachedFolderPages[] = [
      { folderId: 't', ok: false, notFound: true, pages: undefined },
    ];
    expect(liveFolder(cache, target)).toBeNull();
  });
  it('stays as it was when nothing cached says', () => {
    expect(liveFolder([], target)).toBe(target);
    const pending: CachedFolderPages[] = [
      { folderId: 'a', ok: false, notFound: false, pages: undefined },
    ];
    expect(liveFolder(pending, target)).toBe(target);
  });
  it('a top-level folder’s parent is the root page', () => {
    const top = folder('t', 'notes.t');
    const cache: CachedFolderPages[] = [
      { folderId: null, ok: true, notFound: false, pages: [page([])] },
    ];
    expect(liveFolder(cache, top)).toBeNull();
  });
});

describe('a submitted draft that an admin accepted', () => {
  const draft = (id: string, state: TreeItem['state'], source: TreeItem['source'] = 'own') => ({
    ...item(id),
    title: `T${id}`,
    state,
    source,
  });
  const page = (items: TreeItem[]): TreeFolderPage => ({
    kind: 'notes',
    folder: null,
    crumbs: [],
    folders: [],
    items,
    sort: 'updated',
    nextCursor: null,
  });

  it('lists only own drafts that are with an admin', () => {
    const p = page([draft('a', 'submitted'), draft('b', 'draft'), draft('c', 'submitted', 'team')]);
    expect([...submittedDrafts([p])]).toEqual([['a', 'Ta']]);
    expect([...ownDraftIds([p])].sort()).toEqual(['a', 'b']);
  });

  it('reports one that left and is no draft anywhere else', () => {
    const before = submittedDrafts([page([draft('a', 'submitted'), draft('b', 'submitted')])]);
    const after = submittedDrafts([page([draft('b', 'submitted')])]);
    expect(acceptedSince(before, after, new Set())).toEqual([{ id: 'a', title: 'Ta' }]);
  });

  it('says nothing of one still a draft (recalled, or listed elsewhere)', () => {
    const before = submittedDrafts([page([draft('a', 'submitted')])]);
    expect(acceptedSince(before, new Map(), new Set(['a']))).toEqual([]);
  });
});
