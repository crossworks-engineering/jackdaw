import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Switching between the logins a device holds. The promises under test:
 *
 *   - nothing is given up before there is something to move to: a login whose
 *     brain refuses it, or does not answer, leaves the one in use untouched;
 *   - on a same-origin box the old login's cookie is dropped BEFORE the new
 *     bearer is traded for one, because the upgrade resolves a cookie first;
 *   - a switch ends in a page load, and a sign-out lands on the next login held
 *     here rather than on the sign-in screen.
 *
 * Modules are re-imported per test: the cookie-upgrade memo, the asset token
 * and the sign-out registry are module state, which is the point.
 */

type Call = { url: string; init: RequestInit | undefined };

let map: Map<string, string>;
let calls: Call[];
let assigned: string[];
let respond: (call: Call) => { ok: boolean; status: number };

function stubWindow(opts: { apiBase?: string; vault?: boolean } = {}) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
    location: {
      protocol: 'https:',
      origin: 'https://app.example',
      href: 'https://app.example/',
      assign: (to: string) => void assigned.push(to),
    },
    __MANTLE_ENV__: opts.apiBase ? { apiBase: opts.apiBase } : {},
    ...(opts.vault
      ? { mantleDesktop: { tokenVault: { get: () => 'v', set: () => {}, clear: () => {} } } }
      : {}),
  });
}

async function fresh() {
  vi.resetModules();
  const registry = await import('./session-registry');
  const switcher = await import('./session-switch');
  return { registry, switcher };
}

const paths = () => calls.map((c) => new URL(c.url, 'https://app.example').pathname);
const bearerOf = (c: Call) => new Headers(c.init?.headers).get('Authorization');

beforeEach(() => {
  map = new Map();
  calls = [];
  assigned = [];
  respond = () => ({ ok: true, status: 200 });
  stubWindow();
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const call = { url: String(url), init };
      calls.push(call);
      return Promise.resolve(respond(call) as Response);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('switchSession · same-origin box', () => {
  it('probes with the new bearer alone, swaps, moves the cookie in order, then loads the app', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });

    expect(await switcher.switchSession(b.id)).toBe('switched');

    expect(paths()).toEqual([
      '/api/shell',
      '/api/auth/whoami',
      '/api/auth/logout',
      '/api/auth/sso',
    ]);
    expect(bearerOf(calls[0]!)).toBe('Bearer b.sig');
    expect(calls[0]!.init?.credentials).toBe('omit');
    // Whose cookie it is, asked with the cookie alone.
    expect(bearerOf(calls[1]!)).toBeNull();
    expect(calls[1]!.init?.credentials).toBe('include');
    // The cookie drop revokes nothing: it carries no bearer.
    expect(bearerOf(calls[2]!)).toBeNull();
    expect(bearerOf(calls[3]!)).toBe('Bearer b.sig');

    expect(map.get('mantle_token')).toBe('b.sig');
    expect(registry.activeSession()?.id).toBe(b.id);
    expect(registry.listSessions()).toHaveLength(2);
    expect(assigned).toEqual(['/']);
  });

  it('a refused login is marked, and the one in use is left exactly as it was', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'dead.sig' })!;
    const a = registry.signInSession({ email: 'a@example.com', token: 'a.sig' })!;
    respond = () => ({ ok: false, status: 401 });

    expect(await switcher.switchSession(b.id)).toBe('needs-sign-in');

    expect(paths()).toEqual(['/api/shell']);
    expect(map.get('mantle_token')).toBe('a.sig');
    expect(registry.activeSession()?.id).toBe(a.id);
    expect(registry.sessionToken(b.id)).toBeNull();
    expect(registry.listSessions().find((s) => s.id === b.id)?.tokenExpiresAt).toBe(0);
    expect(assigned).toEqual([]);
  });

  it('a brain that does not answer changes nothing at all', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    expect(await switcher.switchSession(b.id)).toBe('unreachable');
    expect(map.get('mantle_token')).toBe('a.sig');
    expect(registry.sessionToken(b.id)).toBe('b.sig');
    expect(assigned).toEqual([]);
  });

  it('a 500 is not a refusal: the login keeps its bearer', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
    respond = () => ({ ok: false, status: 500 });

    expect(await switcher.switchSession(b.id)).toBe('unreachable');
    expect(registry.sessionToken(b.id)).toBe('b.sig');
  });

  it("a member login's 403 from /api/shell is a live bearer, not a brain that is down", async () => {
    const { registry, switcher } = await fresh();
    const m = registry.signInSession({ email: 'm@example.com', token: 'm.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
    respond = (call) =>
      call.url.endsWith('/api/shell')
        ? ({
            ok: false,
            status: 403,
            json: () => Promise.resolve({ reason: 'member-login' }),
          } as unknown as { ok: boolean; status: number })
        : { ok: true, status: 200 };

    expect(await switcher.switchSession(m.id)).toBe('switched');
    expect(registry.activeSession()?.id).toBe(m.id);
  });

  it('a 403 that names no login role (a proxy, a WAF) changes nothing', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    const a = registry.signInSession({ email: 'a@example.com', token: 'a.sig' })!;
    respond = () =>
      ({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Forbidden' }),
      }) as unknown as { ok: boolean; status: number };

    expect(await switcher.switchSession(b.id)).toBe('unreachable');
    expect(registry.activeSession()?.id).toBe(a.id);
    expect(registry.sessionToken(b.id)).toBe('b.sig');
    expect(assigned).toEqual([]);
  });

  it("lands where the app's landing says, after the credential has moved", async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
    const seen: { to: string; token: string | undefined }[] = [];
    switcher.setSwitchLanding(async (to) => {
      seen.push({ to, token: map.get('mantle_token') });
      return '/home-for-b';
    });

    expect(await switcher.switchSession(b.id)).toBe('switched');
    expect(seen).toEqual([{ to: '/', token: 'b.sig' }]);
    expect(assigned).toEqual(['/home-for-b']);
  });

  it('a landing that throws still lands, on the path asked for', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
    const off = switcher.setSwitchLanding(() => Promise.reject(new Error('offline')));

    expect(await switcher.switchSession(b.id)).toBe('switched');
    expect(assigned).toEqual(['/']);
    off();
  });

  it('will not switch to a login held for a different brain', async () => {
    const { registry, switcher } = await fresh();
    const far = registry.signInSession({
      email: 'a@example.com',
      token: 'far.sig',
      origin: 'https://other.example',
    })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });

    expect(await switcher.switchSession(far.id)).toBe('other-brain');
    expect(calls).toEqual([]);
    expect(switcher.switchableSessions()).toEqual([]);
  });
});

