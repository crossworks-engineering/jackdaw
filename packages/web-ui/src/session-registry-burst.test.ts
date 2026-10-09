import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The burst: one login listed dozens of times, every row nameless, every row
 * holding a copy of the same bearer, all added within a few milliseconds. Seen
 * on admin and member browsers with the same login open in two tabs.
 *
 * The cause, pinned below: writing the list fires SESSIONS_CHANGED_EVENT
 * synchronously, and `useSessions` answers it by reading the list, which
 * reconciles. `reconcile` used to write the list BEFORE the active id, so that
 * inner call saw a bearer with no active row, listed it again, and its write
 * fired the event again. A second tab's storage events can open the same gap.
 *
 * `environment: 'node'`. A TAB here is its own module instance and its own
 * `window` (with real listeners) over ONE shared storage, the way two tabs of a
 * browser share localStorage. `window` is swapped to the tab doing the work.
 */

type Listener = () => void;

function sharedStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const tabs: Tab[] = [];
  let current: Tab | null = null;
  // A write in one tab is a `storage` event in every other, delivered later.
  const changed = () => {
    for (const t of tabs) if (t !== current) t.pendingStorageEvents += 1;
  };
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
      changed();
    },
    removeItem: (k: string) => {
      if (map.delete(k)) changed();
    },
  };
  return {
    map,
    storage,
    tabs,
    setCurrent: (t: Tab | null) => {
      current = t;
    },
  };
}

type Shared = ReturnType<typeof sharedStorage>;
type Registry = typeof import('./session-registry');
type TokenStore = typeof import('./token-store');

type Tab = {
  registry: Registry;
  tokenStore: TokenStore['tokenStore'];
  window: Record<string, unknown>;
  pendingStorageEvents: number;
  /** How many times this tab's list screen re-read the registry. */
  reads: number;
};

/** A new tab: fresh modules (a page load), a window with real listeners, and
 *  the account menu's `useSessions` subscribed to both events. */
async function openTab(
  shared: Shared,
  opts: { listen?: boolean; vault?: Record<string, unknown> } = {},
): Promise<Tab> {
  const listeners = new Map<string, Listener[]>();
  const win: Record<string, unknown> = {
    localStorage: shared.storage,
    location: {
      protocol: 'https:',
      origin: 'https://brain.example',
      href: 'https://brain.example/',
    },
    __MANTLE_ENV__: {},
    ...(opts.vault ? { mantleDesktop: { tokenVault: opts.vault } } : {}),
    addEventListener: (type: string, fn: Listener) =>
      void listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: () => {},
    // A browser runs listeners synchronously and reports, rather than throws,
    // what they throw. Nesting is capped so the old unbounded recursion ends.
    dispatchEvent: (e: Event) => {
      if (depth > 200) return true;
      depth += 1;
      try {
        for (const fn of listeners.get(e.type) ?? []) {
          try {
            fn();
          } catch {
            /* reported, not thrown */
          }
        }
      } finally {
        depth -= 1;
      }
      return true;
    },
  };
  let depth = 0;
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { cookie: '' });
  vi.resetModules();
  const registry = await import('./session-registry');
  const { tokenStore } = await import('./token-store');
  const tab: Tab = { registry, tokenStore, window: win, pendingStorageEvents: 0, reads: 0 };
  shared.tabs.push(tab);
  if (opts.listen !== false) {
    // What useSessions' `update` does with either event.
    const update = () => {
      tab.reads += 1;
      const activeId = registry.activeSession()?.id ?? null;
      for (const s of registry.listSessions()) {
        void (s.id === activeId);
        registry.sessionToken(s.id);
      }
    };
    (win.addEventListener as (t: string, f: Listener) => void)(
      registry.SESSIONS_CHANGED_EVENT,
      update,
    );
    (win.addEventListener as (t: string, f: Listener) => void)('storage', update);
  }
  return tab;
}

/** Run `fn` as `tab`: its window, its modules. */
function inTab<T>(shared: Shared, tab: Tab, fn: (t: Tab) => T): T {
  vi.stubGlobal('window', tab.window);
  shared.setCurrent(tab);
  try {
    return fn(tab);
  } finally {
    shared.setCurrent(null);
  }
}

