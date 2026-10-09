import { apiUrl, withAuth } from '@mantle/web-ui/api-fetch';
import { isCrossOrigin } from '@mantle/web-ui/runtime-env';
import { safeNext } from './safe-next';

/**
 * The brain's MCP consent page. An MCP client (claude.ai, Claude Desktop)
 * opens it in the browser; when the brain sees no session cookie there it
 * sends the browser to `/login?next=<this page and its query>`, and sign-in
 * must send the browser BACK, whatever the login's role. The page is the
 * brain's, not this app's: it is reached by a page load, never a client-side
 * route.
 */
export const OAUTH_CONSENT_PATH = '/api/oauth/authorize';

/**
 * `next` when it is the consent page on this origin (reduced by safeNext,
 * so nothing off this origin and no path trick passes), else undefined.
 * Exactly that path: no other /api path is a place sign-in sends anyone.
 */
export function oauthConsentNext(next: string | null | undefined): string | undefined {
  const safe = safeNext(next);
  if (!safe) return undefined;
  return new URL(safe, 'https://n.invalid').pathname === OAUTH_CONSENT_PATH ? safe : undefined;
}

/** How long a return to the consent page counts as "just now". */
export const CONSENT_RETURN_WINDOW_MS = 30_000;
const CONSENT_RETURN_KEY = 'mantle.oauth-consent-return';

export type ConsentReturnDeps = {
  crossOrigin: () => boolean;
  /** POST /api/auth/sso with this tab's bearer: true when the brain set the
   *  session cookie (204). */
  upgrade: () => Promise<boolean>;
  /** When this tab last went back to the consent page (ms), or null. */
  lastReturn: () => number | null;
  markReturn: (at: number) => void;
  assign: (to: string) => void;
  now: () => number;
};

const browserDeps: ConsentReturnDeps = {
  crossOrigin: isCrossOrigin,
  upgrade: async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/sso'), withAuth({ method: 'POST' }));
      return res.status === 204;
    } catch {
      return false;
    }
  },
  lastReturn: () => {
    try {
      const v = Number(window.sessionStorage.getItem(CONSENT_RETURN_KEY));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  },
  markReturn: (at) => {
    try {
      window.sessionStorage.setItem(CONSENT_RETURN_KEY, String(at));
    } catch {
      /* no storage: the loop guard is off, the return still works */
    }
  },
  assign: (to) => window.location.assign(to),
  now: () => Date.now(),
};

/**
 * Send a signed-in login back to the consent page. The page reads the
 * session cookie only (a page load carries no bearer), so this tab's bearer
 * is turned into one first (POST /api/auth/sso: an admin or a member; a
 * client is refused there, and signs in to a cookie anyway).
 *
 * False, and nothing happens, when it cannot work: a split client (the
 * cookie would belong to another origin), the upgrade refused or failed, or
 * this tab already went back moments ago and the brain sent it here again
 * (the cookie did not stick, and another round would loop). The caller then
 * lands the login on its usual home.
 */
export async function returnToConsent(
  next: string,
  deps: ConsentReturnDeps = browserDeps,
): Promise<boolean> {
  if (deps.crossOrigin()) return false;
  const last = deps.lastReturn();
  if (last !== null && deps.now() - last < CONSENT_RETURN_WINDOW_MS) return false;
  if (!(await deps.upgrade())) return false;
  deps.markReturn(deps.now());
  deps.assign(next);
  return true;
}

/**
 * Where sign-in sends the browser, `to` being destinationAfterSignIn's
 * answer: back to the consent page when that is where it came from and the
 * return can work, else `to` by `go` (a client-side navigation), with the
 * home standing in for a consent page it cannot return to.
 */
export async function goAfterSignIn(to: string, go: (to: string) => void): Promise<void> {
  const consent = oauthConsentNext(to);
  if (!consent) return go(to);
  if (await returnToConsent(consent)) return;
  go('/');
}
