/**
 * Nav rail width bounds, in px.
 *
 * Deliberately NOT in `app-shell.tsx`: that file is `'use client'`, and a
 * server component importing a plain value from a client module gets a client
 * *reference*, not the value. `Math.max(<reference>, …)` is `NaN`, which
 * reaches the layout as `--nav-w: NaNpx` and collapses the rail to its content
 * width. This module carries no directive, so both tiers get real numbers.
 */

/** The nav rail's original hard-coded `16rem`. */
export const NAV_W_DEFAULT = 256;
export const NAV_W_MIN = 200;
export const NAV_W_MAX = 420;
export const NAV_W_COOKIE = 'mantle_nav_w';

/** The activity column's original hard-coded `20rem`. */
export const ACTIVITY_W_DEFAULT = 320;
export const ACTIVITY_W_MIN = 240;
export const ACTIVITY_W_MAX = 520;
export const ACTIVITY_W_COOKIE = 'mantle_activity_w';

/** Clamp a stored width. The cookie is user-editable, so junk has to survive. */
function clamp(raw: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function clampNavWidth(raw: string | undefined): number {
  return clamp(raw, NAV_W_MIN, NAV_W_MAX, NAV_W_DEFAULT);
}

export function clampActivityWidth(raw: string | undefined): number {
  return clamp(raw, ACTIVITY_W_MIN, ACTIVITY_W_MAX, ACTIVITY_W_DEFAULT);
}
