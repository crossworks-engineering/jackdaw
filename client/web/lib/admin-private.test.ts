import { describe, expect, it } from 'vitest';
import {
  KEEP_PRIVATE_HELP,
  acceptedBrainHref,
  brainViewHref,
  createPrivateItem,
  isPrivateView,
  legacyPrivateHref,
  privateTextFile,
  privateViewHref,
  uploadPrivateFile,
} from './admin-private';
import { MEMBER_MAX_UPLOAD_BYTES } from './member-space';

/** A private-space client that records what it was asked to do. */
function fakeClient() {
  const log: string[] = [];
  const bodies: unknown[] = [];
  return {
    log,
    bodies,
    create: async (body: { type: string; title: string; content?: string }) => {
      log.push(`create ${body.type}`);
      bodies.push(body);
      return { item: { id: 'new-1' } as never };
    },
    patch: async (id: string, body: { content?: string }) => {
      log.push(`patch ${id}`);
      bodies.push(body);
      return {} as never;
    },
    upload: async (file: File) => {
      log.push(`upload ${file.name}`);
      return { row: { id: 'file-1' } as never };
    },
  };
}

describe('the Private view (member logins Phase 7)', () => {
  it('is the kind screen with the open private item, or filtered to them', () => {
    expect(privateViewHref('page')).toBe('/pages?state=private');
    expect(privateViewHref('table', 't1')).toBe('/tables?pid=t1');
    expect(privateViewHref('file', 'f1')).toBe('/files?pid=f1');
    // An old Private-view link lands on the same place.
    expect(legacyPrivateHref('note', new URLSearchParams('space=private&id=n1'))).toBe(
      '/notes?pid=n1',
    );
    expect(legacyPrivateHref('note', new URLSearchParams('space=private'))).toBe(
      '/notes?state=private',
    );
    expect(brainViewHref('draw')).toBe('/draw');
  });

  it('is read from the URL, and nothing else opens it', () => {
    expect(isPrivateView(new URLSearchParams('space=private&id=x'))).toBe(true);
    expect(isPrivateView(new URLSearchParams('space=brain'))).toBe(false);
    expect(isPrivateView(new URLSearchParams(''))).toBe(false);
    expect(isPrivateView(null)).toBe(false);
  });

  it('an accepted item opens on its brain route', () => {
    expect(acceptedBrainHref('page', 'p1')).toBe('/pages/p1');
    expect(acceptedBrainHref('note', 'n1')).toBe('/notes/n1');
    expect(acceptedBrainHref('draw', 'd1')).toBe('/draw/d1');
    expect(acceptedBrainHref('table', 't1')).toBe('/tables/t1');
    expect(acceptedBrainHref('file', 'f1', 'files.docs')).toBe('/files?path=files.docs&file=f1');
    expect(acceptedBrainHref('file', 'f1', null)).toBe('/files?file=f1');
  });

  it('says one line of help', () => {
    expect(KEEP_PRIVATE_HELP).toBe('Only you can see it until you accept it into the brain.');
  });
});

describe('Keep private in the create flows', () => {
  it.each(['page', 'draw', 'table'] as const)(
    'a kept-private %s is created in the private space and opens there',
    async (kind) => {
      const c = fakeClient();
      const href = await createPrivateItem(kind, { title: '  Plan  ' }, c);
      expect(c.log).toEqual([`create ${kind}`]);
      expect(c.bodies[0]).toEqual({ type: kind, title: 'Plan' });
      expect(href).toBe(privateViewHref(kind, 'new-1'));
    },
  );

  it("a kept-private note takes its text in the one create call (a page's does not)", async () => {
    const c = fakeClient();
    const href = await createPrivateItem('note', { title: 'N', content: '# hi' }, c);
    // One write: a refused text can no longer leave an empty note behind.
    expect(c.log).toEqual(['create note']);
    expect(c.bodies[0]).toEqual({ type: 'note', title: 'N', content: '# hi' });
    expect(href).toBe('/notes?pid=new-1');

    const empty = fakeClient();
    await createPrivateItem('note', { title: 'N', content: '' }, empty);
    expect(empty.bodies[0]).toEqual({ type: 'note', title: 'N' });
    const page = fakeClient();
    await createPrivateItem('page', { title: 'P', content: 'ignored' }, page);
    expect(page.bodies[0]).toEqual({ type: 'page', title: 'P' });
  });

  it('a refused note text makes no note at all', async () => {
    const c = fakeClient();
    c.create = async () => {
      throw new Error('Too long.');
    };
    await expect(createPrivateItem('note', { title: 'N', content: 'x' }, c)).rejects.toThrow(
      'Too long.',
    );
    expect(c.log).toEqual([]);
  });

  it('a private upload goes to the private space and opens there', async () => {
    const c = fakeClient();
    const href = await uploadPrivateFile(new File(['x'], 'plan.pdf'), c);
    expect(c.log).toEqual(['upload plan.pdf']);
    expect(href).toBe('/files?pid=file-1');
  });

  it('a private upload over the cap is refused before a byte is sent', async () => {
    const c = fakeClient();
    const big = { name: 'big.bin', size: MEMBER_MAX_UPLOAD_BYTES + 1 } as File;
    await expect(uploadPrivateFile(big, c)).rejects.toThrow(/upload limit/);
    expect(c.log).toEqual([]);
  });

  it('a new private text file carries its name, type and starter body', async () => {
    const f = privateTextFile('notes.md', 'md', '# Title\n');
    expect(f.name).toBe('notes.md');
    expect(f.type).toBe('text/markdown');
    expect(await f.text()).toBe('# Title\n');
    expect(privateTextFile('a.json', 'json', '{}').type).toBe('application/json');
    expect(privateTextFile('a.txt', 'txt', '').type).toBe('text/plain');
  });
});
