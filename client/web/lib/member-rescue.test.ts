import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESCUE_MAX_AGE_MS,
  clearRescues,
  dropRescue,
  keepRescue,
  replayRescue,
  clientRescueOwner,
  rescueOwnerFor,
  setRescueOwner,
  sweepRescues,
  takeRescue,
} from './member-rescue';
import { memberSpace } from './member-space';

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    size: () => m.size,
    keys: () => [...m.keys()],
  };
}

const PATH = '/api/member/space/abc/draft';
const ME = 'member:login-a';
const NEXT = 'member:login-b';

describe('member rescue', () => {
  it('a kept write is taken once, then gone', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{"if_rev":3}', at: 1000 }, s, ME);
    expect(takeRescue(PATH, 2000, s, ME)).toEqual({
      method: 'PUT',
      body: '{"if_rev":3}',
      at: 1000,
    });
    expect(takeRescue(PATH, 2000, s, ME)).toBeNull();
    expect(s.size()).toBe(0);
  });

  it('an answered write leaves nothing to send', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{}', at: 1000 }, s, ME);
    dropRescue(PATH, s, ME);
    expect(takeRescue(PATH, 1000, s, ME)).toBeNull();
  });

  it('a write older than the limit is dropped unsent (a note PATCH has no etag)', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PATCH', body: '{}', at: 0 }, s, ME);
    expect(takeRescue(PATH, RESCUE_MAX_AGE_MS + 1, s, ME)).toBeNull();
    expect(s.size()).toBe(0);
  });

  it('junk in storage is dropped, never sent', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{}', at: 0 }, s, ME);
    const key = s.keys()[0]!;
    s.setItem(key, '{not json');
    expect(takeRescue(PATH, 0, s, ME)).toBeNull();
    s.setItem(key, JSON.stringify({ method: 'DELETE', body: '', at: 0 }));
    expect(takeRescue(PATH, 0, s, ME)).toBeNull();
  });

  it('blocked or full storage never throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      key: () => {
        throw new Error('blocked');
      },
      get length(): number {
        throw new Error('blocked');
      },
    };
    expect(() => keepRescue(PATH, { method: 'PUT', body: '{}', at: 0 }, broken, ME)).not.toThrow();
    expect(takeRescue(PATH, 0, broken, ME)).toBeNull();
    expect(() => sweepRescues(0, broken)).not.toThrow();
    expect(() => clearRescues(broken)).not.toThrow();
  });
});

describe('a kept write belongs to the login that wrote it', () => {
  it('names the login in its key', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{}', at: 0 }, s, ME);
    expect(s.keys()).toEqual([`mantle_member_rescue:${encodeURIComponent(ME)}:${PATH}`]);
  });

  it('another login on the same browser never takes it', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{"secret":1}', at: 0 }, s, ME);
    expect(takeRescue(PATH, 0, s, NEXT)).toBeNull();
    expect(s.size()).toBe(1);
  });

  it('is not kept, nor taken, before the shell has said who is signed in', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{}', at: 0 }, s, null);
    expect(s.size()).toBe(0);
    keepRescue(PATH, { method: 'PUT', body: '{}', at: 0 }, s, ME);
    expect(takeRescue(PATH, 0, s, null)).toBeNull();
  });

  it('the owner is the member login, or the admin login', () => {
    expect(rescueOwnerFor(true, { loginId: 'L1' }, undefined)).toBe('member:L1');
    expect(rescueOwnerFor(true, undefined, { email: 'a@example.com' })).toBeNull();
    expect(rescueOwnerFor(false, undefined, { email: 'a@example.com' })).toBe(
      'admin:a@example.com',
    );
    expect(rescueOwnerFor(false, undefined, undefined)).toBeNull();
  });

  it('a client portal names its client login (tier U7)', () => {
    expect(clientRescueOwner({ loginId: 'C1' })).toBe('client:C1');
    expect(clientRescueOwner({ loginId: '' })).toBeNull();
    expect(clientRescueOwner(undefined)).toBeNull();
  });
});

