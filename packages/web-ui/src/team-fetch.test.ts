import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The member surface's transport. Its credential rules are the mirror image of
 * api-fetch's and were equally untested: cookies same-origin, bearer with
 * `credentials: 'omit'` cross-origin, because the server's CORS deliberately
 * never allows credentials — get that backwards and every cross-origin member
 * request fails in the browser rather than in a test.
 *
 * `upgradeTeamCookie` memoises at MODULE scope, so the tests that touch it
 * import the module fresh (`vi.resetModules()`) instead of sharing one memo.
 */

function stubWindow(opts: { apiBase?: string; origin?: string; storage?: Storage } = {}) {
  const origin = opts.origin ?? 'https://app.example';
  const map = new Map<string, string>();
  const storage = opts.storage ?? {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  vi.stubGlobal('window', {
    __MANTLE_ENV__: opts.apiBase === undefined ? {} : { apiBase: opts.apiBase },
    localStorage: storage,
    location: { origin, href: `${origin}/team` },
  });
  return { map: map as Map<string, string> };
}

/** A fresh copy of the module, so the cookie-upgrade memo starts empty. */
async function freshModule() {
  vi.resetModules();
  return import('./team-fetch');
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('teamTokenStore', () => {
  it('round-trips and clears the member bearer', async () => {
    const { map } = stubWindow();
    const { teamTokenStore } = await freshModule();

    expect(teamTokenStore.get()).toBeNull();
    teamTokenStore.set('member-1');
    expect(map.get('mantle_team_token')).toBe('member-1');
    expect(teamTokenStore.get()).toBe('member-1');

    teamTokenStore.clear();
    expect(teamTokenStore.get()).toBeNull();
  });

  it('is inert without a window, and survives a storage that throws', async () => {
    vi.stubGlobal('window', undefined);
    const { teamTokenStore } = await freshModule();
    expect(teamTokenStore.get()).toBeNull();
    expect(() => teamTokenStore.set('x')).not.toThrow();

    vi.unstubAllGlobals();
    stubWindow({
      storage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('SecurityError');
        },
        removeItem: () => {
          throw new Error('SecurityError');
        },
      } as unknown as Storage,
    });
    const fresh = await freshModule();
    expect(fresh.teamTokenStore.get()).toBeNull();
    expect(() => fresh.teamTokenStore.set('x')).not.toThrow();
    expect(() => fresh.teamTokenStore.clear()).not.toThrow();
  });
});

describe('teamUrl', () => {
  it('stays relative same-origin and absolute against the server origin when split', async () => {
    stubWindow();
    expect((await freshModule()).teamUrl('/api/team/chat')).toBe('/api/team/chat');

    vi.unstubAllGlobals();
    stubWindow({ apiBase: 'https://brain.example/', origin: 'https://app.example' });
    expect((await freshModule()).teamUrl('/api/team/chat')).toBe(
      'https://brain.example/api/team/chat',
    );
  });
});

describe('withTeamAuth', () => {
  it('sends cookies same-origin', async () => {
    stubWindow({ apiBase: 'https://app.example', origin: 'https://app.example' });
    const { withTeamAuth } = await freshModule();
    expect(withTeamAuth().credentials).toBe('include');
  });

  // The rule that cannot be got wrong: the server's CORS reflects the origin
  // WITHOUT Allow-Credentials, so a credentialed cross-origin response is
  // refused by the browser.
  it('omits credentials cross-origin, where the bearer IS the credential', async () => {
    stubWindow({ apiBase: 'https://brain.example', origin: 'https://app.example' });
    const { withTeamAuth, teamTokenStore } = await freshModule();
    teamTokenStore.set('member-1');

    const init = withTeamAuth();
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer member-1');
  });

  it('attaches a stored bearer same-origin too, for bearer-mode sessions', async () => {
    stubWindow();
    const { withTeamAuth, teamTokenStore } = await freshModule();
    teamTokenStore.set('member-1');

    const init = withTeamAuth();
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer member-1');
  });

  it('never overwrites an Authorization header the caller already set', async () => {
    stubWindow();
    const { withTeamAuth, teamTokenStore } = await freshModule();
    teamTokenStore.set('member-1');

    const init = withTeamAuth({ headers: { Authorization: 'Bearer explicit' } });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer explicit');
  });

  it('adds no Authorization header when nothing is stored', async () => {
    stubWindow();
    const { withTeamAuth } = await freshModule();
    expect(new Headers(withTeamAuth().headers).has('Authorization')).toBe(false);
  });
});

describe('upgradeTeamCookie', () => {
  it('is a no-op cross-origin, where the bearer is already the credential', async () => {
    stubWindow({ apiBase: 'https://brain.example', origin: 'https://app.example' });
    const { upgradeTeamCookie, teamTokenStore } = await freshModule();
    teamTokenStore.set('member-1');

    await upgradeTeamCookie();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is a no-op for a cookie-mode session with no bearer to upgrade', async () => {
    stubWindow();
    const { upgradeTeamCookie } = await freshModule();
    await upgradeTeamCookie();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the bearer once, however many callers await it', async () => {
    stubWindow();
    const { upgradeTeamCookie, teamTokenStore } = await freshModule();
    teamTokenStore.set('member-1');

    await Promise.all([upgradeTeamCookie(), upgradeTeamCookie(), upgradeTeamCookie()]);
    await upgradeTeamCookie();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe('/api/team/sso');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).credentials).toBe('include');
    expect(String((init as RequestInit).body)).toBe('tb=member-1');
  });

  it('clears the memo after a failure so a later caller retries', async () => {
    stubWindow();
    const { upgradeTeamCookie, teamTokenStore } = await freshModule();
    teamTokenStore.set('member-1');
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockRejectedValueOnce(new Error('offline'));

    await upgradeTeamCookie();
    expect(f).toHaveBeenCalledTimes(1);

    await upgradeTeamCookie();
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('teamEventStream', () => {
  it('drops the stored bearer and raises the token gate on an auth failure', async () => {
    stubWindow();
    const { teamEventStream, teamTokenStore } = await freshModule();
    teamTokenStore.set('member-1');

    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue({ status: 401, ok: false, body: null, redirected: false } as Response);

    const onUnauthorized = vi.fn();
    const stop = teamEventStream('/api/team/chat/stream', () => {}, { onUnauthorized });

    // Let the reader make its one request and read the 401.
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(teamTokenStore.get()).toBeNull();
    stop();
  });

  // The 404 fallback: streaming is off server-side. It must not retry, and the
  // consumer that registered `onExhausted` must still be told the stream ended,
  // or its spinner never comes down.
  it('ends the stream on a 404 instead of leaving the consumer waiting', async () => {
    stubWindow();
    const { teamEventStream } = await freshModule();

    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue({ status: 404, ok: false, body: null, redirected: false } as Response);

    const onExhausted = vi.fn();
    const stop = teamEventStream('/api/team/chat/stream', () => {}, {
      maxAttempts: 5,
      onExhausted,
    });

    await vi.waitFor(() => expect(onExhausted).toHaveBeenCalledTimes(1));
    expect(f).toHaveBeenCalledTimes(1);
    stop();
  });
});
