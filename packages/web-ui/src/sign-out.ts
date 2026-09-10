import { apiUrl, resetCookieUpgrade, withAuth } from './api-fetch';
import { setAssetToken } from './asset-url';
import { runSignOutResets } from './session-reset';
import { tokenStore } from './token-store';

export { onSignOut } from './session-reset';

/**
 * Signing out has to forget the session, and "the session" is more than the
 * credential.
 *
 * The credential was always cleared. What was not is everything else this tab
 * accumulated about the person who just left: the TanStack Query cache (their
 * profile, messages, settings), the short-lived asset token, and the memo
 * saying the cookie upgrade had already run. None of that is reachable from a
 * `tokenStore.clear()`.
 *
 * It survives because SIGNING OUT IS A CLIENT NAVIGATION. A 401 bounce is a
 * full page load and takes the whole heap with it, which is why this was never
 * seen there — but `router.push('/login')` keeps the JS context alive, so the
 * next person to sign in on the same tab was first shown the last one's data,
 * painted straight from cache before any request came back.
 *
 * Two ways to forget, and the difference matters:
 *
 *   • Module state this file can reach, reset directly below.
 *   • State owned by React — the query client lives in a provider — which
 *     registers a callback through `onSignOut`. That registry is its own leaf
 *     module (`session-reset.ts`) so the provider does not have to import this
 *     one; see the note there.
 */

/**
 * Sign out across BOTH transports. Same-origin: POST /api/auth/logout clears
 * the session cookie, exactly as before. If a web bearer is held (the split
 * client), also revoke its device row (mobile-logout self-authenticates from
 * the bearer, idempotent) and clear the local store + presence cookie.
 * Callers navigate to /login themselves afterwards.
 *
 * The local clear happens whatever the network did: a sign-out that failed to
 * reach the brain must still leave nothing of this session on the machine.
 */
export async function performSignOut(): Promise<void> {
  const hadToken = tokenStore.get() !== null;
  try {
    if (hadToken) {
      await fetch(apiUrl('/api/auth/mobile-logout'), withAuth({ method: 'POST' }));
    }
    await fetch(apiUrl('/api/auth/logout'), withAuth({ method: 'POST' }));
  } catch {
    /* network failure — still clear local state so the UI signs out */
  }
  tokenStore.clear();
  setAssetToken(null);
  resetCookieUpgrade();
  runSignOutResets();
}
