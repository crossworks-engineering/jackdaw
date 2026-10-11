/**
 * What a chat reply may link to and show (W7f), the pure half. A reply is
 * model output, and a workspace assistant's model reads what any team member
 * put in the brain, so the chat treats its links and pictures as untrusted:
 *
 *  - every login: a link is followed only when it is http(s) or mailto (a
 *    relative link resolves to this origin, so it is http(s) too); any other
 *    scheme (javascript:, data:, media:, page:, ...) renders as its text;
 *  - a login that is not an Admin user: a picture shows only from this
 *    origin, and never an owner byte route (`?raw`, /api/files, /api/draws:
 *    the brain answers a member 401 there). Anything else renders as its alt
 *    text.
 *
 * Used by lib/rich-markdown.ts (what the reply renders) and
 * components/assistant/rich-text.tsx (what a click does). Pinned by
 * chat-links.test.ts.
 */

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** Browsers ignore ASCII tab, newline and control characters inside a URL
 *  scheme (`java\tscript:` runs), so they go before the scheme is read. */
function squeeze(href: string): string {
  // eslint-disable-next-line no-control-regex
  return href.replace(/[\x00-\x20\x7f]/g, '');
}

/** The scheme of an href with one (`mailto:`), or null for a relative one. */
function schemeOf(href: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(squeeze(href));
  return m ? `${m[1]!.toLowerCase()}:` : null;
}

/** Whether a chat reply may link to this href: http(s), mailto, or relative. */
export function isSafeChatHref(href: string | null | undefined): boolean {
  if (typeof href !== 'string' || !href.trim()) return false;
  const scheme = schemeOf(href);
  return scheme === null || SAFE_SCHEMES.has(scheme);
}

/** What a click on a reply's link does: the SPA router for this origin, a
 *  new tab for another http(s) origin, the browser's own handling for mailto,
 *  nothing at all for any other scheme. */
export type ChatLinkAction =
  | { kind: 'route'; path: string }
  | { kind: 'open'; href: string }
  | { kind: 'default' }
  | { kind: 'block' };

export function chatLinkAction(href: string, origin: string): ChatLinkAction {
  if (!isSafeChatHref(href)) return { kind: 'block' };
  let url: URL;
  try {
    url = new URL(squeeze(href), origin);
  } catch {
    return { kind: 'block' };
  }
  if (url.protocol === 'mailto:') return { kind: 'default' };
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'block' };
  if (url.origin === origin) return { kind: 'route', path: url.pathname + url.search + url.hash };
  return { kind: 'open', href: url.href };
}

/** Owner byte routes a login that is not an Admin user cannot read. */
const OWNER_BYTES = /^\/api\/(?:files|draws)\//i;

/** Whether a reply's picture shows for this login: any for an Admin user;
 *  for anyone else only a same-origin one that is not an owner byte route. */
export function chatImageAllowed(src: string | null | undefined, adminUser: boolean): boolean {
  if (typeof src !== 'string' || !src.trim()) return false;
  if (adminUser) return true;
  // A browser reads `\` as `/` in a URL, so `/\host` is another origin too.
  const s = squeeze(src).replace(/\\/g, '/');
  // Another origin (`https://`, `//host`, `data:`, any scheme): not shown.
  if (schemeOf(s) !== null || s.startsWith('//')) return false;
  const path = s.split('#')[0]!;
  if (OWNER_BYTES.test(path)) return false;
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
  return !new URLSearchParams(query).has('raw');
}
