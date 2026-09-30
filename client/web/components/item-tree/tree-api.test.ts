import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as Array<{ url: string; method: string; body: unknown }>);

vi.mock('@mantle/web-ui/api-fetch', () => ({
  apiFetch: vi.fn(),
  apiSend: vi.fn(async (url: string, method: string, body?: unknown) => {
    sent.push({ url, method, body });
    return { folder: { id: 'f1' }, ok: true, moved: 1, failed: [] };
  }),
}));

import { createTreeFolder, deleteTreeFolder, moveTreeItems, patchTreeFolder } from './tree-api';

beforeEach(() => {
  sent.length = 0;
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
