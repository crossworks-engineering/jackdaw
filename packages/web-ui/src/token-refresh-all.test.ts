import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSessions, sessionToken, signInSession } from './session-registry';
import { refreshAllSessions } from './token-refresh';

/**
 * Keeping every held login alive. The active session's rotation is covered in
 * token-refresh.test.ts and is unchanged; this is about the ones NOT in use,
 * whose brain may be a different origin and whose bearer must travel alone.
 * Runs over a real (fake-backed) store rather than a mocked one: which bearer
 * ends up under which key is the whole question.
 */

const DAY = 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

function bearer(exp: number, tag: string): string {
  const payload = btoa(JSON.stringify({ exp, tag })).replace(/\+/g, '-').replace(/\//g, '_');
  return `${payload}.signature`;
}

const jsonRes = (body: unknown, ok = true) =>
  ({ ok, json: () => Promise.resolve(body) }) as unknown as Response;

let map: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  map = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
    location: {
      protocol: 'https:',
      origin: 'https://brain.example',
      href: 'https://brain.example/',
    },
    __MANTLE_ENV__: {},
  });
  vi.stubGlobal('document', { cookie: '' });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshAllSessions', () => {
  it('rotates an idle login against ITS brain, with ITS bearer and no cookie', async () => {
    const idleToken = bearer(nowSeconds() + 2 * DAY, 'idle');
    const idle = signInSession({
      email: 'me@example.com',
      token: idleToken,
      origin: 'https://other.example',
    })!;
    const activeToken = bearer(nowSeconds() + 20 * DAY, 'active');
    signInSession({ email: 'me@example.com', token: activeToken });
    const rotated = bearer(nowSeconds() + 30 * DAY, 'idle-rotated');
    fetchMock.mockResolvedValue(jsonRes({ token: rotated }));

    await refreshAllSessions();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://other.example/api/auth/token/refresh');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${idleToken}`);
    expect(init.credentials).toBe('omit');

    expect(sessionToken(idle.id)).toBe(rotated);
    // The login in use is not disturbed by someone else's rotation.
    expect(map.get('mantle_token')).toBe(activeToken);
  });

  it('leaves alone a login with time to spare, and one that holds no bearer', async () => {
    signInSession({ email: 'fine@example.com', token: bearer(nowSeconds() + 20 * DAY, 'fine') });
    signInSession({ email: 'active@example.com', token: bearer(nowSeconds() + 20 * DAY, 'act') });
    const refused = signInSession({ email: 'gone@example.com', token: 'x.y' })!;
    map.delete(`mantle_token:${refused.id}`);
    signInSession({ email: 'active@example.com', token: bearer(nowSeconds() + 20 * DAY, 'act') });

    await refreshAllSessions();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('one brain being down costs the others nothing', async () => {
    const down = signInSession({
      email: 'a@example.com',
      token: bearer(nowSeconds() + DAY, 'down'),
      origin: 'https://down.example',
    })!;
    const up = signInSession({
      email: 'a@example.com',
      token: bearer(nowSeconds() + DAY, 'up'),
      origin: 'https://up.example',
    })!;
    signInSession({ email: 'a@example.com', token: bearer(nowSeconds() + 20 * DAY, 'active') });
    const before = sessionToken(down.id);
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('https://down.example')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(jsonRes({ token: 'fresh.sig' })),
    );

    await expect(refreshAllSessions()).resolves.toBeUndefined();
    expect(sessionToken(down.id)).toBe(before);
    expect(sessionToken(up.id)).toBe('fresh.sig');
    expect(listSessions()).toHaveLength(3);
  });

  it('keeps the working bearer when the rotation is refused', async () => {
    const token = bearer(nowSeconds() + DAY, 'idle');
    const idle = signInSession({ email: 'idle@example.com', token })!;
    signInSession({ email: 'active@example.com', token: bearer(nowSeconds() + 20 * DAY, 'act') });
    fetchMock.mockResolvedValue(jsonRes({ error: 'nope' }, false));

    await refreshAllSessions();
    expect(sessionToken(idle.id)).toBe(token);
  });
});
