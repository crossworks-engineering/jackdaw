import { describe, expect, it } from 'vitest';
import {
  droppedTree,
  folderSlug,
  folderUploadNotice,
  pickedTreeFiles,
  planFolderUpload,
} from './folder-upload';
import type { TreeFile } from './folder-upload';

const tf = (relPath: string): TreeFile => ({
  file: new File(['x'], relPath.split('/').pop()!),
  relPath,
});
const names = (files: File[]) => files.map((f) => f.name);

describe('folderSlug', () => {
  it('matches the brain: lowercase, dashes, trimmed', () => {
    expect(folderSlug('My Photos (2024)')).toBe('my-photos-2024');
    expect(folderSlug('--a__b--')).toBe('a-b');
  });
  it('gives a name with no Latin letters a stable slug', () => {
    const a = folderSlug('Фото');
    expect(a).toMatch(/^f-[0-9a-f]{8}$/);
    expect(folderSlug('Фото')).toBe(a);
    expect(folderSlug('Документы')).not.toBe(a);
  });
  it('refuses a blank name', () => {
    expect(folderSlug('   ')).toBeNull();
  });
});

describe('planFolderUpload', () => {
  it('makes each folder once, parents first, and groups files by folder', () => {
    const plan = planFolderUpload(
      [tf('Docs/a.txt'), tf('Docs/Sub Dir/b.txt'), tf('Docs/Sub Dir/c.txt'), tf('loose.txt')],
      'files',
    );
    expect(plan.folders).toEqual([
      { parentPath: 'files', slug: 'docs', path: 'files.docs' },
      { parentPath: 'files.docs', slug: 'sub-dir', path: 'files.docs.sub_dir' },
    ]);
    expect(plan.batches.map((b) => [b.parentPath, names(b.files)])).toEqual([
      ['files.docs', ['a.txt']],
      ['files.docs.sub_dir', ['b.txt', 'c.txt']],
      ['files', ['loose.txt']],
    ]);
    expect(plan.fileCount).toBe(4);
    expect(plan.flattened).toBe(0);
  });

  it('puts files deeper than three folders into the third', () => {
    const plan = planFolderUpload([tf('a/b/c/d/e/deep.txt')], 'files');
    expect(plan.folders.map((f) => f.path)).toEqual(['files.a', 'files.a.b', 'files.a.b.c']);
    expect(plan.batches).toEqual([{ parentPath: 'files.a.b.c', files: expect.any(Array) }]);
    expect(plan.flattened).toBe(1);
  });

  it('counts the depth from the folder being uploaded into', () => {
    const plan = planFolderUpload([tf('a/b/x.txt')], 'files.work.clients');
    expect(plan.folders.map((f) => f.path)).toEqual(['files.work.clients.a']);
    expect(plan.batches[0]!.parentPath).toBe('files.work.clients.a');
    expect(plan.flattened).toBe(1);
  });

  it('leaves out hidden and system files', () => {
    const plan = planFolderUpload(
      [tf('p/.DS_Store'), tf('p/.git/config'), tf('p/Thumbs.db'), tf('p/ok.md')],
      'files',
    );
    expect(plan.skipped).toBe(3);
    expect(plan.fileCount).toBe(1);
    expect(plan.folders.map((f) => f.path)).toEqual(['files.p']);
  });

  it('merges sibling folders whose names share a slug', () => {
    const plan = planFolderUpload([tf('A/x.txt'), tf('a/y.txt')], 'files');
    expect(plan.folders).toHaveLength(1);
    expect(names(plan.batches[0]!.files)).toEqual(['x.txt', 'y.txt']);
  });
});

describe('pickedTreeFiles', () => {
  it('uses the picker’s relative path, else the name', () => {
    const f = new File(['x'], 'a.txt');
    Object.defineProperty(f, 'webkitRelativePath', { value: 'top/a.txt' });
    expect(pickedTreeFiles([f])[0]!.relPath).toBe('top/a.txt');
    expect(pickedTreeFiles([new File(['x'], 'b.txt')])[0]!.relPath).toBe('b.txt');
  });
});

describe('folderUploadNotice', () => {
  it('says nothing for a plain upload', () => {
    expect(folderUploadNotice(planFolderUpload([tf('a/b.txt')], 'files'))).toBeNull();
  });
  it('names flattened and skipped files', () => {
    const plan = planFolderUpload([tf('a/b/c/d/x.txt'), tf('a/.env')], 'files');
    expect(folderUploadNotice(plan)).toBe(
      '1 file nested deeper than 3 folders went into the deepest folder. 1 hidden or system file was left out.',
    );
  });
});

/** A fake of the drag-and-drop entry API: files and folders by full path. */
function fakeEntry(fullPath: string, children?: FileSystemEntry[]): FileSystemEntry {
  const name = fullPath.split('/').pop()!;
  if (!children) {
    return {
      isFile: true,
      isDirectory: false,
      name,
      fullPath,
      file: (ok: (f: File) => void) => ok(new File(['x'], name)),
    } as unknown as FileSystemEntry;
  }
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => {
      // Two batches then empty, as Chromium answers a big folder.
      const batches = [children.slice(0, 1), children.slice(1), []];
      return { readEntries: (ok: (e: FileSystemEntry[]) => void) => ok(batches.shift()!) };
    },
  } as unknown as FileSystemEntry;
}
const itemsOf = (entries: FileSystemEntry[]) =>
  entries.map((e) => ({
    kind: 'file',
    webkitGetAsEntry: () => e,
  })) as unknown as DataTransferItemList;

describe('droppedTree', () => {
  it('is null for a drop of plain files', () => {
    expect(droppedTree(itemsOf([fakeEntry('/a.txt')]))).toBeNull();
  });

  it('walks every folder batch and keeps paths, skipping hidden folders', async () => {
    const tree = fakeEntry('/top', [
      fakeEntry('/top/a.txt'),
      fakeEntry('/top/sub', [fakeEntry('/top/sub/b.txt'), fakeEntry('/top/sub/c.txt')]),
      fakeEntry('/top/.git', [fakeEntry('/top/.git/config')]),
    ]);
    const files = await droppedTree(itemsOf([tree, fakeEntry('/loose.md')]));
    expect(files!.map((f) => f.relPath).sort()).toEqual([
      'loose.md',
      'top/a.txt',
      'top/sub/b.txt',
      'top/sub/c.txt',
    ]);
  });
});
