import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import type { LoginRefused, LoginRefusedReason } from '@mantle/client-types';
import { MEMBER_HINT_COOKIE, memberMayOpen } from './member-surface';
import { CLIENT_HINT_COOKIE } from './client-surface';
import { oauthConsentNext } from './oauth-consent';

function setHint(name: string, on: boolean): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = on
    ? `${name}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`
    : `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Set or clear the UX-only member hint cookie (see MEMBER_HINT_COOKIE). */
export function setMemberHint(on: boolean): void {
  setHint(MEMBER_HINT_COOKIE, on);
}

/** Set or clear the UX-only client hint cookie (see CLIENT_HINT_COOKIE). */
export function setClientHint(on: boolean): void {
  setHint(CLIENT_HINT_COOKIE, on);
}

/** Where a MEMBER lands: `next` when a member may open it, else the home. */
export function memberHome(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  const path = next.split(/[?#]/)[0] ?? '/';
  return memberMayOpen(path) ? next : '/';
}

/** The brain's own "wrong role" refusal (client logins C0): a 403 whose body
 *  names the CALLER's role, `member-login` from an admin route, `admin-login`
 *  from a member route, `client-login` from any route that is not a client
 *  route. Null for anything else: a 403 without one of those reasons (a
 *  proxy, a WAF) says nothing about who is signed in. */
export function loginRefusalReason(err: unknown): LoginRefusedReason | null {
  if (!(err instanceof ApiError) || err.status !== 403) return null;
  const reason = (err.body as Partial<LoginRefused> | undefined)?.reason;
  return reason === 'member-login' || reason === 'admin-login' || reason === 'client-login'
    ? reason
    : null;
}

/** Any of the three refusals: the route is not for this login, for good, so
 *  retrying it only delays what the shell does about it. */
export function isLoginRefusal(err: unknown): boolean {
  return loginRefusalReason(err) !== null;
}

/** True when an API error is the brain refusing a member login on an admin
 *  route (member logins, Phase 1). */
export function isMemberLoginRefusal(err: unknown): boolean {
  return loginRefusalReason(err) === 'member-login';
}

/** True when an API error is the brain refusing an ADMIN on a member route
 *  (`getMemberOr401` answers 403 `admin-login`): the member hint was wrong.
 *  Any other 403 (a proxy, a WAF) says nothing about who is signed in. */
export function isAdminLoginRefusal(err: unknown): boolean {
  return loginRefusalReason(err) === 'admin-login';
}

/** True when an API error is the brain refusing a CLIENT login (client
 *  logins C0): every admin and member route answers a client that way. */
export function isClientLoginRefusal(err: unknown): boolean {
  return loginRefusalReason(err) === 'client-login';
}

/** Onboarding is an admin's (its route refuses anyone else). A member or
 *  client login that lands on /onboarding goes home, where the shell shows
 *  its own screen, instead of a Retry that can only be refused again. Null:
 *  stay (loading, or any other failure, which Retry may cure). */
export function onboardingExitFor(err: unknown): '/' | null {
  const reason = loginRefusalReason(err);
  return reason === 'member-login' || reason === 'client-login' ? '/' : null;
}

/**
 * After sign-in: a member goes to the member home (or `next` when a member may
 * open it, or when `next` is the brain's MCP consent page: lib/oauth-consent),
 * a client login to `/` (the client home; no deep link into the owner screens
 * is carried), anyone else to `next` (or /). Asks the member
 * shell, which answers only a member; a client refusal there asks the client
 * shell too, and sets the client hint when it answers (a brain without the
 * client routes leaves the hint off: the shell shows the plain client screen).
 * A failure of any other kind keeps the ordinary destination (the admin shell
 * sorts out the rest, and never renders for a login it has not confirmed as
 * an admin).
 */
export async function destinationAfterSignIn(next: string | null | undefined): Promise<string> {
  try {
    await apiFetch('/api/member/shell');
    setMemberHint(true);
    setClientHint(false);
    return oauthConsentNext(next) ?? memberHome(next);
  } catch (err) {
    setMemberHint(false);
    if (isClientLoginRefusal(err)) {
      try {
        await apiFetch('/api/client/shell');
        setClientHint(true);
      } catch {
        setClientHint(false);
      }
      return '/';
    }
    setClientHint(false);
    return next ?? '/';
  }
}
