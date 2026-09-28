/**
 * The member's personal-space API (member logins Phase 2), as the brain
 * serves it under /api/member/*. The wire shapes are the brain's published
 * contract (@mantle/client-types, audit M3); the local names stay so callers
 * need not change. The client narrows the editor documents and the table.
 *
 * An ADMIN's own private space (Phase 7) is the same routes under
 * /api/admin/* (same methods, bodies and shapes), minus everything a member
 * does with other people (share, submit, recall, comments, realtime), plus a
 * self-accept into the brain. `spaceClient(base)` serves both.
 */
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import type { TableDetail } from '@mantle/content-core/table-model';
import type {
  AccessLevel,
  MemberItemKind,
  MemberReviewState,
  MemberSpaceFile,
  MemberSpaceItem,
  MemberSpaceItemBody,
  MemberSpaceItemRow,
  MemberSpaceList,
  MemberSpaceSharing,
  NodeComment,
} from '@mantle/client-types';
import { formatBytes } from './upload-progress';
import { dropRescue, keepRescue } from './member-rescue';
import type { AcceptInput, AcceptResult } from './member-review';

export type SpaceKind = MemberItemKind;
export type SpaceSharing = MemberSpaceSharing;
export type ReviewState = MemberReviewState;

/** Where a member's list reads from: their own items, teammates' shared
 *  items, the Library (brain items at the team level), or what they wrote
 *  and an admin accepted into the brain (any level; brains from 0.232.285). */
export type SpaceSource = 'mine' | 'team' | 'library' | 'accepted';

export type SpaceItemRow = MemberSpaceItemRow;
export type SpaceFile = MemberSpaceFile;

type Doc = Record<string, unknown>;

export type SpaceItemBody = MemberSpaceItemBody<Doc, TableDetail>;
export type SpaceItem = MemberSpaceItem<Doc, TableDetail>;
export type SpaceList = MemberSpaceList;
export type SpaceComment = NodeComment;

/** What a member reads for a refusal the brain answered without a sentence
 *  of its own (it normally sends one in `error`). */
const REFUSAL_TEXT: Record<string, string> = {
  quota: 'Your space is full. Delete something to make room, then try again.',
  embed:
    'This uses items you cannot share: only your own items and Library items. Remove them, then save.',
  'rate-limit': 'Too many requests just now. Wait a moment, then try again.',
  frozen: 'Submitted for review: nobody can change it now. Recall it to make a correction.',
};

/**
 * The sentence for a member-route refusal: the brain's own `error` when it
 * sent one (every state refusal does: quota, embed, frozen, …), else a
 * sentence for its `reason` (a 429 counts as rate-limit), else null so the
 * caller keeps its own fallback.
 */
export function refusalMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = (err.body ?? {}) as { error?: unknown; reason?: unknown };
  const reason =
    typeof body.reason === 'string' ? body.reason : err.status === 429 ? 'rate-limit' : null;
  // `forbidden` / `unauthorized` are codes, not sentences.
  if (typeof body.error === 'string' && body.error && !/^[a-z-]+$/.test(body.error)) {
    return body.error;
  }
  return (reason && REFUSAL_TEXT[reason]) || null;
}

/** A member's per-upload cap: the brain's SPACE_FILE_MAX_BYTES (100 MB,
 *  docs/member-logins.md section 5). A member's upload goes straight to
 *  /api/member/space-files, not through the upload dock, so the workspace
 *  checks it itself before a byte is sent. The brain still refuses above it. */
export const MEMBER_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Why a member upload of `size` bytes is refused before it starts, or null
 *  when it may go. Names the file's size unless it rounds to the limit's. */
export function memberUploadRefusal(size: number): string | null {
  if (size <= MEMBER_MAX_UPLOAD_BYTES) return null;
  const limit = formatBytes(MEMBER_MAX_UPLOAD_BYTES);
  const actual = formatBytes(size);
  return actual === limit
    ? `This file is over the ${limit} upload limit.`
    : `This file is ${actual}, over the ${limit} upload limit.`;
}

