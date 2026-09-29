// Server-module only (fetches with process.env; the /login and
// /client-signin pages, Server Components, await it). Do not import from
// client components.
import { CLIENT_CODE_PATH, clientCodesEnabled } from './client-code';

/**
 * Whether this brain sends client sign-in codes (client logins C2b): GET
 * /api/auth/client-code on the server tier, public and boolean-only, like
 * loadBrainAppearance. Asked on the server so the sign-in screens render the
 * right way in on the first paint, with no flash of a form that then goes.
 *
 * Not cached: an admin turning codes on or off should show on the next
 * load, and the page's own render is the only caller. Every failure (no
 * origin, a brain before C2b, a timeout) is false: the screens then say to
 * ask for a sign-in link, which always works.
 */
export async function loadClientCodesEnabled(): Promise<boolean> {
  const origin = (process.env.MANTLE_SERVER_ORIGIN ?? '').replace(/\/+$/, '');
  if (!origin) return false;
  try {
    const res = await fetch(`${origin}${CLIENT_CODE_PATH}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    return clientCodesEnabled(res.status, await res.json().catch(() => null));
  } catch {
    return false;
  }
}
