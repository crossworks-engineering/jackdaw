/**
 * A client's own items (client logins C5), the pure half: My requests (the
 * client's second screen, beside "Shared with you"), its URL state, the
 * client's upload cap, and the comment threads a client and a member read on
 * an item at client level. The item view itself is the member's (MineItem
 * under `clientSpace`, lib/member-space.ts).
 *
 * Every route here is new with C5: an older brain answers 404, which reads
 * as "not here yet" (nothing broken, no toast, no retry, no poll).
 *
 * No React here, so every rule is pinned by a test (client-requests.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
import {
  CLIENT_ITEM_FILTERS,
  CLIENT_ITEM_KINDS,
  isClientItemFilter,
  isClientItemKind,
  type ClientItemFilter,
  type ClientItemKind,
} from '@mantle/client-types/member-kinds';
import type { ClientItemRow, NodeCommentAuthorKind } from '@mantle/client-types';
import { CLIENT_MAX_UPLOAD_BYTES, CLIENT_SPACE_BASE, memberUploadRefusal } from './member-space';
import { MEMBER_KIND } from './member-kinds';

// ── The client portal's screens ─────────────────────────────────────────────

/** The portal is one path (`/`); `?view=requests` is My requests, `?view=apps`
 *  the client's apps (C6), anything else "Shared with you". A query, not a
 *  path, so the middleware's one-path rule for a client
 *  (lib/client-surface.ts) stays as it is. */
export type ClientView = 'shared' | 'requests' | 'apps' | 'api-access';

export function clientViewOf(params: Pick<URLSearchParams, 'get'> | null): ClientView {
  const v = params?.get('view');
  return v === 'requests' || v === 'apps' || v === 'api-access' ? v : 'shared';
}

/** Where each screen starts: every filter, search, page and open item
 *  dropped (a screen's own state is not another's). */
export const CLIENT_VIEW_HREF: Record<ClientView, string> = {
  shared: '/',
  requests: '/?view=requests',
  apps: '/?view=apps',
  'api-access': '/?view=api-access',
};

// ── My requests ─────────────────────────────────────────────────────────────

/** The list (every kind, query, state and page) and the accepted reader. */
export const CLIENT_REQUESTS_KEY = ['client-requests'] as const;
export const CLIENT_ACCEPTED_KEY = ['client-accepted'] as const;

/** My requests' list route, whatever its query: what a 404 marks missing
 *  (askUnlessMissing). */
export const CLIENT_ITEMS_ROUTE = `${CLIENT_SPACE_BASE}/items`;

/** One page of My requests (`?kind=&q=&state=&page=`), newest first. No
 *  kind: every kind; `all`: every state. */