/** Deliver every queued `storage` event, tab by tab, until none are left. */
function settle(shared: Shared) {
  for (let round = 0; round < 50; round++) {
    const waiting = shared.tabs.filter((t) => t.pendingStorageEvents > 0);
    if (waiting.length === 0) return;
    for (const t of waiting) {
      t.pendingStorageEvents = 0;
      inTab(shared, t, () =>
        (t.window.dispatchEvent as (e: Event) => boolean)(new Event('storage')),
      );
    }
  }
  throw new Error('storage events never settled');
}

const rows = (shared: Shared) =>
  JSON.parse(shared.map.get('mantle_sessions') ?? '[]') as { id: string; email: string }[];
const tokenKeys = (shared: Shared) =>
  [...shared.map.keys()].filter((k) => k.startsWith('mantle_token:'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('one bearer, one row', () => {
  it('a list screen that re-reads on every change does not multiply the held bearer', async () => {
    const shared = sharedStorage({ mantle_token: 'held.sig' });
    const tab = await openTab(shared);

    inTab(shared, tab, (t) => t.tokenStore.get());

    expect(rows(shared)).toHaveLength(1);
    expect(tokenKeys(shared)).toEqual([`mantle_token:${rows(shared)[0]!.id}`]);
    expect(shared.map.get('mantle_active_session')).toBe(rows(shared)[0]!.id);
    expect(tab.reads).toBeGreaterThan(0); // the listener did run, mid-write
  });

  it('two tabs of the same login, reconciling over each other, settle on one row', async () => {
    const shared = sharedStorage({ mantle_token: 'held.sig' });
    const a = await openTab(shared);
    const b = await openTab(shared);

    inTab(shared, a, (t) => t.tokenStore.get());
    inTab(shared, b, (t) => t.tokenStore.get());
    settle(shared);
    inTab(shared, a, (t) => t.tokenStore.get());
    inTab(shared, b, (t) => t.tokenStore.get());

    expect(rows(shared)).toHaveLength(1);
    expect(tokenKeys(shared)).toHaveLength(1);
  });

  it('a tab that runs between another tab’s writes adopts the row instead of minting one', async () => {
    const shared = sharedStorage({ mantle_token: 'held.sig' });
    const a = await openTab(shared, { listen: false });
    const b = await openTab(shared, { listen: false });
    // Tab B runs the moment tab A has written the active id, before A's list.
    const setItem = shared.storage.setItem;
    let interleaved = false;
    shared.storage.setItem = (k: string, v: string) => {
      setItem(k, v);
      if (k === 'mantle_active_session' && !interleaved) {
        interleaved = true;
        inTab(shared, b, (t) => t.tokenStore.get());
        vi.stubGlobal('window', a.window);
        shared.setCurrent(a);
      }
    };
    inTab(shared, a, (t) => t.tokenStore.get());
    shared.storage.setItem = setItem;
    expect(interleaved).toBe(true);

    // The race may leave the active id naming the losing tab's row; the next
    // read in either tab points it at the row that holds the bearer.
    inTab(shared, a, (t) => t.tokenStore.get());
    inTab(shared, b, (t) => t.tokenStore.get());
    expect(rows(shared)).toHaveLength(1);
    expect(shared.map.get('mantle_active_session')).toBe(rows(shared)[0]!.id);

    // And the next page load clears the losing tab's orphan bearer copy.
    const c = await openTab(shared, { listen: false });
    inTab(shared, c, (t) => t.tokenStore.get());
    expect(tokenKeys(shared)).toEqual([`mantle_token:${rows(shared)[0]!.id}`]);
  });

  it('a missing active id with the bearer already listed points at that row', async () => {
    const shared = sharedStorage({
      mantle_token: 'held.sig',
      'mantle_token:r1': 'held.sig',
      mantle_sessions: JSON.stringify([
        {
          id: 'r1',
          origin: 'https://brain.example',
          email: 'a@example.com',
          addedAt: 1,
          lastUsedAt: 1,
        },
      ]),
    });
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => {
      expect(t.registry.activeSession()?.email).toBe('a@example.com');
    });
    expect(rows(shared)).toHaveLength(1);
  });

  it('signing in with the list screen open adds exactly one row', async () => {
    const shared = sharedStorage();
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => {
      t.registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
      t.registry.signInSession({ email: 'b@example.com', token: 'b.sig' });
      t.tokenStore.get();
    });
    expect(rows(shared).map((r) => r.email)).toEqual(['a@example.com', 'b@example.com']);
    expect(tokenKeys(shared)).toHaveLength(2);
  });

  it('/api/shell folds a nameless row that holds the active bearer into the active one', async () => {
    const shared = sharedStorage();
    const tab = await openTab(shared);
    const extra = {
      id: 'copy',
      origin: 'https://brain.example',
      email: '',
      addedAt: 5,
      lastUsedAt: 5,
    };
    inTab(shared, tab, (t) => {
      t.registry.signInSession({ email: 'a@example.com', token: 'a.sig' });
      // A copy that arrives after this page's load-time repair has run.
      shared.map.set('mantle_sessions', JSON.stringify([...rows(shared), extra]));
      shared.map.set('mantle_token:copy', 'a.sig');
      t.registry.recordActiveIdentity({ email: 'a@example.com' });
    });
    expect(rows(shared).map((r) => r.email)).toEqual(['a@example.com']);
    expect(shared.map.has('mantle_token:copy')).toBe(false);
  });
});

