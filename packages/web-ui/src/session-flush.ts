/**
 * The last chance an editor gets to save before the page is taken away.
 *
 * A LEAF module — it imports nothing, so `api-fetch` can run these without
 * pulling React in behind it.
 *
 * Every draft editor in the app saves on a debounce, and a debounce is a
 * promise to write LATER. Three things can happen inside that window, and one
 * of them was not covered:
 *
 *   • the user navigates in-app — React unmounts, the cleanup flushes. Covered.
 *   • the user reloads or closes the tab — `visibilitychange`. Covered.
 *   • THE SESSION EXPIRES — `bounceToLogin` sets `window.location.href`, which
 *     is a full navigation. React does not unmount on a page teardown, so the
 *     cleanup never runs and up to a whole debounce window of typing was gone,
 *     with a login screen as the only explanation.
 *
 * So the bounce asks first. Editors register through {@link onSessionBounce};
 * `runSessionFlushes` is what the bounce awaits.
 *
 * It is a registry rather than a call into each editor because the bounce lives
 * in the transport, which must not know what a Pages document is — and because
 * a fourth editor should be covered by registering, not by someone remembering
 * to edit `api-fetch`.
 */

/** May return a promise; may return nothing. Both are fine. */
type Flush = () => unknown;

const flushes = new Set<Flush>();

/**
 * Register a save to run before the session bounce navigates away. Returns an
 * unregister function — call it from the effect's cleanup, or an unmounted
 * editor keeps a callback closing over a dead component.
 */
export function onSessionBounce(flush: Flush): () => void {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

/**
 * How long the bounce will wait. Long enough for a draft PUT on a normal
 * connection, short enough that nobody stares at a dead screen: the session is
 * already gone, and a save that cannot land in a second is not going to.
 */
export const FLUSH_TIMEOUT_MS = 1000;

/**
 * Run every registered flush and settle when they are all done — or when
 * {@link FLUSH_TIMEOUT_MS} passes, whichever comes first.
 *
 * NEVER rejects, and never waits forever. The caller's next move is to take the
 * page away; a flush that throws, hangs, or was registered by something already
 * broken must not be able to strand the user on a screen whose session has
 * expired. Best-effort is the whole contract — the alternative to a
 * best-effort save here is no save at all.
 */
export async function runSessionFlushes(timeoutMs: number = FLUSH_TIMEOUT_MS): Promise<void> {
  if (flushes.size === 0) return;
  const started = [...flushes].map(async (flush) => {
    try {
      await flush();
    } catch {
      /* one editor failing must not stop the others saving */
    }
  });
  await Promise.race([
    Promise.allSettled(started),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
