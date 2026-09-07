import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maybeRefreshToken } from './token-refresh';
import { tokenStore } from './token-store';

/**
 * Opportunistic bearer rotation, run from the shell's boot path. Everything
 * here is a decision NOT to act — no token, an unreadable one, one with plenty
 * of life left — and the one case that does act must not lose the working token
 * when the rotation fails. Untested until now, which meant "an active browser
 * never expires" was a claim in a comment rather than a fact.
 */

const DAY = 24 * 60 * 60;

/** A bearer of this module's shape: base64url(payload) + '.' + signature. Note
 *  `tokenExpEpoch` slices at the LAST dot, so everything before it is payload. */
function bearer(expEpochSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expEpochSeconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${payload}.signature`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

let stored: string | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stored = null;
  vi.spyOn(tokenStore, 'get').mockImplementation(() => stored);
  vi.spyOn(tokenStore, 'set').mockImplementation((t: string) => {
    stored = t;
  });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  // withAuth()/apiUrl() read the runtime env off window.
  vi.stubGlobal('window', {
    __MANTLE_ENV__: {},
    location: { origin: 'https://app.example', href: 'https://app.example/' },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const jsonRes = (body: unknown, ok = true) =>
  ({ ok, json: () => Promise.resolve(body) }) as unknown as Response;

describe('maybeRefreshToken · when it declines to act', () => {
  it('does nothing when no bearer is stored', async () => {
    await maybeRefreshToken();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when the bearer has more than seven days left', async () => {
    stored = bearer(nowSeconds() + 8 * DAY);
    await maybeRefreshToken();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when the payload carries no exp, or will not decode', async () => {
    for (const token of [
      bearer(NaN).replace(/^[^.]+/, btoa(JSON.stringify({ sub: 'nope' }))),
      'not-base64-at-all.signature',
      'nodotatall',
      '.signature',
    ]) {
      stored = token;
      await maybeRefreshToken();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('maybeRefreshToken · when it rotates', () => {
  it('rotates a bearer inside the seven-day window and stores the new one', async () => {
    stored = bearer(nowSeconds() + 3 * DAY);
    fetchMock.mockResolvedValue(jsonRes({ token: 'rotated' }));

    await maybeRefreshToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/auth/token/refresh');
    expect((init as RequestInit).method).toBe('POST');
    expect(stored).toBe('rotated');
  });

  it('rotates an already-expired bearer rather than giving up on it', async () => {
    stored = bearer(nowSeconds() - DAY);
    fetchMock.mockResolvedValue(jsonRes({ token: 'rotated' }));
    await maybeRefreshToken();
    expect(stored).toBe('rotated');
  });

  // Each of these must leave the working token exactly where it was: it is
  // still valid until its real expiry, and the next boot retries.
  it('keeps the current token when the rotation is refused', async () => {
    stored = bearer(nowSeconds() + DAY);
    const before = stored;
    fetchMock.mockResolvedValue(jsonRes({ error: 'nope' }, false));
    await maybeRefreshToken();
    expect(stored).toBe(before);
  });

  it('keeps the current token when the response carries no new one', async () => {
    stored = bearer(nowSeconds() + DAY);
    const before = stored;
    fetchMock.mockResolvedValue(jsonRes({}));
    await maybeRefreshToken();
    expect(stored).toBe(before);
  });

  it('keeps the current token, and does not throw, when the network is down', async () => {
    stored = bearer(nowSeconds() + DAY);
    const before = stored;
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(maybeRefreshToken()).resolves.toBeUndefined();
    expect(stored).toBe(before);
  });
});