describe('repair on load', () => {
  /** What a member browser was found holding: the real login, 43 nameless
   *  copies of its bearer from one burst, and orphan bearer keys. */
  function burstSeed(opts: { activeIsCopy?: boolean } = {}) {
    const seed: Record<string, string> = { mantle_token: 'held.sig' };
    const list = [
      {
        id: 'real',
        origin: 'https://brain.example',
        email: 'm@example.com',
        role: 'member',
        addedAt: 1000,
        lastUsedAt: 1000,
      },
    ];
    seed['mantle_token:real'] = 'held.sig';
    for (let i = 0; i < 43; i++) {
      list.push({
        id: `copy${i}`,
        origin: 'https://brain.example',
        email: '',
        role: null as unknown as string,
        addedAt: 1000 + i / 10,
        lastUsedAt: 1000,
      });
      seed[`mantle_token:copy${i}`] = 'held.sig';
    }
    for (let i = 0; i < 45; i++) seed[`mantle_token:orphan${i}`] = 'held.sig';
    seed.mantle_sessions = JSON.stringify(list);
    seed.mantle_active_session = opts.activeIsCopy ? 'copy7' : 'real';
    return seed;
  }

  it('drops the copies and the orphan keys, and keeps the login signed in', async () => {
    const shared = sharedStorage(burstSeed());
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => {
      expect(t.tokenStore.get()).toBe('held.sig');
      expect(t.registry.listSessions().map((s) => s.id)).toEqual(['real']);
      expect(t.registry.activeSession()?.id).toBe('real');
    });
    expect(tokenKeys(shared)).toEqual(['mantle_token:real']);
    expect(shared.map.get('mantle_token')).toBe('held.sig');
  });

  it('when the active id names a copy, the row with the login becomes active', async () => {
    const shared = sharedStorage(burstSeed({ activeIsCopy: true }));
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => {
      expect(t.registry.activeSession()?.id).toBe('real');
      expect(t.registry.listSessions()).toHaveLength(1);
    });
  });

  it('never drops a row that is the only holder of its bearer, named or not', async () => {
    const list = [
      {
        id: 'named',
        origin: 'https://brain.example',
        email: 'a@example.com',
        addedAt: 1,
        lastUsedAt: 1,
      },
      { id: 'lone', origin: 'https://brain.example', email: '', addedAt: 2, lastUsedAt: 2 },
      { id: 'twinA', origin: 'https://brain.example', email: '', addedAt: 3, lastUsedAt: 3 },
      { id: 'twinB', origin: 'https://brain.example', email: '', addedAt: 4, lastUsedAt: 4 },
    ];
    const shared = sharedStorage({
      mantle_token: 'a.sig',
      mantle_active_session: 'named',
      mantle_sessions: JSON.stringify(list),
      'mantle_token:named': 'a.sig',
      'mantle_token:lone': 'lone.sig',
      'mantle_token:twinA': 'twin.sig',
      'mantle_token:twinB': 'twin.sig',
    });
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => {
      // Two nameless rows sharing a bearer keep one of them: the first listed.
      expect(t.registry.listSessions().map((s) => s.id)).toEqual(['named', 'lone', 'twinA']);
      expect(t.registry.sessionToken('lone')).toBe('lone.sig');
      expect(t.registry.sessionToken('twinA')).toBe('twin.sig');
    });
    expect(shared.map.has('mantle_token:twinB')).toBe(false);
  });

  it('never drops a row that has a login, even one sharing a bearer', async () => {
    const list = [
      {
        id: 'a',
        origin: 'https://brain.example',
        email: 'a@example.com',
        addedAt: 1,
        lastUsedAt: 1,
      },
      {
        id: 'b',
        origin: 'https://other.example',
        email: 'a@example.com',
        addedAt: 2,
        lastUsedAt: 2,
      },
    ];
    const shared = sharedStorage({
      mantle_token: 'a.sig',
      mantle_active_session: 'a',
      mantle_sessions: JSON.stringify(list),
      'mantle_token:a': 'a.sig',
      'mantle_token:b': 'a.sig',
    });
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => expect(t.registry.listSessions()).toHaveLength(2));
  });

  it('drops a nameless row that holds no bearer, which can only say "sign in again"', async () => {
    const list = [
      {
        id: 'a',
        origin: 'https://brain.example',
        email: 'a@example.com',
        addedAt: 1,
        lastUsedAt: 1,
      },
      {
        id: 'dead',
        origin: 'https://brain.example',
        email: '',
        addedAt: 2,
        lastUsedAt: 2,
        tokenExpiresAt: 0,
      },
      {
        id: 'named-dead',
        origin: 'https://brain.example',
        email: 'b@example.com',
        addedAt: 3,
        lastUsedAt: 3,
        tokenExpiresAt: 0,
      },
    ];
    const shared = sharedStorage({
      mantle_token: 'a.sig',
      mantle_active_session: 'a',
      mantle_sessions: JSON.stringify(list),
      'mantle_token:a': 'a.sig',
    });
    const tab = await openTab(shared);
    // A named row without a bearer stays: it is a login to sign back in to.
    inTab(shared, tab, (t) =>
      expect(t.registry.listSessions().map((s) => s.id)).toEqual(['a', 'named-dead']),
    );
  });

  it('runs once per page load, not on every read', async () => {
    const shared = sharedStorage({ mantle_token: 'held.sig' });
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => t.tokenStore.get());
    // e.g. another tab mid-write, holding the very bearer a sweep would take
    shared.map.set('mantle_token:later', 'held.sig');
    inTab(shared, tab, (t) => t.tokenStore.get());
    expect(shared.map.has('mantle_token:later')).toBe(true);
  });
});

