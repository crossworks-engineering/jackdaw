/**
 * What is left of the client portal's routing rules (client logins C2) after
 * phase W5c removed the portal and the middleware's client routing: the
 * client sign-in path (app/login links it until that page goes) and the item
 * id a path names (lib/client-portal.ts reads links with it).
 */
import { MEMBER_KIND_PATHS } from './member-kinds';

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
