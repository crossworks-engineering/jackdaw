import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { MEMBER_HINT_COOKIE } from './member-surface';

/** Set or clear the UX-only member hint cookie (see MEMBER_HINT_COOKIE). */
export function setMemberHint(on: boolean): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = on
    ? `${MEMBER_HINT_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`
    : `${MEMBER_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Where a MEMBER lands: the member surface, unless already headed inside it. */
export function memberHome(next: string | null | undefined): string {
  return next && (next === '/m' || next.startsWith('/m/') || next.startsWith('/m?')) ? next : '/m';
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

/**
 * After sign-in: a member goes to /m, anyone else to `next` (or /). Asks the
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
