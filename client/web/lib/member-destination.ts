import { oauthConsentNext } from './oauth-consent';

/**
 * After sign-in (phase W5c: one shell for every login): the brain's MCP
 * consent page when `next` is one (lib/oauth-consent), else `next`, else
 * the home. No shell is asked first: every login lands in the same shell.
 * Async so a caller's `await` and the switch landing (setSwitchLanding)
 * keep their shape.
 */
export async function destinationAfterSignIn(next: string | null | undefined): Promise<string> {
  return oauthConsentNext(next) ?? next ?? '/';
}

// ── Retired role hints ──────────────────────────────────────────────────────
// Nothing reads these cookies since phase W5c (the middleware routes no role
// and the layout seeds none). Kept only because the invite and client sign-in
// pages still call the setters; the W5c helper that removes those pages and
// calls removes these too.

const RETIRED_MEMBER_COOKIE = 'mantle_member';
const RETIRED_CLIENT_COOKIE = 'mantle_client';

function setHint(name: string, on: boolean): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = on
    ? `${name}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`
    : `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Retired (see above). */
export function setMemberHint(on: boolean): void {
  setHint(RETIRED_MEMBER_COOKIE, on);
}

/** Retired (see above). */
export function setClientHint(on: boolean): void {
  setHint(RETIRED_CLIENT_COOKIE, on);
}
