import { describe, expect, it } from 'vitest';
import { describeDerivedCounts, dismissDialog, slugify, sumDerivedCounts } from './files-shared';
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