describe('sweeping and clearing', () => {
  it('the boot sweep drops expired, unreadable and owner-less copies, and keeps the rest', () => {
    const s = memStore();
    const now = RESCUE_MAX_AGE_MS * 3;
    keepRescue('/api/member/space/fresh', { method: 'PATCH', body: '{}', at: now - 1000 }, s, ME);
    keepRescue('/api/member/space/old', { method: 'PATCH', body: '{}', at: 0 }, s, ME);
    keepRescue('/api/member/space/junk', { method: 'PATCH', body: '{}', at: now }, s, NEXT);
    s.setItem(s.keys()[2]!, '{not json');
    // The format before the owner was in the key.
    s.setItem('mantle_member_rescue:/api/member/space/legacy', '{}');
    s.setItem('unrelated', 'kept');
    sweepRescues(now, s);
    expect(s.keys()).toEqual([
      `mantle_member_rescue:${encodeURIComponent(ME)}:/api/member/space/fresh`,
      'unrelated',
    ]);
  });

  it('sign-out clears every kept copy, whoever wrote it, and nothing else', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{}', at: 0 }, s, ME);
    keepRescue(PATH, { method: 'PUT', body: '{}', at: 0 }, s, NEXT);
    s.setItem('unrelated', 'kept');
    clearRescues(s);
    expect(s.keys()).toEqual(['unrelated']);
  });

  it('the app shell sweeps at boot, names the owner and clears at sign-out', () => {
    const shell = readFileSync(
      fileURLToPath(new URL('../components/app-shell.tsx', import.meta.url)),
      'utf8',
    );
    expect(shell).toMatch(
      /sweepRescues\(Date\.now\(\)\);\s*return onSignOut\(\(\) => \{\s*setRescueOwner\(null\);\s*clearRescues\(\);/,
    );
    expect(shell).toContain(
      'const rescueWho = rescueOwnerFor(isMember, memberShellQuery.data, shellQuery.data);',
    );
    expect(shell).toContain('setRescueOwner(rescueWho);');
  });
});

/**
 * The behaviour end to end, through the real client: a note save over the
 * keepalive cap is cut off by a reload (its request never answers), and the
 * next open of that item sends it. Turning the rescue copy off fails here.
 */
describe('a big save a reload cut off is sent on the next open', () => {
  let store: ReturnType<typeof memStore>;
  let sent: { method: string; url: string; body: string }[];

  beforeEach(() => {
    store = memStore();
    sent = [];
    vi.stubGlobal('window', { localStorage: store });
  });
  afterEach(() => {
    setRescueOwner(null);
    vi.unstubAllGlobals();
  });

  it('keeps it through the reload, then sends it once as its own login', async () => {
    setRescueOwner(ME);
    const big = 'typed words '.repeat(6000); // about 72 KB: no keepalive
    // The page unloads mid-request: the answer never comes.
    vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
    void memberSpace.patch('abc', { content: big });
    await Promise.resolve();
    expect(store.size()).toBe(1);

    // Reopened after the reload, signed in as the same login.
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      sent.push({ method: init?.method ?? 'GET', url, body: String(init?.body ?? '') });
      return new Response('{}', { status: 200 });
    });
    await replayRescue('abc', Date.now());
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('PATCH');
    expect(sent[0]!.url).toMatch(/\/api\/member\/space\/abc$/);
    expect(JSON.parse(sent[0]!.body)).toEqual({ content: big });
    expect(store.size()).toBe(0);

    // Once only.
    await replayRescue('abc', Date.now());
    expect(sent).toHaveLength(1);
  });

  it('the next login on the browser sends nothing of it', async () => {
    setRescueOwner(ME);
    vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
    void memberSpace.patch('abc', { content: 'x'.repeat(70_000) });
    await Promise.resolve();
    setRescueOwner(NEXT);
    vi.stubGlobal('fetch', async (url: string) => {
      sent.push({ method: 'x', url, body: '' });
      return new Response('{}', { status: 200 });
    });
    await replayRescue('abc', Date.now());
    expect(sent).toEqual([]);
  });

  it('a small save needs no copy (keepalive carries it)', async () => {
    setRescueOwner(ME);
    vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
    void memberSpace.patch('abc', { content: 'short' });
    await Promise.resolve();
    expect(store.size()).toBe(0);
  });
});
