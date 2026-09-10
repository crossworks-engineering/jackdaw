/**
 * The "random theme" screensaver's visitor-local state.
 *
 * The other RANDOM_* keys live in `@mantle/share-ui/lib/themes`, which is a
 * published contract package this repo consumes and cannot add to — so the
 * pick lives here instead.
 *
 * Why there is a pick at all: the colour theme proper is BRAIN-WIDE. It is
 * server-rendered into `<html data-color-theme>` and changed with a PUT to
 * `/api/profile/color-theme`. The shuffle used to go through that same path,
 * so one visitor running the screensaver repainted the app for everybody and
 * overwrote the brain's own choice a few times a day. The shuffle now paints
 * locally and remembers its pick here, which keeps the feature's documented
 * behaviour — a reload before the next tick is due keeps the last theme —
 * without ever touching the server's copy.
 */

export const RANDOM_THEME_PICK_STORAGE_KEY = 'mantle-random-theme-pick';

/** Remember the shuffle's last pick, or forget it when passed `null`. */
export function writeRandomPick(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(RANDOM_THEME_PICK_STORAGE_KEY);
    else window.localStorage.setItem(RANDOM_THEME_PICK_STORAGE_KEY, id);
  } catch {
    // storage blocked — the pick won't survive a reload, no-op
  }
}

export function readRandomPick(): string | null {
  try {
    return window.localStorage.getItem(RANDOM_THEME_PICK_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Which theme the provider paints on mount.
 *
 * `stored` is the brain's theme, already server-rendered into the DOM. The
 * visitor's own pick only wins while the screensaver is ON — turning it off,
 * or choosing a theme deliberately, clears the pick, so this falls straight
 * back to the brain's copy and the painted DOM is already right.
 */
export function resolveInitialColorTheme(opts: {
  stored: string;
  randomTheme: boolean;
  pick: string | null;
}): { theme: string; repaint: boolean } {
  const pick = opts.randomTheme ? opts.pick : null;
  // An empty string is not a theme id; treat it as no pick rather than
  // clearing the brain's theme to "".
  if (!pick) return { theme: opts.stored, repaint: false };
  // Repainting to what is already on screen is a wasted DOM write, and the
  // provider uses this flag to skip it.
  return { theme: pick, repaint: pick !== opts.stored };
}
