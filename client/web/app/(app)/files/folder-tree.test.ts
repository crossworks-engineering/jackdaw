import { describe, expect, it } from 'vitest';
import { ancestorPaths, flattenFolderTree } from './folder-tree';
import type { FolderRow } from './files-shared';

const folder = (path: string): FolderRow => ({
  id: path,
  path,
  title: path,
  slug: path.split('.').pop()!,
  description: '',
  indexing: null,
  childFolderCount: 0,
  fileCount: 0,
  createdAt: '',
  updatedAt: '',
});

const TREE = [
  'files',
  'files.work',
  'files.work.reports',
  'files.work.audits',
  'files.home',
  'files.work.reports.q3',
].map(folder);

const paths = (rows: ReturnType<typeof flattenFolderTree>) =>
  rows.map((r) => `${'  '.repeat(r.depth)}${r.folder.slug}`);

describe('flattenFolderTree', () => {
  it('lists the root’s children sorted, descending only into open folders', () => {
    expect(paths(flattenFolderTree(TREE, () => false))).toEqual(['home', 'work']);
    expect(paths(flattenFolderTree(TREE, (f) => f.path === 'files.work'))).toEqual([
      'home',
      'work',
      '  audits',
      '  reports',
    ]);
  });

  it('carries the guide flags: last child, and which ancestors were last', () => {
    const rows = flattenFolderTree(TREE, () => true);
    const q3 = rows.find((r) => r.folder.slug === 'q3')!;
    expect(q3.depth).toBe(2);
    expect(q3.isLast).toBe(true);
    // work was the last root child; reports the last child of work.
    expect(q3.guides).toEqual([true, true]);
    expect(rows.find((r) => r.folder.slug === 'home')!.isLast).toBe(false);
    expect(rows.find((r) => r.folder.slug === 'work')!.hasChildren).toBe(true);
    expect(rows.find((r) => r.folder.slug === 'audits')!.hasChildren).toBe(false);
  });

  it('keeps a match’s ancestors and shows them expanded when filtering', () => {
    expect(paths(flattenFolderTree(TREE, () => false, 'q3'))).toEqual([
      'work',
      '  reports',
      '    q3',
    ]);
  });
});

describe('ancestorPaths', () => {
  it('lists every ancestor, root first, without the path itself', () => {
    expect(ancestorPaths('files.work.reports')).toEqual(['files', 'files.work']);
    expect(ancestorPaths('files')).toEqual([]);
  });
});