/** Whose own space a client reads: a member's, or an admin's private one. */
export type SpaceApiBase = '/api/member' | '/api/admin';
export const MEMBER_API_BASE: SpaceApiBase = '/api/member';
export const ADMIN_API_BASE: SpaceApiBase = '/api/admin';

/** The route one own item answers on, under its space's base. */
export function ownItemPath(id: string, base: SpaceApiBase = MEMBER_API_BASE): string {
  return `${base}/space/${id}`;
}

/** An own-space list page (`?kind=&q=&page=`), under its space's base. */
export function ownListPath(
  opts: { kind: SpaceKind; q?: string; page?: number },
  base: SpaceApiBase = MEMBER_API_BASE,
): string {
  const sp = new URLSearchParams({ kind: opts.kind, page: String(opts.page ?? 1) });
  if (opts.q?.trim()) sp.set('q', opts.q.trim());
  return `${base}/space?${sp.toString()}`;
}

/** The routes one item answers on: own items vs a teammate's shared one. */
export function itemBase(source: 'mine' | 'team', id: string): string {
  return source === 'mine' ? ownItemPath(id) : `/api/member/team-drafts/${id}`;
}

export function listPath(
  source: SpaceSource,
  opts: { kind: SpaceKind; q?: string; page?: number },
): string {
  if (source === 'mine') return ownListPath(opts);
  const sp = new URLSearchParams({ kind: opts.kind, page: String(opts.page ?? 1) });
  if (opts.q?.trim()) sp.set('q', opts.q.trim());
  const base =
    source === 'team'
      ? '/api/member/team-drafts'
      : source === 'accepted'
        ? '/api/member/accepted'
        : '/api/member/library';
  return `${base}?${sp.toString()}`;
}

/**
 * Mine filtered by review state (`?review=` takes a comma list), for the
 * member home's Returned and Waiting for review lists: read from the whole
 * space, not picked out of the newest page. A brain older than the filter
 * ignores it and answers the newest page, which `splitByReview` still sorts.
 */
export function reviewListPath(states: readonly ReviewState[], page = 1): string {
  const sp = new URLSearchParams({ review: states.join(','), page: String(page) });
  return `/api/member/space?${sp.toString()}`;
}

/** The returned and the submitted rows of a list, each in list order. */
export function splitByReview<T extends Pick<SpaceItemRow, 'reviewState'>>(
  rows: readonly T[],
): { returned: T[]; submitted: T[] } {
  return {
    returned: rows.filter((r) => r.reviewState === 'returned'),
    submitted: rows.filter((r) => r.reviewState === 'submitted'),
  };
}

/** The browser's cap on keepalive request bodies is 64 KB (shared by all of
 *  a page's keepalive requests in flight); stay under it. */
const KEEPALIVE_MAX_BYTES = 60_000;

/**
 * An autosave write. `keepalive` lets a write that starts while the tab is
 * unloading (the leave flush on a reload or a tab close: pagehide,
 * visibilitychange) reach the brain instead of being cancelled with the
 * page. Bigger bodies go without it, as every write did before.
 */
async function sendAutosave<T>(path: string, method: 'PUT' | 'PATCH', body: unknown): Promise<T> {
  const text = JSON.stringify(body);
  const keepalive = new TextEncoder().encode(text).length < KEEPALIVE_MAX_BYTES;
  // Too big to outlive the page: keep a copy until the brain answers, so a
  // reload that cuts it off is sent on the next open (lib/member-rescue.ts).
  if (!keepalive) keepRescue(path, { method, body: text, at: Date.now() });
  try {
    return await apiFetch<T>(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: text,
      keepalive,
    });
  } finally {
    // Answered (either way): the queue owns what happens next.
    if (!keepalive) dropRescue(path);
  }
}

