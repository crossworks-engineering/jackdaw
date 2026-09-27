import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { MEMBER_HINT_COOKIE, memberMayOpen } from './member-surface';

/** Set or clear the UX-only member hint cookie (see MEMBER_HINT_COOKIE). */
export function setMemberHint(on: boolean): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = on
    ? `${MEMBER_HINT_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`
    : `${MEMBER_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Where a MEMBER lands: `next` when a member may open it, else the home. */
export function memberHome(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  const path = next.split(/[?#]/)[0] ?? '/';
  return memberMayOpen(path) ? next : '/';
}

/** True when an API error is the brain refusing a member login on an admin
 *  route (member logins, Phase 1). */
export function isMemberLoginRefusal(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    (err.body as { reason?: string } | undefined)?.reason === 'member-login'
  );
}

/** True when an API error is the brain refusing an ADMIN on a member route
 *  (`getMemberOr401` answers 403 `admin-login`): the member hint was wrong.
 *  Any other 403 (a proxy, a WAF) says nothing about who is signed in. */
export function isAdminLoginRefusal(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    (err.body as { reason?: string } | undefined)?.reason === 'admin-login'
  );
}

/**
 * After sign-in: a member goes to the member home (or `next` when a member may
 * open it), anyone else to `next` (or /). Asks the
 * member shell, which answers only a member; a failure of any other kind keeps
 * the ordinary destination (the admin shell sorts out the rest).
 */
export async function destinationAfterSignIn(next: string | null | undefined): Promise<string> {
  try {
    await apiFetch('/api/member/shell');
    setMemberHint(true);
    return memberHome(next);
  } catch {
    setMemberHint(false);
    return next ?? '/';
  }
}
