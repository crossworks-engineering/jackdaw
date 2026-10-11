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
 * Every check reads the URL the browser will read: HTML entities decoded
 * first (`&#106;avascript:` is javascript:, `&#47;&#47;host` is another
 * origin), then the characters a browser drops or bends. And a last pass,
 * sanitizeChatDoc, runs the same checks on the parsed document, whose values
 * the DOM has already decoded, before anything renders.
 *
 * Used by lib/rich-markdown.ts (what the reply renders) and
 * components/assistant/rich-text.tsx (the parsed document and what a click
 * does). Pinned by chat-links.test.ts.
 */

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** The named HTML entities that stand for an ASCII character (plus the
 *  no-break space): every one that could spell a scheme, a slash or a query.
 *  The rest of the table only names characters outside ASCII, which cannot. */
const NAMED_ENTITIES: Record<string, string> = {
  Tab: '\t',
  NewLine: '\n',
  nbsp: '\u00a0',
  NonBreakingSpace: '\u00a0',
  excl: '!',
  quot: '"',
  QUOT: '"',
  num: '#',
  dollar: '$',
  percnt: '%',
  amp: '&',
  AMP: '&',
  apos: "'",
  lpar: '(',
  rpar: ')',
  ast: '*',
  midast: '*',
  plus: '+',
  comma: ',',
  period: '.',
  sol: '/',
  colon: ':',
  semi: ';',
  lt: '<',
  LT: '<',
  equals: '=',
  gt: '>',
  GT: '>',
  quest: '?',
  commat: '@',
  lsqb: '[',
  lbrack: '[',
  bsol: '\\',
  rsqb: ']',
  rbrack: ']',
  Hat: '^',
  lowbar: '_',
  UnderBar: '_',
  grave: '`',
  DiacriticalGrave: '`',
  lcub: '{',
  lbrace: '{',
  verbar: '|',
  vert: '|',
  VerticalLine: '|',
  rcub: '}',
  rbrace: '}',
};

function codePointText(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '\ufffd';
  if (code >= 0xd800 && code <= 0xdfff) return '\ufffd';
  return String.fromCodePoint(code);
}

/** Decode HTML character references the way an attribute value is decoded:
 *  numeric ones with or without the closing `;`, named ones with it. Run to
 *  a fixed point (a few rounds at most), so a double-encoded value reads as
 *  the worst it could become: stricter than the browser, never looser. */
