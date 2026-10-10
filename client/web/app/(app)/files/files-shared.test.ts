import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  describeDerivedCounts,
  dismissDialog,
  folderShareOf,
  sharedUploadLine,
  slugify,
  sumDerivedCounts,
} from './files-shared';
import type { DerivedCounts, FilesDialog } from './files-shared';

/**
 * The Files screen's pure layer. None of this could be reached without
 * rendering a 2,158-line component until phase 1 lifted it out.
 */

describe('dismissDialog', () => {
  const rename: FilesDialog = {
    kind: 'rename',
    target: { kind: 'file', id: 'f1', filename: 'a.md', extension: 'md' },
  };

  it('closes the dialog that asked', () => {
    expect(dismissDialog(rename, 'rename')).toBeNull();
    expect(dismissDialog({ kind: 'bulkDelete' }, 'bulkDelete')).toBeNull();
  });

  // The reason this is a function and not `setDialog(null)`. Radix fires
  // onOpenChange(false) as it closes, and the bulk-delete flow opens the
  // cascade confirm from an async handler — a late close must not wipe the
  // dialog that replaced it.
  it('leaves a dialog that has already replaced it alone', () => {
    const cascade: FilesDialog = {
      kind: 'cascade',
      ids: ['f1'],
      counts: { images: 0, tables: 0, pages: 1, notes: 0, other: 0, total: 1 },
    };
    expect(dismissDialog(cascade, 'bulkDelete')).toBe(cascade);
    expect(dismissDialog(rename, 'createFolder')).toBe(rename);
  });

  it('is a no-op when nothing is open', () => {
    expect(dismissDialog(null, 'rename')).toBeNull();
  });
});

describe('slugify', () => {
  it('makes a path segment out of what someone types', () => {
    expect(slugify('My Notes')).toBe('my-notes');
    expect(slugify('  spaced  out  ')).toBe('spaced-out');
  });

  it('drops what cannot ride in a path', () => {
    expect(slugify('a/b\\c')).not.toContain('/');
    expect(slugify('a/b\\c')).not.toContain('\\');
    expect(slugify('....')).toBe('');
  });
});

describe('derived counts', () => {
  const counts = (o: Partial<DerivedCounts> = {}): DerivedCounts => ({
    images: 0,
    tables: 0,
    pages: 0,
    notes: 0,
    other: 0,
    total: 0,
    ...o,
  });

  it('sums every kind across files', () => {
    const total = sumDerivedCounts([
      counts({ pages: 1, notes: 2, total: 3 }),
      counts({ pages: 3, images: 1, total: 4 }),
    ]);
    expect(total.pages).toBe(4);
    expect(total.notes).toBe(2);
    expect(total.images).toBe(1);
    expect(total.total).toBe(7);
  });

  it('sums to zero over nothing', () => {
    expect(sumDerivedCounts([])).toEqual(counts());
  });

  // This sentence is what the user reads before agreeing to a cascade delete,
  // so it has to name what would actually go.
  it('describes what a cascade would take', () => {
    const text = describeDerivedCounts(counts({ pages: 2, notes: 1, total: 3 }));
    expect(text).toContain('2');
    expect(text).toMatch(/page/i);
    expect(text).toMatch(/note/i);
    expect(typeof describeDerivedCounts(counts())).toBe('string');
  });
});

describe('a shared folder on the Files screen', () => {
  it('is read at the more open of its own share and the one above it', () => {
    expect(folderShareOf({ share: 'team', inherited: 'client' })).toBe('client');
    expect(folderShareOf({ share: null, inherited: 'team' })).toBe('team');
    expect(folderShareOf({ share: 'client', inherited: null })).toBe('client');
    expect(folderShareOf({ share: null, inherited: null })).toBeNull();
    // A brain before folder sharing sends neither.
    expect(folderShareOf({})).toBeNull();
    expect(folderShareOf(null)).toBeNull();
  });
  it('asks before an upload says who reads it', () => {
    expect(sharedUploadLine('client', 1)).toBe(
      'Clients read everything in this folder, so they read this file as soon as it lands.',
    );
    expect(sharedUploadLine('team', 3)).toMatch(
      /^The team reads .* these 3 files as soon as they land\.$/,
    );
  });
});

/** The Files writes into a shared folder, pinned where the node runner
 *  cannot render them. */
describe('Files asks before a shared folder exposes what lands in it', () => {
  const read = (f: string) =>
    readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

  it('an upload into a shared folder asks once, then sends confirm', () => {
    const src = read('./files-client.tsx');
    // W5b: asked when the folder's grants reach beyond its home (or, on a
    // brain before W5b, by its level).
    expect(src).toContain(
      'const visibleTo = currentFolder ? uploadVisibleTo(folderGrants.data) : null;',
    );
    expect(src).toContain(
      'if (asksOnUpload) setSharedUpload({ files: picked, path: currentPath });',
    );
    expect(src).toContain('enqueue(sharedUpload.files, sharedUpload.path, { confirm: true });');
    expect(src).toContain('if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);');
  });

  it('a new file in a shared folder shows the brain’s list and repeats with confirm', () => {
    const src = read('./files-dialogs.tsx');
    expect(src).toContain('const refusal = visibilityRefusal(err);');
    expect(src).toContain('run: () => void create(true),');
  });

  it('the dual pane sets refused items aside and repeats them with confirm and seen', () => {
    const src = read('./files-panes.tsx');
    expect(src).toContain(
      'const yes = seen?.has(key) ? { confirm: true, seen: seen.get(key) } : {};',
    );
    expect(src).toContain('refusal: mergeRefusals(refused.map((r) => r.refusal)),');
    expect(src).toContain('new Map(refused.map((r) => [r.key, r.refusal.total])),');
  });
});