/** A bearer of the brain's shape, naming its login (`uid`) and its own id. */
function tok(uid: string, jti: string): string {
  const payload = btoa(JSON.stringify({ uid, jti, exp: 2_000_000_000 }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${payload}.sig`;
}

const row = (id: string, email: string, origin = 'https://brain.example') => ({
  id,
  origin,
  email,
  addedAt: 1,
  lastUsedAt: 1,
});

describe('repair on load · copies whose bearer was rotated', () => {
  it('drops a nameless row holding another bearer for a listed login, and only at that brain', async () => {
    // Idle rows are refreshed too, so each copy can hold a rotation of its own.
    const seed: Record<string, string> = {
      mantle_token: tok('u1', 'live'),
      mantle_active_session: 'real',
      mantle_sessions: JSON.stringify([
        row('real', 'm@example.com'),
        row('copyA', ''),
        row('copyB', ''),
        row('other', 'o@example.com'),
        row('far', '', 'https://other.example'),
      ]),
      'mantle_token:real': tok('u1', 'live'),
      'mantle_token:copyA': tok('u1', 'old1'),
      'mantle_token:copyB': tok('u1', 'old2'),
      'mantle_token:other': tok('u2', 'x'),
      // The same login id at ANOTHER brain is another login.
      'mantle_token:far': tok('u1', 'far'),
    };
    const shared = sharedStorage(seed);
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => {
      expect(t.registry.listSessions().map((s) => s.id)).toEqual(['real', 'other', 'far']);
      expect(t.tokenStore.get()).toBe(tok('u1', 'live'));
    });
    expect(tokenKeys(shared).sort()).toEqual(
      ['mantle_token:far', 'mantle_token:other', 'mantle_token:real'].sort(),
    );
  });

  it('when the active row is a rotated copy, the named row takes over its live bearer', async () => {
    const shared = sharedStorage({
      mantle_token: tok('u1', 'newest'),
      mantle_active_session: 'copy',
      mantle_sessions: JSON.stringify([row('real', 'm@example.com'), row('copy', '')]),
      'mantle_token:real': tok('u1', 'rotated-away'),
      'mantle_token:copy': tok('u1', 'newest'),
    });
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => {
      expect(t.registry.activeSession()?.id).toBe('real');
      expect(t.registry.sessionToken('real')).toBe(tok('u1', 'newest'));
      expect(t.tokenStore.get()).toBe(tok('u1', 'newest'));
      expect(t.registry.listSessions()).toHaveLength(1);
    });
  });

  it('/api/shell folds a rotated nameless copy into the active login', async () => {
    const shared = sharedStorage();
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => {
      t.registry.signInSession({ email: 'a@example.com', token: tok('u1', 'a') });
      shared.map.set('mantle_sessions', JSON.stringify([...rows(shared), row('copy', '')]));
      shared.map.set('mantle_token:copy', tok('u1', 'b'));
      t.registry.recordActiveIdentity({ email: 'a@example.com' });
    });
    expect(rows(shared).map((r) => r.email)).toEqual(['a@example.com']);
  });
});

describe('repair on load · what the sweep leaves alone', () => {
  it('sweeps nothing against a list it cannot read', async () => {
    const shared = sharedStorage({
      mantle_token: 'held.sig',
      mantle_sessions: '{not json',
      'mantle_token:a': 'held.sig',
      'mantle_token:b': 'other.sig',
    });
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => expect(t.tokenStore.get()).toBe('held.sig'));
    expect(shared.map.has('mantle_token:a')).toBe(true);
    expect(shared.map.has('mantle_token:b')).toBe(true);
  });

  it('keeps an orphan key whose bearer this device holds nowhere else', async () => {
    const shared = sharedStorage({
      mantle_token: 'held.sig',
      mantle_active_session: 'real',
      mantle_sessions: JSON.stringify([row('real', 'm@example.com')]),
      'mantle_token:real': 'held.sig',
      'mantle_token:copy-of-held': 'held.sig',
      'mantle_token:unknown': 'unknown.sig',
    });
    const tab = await openTab(shared);
    inTab(shared, tab, (t) => t.tokenStore.get());
    expect(tokenKeys(shared).sort()).toEqual(['mantle_token:real', 'mantle_token:unknown']);
  });
});

describe('repair on load · the desktop keychain', () => {
  function scopedVault(slots: Record<string, string>) {
    const map = new Map(Object.entries(slots));
    const keptOnly: string[][] = [];
    const v = {
      slots: map,
      keptOnly,
      get: () => null,
      set: () => {},
      clear: () => {},
      getFor: (id: string) => map.get(id) ?? null,
      setFor: (id: string, t: string) => void map.set(id, t),
      clearFor: (id: string) => void map.delete(id),
      adopt: (id: string) => map.get(id) ?? null,
      keepOnly: (ids: string[]) => {
        keptOnly.push([...ids].sort());
        for (const id of [...map.keys()]) if (!ids.includes(id)) map.delete(id);
      },
    };
    return v;
  }

  it('clears the copies’ slots and asks the shell to drop slots no row names', async () => {
    const vault = scopedVault({
      real: tok('u1', 'live'),
      copy1: tok('u1', 'live'),
      copy2: tok('u1', 'rotated'),
      orphan: tok('u1', 'live'),
    });
    const shared = sharedStorage({
      mantle_active_session: 'real',
      mantle_sessions: JSON.stringify([
        row('real', 'm@example.com'),
        row('copy1', ''),
        row('copy2', ''),
      ]),
    });
    const tab = await openTab(shared, { vault });
    inTab(shared, tab, (t) => {
      expect(t.tokenStore.get()).toBe(tok('u1', 'live'));
      expect(t.registry.listSessions().map((s) => s.id)).toEqual(['real']);
    });
    expect(vault.keptOnly).toEqual([['real']]);
    expect([...vault.slots.keys()]).toEqual(['real']);
    expect(tokenKeys(shared)).toEqual([]);
  });

  it('an older shell without the call: copies still go, orphans simply stay', async () => {
    const vault = scopedVault({ real: tok('u1', 'live'), copy1: tok('u1', 'live'), orphan: 'x' });
    delete (vault as Partial<typeof vault>).keepOnly;
    const shared = sharedStorage({
      mantle_active_session: 'real',
      mantle_sessions: JSON.stringify([row('real', 'm@example.com'), row('copy1', '')]),
    });
    const tab = await openTab(shared, { vault });
    inTab(shared, tab, (t) => expect(t.registry.listSessions()).toHaveLength(1));
    expect([...vault.slots.keys()].sort()).toEqual(['orphan', 'real']);
  });
});