export function decodeHtmlEntities(s: string): string {
  let out = s;
  for (let i = 0; i < 4 && out.includes('&'); i++) {
    const next = out
      .replace(/&#[xX]([0-9a-fA-F]+);?/g, (_, hex: string) => codePointText(parseInt(hex, 16)))
      .replace(/&#(\d+);?/g, (_, dec: string) => codePointText(parseInt(dec, 10)))
      .replace(/&([A-Za-z][A-Za-z0-9]*);/g, (whole, name: string) => NAMED_ENTITIES[name] ?? whole);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Browsers ignore ASCII tab, newline and control characters inside a URL
 *  scheme (`java\tscript:` runs), so they go before the scheme is read. */
function squeeze(href: string): string {
  // eslint-disable-next-line no-control-regex
  return href.replace(/[\x00-\x20\x7f]/g, '');
}

/** The URL a browser reads from an href or src, the one helper every check
 *  here goes through: entities decoded, then the ignored characters dropped,
 *  and `\` read as `/` (so `/\host` is another origin too). */
export function normaliseChatUrl(raw: string): string {
  return squeeze(decodeHtmlEntities(raw)).replace(/\\/g, '/');
}

/** The scheme of a normalised href with one (`mailto:`), or null for a
 *  relative one. */
function schemeOf(normalised: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(normalised);
  return m ? `${m[1]!.toLowerCase()}:` : null;
}

/** Whether a chat reply may link to this href: http(s), mailto, or relative. */
export function isSafeChatHref(href: string | null | undefined): boolean {
  if (typeof href !== 'string' || !href.trim()) return false;
  const scheme = schemeOf(normaliseChatUrl(href));
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
const OWNER_BYTES = /^\/api\/(?:files|draws)(?:\/|$)/i;

/** A base no reply can name, to resolve a relative src against. */
const PROBE_ORIGIN = 'http://chat-src.invalid';

/** An owner byte route, with repeated slashes read as one (`/api//files`). */
function isOwnerBytes(path: string): boolean {
  return OWNER_BYTES.test(path.replace(/\/{2,}/g, '/'));
}

/** Whether a same-origin path reaches an owner byte route, read the way a
 *  server routes it: dot segments resolved (`/a/../api/files/x`), then
 *  percent escapes decoded (`/api/%66iles/x`), until nothing changes. A path
 *  that will not decode, or that decodes onto another origin, counts as one. */
function reachesOwnerBytes(pathname: string): boolean {
  let path = pathname;
  for (let i = 0; i < 4; i++) {
    if (isOwnerBytes(path)) return true;
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return true;
    }
    if (isOwnerBytes(decoded)) return true;
    let next: URL;
    try {
      next = new URL(decoded.replace(/\\/g, '/'), PROBE_ORIGIN);
    } catch {
      return true;
    }
    if (next.origin !== PROBE_ORIGIN) return true;
    if (next.pathname === path) return false;
    path = next.pathname;
  }
  return isOwnerBytes(path);
}

/** Whether a reply's picture shows for this login: any for an Admin user;
 *  for anyone else only a same-origin one that is not an owner byte route. */
export function chatImageAllowed(src: string | null | undefined, adminUser: boolean): boolean {
  if (typeof src !== 'string' || !src.trim()) return false;
  if (adminUser) return true;
  // A belt over the decoding below: an `&` before the query can only be an
  // entity (a plain path has no use for one), so it is refused outright.
  const queryAt = src.indexOf('?');
  if ((queryAt < 0 ? src : src.slice(0, queryAt)).includes('&')) return false;
  const s = normaliseChatUrl(src);
  // Another origin (`https://`, `//host`, `data:`, any scheme): not shown.
  if (schemeOf(s) !== null || s.startsWith('//')) return false;
  let url: URL;
  try {
    url = new URL(s, PROBE_ORIGIN);
  } catch {
    return false;
  }
  if (url.origin !== PROBE_ORIGIN) return false;
  if (reachesOwnerBytes(url.pathname)) return false;
  return !url.searchParams.has('raw');
}

/** The parts of a parsed document (TipTap JSON) the last pass reads. */
export type ChatDocNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: ChatDocNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

/** Whether an image node may render for this login. One carrying a file or
 *  drawing id renders from an owner byte route whatever its src says. */
function docImageAllowed(attrs: Record<string, unknown> | undefined, adminUser: boolean): boolean {
  if (adminUser) return true;
  if (attrs?.nodeId || attrs?.drawId) return false;
  return chatImageAllowed(typeof attrs?.src === 'string' ? attrs.src : null, adminUser);
}

function sanitizeNode(node: ChatDocNode, adminUser: boolean): ChatDocNode {
  if (node.type === 'image' && !docImageAllowed(node.attrs, adminUser)) {
    // The picture this login may not load reads as its alt text (a block,
    // where the image stood).
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
    return alt
      ? { type: 'paragraph', content: [{ type: 'text', text: alt }] }
      : { type: 'paragraph' };
  }
  let next = node;
  if (node.marks?.some((m) => m.type === 'link')) {
    const marks = node.marks.filter(
      (m) =>
        m.type !== 'link' ||
        isSafeChatHref(typeof m.attrs?.href === 'string' ? m.attrs.href : null),
    );
    next = { ...next, marks };
  }
  if (node.content) {
    next = { ...next, content: node.content.map((c) => sanitizeNode(c, adminUser)) };
  }
  return next;
}

/**
 * The last pass over a reply's parsed document, before it renders: the DOM
 * has decoded every value by now, so this reads exactly what the browser
 * would load or follow. A link that is not http(s), mailto or relative loses
 * its link (the text stays); a picture this login may not load becomes its
 * alt text.
 */
export function sanitizeChatDoc<T extends ChatDocNode>(doc: T, adminUser: boolean): T {
  return sanitizeNode(doc, adminUser) as T;
}
