import { describe, expect, it } from 'vitest';
import { folderIndexGate, getSlashItems } from './slash-menu';

const ids = (q: string, opts: Parameters<typeof getSlashItems>[1] = {}) =>
  getSlashItems(q, opts).map((i) => i.id);

describe('getSlashItems (every login, W6b)', () => {
  it('offers the items that create or upload to every editor', () => {
    for (const id of ['new-page', 'image', 'drawing', 'file']) expect(ids('')).toContain(id);
  });

  it('filters by the text typed', () => {
    expect(ids('page')).toContain('new-page');
    expect(ids('zzzz')).toEqual([]);
  });
});

describe('getSlashItems and the Folder index', () => {
  it('is offered unless the editor says the brain has no pages tree', () => {
    expect(ids('')).toContain('folder-index');
    expect(ids('', { folderIndex: true })).toContain('folder-index');
    expect(ids('', { folderIndex: false })).not.toContain('folder-index');
    expect(ids('folder', { folderIndex: false })).not.toContain('folder-index');
  });
});

describe('folderIndexGate: what an editor hands the slash command by default', () => {
  it('is on only when the caller said so: left out is off', () => {
    expect(folderIndexGate(true)).toBe(true);
    expect(folderIndexGate(false)).toBe(false);
    expect(folderIndexGate(undefined)).toBe(false);
    expect(ids('', { folderIndex: folderIndexGate(undefined) })).not.toContain('folder-index');
  });
});
