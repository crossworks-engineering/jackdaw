/**
 * A screen with unsaved edits can hold in-app navigation that does not go
 * through a link (the search palette, a toast's "Open", a desktop
 * notification). One screen at a time registers a `hold`; a caller that
 * would otherwise `router.push` runs its navigation through
 * `guardedNavigate`, which hands it to the hold (the screen asks, then runs
 * it or not) or runs it at once when nothing is held.
 */
type Hold = (go: () => void) => void;

let current: Hold | null = null;

/** Register the hold; returns the release. A later registration replaces
 *  an earlier one, and releasing a replaced hold does nothing. */
export function setNavHold(hold: Hold): () => void {
  current = hold;
  return () => {
    if (current === hold) current = null;
  };
}

export function guardedNavigate(go: () => void): void {
  if (current) current(go);
  else go();
}
