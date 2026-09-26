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
 * UX-only cookie: this browser's session is a MEMBER login (member logins,
 * Phase 1). With it, the middleware sends a page load on an owner path
 * straight to /m, so a member never gets a flash of the owner shell whose
 * queries and event stream would only collect 403s. Set by the member shell
 * and at sign-in, cleared by the owner shell and at sign-out. Spoofable and
 * authenticates nothing: the brain refuses a member on every admin route.
 */
export const MEMBER_HINT_COOKIE = 'mantle_member';

/** Owner paths a hinted member is sent away from: anything that is not a
 *  member or public surface. Pure, so the rule is unit-tested. */
export function sendsMemberHome(pathname: string, publicPrefixes: readonly string[]): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return !under('/m') && !publicPrefixes.some(under);
}
