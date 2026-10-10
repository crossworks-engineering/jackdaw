import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { TreeFolder } from '@mantle/web-ui/types/tree';
import {
  canGrantFolder,
  isWorkspaceChange,
  mergeRefusals,
  refusalHeading,
  seenOf,
  shareLevelsOf,
  visibilityRefusal,
  workspaceChangeWords,
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

describe('canGrantFolder', () => {
  it('offers Access on an ordinary folder of a shareable kind', () => {
    expect(canGrantFolder('notes', folder())).toBe(true);
  });
  it('never on a system folder or an admin-only kind', () => {
    expect(canGrantFolder('files', folder({ system: true }))).toBe(false);
    expect(canGrantFolder('contacts', folder())).toBe(false);
  });
});

describe('visibilityRefusal, the tree (workspaces, contract 29)', () => {
  const ws = (wsId: string, name: string) => ({ wsId, name });
  const change = {
    id: 'a',
    title: 'Plan',
    alsoVisibleTo: [ws('s', 'Sales'), ws('o', 'Ops')],
    removedFrom: [ws('t', 'Team')],
  };

  it('reads each item with the workspaces it gains and loses', () => {
    const err = new ApiError('x', 409, { error: 'visibility', changes: [change], total: 4 });
    const r = visibilityRefusal(err)!;
    expect(r).toEqual({ error: 'visibility', changes: [change], total: 4 });
    expect(isWorkspaceChange(r.changes[0]!)).toBe(true);
    expect(seenOf(r)).toBe(4);
    expect(workspaceChangeWords(change)).toEqual({ added: 'Sales, Ops', removed: 'Team' });
    expect(workspaceChangeWords({ ...change, removedFrom: [] }).removed).toBeNull();
  });

  it('keeps a new item (id empty), drops malformed refs and rows', () => {
    const fresh = {
      id: '',
      title: 'new.txt',
      alsoVisibleTo: [ws('s', 'Sales'), { x: 1 }],
      removedFrom: [],
    };
    const err = new ApiError('x', 409, {
      error: 'visibility',
      changes: [fresh, { id: 'b', title: 'B', alsoVisibleTo: 'Sales' }, null],
      total: 1,
    });
    expect(visibilityRefusal(err)!.changes).toEqual([
      { id: '', title: 'new.txt', alsoVisibleTo: [ws('s', 'Sales')], removedFrom: [] },
    ]);
  });

  it('merges batches, each new item counted on its own', () => {
    const fresh = (title: string) => ({
      id: '',
      title,
      alsoVisibleTo: [ws('s', 'S')],
      removedFrom: [],
    });
    const merged = mergeRefusals([
      { error: 'visibility', changes: [change, fresh('x')], total: 2 },
      { error: 'visibility', changes: [change, fresh('y')], total: 2 },
    ]);
    expect(merged.changes.map((c) => c.title)).toEqual(['Plan', 'x', 'y']);
    expect(merged.total).toBe(4);
  });
});

describe('visibilityRefusal, a review accept (levels, until W5c)', () => {
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
  it('reads what they embed (alsoEmbeds), dropping malformed rows', () => {
    const embed = { id: 'e', title: 'Logo', from: 'admin', to: 'client' };
    const err = new ApiError('x', 409, {
      error: 'visibility',
      changes: [change],
      total: 1,
      alsoEmbeds: [embed, { id: 2 }],
    });
    expect(visibilityRefusal(err)).toEqual({
      error: 'visibility',
      changes: [change],
      total: 1,
      alsoEmbeds: [embed],
      embedsTotal: 1,
    });
  });
  it('leaves alsoEmbeds out when a brain sends none, and ignores the old alsoLowered', () => {
    const embed = { id: 'e', title: 'Logo', from: 'admin', to: 'client' };
    const err = new ApiError('x', 409, {
      error: 'visibility',
      changes: [change],
      total: 1,
      alsoLowered: [embed],
    });
    const out = visibilityRefusal(err);
    expect(out).not.toHaveProperty('alsoEmbeds');
    expect(out).not.toHaveProperty('alsoLowered');
  });
  it('counts embeds in seen, and words an embeds-only change', () => {
    const embed = { id: 'e', title: 'Logo', from: 'admin', to: 'client' };
    const err = new ApiError('x', 409, {
      error: 'visibility',
      changes: [],
      total: 0,
      alsoEmbeds: [embed],
      embedsTotal: 3,
    });
    const r = visibilityRefusal(err)!;
    expect(r.embedsTotal).toBe(3);
    expect(seenOf(r)).toBe(3);
    expect(refusalHeading(r)).toBe('This changes who can see what they embed');
    expect(seenOf({ error: 'visibility', changes: [], total: 4 })).toBe(4);
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
      { error: 'visibility', changes: [c('b'), c('c')], total: 2, alsoEmbeds: [c('x')] },
    ]);
    expect(merged.changes.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(merged.total).toBe(7);
    expect(merged.alsoEmbeds?.map((x) => x.id)).toEqual(['x']);
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
    expect(merged).not.toHaveProperty('alsoEmbeds');
  });
});
