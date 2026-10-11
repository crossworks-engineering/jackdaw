import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Where a dead bearer goes (bounceToLogin). Phase W5c: a held login is a
 * login, so every one goes to /login?next=…, back to where it was. A row an
 * older build stored with a `role` (a desktop client login) is no exception:
 * the old field is ignored, never an error.
 */

let map: Map<string, string>;
let hrefs: string[];

function vaultStub() {
  const slots = new Map<string, string>();
  return {
    slots,
    get: () => null,
    set: () => {},
    clear: () => {},
    getFor: (id: string) => slots.get(id) ?? null,
    setFor: (id: string, t: string) => void slots.set(id, t),
    clearFor: (id: string) => void slots.delete(id),
    adopt: () => null,
  };
}

function stub(opts: { desktop?: ReturnType<typeof vaultStub> } = {}) {
  const location = {
    protocol: opts.desktop ? 'http:' : 'https:',
    origin: opts.desktop ? 'http://127.0.0.1:4173' : 'https://app.example',
    href: '',
    pathname: '/pages/abc',
    search: '?tab=1',
  };
  Object.defineProperty(location, 'href', {
    get: () => hrefs.at(-1) ?? '',
    set: (v: string) => void hrefs.push(v),
  });
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
    location,
    __MANTLE_ENV__: opts.desktop ? { apiBase: 'https://brain.example' } : {},
    ...(opts.desktop ? { mantleDesktop: { tokenVault: opts.desktop } } : {}),
  });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false, status: 401, redirected: false } as Response)),
  );
}

async function fresh() {
  vi.resetModules();
  const registry = await import('./session-registry');
  const api = await import('./api-fetch');
  const { tokenStore } = await import('./token-store');
  return { registry, api, tokenStore };
}

/** A 401 from any route, then the bounce's flush-then-navigate. */
async function bounce(api: Awaited<ReturnType<typeof fresh>>['api']) {
  await expect(api.apiFetch('/api/shell')).rejects.toThrow();
  await vi.waitFor(() => expect(hrefs.length).toBeGreaterThan(0));
  return hrefs.at(-1);
}

const LOGIN_NEXT = `/login?next=${encodeURIComponent('/pages/abc?tab=1')}`;

beforeEach(() => {
  map = new Map();
  hrefs = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a held desktop login whose bearer dies', () => {
  it('goes to /login, back to where it was; the row is kept, with no bearer', async () => {
    const vault = vaultStub();
    stub({ desktop: vault });
    const { registry, api } = await fresh();
    registry.signInSession({ email: 'admin@example.com', token: 'admin.sig' });
    const c = registry.signInSession({ email: 'c@example.com', token: 'c.sig' })!;

    expect(await bounce(api)).toBe(LOGIN_NEXT);
    const row = registry.listSessions().find((s) => s.id === c.id)!;
    expect(row).toMatchObject({ email: 'c@example.com', tokenExpiresAt: 0 });
    expect(vault.slots.has(c.id)).toBe(false);
    expect(registry.activeSession()).toBeNull();
    expect(registry.listSessions()).toHaveLength(2);
  });

  it('a row an older build stored with a role goes to /login too', async () => {
    stub({ desktop: vaultStub() });
    const { registry, api } = await fresh();
    const c = registry.signInSession({ email: 'c@example.com', token: 'c.sig' })!;
    // What a build before W5c wrote: the row with its role.
    const raw = JSON.parse(map.get(registry.SESSIONS_STORAGE_KEY) ?? '[]') as object[];
    map.set(
      registry.SESSIONS_STORAGE_KEY,
      JSON.stringify(raw.map((r) => ({ ...r, role: 'client' }))),
    );
    expect(registry.listSessions().find((s) => s.id === c.id)?.email).toBe('c@example.com');
    expect(await bounce(api)).toBe(LOGIN_NEXT);
  });

  it('a new sign-in lands in that same row, not a second one, and stores no role', async () => {
    stub({ desktop: vaultStub() });
    const { registry, api, tokenStore } = await fresh();
    const c = registry.signInSession({ email: 'c@example.com', token: 'old.sig' })!;
    await bounce(api);

    tokenStore.signIn({ email: 'C@example.com', token: 'new.sig' });

    expect(registry.listSessions().map((s) => s.id)).toEqual([c.id]);
    expect(registry.activeSession()?.id).toBe(c.id);
    expect(registry.sessionToken(c.id)).toBe('new.sig');
    expect(registry.listSessions()[0]).not.toHaveProperty('role');
  });
});

describe('the browser', () => {
  it('a dead bearer goes to /login?next=… exactly as before', async () => {
    stub();
    const { registry, api } = await fresh();
    registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
    expect(await bounce(api)).toBe(LOGIN_NEXT);
  });

  it('a cookie session (no login held) goes to /login?next=…, as before', async () => {
    stub();
    const { api } = await fresh();
    expect(await bounce(api)).toBe(LOGIN_NEXT);
  });
});
