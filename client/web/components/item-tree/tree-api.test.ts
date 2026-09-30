import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as Array<{ url: string; method: string; body: unknown }>);
/** A brain before `seen`: its strict folder PATCH refuses the field. */
const strictPatch = vi.hoisted(() => ({ on: false }));
const fetched = vi.hoisted(() => ({ answer: null as unknown }));

vi.mock('@mantle/web-ui/api-fetch', () => {
  class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly body?: Record<string, unknown>,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    apiFetch: vi.fn(async () => fetched.answer),
    apiSend: vi.fn(async (url: string, method: string, body?: unknown) => {
      sent.push({ url, method, body });
      if (
        strictPatch.on &&
        method === 'PATCH' &&
        body &&
        typeof body === 'object' &&
        'seen' in body
      ) {
        throw new ApiError("Unrecognized key(s) in object: 'seen'", 400);
      }
      return { folder: { id: 'f1' }, ok: true, moved: 1, failed: [] };
    }),
  };
});

import {
  createTreeFolder,
  deleteTreeFolder,
  fetchFolderPage,
  fetchSearch,
  moveTreeItems,
  patchTreeFolder,
} from './tree-api';

beforeEach(() => {
  sent.length = 0;
  strictPatch.on = false;
});

describe('tree writes', () => {
  it('go to the owner tree by default', async () => {
    await createTreeFolder('notes', null, 'A');
    await patchTreeFolder('notes', 'f1', { name: 'B' });
    await deleteTreeFolder('notes', 'f1', true);
    await moveTreeItems('notes', ['i1'], 'f1', true);
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      'POST /api/tree/notes/folders',
      'PATCH /api/tree/notes/folders/f1',
      'DELETE /api/tree/notes/folders/f1?confirm=true',
      'POST /api/tree/notes/move',
    ]);
  });

  it('sends a new folder’s icon and colour in the same POST, and nothing for none', async () => {
    await createTreeFolder('notes', null, 'A', 'owner', {
      icon: 'lucide:briefcase',
      color: 'cyan',
    });
    expect(sent.at(-1)).toEqual({
      url: '/api/tree/notes/folders',
      method: 'POST',
      body: { parentId: null, name: 'A', icon: 'lucide:briefcase', color: 'cyan' },
    });
    await createTreeFolder('notes', 'p1', 'B', 'member', { icon: '', color: null });
    expect(sent.at(-1)).toEqual({
      url: '/api/member/tree/notes/folders',
      method: 'POST',
      body: { parentId: 'p1', name: 'B' },
    });
  });

  it('a member writes to its own tree routes (folder plan phase 5)', async () => {
    await createTreeFolder('files', 'p1', 'Mine', 'member');
    await patchTreeFolder('files', 'f1', { name: 'Ours' }, 'member');
    await deleteTreeFolder('files', 'f1', false, 'member');
    await moveTreeItems('files', ['i1'], null, false, 'member');
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      'POST /api/member/tree/files/folders',
      'PATCH /api/member/tree/files/folders/f1',
      'DELETE /api/member/tree/files/folders/f1',
      'POST /api/member/tree/files/move',
    ]);
    expect(sent[0]!.body).toEqual({ parentId: 'p1', name: 'Mine' });
    expect(sent[3]!.body).toEqual({ ids: ['i1'], folderId: null });
  });
});

describe('a confirmed write says what it was shown (seen)', () => {
  it('sends seen on a confirmed folder change, move and delete', async () => {
    await patchTreeFolder('notes', 'f1', { share: 'client', confirm: true, seen: 3 });
    await moveTreeItems('notes', ['i1'], 'f1', true, 'owner', 2);
    await deleteTreeFolder('notes', 'f1', true, 'owner', 4);
    expect(sent[0]!.body).toEqual({ share: 'client', confirm: true, seen: 3 });
    expect(sent[1]!.body).toEqual({ ids: ['i1'], folderId: 'f1', confirm: true, seen: 2 });
    expect(sent[2]!.url).toBe('/api/tree/notes/folders/f1?confirm=true&seen=4');
  });

  it('sends no seen without confirm', async () => {
    await moveTreeItems('notes', ['i1'], null, false, 'owner', 2);
    await deleteTreeFolder('notes', 'f1', false, 'owner', 4);
    expect(sent[0]!.body).toEqual({ ids: ['i1'], folderId: null });
    expect(sent[1]!.url).toBe('/api/tree/notes/folders/f1');
  });

  it('repeats a folder change without seen for a brain that refuses the field', async () => {
    strictPatch.on = true;
    await patchTreeFolder('notes', 'f1', { share: 'team', confirm: true, seen: 1 });
    expect(sent.map((x) => x.body)).toEqual([
      { share: 'team', confirm: true, seen: 1 },
      { share: 'team', confirm: true },
    ]);
  });
});

describe('a client login’s tree (its own shapes)', () => {
  const clientFolder = {
    id: 'f1',
    path: 'notes.f1',
    name: 'Shared',
    icon: null,
    color: null,
    depth: 1,
    parentId: null,
    folderCount: 0,
    itemCount: 1,
  };
  const clientItem = {
    id: 'i1',
    title: 'Plan',
    icon: null,
    color: null,
    subtype: null,
    updatedAt: '2026-09-30T00:00:00.000Z',
  };

  it('reads a folder page as the rows draw it, making up no level', async () => {
    fetched.answer = {
      kind: 'notes',
      folder: clientFolder,
      crumbs: [],
      folders: [clientFolder],
      items: [clientItem],
      sort: 'updated',
      nextCursor: null,
    };
    const page = await fetchFolderPage('notes', 'f1', 'updated', null, 'client');
    expect(page.folders[0]).toMatchObject({ share: null, system: false });
    expect(page.folder).toMatchObject({ share: null, system: false });
    expect(page.items[0]).toMatchObject({ id: 'i1', state: null });
    expect('level' in page.items[0]!).toBe(false);
  });

  it('reads a search the same way', async () => {
    fetched.answer = {
      kind: 'notes',
      folders: [{ ...clientFolder, crumbs: [] }],
      items: [{ ...clientItem, crumbs: [{ id: 'f1', name: 'Shared' }] }],
      nextCursor: null,
    };
    const res = await fetchSearch('notes', 'plan', null, {}, 'client');
    expect(res.folders[0]).toMatchObject({ share: null, system: false, crumbs: [] });
    expect(res.items[0]).toMatchObject({ state: null, crumbs: [{ id: 'f1', name: 'Shared' }] });
    expect('level' in res.items[0]!).toBe(false);
  });

  it('leaves an owner page as it came', async () => {
    const owner = {
      kind: 'notes',
      folder: null,
      crumbs: [],
      folders: [],
      items: [],
      sort: 'updated',
      nextCursor: null,
    };
    fetched.answer = owner;
    expect(await fetchFolderPage('notes', null, 'updated', null)).toBe(owner);
  });
});
