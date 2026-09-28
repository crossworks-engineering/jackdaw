import { MEMBER_KIND_PATHS } from './member-kinds';

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
 * an admin. `/` is the member home. `/apps` is the member app launcher and
 * run view (Phase 4b): a member never reaches the owner app editor.
 */
export const MEMBER_APP_PREFIXES: readonly string[] = [...MEMBER_KIND_PATHS, '/apps'];

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
