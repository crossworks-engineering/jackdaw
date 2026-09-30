import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { TreeFolder } from '@mantle/web-ui/types/tree';
import {
  canShareFolder,
  mergeRefusals,
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
  it('offers nothing on Recall until the brain shares its folders', () => {
    expect(shareLevelsOf('recall')).toEqual([]);
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
  it('does not offer a share on a Recall folder yet', () => {
    expect(canShareFolder('recall', folder({ path: 'recall.f' }))).toBe(false);
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
  it('reads what goes down with them (alsoLowered), dropping malformed rows', () => {
    const embed = { id: 'e', title: 'Logo', from: 'admin', to: 'client' };
    const err = new ApiError('x', 409, {
      error: 'visibility',
      changes: [change],
      total: 1,
      alsoLowered: [embed, { id: 2 }],
    });
    expect(visibilityRefusal(err)).toEqual({
      error: 'visibility',
      changes: [change],
      total: 1,
      alsoLowered: [embed],
    });
  });
  it('leaves alsoLowered out when a brain sends none', () => {
    const err = new ApiError('x', 409, { error: 'visibility', changes: [change], total: 1 });
    expect(visibilityRefusal(err)).not.toHaveProperty('alsoLowered');
  });
  it('words the heading for one and for many', () => {
    expect(refusalHeading({ error: 'visibility', changes: [], total: 1 })).toMatch(/one item$/);
    expect(refusalHeading({ error: 'visibility', changes: [], total: 12 })).toMatch(/12 items$/);
  });
});

describe('mergeRefusals', () => {
  const c = (id: string) => ({ id, title: id, from: 'admin' as const, to: 'team' as const });

  it('adds the totals and lists each item once', () => {
    const merged = mergeRefusals([
      { error: 'visibility', changes: [c('a'), c('b')], total: 5 },
      { error: 'visibility', changes: [c('b'), c('c')], total: 2, alsoLowered: [c('x')] },
    ]);
    expect(merged.changes.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(merged.total).toBe(7);
    expect(merged.alsoLowered?.map((x) => x.id)).toEqual(['x']);
  });

  it('keeps within one refusal’s list size', () => {
    const many = Array.from({ length: 80 }, (_, i) => c(`a${i}`));
    const more = Array.from({ length: 80 }, (_, i) => c(`b${i}`));
    const merged = mergeRefusals([
      { error: 'visibility', changes: many, total: 80 },
      { error: 'visibility', changes: more, total: 80 },
    ]);
    expect(merged.changes).toHaveLength(100);
    expect(merged.total).toBe(160);
    expect(merged).not.toHaveProperty('alsoLowered');
  });
});
