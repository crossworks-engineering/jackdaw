/**
 * Request header the middleware sets (always overwriting the inbound value)
 * when the path is a team-MEMBER surface (/team, /hub — not /team-admin,
 * which is the owner's console). The root layout reads it to render the
 * `data-color-theme-owner` lock into the original HTML, so the providers see
 * the lock at mount — before the carve this ordering came from the server
 * layout, and stamping it from a post-fetch effect instead left a window
 * where visitor-local state (e.g. the random-theme toggle) could start up
 * over the brand. Shared as a constant so middleware and layout can't drift.
 */
export const MEMBER_SURFACE_HEADER = 'x-mantle-member-surface';

/**
 * UX-only cookie: this browser's session is a MEMBER login (member logins).
 * The (app) layout reads it to render the member shell from the first paint
 * (no flash of owner chrome whose queries would only collect 403s), and the
 * middleware sends a hinted member off admin-only paths to the member home.
 * Set by the shells and at sign-in, cleared by the owner shell and at
 * sign-out. Spoofable and authenticates nothing: the brain refuses a member
 * on every admin route, and a spoofing admin just gets the member shell,
 * which notices and reloads as the admin.
 */
export const MEMBER_HINT_COOKIE = 'mantle_member';

/**
 * The (app) screens a member works in (member logins Phase 2, the real app
 * shell): each renders a member screen for a member and the owner screen for
 * an admin. `/` is the member home.
 */
export const MEMBER_APP_PREFIXES = ['/pages', '/notes', '/draw', '/tables', '/files'] as const;

/** A path a member may open: the home, the member app screens, public
 *  paths. Chat is the assistant dock, on any of them (the old /m is gone). */
export function memberMayOpen(pathname: string, publicPrefixes: readonly string[] = []): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return pathname === '/' || MEMBER_APP_PREFIXES.some(under) || publicPrefixes.some(under);
}

/** Owner paths a hinted member is sent away from (to the member home). Pure,
 *  so the rule is unit-tested. */
export function sendsMemberHome(pathname: string, publicPrefixes: readonly string[]): boolean {
  return !memberMayOpen(pathname, publicPrefixes);
}
