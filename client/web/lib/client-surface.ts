/**
 * The client portal's routing rules (client logins C2), as plain data: the
 * middleware reads them, so no React or API import here.
 *
 * A CLIENT login has one screen, "Shared with you", at `/`, with the open
 * item in the query (`/?id=<id>`). Nothing else of the app is theirs: the
 * shell renders the client portal in place of every (app) page, and the
 * middleware sends a hinted client from any other path to the home first.
 */
import { MEMBER_KIND_PATHS } from './member-kinds';

/**
 * UX-only cookie: this browser's session is a CLIENT login. The (app) layout
 * reads it to render the client portal from the first paint (no request to
 * an admin or member route at all), and the middleware sends a hinted client
 * off every other path to the client home, and from /login to the client
 * sign-in page. Set at client sign-in and by the shell when the brain names
 * a client; cleared at sign-out and when the brain names an admin or a
 * member. Spoofable and authenticates nothing: the brain refuses a client on
 * every admin and member route, and a spoofing admin just gets the client
 * portal, which notices (403 `admin-login`) and reloads as the admin.
 */
export const CLIENT_HINT_COOKIE = 'mantle_client';

/** Where a client signs in: the page a sign-in link opens. */
export const CLIENT_SIGNIN_PATH = '/client-signin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The routes that name one item by id: the permalink and each kind's own
 *  screen (`/pages/<id>`, `/notes/<id>`, …). A page a client reads links its
 *  sibling items this way. */
const ITEM_PREFIXES: readonly string[] = ['/n', ...MEMBER_KIND_PATHS];

/** The item id a path names (`/n/<id>`, `/pages/<id>`, …), else null. */
export function clientItemIdFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [head, id] = parts as [string, string];
  if (!ITEM_PREFIXES.includes(`/${head}`)) return null;
  return UUID_RE.test(id) ? id : null;
}

/** The client home, with `id` open when one is given. */
export function clientHomeHref(id?: string | null): string {
  return id ? `/?id=${encodeURIComponent(id)}` : '/';
}

/**
 * Where a hinted client is sent from `pathname`: null to stay (the home
 * itself, and the public pages), else the home, with the item open when the
 * path named one (a permalink a client was sent). Pure, so the rule is
 * unit-tested; the middleware runs it before the page renders.
 */
export function clientRedirectFor(
  pathname: string,
  publicPrefixes: readonly string[],
): string | null {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (pathname === '/' || publicPrefixes.some(under)) return null;
  return clientHomeHref(clientItemIdFromPath(pathname));
}