/**
 * The own-space routes one space answers on: create, read, autosave, save a
 * version, delete, upload and the list. The same for a member (/api/member)
 * and for an admin's private space (/api/admin); nothing here reaches another
 * person, so the admin variant is this and no more (plus `accept`).
 */
export function spaceClient(base: SpaceApiBase = MEMBER_API_BASE) {
  const own = (id: string) => ownItemPath(id, base);
  return {
    base,
    create: (body: { type: 'page' | 'note' | 'draw' | 'table'; title: string }) =>
      apiSend<{ item: SpaceItemRow }>(`${base}/space`, 'POST', body),
    /** One own item; a table reads one tab (`tabId`, else its first). */
    item: (id: string, tabId?: string | null) =>
      apiFetch<SpaceItem>(`${own(id)}${tabId ? `?tab=${encodeURIComponent(tabId)}` : ''}`),
    patch: (id: string, body: { title?: string; icon?: string; content?: string }) =>
      sendAutosave<SpaceItem>(own(id), 'PATCH', body),
    remove: (id: string) => apiSend<{ ok: true }>(own(id), 'DELETE'),
    /** Autosave: a page `doc`, a drawing `scene`, or a table as a whole
     *  `table` document or an `ops` batch (the owner's op schema). */
    draft: (
      id: string,
      body: { doc?: Doc; scene?: Doc; table?: Doc; ops?: unknown[]; if_rev?: number },
    ) =>
      sendAutosave<{ ok: true; draft_rev: number; created_ids?: (string | null)[] }>(
        `${own(id)}/draft`,
        'PUT',
        body,
      ),
    save: (id: string, body: { doc?: Doc; scene?: Doc; svg?: string; if_rev?: number }) =>
      apiSend<SpaceItem>(`${own(id)}/save`, 'POST', body),
    /** A file into the space (multipart). */
    upload: (file: File) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return apiFetch<{ row: SpaceItemRow }>(`${base}/space-files`, { method: 'POST', body: fd });
    },
    listPath: (opts: { kind: SpaceKind; q?: string; page?: number }) => ownListPath(opts, base),
    /** Where an own file's bytes stream from. */
    bytesPath: (id: string) => `${own(id)}/bytes`,
  };
}

export type SpaceClient = ReturnType<typeof spaceClient>;

export const memberSpace = {
  ...spaceClient(MEMBER_API_BASE),
  get: (source: 'mine' | 'team', id: string, tabId?: string | null) =>
    apiFetch<SpaceItem>(
      `${itemBase(source, id)}${tabId ? `?tab=${encodeURIComponent(tabId)}` : ''}`,
    ),
  share: (id: string, sharing: SpaceSharing) =>
    apiSend<{ item: SpaceItemRow }>(`/api/member/space/${id}/share`, 'POST', { sharing }),
  submit: (id: string) => apiSend<{ item: SpaceItemRow }>(`/api/member/space/${id}/submit`, 'POST'),
  recall: (id: string) => apiSend<{ item: SpaceItemRow }>(`/api/member/space/${id}/recall`, 'POST'),
  comments: (source: 'mine' | 'team', id: string) =>
    apiFetch<{ comments: SpaceComment[] }>(`${itemBase(source, id)}/comments`),
  addComment: (source: 'mine' | 'team', id: string, body: string) =>
    apiSend<{ comment: SpaceComment }>(`${itemBase(source, id)}/comments`, 'POST', { body }),
  deleteComment: (source: 'mine' | 'team', id: string, commentId: string) =>
    apiSend<{ ok: true }>(`${itemBase(source, id)}/comments/${commentId}`, 'DELETE'),
};

/**
 * An admin's own private space (member logins Phase 7): seen by that admin
 * only, no review. `accept` moves an item into the brain directly, with the
 * body and answer of the Team admin submissions accept route.
 */
export const adminSpace = {
  ...spaceClient(ADMIN_API_BASE),
  accept: (id: string, input: AcceptInput) =>
    apiSend<AcceptResult>(`${ownItemPath(id, ADMIN_API_BASE)}/accept`, 'POST', input),
};

