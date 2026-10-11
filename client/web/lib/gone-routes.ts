/**
 * THE list of routes a W6b or W7 brain answers 410, one source for both
 * checks that keep the app off them:
 *
 *  - lib/no-gone-route.guard.test.ts scans every source file for a quoted
 *    path on one of them (GONE_ROUTE_NEEDLES);
 *  - e2e/workspace/shell-nav.ts fails a spec that asks one of them
 *    (GONE_ROUTE, against the path of each request).
 *
 * W6b (contract item 1): the personal spaces are folded into the brain. The
 * member space, its files, the member's own apps and trash, the member items
 * list and the member tree are gone, and so are the admin's private space and
 * its files. W7b: the per-login MCP switches and the agent and tool group
 * levels. W7c: the member chat (its read and unread) and the Admin member
 * chats.
 *
 * This file names every one of them, so the guard does not scan it.
 */

export type GoneRoute = { base: string; label: string };

export const GONE_ROUTE_BASES: readonly GoneRoute[] = [
  // W6b.
  {
    base: '/api/member/space',
    label: '/api/member/space (and its items, drafts, saves and bytes)',
  },
  { base: '/api/member/space-files', label: '/api/member/space-files' },
  { base: '/api/member/my-apps', label: '/api/member/my-apps (and its trash, history and share)' },
  { base: '/api/member/items', label: '/api/member/items' },
  { base: '/api/member/tree', label: '/api/member/tree (and its search, move and folders)' },
  { base: '/api/admin/space', label: '/api/admin/space (and its items, drafts, saves and bytes)' },
  { base: '/api/admin/space-files', label: '/api/admin/space-files' },
  // W7b.
  { base: '/api/mcp-logins', label: '/api/mcp-logins (and its tokens)' },
  { base: '/api/access/agents', label: '/api/access/agents/:slug (an agent level)' },
  { base: '/api/access/tool-groups', label: '/api/access/tool-groups/:slug (a tool group level)' },
  // W7c.
  { base: '/api/member/chat', label: '/api/member/chat (and its read and unread)' },
  { base: '/api/team-admin/member-chats', label: '/api/team-admin/member-chats' },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** A request path on a gone route: the base itself or anything under it. */
export const GONE_ROUTE = new RegExp(
  `^(?:${GONE_ROUTE_BASES.map((r) => escape(r.base)).join('|')})(?:/|$)`,
);

/**
 * The source needle of one base: the base right after a quote, a backtick or
 * the `}` that ends a template interpolation (`${origin}/api/mcp-logins`),
 * and right before a slash, a quote, a backtick, a `?`, a `#` or a `${`. A
 * comment that names the route in prose (`PATCH /api/...` after a space) is
 * not a call and is not caught.
 */
export function goneRouteNeedle(base: string): RegExp {
  return new RegExp(`[}'"\`]${escape(base)}(?:[/'"\`?#]|\\$\\{)`);
}

/** Every needle the guard scans for, with its label. */
export const GONE_ROUTE_NEEDLES: readonly (readonly [label: string, needle: RegExp])[] = [
  ...GONE_ROUTE_BASES.map((r) => [r.label, goneRouteNeedle(r.base)] as const),
  // A route base the W6b paths were built on ('/api/member' + '/space').
  ['a bare /api/member or /api/admin base', /['"`]\/api\/(member|admin)\/?['"`]/],
];
