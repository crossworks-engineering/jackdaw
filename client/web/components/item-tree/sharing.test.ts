import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { TreeFolder } from '@mantle/web-ui/types/tree';
import {
  canShareFolder,
  refusalHeading,
  shareLevelsOf,
  shareTitle,
  shownShare,
  visibilityRefusal,
} from './sharing';

const folder = (over: Partial<TreeFolder> = {}): TreeFolder => ({
  id: 'f',
  path: 'notes.f',
  name: 'f',
  icon: null,
  color: null,
  depth: 1,
  parentId: null,
  share: null,
  inherited: null,
  system: false,
  folderCount: 0,
  itemCount: 0,
  ...over,
});

describe('shareLevelsOf', () => {
  it('offers team and clients on the shareable kinds', () => {
    expect(shareLevelsOf('notes')).toEqual(['team', 'client']);
    expect(shareLevelsOf('files')).toEqual(['team', 'client']);
  });
  it('offers nothing on the admin-only kinds', () => {
    expect(shareLevelsOf('secrets')).toEqual([]);
    expect(shareLevelsOf('tasks')).toEqual([]);
  });
  it('keeps Recall to the team', () => {
    expect(shareLevelsOf('recall')).toEqual(['team']);
  });
});

describe('canShareFolder', () => {
  it('shares an ordinary folder of a shareable kind', () => {
    expect(canShareFolder('notes', folder())).toBe(true);
  });
  it('never shares a system folder', () => {
    expect(canShareFolder('files', folder({ system: true }))).toBe(false);
  });
  it('never shares an admin-only kind', () => {
    expect(canShareFolder('contacts', folder())).toBe(false);
  });
  it('does not offer it on a brain before folder sharing (no inherited field)', () => {
    const old = folder();
    delete old.inherited;
    expect(canShareFolder('notes', old)).toBe(false);
  });
});

describe('the shared glyph', () => {
  it('shows the folder’s own share first', () => {
    expect(shownShare(folder({ share: 'team', inherited: 'client' }))).toEqual({
      level: 'team',
      own: true,
    });
    expect(shareTitle(folder({ share: 'client' }))).toMatch(/clients, and everything in it/);
  });
  it('falls back to the inherited share, quieter', () => {
    expect(shownShare(folder({ inherited: 'client' }))).toEqual({ level: 'client', own: false });
    expect(shareTitle(folder({ inherited: 'team' }))).toMatch(/by a folder above/);
  });
  it('shows nothing on an unshared folder', () => {
    expect(shownShare(folder())).toBeNull();
    expect(shareTitle(folder())).toBeNull();
  });
});

describe('visibilityRefusal', () => {
  const change = { id: 'a', title: 'Plan', from: 'admin', to: 'client' };

  it('reads the brain’s refusal', () => {
    const err = new ApiError('x', 409, { error: 'visibility', changes: [change], total: 3 });
    expect(visibilityRefusal(err)).toEqual({ error: 'visibility', changes: [change], total: 3 });
  });
  it('ignores any other 409 (a name clash)', () => {
    expect(visibilityRefusal(new ApiError('clash', 409, { error: 'clash' }))).toBeNull();
    expect(visibilityRefusal(new ApiError('clash', 409))).toBeNull();
  });
  it('ignores other statuses and non-API errors', () => {
    expect(visibilityRefusal(new ApiError('x', 400, { error: 'visibility', changes: [] }))).toBe(
      null,
    );
    expect(visibilityRefusal(new Error('x'))).toBeNull();
  });
  it('drops malformed changes and never reports fewer than it lists', () => {
    const err = new ApiError('x', 409, {
      error: 'visibility',
      changes: [change, { id: 1 }, null],
      total: 0,
    });
    expect(visibilityRefusal(err)).toEqual({ error: 'visibility', changes: [change], total: 1 });
  });
  it('words the heading for one and for many', () => {
    expect(refusalHeading({ error: 'visibility', changes: [], total: 1 })).toMatch(/one item$/);
    expect(refusalHeading({ error: 'visibility', changes: [], total: 12 })).toMatch(/12 items$/);
  });
});