describe('a client login cookie on a same-origin box (audit B23)', () => {
  /** The brain's whoami for the cookie alone says: a client is signed in. */
  const clientCookie = (call: Call) =>
    call.url.endsWith('/api/auth/whoami')
      ? ({ ok: true, status: 200, json: () => Promise.resolve({ role: 'client' }) } as unknown as {
          ok: boolean;
          status: number;
        })
      : { ok: true, status: 200 };

  it('a switch never posts logout with it, and changes nothing', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    const a = registry.signInSession({ email: 'a@example.com', token: 'a.sig' })!;
    respond = clientCookie;

    expect(await switcher.switchSession(b.id)).toBe('client-signed-in');
    expect(paths()).toEqual(['/api/shell', '/api/auth/whoami']);
    expect(registry.activeSession()?.id).toBe(a.id);
    expect(map.get('mantle_token')).toBe('a.sig');
    expect(assigned).toEqual([]);
  });

  it('forgetting the login in use does not post logout with it either', async () => {
    const { registry, switcher } = await fresh();
    const a = registry.signInSession({ email: 'a@example.com', token: 'a.sig' })!;
    respond = clientCookie;

    await switcher.forgetSession(a.id);
    expect(paths()).not.toContain('/api/auth/logout');
    expect(assigned).toEqual(['/login']);
  });

  it('cross-origin there is no cookie to ask about: whoami is never called', async () => {
    stubWindow({ apiBase: 'https://brain.example' });
    const { switcher } = await fresh();
    expect(await switcher.sameOriginCookieRole()).toBe('none');
    expect(calls).toEqual([]);
  });
});

describe('switchSession · split client', () => {
  it('touches no cookie: the bearer is the whole credential', async () => {
    stubWindow({ apiBase: 'https://brain.example' });
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });

    expect(await switcher.switchSession(b.id)).toBe('switched');
    expect(calls.map((c) => c.url)).toEqual(['https://brain.example/api/shell']);
    expect(assigned).toEqual(['/']);
  });
});

describe('leaving a login', () => {
  it('signing out of the one in use lands on the next login held here', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });

    await switcher.signOutActive();

    expect(registry.listSessions().map((s) => s.email)).toEqual(['b@example.com']);
    expect(registry.activeSession()?.id).toBe(b.id);
    expect(map.get('mantle_token')).toBe('b.sig');
    expect(assigned).toEqual(['/']);
    // a.sig was revoked on its brain; b.sig never was.
    const revoked = calls.filter((c) => c.url.endsWith('/api/auth/mobile-logout')).map(bearerOf);
    expect(revoked).toEqual(['Bearer a.sig']);
  });

  it('with no other login to land on, it goes to the sign-in screen', async () => {
    const { registry, switcher } = await fresh();
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
    await switcher.signOutActive();
    expect(registry.listSessions()).toEqual([]);
    expect(assigned).toEqual(['/login']);
  });

  it('signing out of a login at rest revokes it on ITS brain and disturbs nothing else', async () => {
    const { registry, switcher } = await fresh();
    const far = registry.signInSession({
      email: 'a@example.com',
      token: 'far.sig',
      origin: 'https://other.example',
    })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });

    await switcher.signOutSession(far.id);

    expect(calls.map((c) => c.url)).toEqual(['https://other.example/api/auth/mobile-logout']);
    expect(bearerOf(calls[0]!)).toBe('Bearer far.sig');
    expect(calls[0]!.init?.credentials).toBe('omit');
    expect(registry.listSessions()).toHaveLength(1);
    expect(map.get('mantle_token')).toBe('a.sig');
    expect(assigned).toEqual([]);
  });

  it('forgetting a login at rest tells no brain anything', async () => {
    const { registry, switcher } = await fresh();
    const b = registry.signInSession({ email: 'b@example.com', token: 'b.sig' })!;
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });

    await switcher.forgetSession(b.id);
    expect(calls).toEqual([]);
    expect(registry.listSessions().map((s) => s.email)).toEqual(['a@example.com']);
  });
});

describe('the desktop shell', () => {
  it('cannot hold several logins yet, and says so', async () => {
    stubWindow({ vault: true });
    const { registry } = await fresh();
    expect(registry.canHoldSeveralLogins()).toBe(false);
    expect(registry.setActiveSession('anything')).toBe(false);
  });
});
