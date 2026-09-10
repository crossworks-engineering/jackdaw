/**
 * The registry of per-session state to drop when the owner signs out.
 *
 * A LEAF module on purpose: it imports nothing. The registry started out inside
 * `sign-out.ts`, which meant the query provider — mounted in the root layout,
 * so present on every route — had to import that module and dragged its whole
 * graph (`api-fetch`, `asset-url`, `token-store`) onto pages that have no
 * sign-out button at all. `/login` and `/team` each paid ~890 bytes for a
 * button they do not render. Split out, the provider imports these few lines
 * and `sign-out.ts` imports them too.
 *
 * Why a registry rather than a parameter on `performSignOut`: there are two
 * sign-out buttons today and nothing stops a third, and "applied to one screen
 * and not its sibling" is the shape of half the bugs in this audit. Anything
 * session-scoped added later registers here and is covered without touching
 * either caller.
 */

type Reset = () => void;

const resets = new Set<Reset>();

/**
 * Register per-session state to drop when the owner signs out. Returns an
 * unregister function — call it from an effect's cleanup, or a remounted
 * provider leaves a callback closing over a dead client behind.
 */
export function onSignOut(reset: Reset): () => void {
  resets.add(reset);
  return () => {
    resets.delete(reset);
  };
}

/** Run every registered reset. One throwing must not leave the rest of the
 *  session on the machine, which is the entire job here. */
export function runSignOutResets(): void {
  for (const reset of resets) {
    try {
      reset();
    } catch {
      /* keep going — a partial forget is the failure mode that matters */
    }
  }
}
