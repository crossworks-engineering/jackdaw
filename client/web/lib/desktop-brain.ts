import { timingSafeEqual } from 'node:crypto';

/**
 * Which brain a server render is for.
 *
 * On the web that is one brain per deployment: `MANTLE_SERVER_ORIGIN`, read
 * per request because one image serves any brain. The desktop shell is the
 * exception. It runs ONE embedded copy of this app for every brain it knows,
 * and that process was started with the first brain's origin. Read alone, it
 * gave a second brain's window the first brain's branding and, worse, a CSP
 * whose connect-src named only the first brain, so every request the second
 * window made to its own brain was refused and sign-in read "Could not reach
 * the server".
 *
 * So the shell names the window's brain on every request it sends to the
 * embedded server (client/desktop/src/main/brain-fence.ts), with a key it
 * generated at launch and handed to this process in its environment. The key
 * is what makes the header the shell's word rather than anyone's: the server
 * listens on loopback, where any local page or process can reach it, and none
 * of them knows the key. No key in the environment (every web deployment), or
 * a header without the right key, and the header is ignored.
 *
 * The header names are repeated in brain-fence.ts: the shell cannot import
 * from this app.
 */
export const DESKTOP_BRAIN_HEADER = 'x-jackdaw-brain';
export const DESKTOP_BRAIN_KEY_HEADER = 'x-jackdaw-brain-key';

/** An http(s) origin, or '' for anything else. */
function originOf(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
  } catch {
    return '';
  }
}

function sameKey(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The brain origin for one request: the shell's header when it carries the
 * key this process was started with, else the deployment's own origin. Pure,
 * so the rule is tested without a request.
 */
export function resolveBrainOrigin(
  env: { serverOrigin?: string; desktopKey?: string },
  request: { brain?: string | null; key?: string | null },
): string {
  const fallback = (env.serverOrigin ?? '').trim().replace(/\/+$/, '');
  const expected = env.desktopKey ?? '';
  if (!expected || !request.key || !sameKey(request.key, expected)) return fallback;
  return originOf(request.brain) || fallback;
}
