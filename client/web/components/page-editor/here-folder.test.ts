import { describe, expect, it } from 'vitest';
import { hereFolderOf } from './here-folder';

describe('hereFolderOf: what a Folder index block set to `here` lists', () => {
  it('takes the live folder over the one the editor was made with', () => {
    expect(hereFolderOf({ folderId: 'now' }, 'then')).toBe('now');
    // Moved to the top level while open: the top level, not the old folder.
    expect(hereFolderOf({ folderId: null }, 'then')).toBeNull();
  });

  it('a live "not known" stays not known: never the stored folder, never the root', () => {
    expect(hereFolderOf({ folderId: undefined }, 'then')).toBeUndefined();
    expect(hereFolderOf({ folderId: undefined }, null)).toBeUndefined();
  });

  it('falls back to the storage only where no provider says anything', () => {
    expect(hereFolderOf(null, 'then')).toBe('then');
    expect(hereFolderOf(null, null)).toBeNull();
    expect(hereFolderOf(null, undefined)).toBeUndefined();
  });
});
