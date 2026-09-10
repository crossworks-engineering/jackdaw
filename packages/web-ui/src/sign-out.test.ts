import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Signing out has to forget the session, and the session is more than the
 * credential. The bug these cover is a privacy one and it is silent: the next
 * person to sign in on the same tab was painted the previous one's profile and
 * messages from a cache nobody cleared.
 *
 * The module is re-imported per test because everything at stake here IS module
 * state — a shared registry and two singletons — which is the whole point.
 */

async function freshModule() {
  vi.resetModules();
  return import('./sign-out');
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 204 } as Response)),
  );
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  vi.stubGlobal('window', {
    localStorage: globalThis.localStorage,
    location: { origin: 'https://x.test' },
  });
  vi.stubGlobal('document', { cookie: '' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('onSignOut', () => {
  it('runs every registered reset', async () => {
    const { onSignOut, performSignOut } = await freshModule();
    const a = vi.fn();
    const b = vi.fn();
    onSignOut(a);
    onSignOut(b);

    await performSignOut();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('stops running one that unregistered', async () => {
    // A remounted provider must not leave a callback closing over a dead query
    // client behind — that is what the effect's cleanup is for.
    const { onSignOut, performSignOut } = await freshModule();
    const stale = vi.fn();
    const unregister = onSignOut(stale);
    unregister();

    await performSignOut();
    expect(stale).not.toHaveBeenCalled();
  });

  it('registers a given callback once, however many times it is added', async () => {
    // A Set, so a provider that re-registers without cleaning up cannot make
    // the cache clear twice.
    const { onSignOut, performSignOut } = await freshModule();
    const reset = vi.fn();
    onSignOut(reset);
    onSignOut(reset);

    await performSignOut();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one reset throws', async () => {
    // One listener failing must not leave the rest of the session on the
    // machine — which is the entire job here.
    const { onSignOut, performSignOut } = await freshModule();
    const boom = vi.fn(() => {
      throw new Error('nope');
    });
    const after = vi.fn();
    onSignOut(boom);
    onSignOut(after);

    await expect(performSignOut()).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledTimes(1);
  });
});

describe('performSignOut', () => {
  it('clears local state even when the network call fails', async () => {
    // A sign-out that could not reach the brain must still leave nothing of
    // this session behind locally.
    const { onSignOut, performSignOut } = await freshModule();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const reset = vi.fn();
    onSignOut(reset);

    await expect(performSignOut()).resolves.toBeUndefined();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('forgets the asset token, so the next session does not sign URLs with it', async () => {
    // SPLIT topology on purpose: same-origin returns the path untouched
    // whatever the token is, so the assertion would pass without the fix and
    // prove nothing. Cross-origin is the shape where the token actually rides
    // in the URL — and so the shape where the previous owner's token leaking
    // into the next session's <img> srcs is a real thing.
    vi.stubGlobal('window', {
      __MANTLE_ENV__: { apiBase: 'https://brain.example', serverOrigin: 'https://brain.example' },
      location: { origin: 'https://app.example', href: 'https://app.example/files' },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
    vi.resetModules();
    const { performSignOut } = await import('./sign-out');
    const { assetUrl, setAssetToken } = await import('./asset-url');

    setAssetToken('previous-owners-token');
    // The token really is in the URL before the sign-out — otherwise the
    // assertion below is vacuous.
    expect(assetUrl('/api/files/files/abc?raw=1')).toContain('at=previous-owners-token');

    await performSignOut();
    expect(assetUrl('/api/files/files/abc?raw=1')).not.toContain('previous-owners-token');
  });
});
