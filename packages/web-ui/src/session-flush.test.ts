import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The last chance an editor gets to save before an expired session takes the
 * page away. Everything here is about NOT making it worse: the session is
 * already gone, so a flush that throws or hangs must not leave someone staring
 * at a screen that will never move.
 *
 * Re-imported per test because the registry is module state, which is the point
 * of it.
 */

async function freshModule() {
  vi.resetModules();
  return import('./session-flush');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runSessionFlushes', () => {
  it('runs every registered flush', async () => {
    const { onSessionBounce, runSessionFlushes } = await freshModule();
    const a = vi.fn();
    const b = vi.fn();
    onSessionBounce(a);
    onSessionBounce(b);

    await runSessionFlushes();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returns immediately when nothing is registered', async () => {
    // The common case by far — no editor open. It must not cost the bounce a
    // timer tick.
    const { runSessionFlushes } = await freshModule();
    await expect(runSessionFlushes()).resolves.toBeUndefined();
  });

  it('waits for an async flush to finish before settling', async () => {
    // The whole reason the bounce awaits: a draft PUT is in flight and the
    // navigation would otherwise cut it off.
    const { onSessionBounce, runSessionFlushes } = await freshModule();
    let landed = false;
    onSessionBounce(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            landed = true;
            resolve();
          }, 200),
        ),
    );

    const done = runSessionFlushes();
    await vi.advanceTimersByTimeAsync(250);
    await done;
    expect(landed).toBe(true);
  });

  it('gives up on a hanging flush rather than stranding the user', async () => {
    // A save that never settles must not hold the page hostage. The session is
    // expired either way; the login screen has to arrive.
    const { onSessionBounce, runSessionFlushes } = await freshModule();
    onSessionBounce(() => new Promise<void>(() => {}));

    let settled = false;
    const done = runSessionFlushes(1000).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await done;
    expect(settled).toBe(true);
  });

  it('never rejects when a flush throws synchronously', async () => {
    const { onSessionBounce, runSessionFlushes } = await freshModule();
    onSessionBounce(() => {
      throw new Error('save blew up');
    });
    await expect(runSessionFlushes()).resolves.toBeUndefined();
  });

  it('never rejects when a flush rejects', async () => {
    const { onSessionBounce, runSessionFlushes } = await freshModule();
    onSessionBounce(() => Promise.reject(new Error('401 on the draft PUT')));
    await expect(runSessionFlushes()).resolves.toBeUndefined();
  });

  it('still runs the others when one throws', async () => {
    // Two editors open; one is already broken. The other one's typing is still
    // worth saving.
    const { onSessionBounce, runSessionFlushes } = await freshModule();
    const survivor = vi.fn();
    onSessionBounce(() => {
      throw new Error('nope');
    });
    onSessionBounce(survivor);

    await runSessionFlushes();
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it('does not run one that unregistered', async () => {
    // An unmounted editor's callback closes over a dead component.
    const { onSessionBounce, runSessionFlushes } = await freshModule();
    const gone = vi.fn();
    onSessionBounce(gone)();

    await runSessionFlushes();
    expect(gone).not.toHaveBeenCalled();
  });

  it('registers a given callback once however many times it is added', async () => {
    const { onSessionBounce, runSessionFlushes } = await freshModule();
    const flush = vi.fn();
    onSessionBounce(flush);
    onSessionBounce(flush);

    await runSessionFlushes();
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
