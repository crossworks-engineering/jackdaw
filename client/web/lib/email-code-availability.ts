// Server-module only (fetches the request's brain; the /login page, a
// Server Component, awaits it). Do not import from client components.
import { brainOrigin } from './brain-origin';
import { EMAIL_CODE_PATH, emailCodesEnabled } from './email-code';

/**
 * Whether this brain sends sign-in codes by email: GET EMAIL_CODE_PATH on
 * the server tier, public and boolean-only, like loadBrainAppearance. Asked
 * on the server so the sign-in page renders the right way in on the first
 * paint, with no flash of a link that then goes.
 *
 * Not cached: an admin turning codes on or off should show on the next
 * load, and the page's own render is the only caller. Every failure (no
 * origin, a brain without the route, a timeout) is false: the page then
 * offers the password form only.
 */
export async function loadEmailCodesEnabled(): Promise<boolean> {
  const origin = await brainOrigin();
  if (!origin) return false;
  try {
    const res = await fetch(`${origin}${EMAIL_CODE_PATH}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    return emailCodesEnabled(res.status, await res.json().catch(() => null));
  } catch {
    return false;
  }
}