export function clientItemsPath(opts: {
  kind?: ClientItemKind | null;
  q?: string;
  state?: ClientItemFilter;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (opts.kind) sp.set('kind', opts.kind);
  if (opts.q?.trim()) sp.set('q', opts.q.trim());
  if (opts.state && opts.state !== 'all') sp.set('state', opts.state);
  sp.set('page', String(opts.page ?? 1));
  return `${CLIENT_ITEMS_ROUTE}?${sp.toString()}`;
}

/** An accepted item, read only. */
export function clientAcceptedPath(id: string): string {
  return `${CLIENT_SPACE_BASE}/accepted/${encodeURIComponent(id)}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The kind filter's choices: every kind, then the three a client has. */
export const CLIENT_KIND_OPTIONS: readonly { value: ClientItemKind | 'all'; label: string }[] = [
  { value: 'all', label: 'Everything' },
  ...CLIENT_ITEM_KINDS.map((k) => ({ value: k, label: cap(MEMBER_KIND[k].many) })),
];

const STATE_LABEL: Record<ClientItemFilter, string> = {
  all: 'All items',
  private: 'Private',
  submitted: 'Submitted',
  returned: 'Returned',
  // A client never reads a staff role (audit U3): a reviewer holds it.
  'with-admin': 'With the team',
  accepted: 'Accepted',
};

/** The State filter's choices, the first the default: the brain's list. */
export const CLIENT_STATE_OPTIONS: readonly { value: ClientItemFilter; label: string }[] =
  CLIENT_ITEM_FILTERS.map((v) => ({ value: v, label: STATE_LABEL[v] }));

export function clientStateOf(params: Pick<URLSearchParams, 'get'> | null): ClientItemFilter {
  const v = params?.get('state');
  return isClientItemFilter(v) ? v : 'all';
}

export function clientKindOf(params: Pick<URLSearchParams, 'get'> | null): ClientItemKind | null {
  const v = params?.get('kind');
  return isClientItemKind(v) ? v : null;
}

/** The URL's `src` for a row: an accepted row opens the accepted reader,
 *  an own row the client's own item view. */
export type ClientRowSrc = 'own' | 'accepted';

export function clientSrcOf(params: Pick<URLSearchParams, 'get'> | null): ClientRowSrc {
  return params?.get('src') === 'accepted' ? 'accepted' : 'own';
}

/** The query string for the open row: `id`, and `src=accepted` for an
 *  accepted one (an own row is the default and names none). */
export function clientRowQuery(
  current: string,
  next: { id: string | null; src?: ClientRowSrc },
): string {
  const sp = new URLSearchParams(current);
  if (next.id) sp.set('id', next.id);
  else sp.delete('id');
  if (next.id && next.src === 'accepted') sp.set('src', 'accepted');
  else sp.delete('src');
  return sp.toString();
}

/** What My requests says with no rows: why, in the client's words. */
export function clientRequestsEmpty(opts: {
  q: string;
  kind: ClientItemKind | null;
  state: ClientItemFilter;
}): string {
  if (opts.q || opts.kind || opts.state !== 'all') return 'Nothing matches that.';
  return 'Nothing here yet. Start a page or a note with New, or upload a file.';
}

/** The row's own words beside its pill: when it was accepted (the list's
 *  own date format, as the updated stamp), else nothing. */
export function acceptedStamp(row: Pick<ClientItemRow, 'source' | 'acceptedAt'>): string | null {
  if (row.source !== 'accepted') return null;
  return row.acceptedAt ? `accepted ${formatDate(row.acceptedAt)}` : 'accepted';
}

/** Why a client's upload is refused before a byte is sent (over 20 MB), or
 *  null when it may go. The brain's own caps (space, day, items) answer
 *  after, in its own words. */
export function clientUploadRefusal(size: number): string | null {
  return memberUploadRefusal(size, CLIENT_MAX_UPLOAD_BYTES);
}

// ── Older brains ────────────────────────────────────────────────────────────

/** A C5 route an older brain does not have: its 404. The screen then shows
 *  a quiet line (or nothing) instead of an error, and asks no more. */
export function isMissingRoute(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** The routes this page load found missing (a 404), by route. */
const missingRoutes = new Set<string>();

/**
 * Ask a C5 route through `ask`, unless this page load already found it
 * missing: then answer that 404 again without a request. So nothing asks a
 * brain before C5 twice (audit U4): not the portal's shell poll or focus
 * refresh (refreshClientPortal invalidates My requests), not a thread's
 * refetch on focus, not a remount. `route` names what is missing: the list
 * route for My requests (whatever its query), the thread's own path for a
 * thread (a 404 there can also mean the item left client level). A reload
 * asks again, once.
 */
export async function askUnlessMissing<T>(route: string, ask: () => Promise<T>): Promise<T> {
  if (missingRoutes.has(route)) {
    throw new ApiError('Not found.', 404, { reason: 'missing-route' });
  }
  try {
    return await ask();
  } catch (err) {
    if (isMissingRoute(err)) missingRoutes.add(route);
    throw err;
  }
}

/** Forget every missing route (the tests; a new session starts empty). */
export function forgetMissingRoutes(): void {
  missingRoutes.clear();
}

/** What My requests shows on a brain before C5. */
export const CLIENT_REQUESTS_UNAVAILABLE = 'My requests is not available here yet.';

// ── Comment threads on items at client level (decision 8) ───────────────────

/** Every thread a client or a member reads on a client-level item. */
export const CLIENT_COMMENTS_KEY = ['client-comments'] as const;

/** A client has no live stream, and a member's stream does not carry these
 *  threads: an open thread is asked again this often, and on focus. */
export const CLIENT_COMMENTS_POLL_MS = 30_000;

/** The poll, stopped for a thread the brain does not have (404). */
export function commentsPollMs(error: unknown): number | false {
  return isMissingRoute(error) ? false : CLIENT_COMMENTS_POLL_MS;
}

/** The thread on an item shared with clients, as a client reads it. */
export function sharedCommentsPath(id: string): string {
  return `${CLIENT_SPACE_BASE}/shared/${encodeURIComponent(id)}/comments`;
}

/** The same thread, as a member reads it on a client-level Library item. */
export function libraryCommentsPath(id: string): string {
  return `/api/member/library/${encodeURIComponent(id)}/comments`;
}

/** One comment of a thread, for its delete. */
export function commentPath(threadPath: string, commentId: string): string {
  return `${threadPath}/${encodeURIComponent(commentId)}`;
}

/**
 * The chip beside a comment's author, per reader. A client sees the team's
 * comments marked (the names are people it may not know); a member sees a
 * client's comments marked. The reader's own side wears none.
 */
export const CLIENT_THREAD_CHIPS: Record<NodeCommentAuthorKind, string | null> = {
  owner: 'Team',
  member: 'Team',
  agent: null,
  client: null,
};
export const MEMBER_THREAD_CHIPS: Record<NodeCommentAuthorKind, string | null> = {
  owner: null,
  member: null,
  agent: null,
  client: 'Client',
};

// ── A client's submitted items, on the member side ──────────────────────────

/** A client request, read only, as a member reads it. */
export function clientRequestPath(id: string): string {
  return `/api/member/client-requests/${encodeURIComponent(id)}`;
}

/** Its file bytes (a member session, or the member `?at=` token). */
export function clientRequestBytesPath(id: string): string {
  return `${clientRequestPath(id)}/bytes`;
}