export type AdminSpaceClient = typeof adminSpace;

/** Is this the admin's private space (not a member's)? */
export function isAdminSpace(client: Pick<SpaceClient, 'base'>): boolean {
  return client.base === ADMIN_API_BASE;
}

/**
 * The query string a member's workspace moves to (`?src=`, `?id=`). The
 * admin screens' redirects (/notes/<id>, /tables/<id>) write `?selected=<id>`
 * and `&edit=1`, which the workspace reads as the open item too: so any
 * change of the open item drops both, or Close would leave `selected` open
 * and a source switch would keep it open under the wrong source.
 */
export function workspaceQuery(
  current: string,
  next: { src?: SpaceSource; id?: string | null },
): string {
  const sp = new URLSearchParams(current);
  if (next.src !== undefined) {
    if (next.src === 'mine') sp.delete('src');
    else sp.set('src', next.src);
  }
  if (next.id !== undefined) {
    sp.delete('selected');
    sp.delete('edit');
    if (next.id) sp.set('id', next.id);
    else sp.delete('id');
  }
  return sp.toString();
}

/**
 * How the workspace moves to `next`: opening an item (a different id) is a
 * new history entry, so Back on a phone returns to the list instead of
 * leaving the screen. Everything else replaces the entry: closing, switching
 * the source, and rewriting a redirect's `?selected=` to `?id=` for the item
 * already open.
 */
export function workspaceNavMode(
  current: string,
  next: { src?: SpaceSource; id?: string | null },
): 'push' | 'replace' {
  if (!next.id) return 'replace';
  const sp = new URLSearchParams(current);
  const open = sp.get('id') ?? sp.get('selected');
  return next.id === open ? 'replace' : 'push';
}

/**
 * Which source an item id opens from, for a link to its own route
 * (/pages/<id>, /draw/<id>): Mine first, then Team drafts, the Library, and
 * last what the member wrote and an admin accepted (at any level).
 * `probe` reads the item from one source. A 404 (or a 400 for an id that is
 * no item's) means "not in this source"; any other failure stops the search
 * and answers Mine, whose screen says it could not load the item. Null when
 * no source has it.
 */
export async function resolveMemberSource(
  probe: (source: SpaceSource) => Promise<unknown>,
): Promise<SpaceSource | null> {
  for (const source of ['mine', 'team', 'library', 'accepted'] as const) {
    try {
      await probe(source);
      return source;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) continue;
      return 'mine';
    }
  }
  return null;
}

/** The read `resolveMemberSource` probes with: one item from one source. */
export function probeMemberItem(id: string): (source: SpaceSource) => Promise<unknown> {
  return (source) =>
    source === 'library' || source === 'accepted'
      ? apiFetch(`/api/member/${source}/${encodeURIComponent(id)}`)
      : apiFetch(itemBase(source, encodeURIComponent(id)));
}

/**
 * Where an accepted item now sits, in the author's words: at admin only
 * admins see it in the brain (the author still reads it here), at team or
 * lower it is in the Library for the whole team.
 */
export function acceptedPlace(level: AccessLevel): string {
  return level === 'admin' ? 'Admins only' : 'In the Library';
}

/** Where an item's bytes stream from (files) for this source. */
export function bytesPath(source: 'mine' | 'team', id: string): string {
  return `${itemBase(source, id)}/bytes`;
}

/** Is the member allowed to edit this own item right now? Submitted (frozen)
 *  and accepted items are read-only until Recall or Return. */
export function isEditable(row: Pick<SpaceItemRow, 'reviewState'>): boolean {
  return row.reviewState === 'draft' || row.reviewState === 'returned';
}

/** Commenting is open on an own item while it is shared or submitted. */
export function commentsOpen(row: Pick<SpaceItemRow, 'sharing' | 'reviewState'>): boolean {
  return row.sharing === 'team' || row.reviewState === 'submitted';
}
