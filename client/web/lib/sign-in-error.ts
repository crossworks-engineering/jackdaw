/**
 * What sign-in tells the user when the request itself goes wrong, and how it
 * reads a bearer it is willing to trust.
 *
 * The login form is the one screen that cannot fall back on `apiFetch`: that
 * transport bounces a failure to /login, which from /login is a loop. So it
 * calls `fetch` directly and owns every failure itself — and it did not. The
 * submit handler was `try`/`finally` with no `catch`, so anything that REJECTS
 * rather than returning a response escaped as an unhandled rejection while
 * `finally` re-enabled the form. The user pressed Sign in, watched the button
 * work and come back, and was told nothing at all.
 *
 * Two things reject rather than resolving, and both are ordinary:
 *
 *   • `fetch` rejects with a TypeError for every transport failure — offline,
 *     DNS, a refused connection, and CORS. The browser collapses them into one
 *     opaque error ON PURPOSE, so that a page cannot probe a network it is not
 *     allowed to see. That means we cannot tell the user which one it was, and
 *     must not pretend to: in the split topology a missing origin in the
 *     brain's MANTLE_API_CORS_ORIGINS looks EXACTLY like being offline.
 *   • `res.json()` rejects on a body that is not JSON. A 200 is not a promise
 *     of JSON — a captive portal, a proxy error page or an HTML 200 from a
 *     misrouted path all parse as nothing, and every other branch in the form
 *     already guards this with `.json().catch(() => ({}))`. The token branch
 *     was the one that did not.
 */

/** Shown when the token response is a 200 we cannot use. Deliberately about
 *  the RESPONSE, not the credentials: the password may well be correct. */
export const UNEXPECTED_RESPONSE = 'The server sent an unexpected response. Please try again.';

/** Shown when the request never completed. */
export const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';

/**
 * Turn whatever was thrown into something a person can act on.
 *
 * A TypeError is the transport failing; anything else is unexpected and its own
 * message is more use than a generic one, since it reaches a screen someone is
 * actively looking at.
 */
export function signInErrorMessage(err: unknown): string {
  if (err instanceof TypeError) return UNREACHABLE;
  if (err instanceof Error && err.message.trim() !== '') return err.message;
  return 'Sign-in failed. Please try again.';
}

/**
 * The bearer from a successful `/api/auth/token` response, or `null` when the
 * body is not what a brain sends.
 *
 * `as { token: string }` was a lie the compiler could not catch: a 200 whose
 * JSON simply has no `token` produced `undefined`, which went into the token
 * store and navigated to a signed-in shell where every request 401s. An empty
 * string does the same, so both are rejected here.
 */
export async function readBearer(res: Pick<Response, 'json'>): Promise<string | null> {
  try {
    const data = (await res.json()) as { token?: unknown };
    const token = typeof data?.token === 'string' ? data.token.trim() : '';
    return token === '' ? null : token;
  } catch {
    return null;
  }
}
