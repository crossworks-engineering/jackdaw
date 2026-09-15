import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The asset token as a STORE — the half `assetUrl()` was missing.
 *
 * `assetUrl` was always correct the instant it was called; the bug was that
 * nothing called it again. The token arrives from `GET /api/shell` after the
 * first paint and then rotates on a timer, so every url resolved in between
 * was unsigned and stayed that way: images 401'd for the life of the session.
 *
 * What is pinned here is the contract the two kinds of caller depend on —
 * subscribers (React, via `useAssetUrl`) are notified on arrival and rotation
 * but not on a no-op refetch, and `assetTokenReady()` never makes a same-origin
 * caller wait for a token that is never coming.
 */

function withWindow(env: Record<string, unknown> | undefined, origin: string) {
  vi.stubGlobal('window', {
    __MANTLE_ENV__: env,
    location: { origin, href: `${origin}/pages` },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
}

const SPLIT = { apiBase: 'https://brain.example.com', serverOrigin: 'https://brain.example.com' };
const CLIENT_ORIGIN = 'https://app.example.com';

/** Fresh module per case — the token store is module state. */
async function load() {
  vi.resetModules();
  return import('./asset-url');
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('subscription', () => {
  it('notifies on arrival, so what rendered unsigned re-resolves', async () => {
    withWindow(SPLIT, CLIENT_ORIGIN);
    const { assetUrl, setAssetToken, subscribeAssetToken, assetTokenVersion } = await load();

    const before = assetTokenVersion();
    // The first paint: no token yet, so the url is unsigned and would 401.
    expect(assetUrl('/api/files/files/f1?raw=1')).toBe(
      'https://brain.example.com/api/files/files/f1?raw=1',
    );

    let notified = 0;
    subscribeAssetToken(() => {
      notified += 1;
    });
    setAssetToken('tok1');

    expect(notified).toBe(1);
    expect(assetTokenVersion()).not.toBe(before);
    expect(assetUrl('/api/files/files/f1?raw=1')).toBe(
      'https://brain.example.com/api/files/files/f1?raw=1&at=tok1',
    );
  });

  it('notifies on rotation — the anchors resolved at render must not go stale', async () => {
    withWindow(SPLIT, CLIENT_ORIGIN);
    const { setAssetToken, subscribeAssetToken, assetUrl } = await load();
    setAssetToken('tok1');

    let notified = 0;
    subscribeAssetToken(() => {
      notified += 1;
    });
    setAssetToken('tok2');

    expect(notified).toBe(1);
    expect(assetUrl('/api/export/n1')).toBe('https://brain.example.com/api/export/n1?at=tok2');
  });

  it('stays quiet when a refetch returns the same token', async () => {
    withWindow(SPLIT, CLIENT_ORIGIN);
    const { setAssetToken, subscribeAssetToken } = await load();
    setAssetToken('tok1');

    let notified = 0;
    subscribeAssetToken(() => {
      notified += 1;
    });
    // The shell query re-runs for plenty of reasons other than rotation; this
    // is the guard against re-rendering every asset on the page for nothing.
    setAssetToken('tok1');

    expect(notified).toBe(0);
  });

  it('stops notifying once unsubscribed', async () => {
    withWindow(SPLIT, CLIENT_ORIGIN);
    const { setAssetToken, subscribeAssetToken } = await load();

    let notified = 0;
    const off = subscribeAssetToken(() => {
      notified += 1;
    });
    off();
    setAssetToken('tok1');

    expect(notified).toBe(0);
  });
});

describe('assetTokenReady', () => {
  it('resolves immediately same-origin, where no token is ever published', async () => {
    // The case that would have been a hang rather than a bug fix: same-origin
    // authenticates by cookie, `setAssetToken` is never called with a value,
    // and an imperative caller awaiting one would wait out the timeout on
    // every single scene load.
    withWindow({}, 'https://mantle.example.com');
    const { assetTokenReady } = await load();

    await expect(
      Promise.race([assetTokenReady(), Promise.reject(new Error('waited'))]),
    ).resolves.toBeUndefined();
  });

  it('resolves immediately when a token is already held', async () => {
    withWindow(SPLIT, CLIENT_ORIGIN);
    const { assetTokenReady, setAssetToken } = await load();
    setAssetToken('tok1');

    await expect(
      Promise.race([assetTokenReady(), Promise.reject(new Error('waited'))]),
    ).resolves.toBeUndefined();
  });

  it('waits for the token, then lets the fetch through signed', async () => {
    withWindow(SPLIT, CLIENT_ORIGIN);
    const { assetTokenReady, setAssetToken, assetUrl } = await load();

    let released = false;
    const ready = assetTokenReady().then(() => {
      released = true;
      return assetUrl('/api/files/files/f1?raw=1');
    });

    // Still parked: this is the beat in which the canvas used to fetch
    // unsigned and cache a broken-image placeholder it never retried.
    await Promise.resolve();
    expect(released).toBe(false);

    setAssetToken('tok1');
    await expect(ready).resolves.toBe('https://brain.example.com/api/files/files/f1?raw=1&at=tok1');
  });

  it('gives up after the timeout rather than hanging forever', async () => {
    vi.useFakeTimers();
    withWindow(SPLIT, CLIENT_ORIGIN);
    const { assetTokenReady } = await load();

    let released = false;
    const ready = assetTokenReady().then(() => {
      released = true;
    });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(released).toBe(false);

    // A shell that never answers must degrade to today's behaviour — fetch
    // unsigned and 401 — not to a canvas that sits blank with no error.
    await vi.advanceTimersByTimeAsync(2_000);
    await ready;
    expect(released).toBe(true);
  });

  it('does not release a waiter when the token is cleared by sign-out', async () => {
    vi.useFakeTimers();
    withWindow(SPLIT, CLIENT_ORIGIN);
    const { assetTokenReady, setAssetToken } = await load();
    setAssetToken('tok1');
    setAssetToken(null);

    let released = false;
    void assetTokenReady().then(() => {
      released = true;
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(released).toBe(false);
  });
});
