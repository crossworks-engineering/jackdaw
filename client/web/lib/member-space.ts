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
  GiveBackResult,
  MemberAcceptedItem,
  MemberReviewState,
  MemberSpaceFile,
  MemberSpaceItem,
  MemberSpaceItemBody,
  MemberSpaceItemRow,
  MemberSpaceItemState,
  MemberSpaceList,
  MemberSpaceSharing,
  NodeComment,
} from '@mantle/client-types';
import { MEMBER_ITEM_KINDS, MEMBER_KIND } from './member-kinds';
import { formatBytes } from './upload-progress';
import { dropRescue, keepRescue } from './member-rescue';
import type { AcceptInput, AcceptResult } from './member-review';

export type SpaceKind = MemberItemKind;
export type SpaceSharing = MemberSpaceSharing;

/** A personal item's stored review state. `taken`: an admin took the
 *  submitted item into their own private space (admin rows and the Review
 *  queue only; a member's list says `with-admin` instead). */
export type ReviewState = MemberReviewState;

/** A row's state in a list: the stored state, or `with-admin` on the
 *  member's own list for an item an admin took over (title and kind only;
 *  every route of it answers 409 `with-admin`). */
export type SpaceItemState = MemberSpaceItemState;

/** Where a member's list reads from: their own items, teammates' shared
 *  items, the Library (brain items at the team level), or what they wrote
 *  and an admin accepted into the brain (any level; brains from 0.232.285). */
export type SpaceSource = 'mine' | 'team' | 'library' | 'accepted';

/** What the member workspace's `?src=` may name: a source above, or
 *  `client-request`, a client's submitted item the member reads only
 *  (client logins C5; no link resolves to one). */
export type WorkspaceSource = SpaceSource | 'client-request';

export type SpaceItemRow = MemberSpaceItemRow;
export type SpaceFile = MemberSpaceFile;

type Doc = Record<string, unknown>;

export type SpaceItemBody = MemberSpaceItemBody<Doc, TableDetail>;
export type SpaceItem = MemberSpaceItem<Doc, TableDetail>;
export type SpaceList = MemberSpaceList;
export type SpaceComment = NodeComment;

/** The admin's private space (Take over, audit F07): each row names who
 *  wrote it when the admin took it over (`takenFrom`), else null. */
export type {
  AdminSpaceItemRow,
  AdminSpaceList,
  AdminTakenFrom,
  GiveBackResult,
  MovedSpaceItem,
} from '@mantle/client-types';

/** What a member reads for a refusal the brain answered without a sentence
 *  of its own (it normally sends one in `error`). */
const REFUSAL_TEXT: Record<string, string> = {
  quota: 'Your space is full. Delete something to make room, then try again.',
  embed:
    'This uses items you cannot share: only your own items and Library items. Remove them, then save.',
  'rate-limit': 'Too many requests just now. Wait a moment, then try again.',
  frozen: 'Submitted for review: nobody can change it now. Recall it to make a correction.',
  'with-admin':
    'An admin is working on this. You will see it again when it is accepted or given back.',
  'too-large': 'This holds too many items to move at once (more than 200).',
  // Client logins C5 audit fixes: a client's day of comments, a full
  // thread, and a request body over the brain's ceiling. The brain sends
  // its own sentence with each; these read when it does not.
  'comment-cap': 'You have written as many comments as you can today. Try again tomorrow.',
  'thread-full': 'This thread is full: it takes no more comments.',
  'body-too-large': 'This is too big to send in one go. Make it smaller, then try again.',
};

/** What a member reads for an item an admin has taken over (audit F07). */
export const WITH_ADMIN_TEXT = REFUSAL_TEXT['with-admin']!;

/** The embed refusal's fallback, and what a CLIENT reads in its place
 *  (client tier audit U6): a client has no Library. */
export const EMBED_TEXT = REFUSAL_TEXT.embed!;
export const CLIENT_EMBED_TEXT =
  'This uses items you cannot share: only your own items and items shared with you. Remove them, then save.';

/** What a CLIENT reads for it (client logins C5 audit fix U3): a client
 *  never reads a staff role, so the one who holds it is the reviewer. */
export const CLIENT_WITH_REVIEWER_TEXT =
  'The reviewer is working on this. You will see it again when it is accepted or given back.';

/** The `reason` of a 409 state refusal, else null. */
export function refusalReason(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const reason = (err.body as { reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' && reason ? reason : null;
}

/** The ids a state refusal names (`frozen`, `unsaved-draft`, `embed`, …). */
export function refusalIds(err: unknown): string[] {
  if (!(err instanceof ApiError)) return [];
  const ids = (err.body as { ids?: unknown } | null | undefined)?.ids;
  return Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : [];
}

/** An own item an admin took over: every member route of it answers 409
 *  `with-admin`. */
export function isWithAdminRefusal(err: unknown): boolean {
  return refusalReason(err) === 'with-admin';
}

/**
 * The submitted item that freezes this one (audit F04): a 409 `frozen` whose
 * `ids` name ANOTHER item, because this one renders inside it (a bundle
 * item). Null for the item's own freeze, or any other answer.
 */
export function frozenByOther(reason: string | null, ids: readonly string[], ownId: string) {
  if (reason !== 'frozen') return null;
  return ids.find((i) => i !== ownId) ?? null;
}

/**
 * The items shown inside this one that must be saved first: a 409
 * `unsaved-draft` from Submit naming items of its bundle. Empty when it
 * names only the item itself (the editor's own Save version handles that),
 * or for any other answer.
 */
export function unsavedBundleIds(err: unknown, ownId: string): string[] {
  if (refusalReason(err) !== 'unsaved-draft') return [];
  return refusalIds(err).filter((i) => i !== ownId);
}

/**
 * The sentence for a member-route refusal: the brain's own `error` when it
 * sent one (every state refusal does: quota, embed, frozen, comment-cap,
 * thread-full, too-large, body-too-large, …), else a sentence for its
 * `reason` (a bare 429 counts as rate-limit), else null so the caller keeps
 * its own fallback.
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

/** A CLIENT login's per-upload cap (client logins C5): 20 MB a file. The
 *  brain also caps a client's space (200 MB), a day's uploads (50 MB) and
 *  its items (500); those refusals come back as a 409 `quota` with the
 *  brain's own sentence. */
export const CLIENT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Why an upload of `size` bytes is refused before it starts, or null when
 *  it may go (a member's cap unless `max` names another). Names the file's
 *  size unless it rounds to the limit's. */
export function memberUploadRefusal(
  size: number,
  max: number = MEMBER_MAX_UPLOAD_BYTES,
): string | null {
  if (size <= max) return null;
  const limit = formatBytes(max);
  const actual = formatBytes(size);
  return actual === limit
    ? `This file is over the ${limit} upload limit.`
    : `This file is ${actual}, over the ${limit} upload limit.`;
}

/** Whose routes a client reads: a member's own space, an admin's private
 *  one, or a client login's (client logins C2: its shared items and bytes,
 *  lib/client-portal.ts; C5: its own items, `clientSpace`). */
export type SpaceApiBase = '/api/member' | '/api/admin' | '/api/client';
export const MEMBER_API_BASE: SpaceApiBase = '/api/member';
export const ADMIN_API_BASE: SpaceApiBase = '/api/admin';
export const CLIENT_SPACE_BASE: SpaceApiBase = '/api/client';

/** The route one own item answers on, under its space's base. The id is
 *  encoded: it often comes from the URL (`?id=`), and a crafted one such as
 *  `../chat` must stay one path segment, never another route (audit U8). */
export function ownItemPath(id: string, base: SpaceApiBase = MEMBER_API_BASE): string {
  return `${base}/space/${encodeURIComponent(id)}`;
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
  return source === 'mine' ? ownItemPath(id) : `/api/member/team-drafts/${encodeURIComponent(id)}`;
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
export function reviewListPath(states: readonly SpaceItemState[], page = 1): string {
  const sp = new URLSearchParams({ review: states.join(','), page: String(page) });
  return `/api/member/space?${sp.toString()}`;
}

/** The returned, the submitted and the with-admin rows of a list, each in
 *  list order. */
export function splitByReview<T extends Pick<SpaceItemRow, 'reviewState'>>(
  rows: readonly T[],
): { returned: T[]; submitted: T[]; withAdmin: T[] } {
  return {
    returned: rows.filter((r) => r.reviewState === 'returned'),
    submitted: rows.filter((r) => r.reviewState === 'submitted'),
    withAdmin: rows.filter((r) => r.reviewState === 'with-admin'),
  };
}

const REVIEW_LABEL: Record<SpaceItemState, string | null> = {
  draft: null,
  submitted: 'Submitted',
  returned: 'Returned',
  accepted: 'Accepted',
  // An admin's row for an item taken over: its "From <member>" badge says it.
  taken: null,
  'with-admin': 'With admin',
};

/**
 * What an own item's StatusChip says: who can see it and, once it has left
 * draft, its review state. An item an admin took over (audit F07) says only
 * "With admin": who can see it is the admin's business until it comes back.
 * A client reads "With the team" (`client`, audit U3: no staff role).
 */
export function statusLabels(
  row: Pick<SpaceItemRow, 'sharing' | 'reviewState'>,
  client = false,
): {
  sharing: 'Private' | 'Shared with team' | null;
  review: string | null;
} {
  const review =
    client && row.reviewState === 'with-admin'
      ? 'With the team'
      : (REVIEW_LABEL[row.reviewState] ?? null);
  if (row.reviewState === 'with-admin') return { sharing: null, review };
  return { sharing: row.sharing === 'team' ? 'Shared with team' : 'Private', review };
}

/**
 * The badge a Library row wears for its level (client logins C2): the
 * Library lists items at team AND client level, and a client-level one is
 * marked "Client", since the brain's client logins read it too. Team rows,
 * the quiet default, wear none.
 */
export function libraryLevelBadge(audience: string | null | undefined): 'Client' | null {
  return audience === 'client' ? 'Client' : null;
}

/** What that badge says on hover. */
export const LIBRARY_CLIENT_TITLE = 'Client level: client logins read this too';

/** A row the member's list shows for an item an admin took over: no editor,
 *  no content, no actions (audit F07). */
export function isWithAdmin(row: Pick<SpaceItemRow, 'reviewState'>): boolean {
  return row.reviewState === 'with-admin';
}

/**
 * The JSON body of a member write, with every NUL character dropped from its
 * strings. Postgres refuses NUL in text, so one pasted NUL made every later
 * save of the item fail as a 500 (the brain strips it too, from the release
 * after v0.232.305; this keeps older brains saving). Nothing a person reads
 * is lost: NUL renders as nothing.
 */
export function memberWriteJson(body: unknown): string {
  return JSON.stringify(body, (_key, value: unknown) =>
    typeof value === 'string' && value.includes('\u0000') ? value.split('\u0000').join('') : value,
  );
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
  const text = memberWriteJson(body);
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
    /** A note may take its text in the same call. */
    /** `folderId`: a folder the member's tree shows, to file it in (folder
     *  plan phase 5; notes, drawings and tables). */
    create: (body: {
      type: 'page' | 'note' | 'draw' | 'table';
      title: string;
      content?: string;
      folderId?: string | null;
    }) =>
      apiFetch<{ item: SpaceItemRow }>(`${base}/space`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: memberWriteJson(body),
      }),
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
      apiFetch<SpaceItem>(`${own(id)}/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: memberWriteJson(body),
      }),
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
    apiSend<{ item: SpaceItemRow }>(`${ownItemPath(id)}/share`, 'POST', { sharing }),
  submit: (id: string) => apiSend<{ item: SpaceItemRow }>(`${ownItemPath(id)}/submit`, 'POST'),
  recall: (id: string) => apiSend<{ item: SpaceItemRow }>(`${ownItemPath(id)}/recall`, 'POST'),
  comments: (source: 'mine' | 'team', id: string) =>
    apiFetch<{ comments: SpaceComment[] }>(`${itemBase(source, id)}/comments`),
  addComment: (source: 'mine' | 'team', id: string, body: string) =>
    apiSend<{ comment: SpaceComment }>(`${itemBase(source, id)}/comments`, 'POST', { body }),
  deleteComment: (source: 'mine' | 'team', id: string, commentId: string) =>
    apiSend<{ ok: true }>(
      `${itemBase(source, id)}/comments/${encodeURIComponent(commentId)}`,
      'DELETE',
    ),
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
  /** An item taken over from the Review queue goes back to its member with
   *  the note, with everything taken with it (audit F07). */
  giveBack: (id: string, note: string) =>
    apiSend<GiveBackResult>(`${ownItemPath(id, ADMIN_API_BASE)}/give-back`, 'POST', { note }),
};

export type AdminSpaceClient = typeof adminSpace;

/** Is this the admin's private space (not a member's)? */
export function isAdminSpace(client: Pick<SpaceClient, 'base'>): boolean {
  return client.base === ADMIN_API_BASE;
}

/**
 * A CLIENT login's own space (client logins C5): the member space routes
 * under /api/client, for pages, notes and files. A client submits and
 * recalls, and talks with the reviewers on a submitted item; it never shares
 * (no Team drafts: a client's item is private until submitted).
 */
export const clientSpace = {
  ...spaceClient(CLIENT_SPACE_BASE),
  submit: (id: string) =>
    apiSend<{ item: SpaceItemRow }>(`${ownItemPath(id, CLIENT_SPACE_BASE)}/submit`, 'POST'),
  recall: (id: string) =>
    apiSend<{ item: SpaceItemRow }>(`${ownItemPath(id, CLIENT_SPACE_BASE)}/recall`, 'POST'),
};

/** Is this a client login's own space? */
export function isClientSpace(client: Pick<SpaceClient, 'base'>): boolean {
  return client.base === CLIENT_SPACE_BASE;
}

/** Submit and Recall for the space an item view writes to: a client's own
 *  routes, else a member's (an admin's private space has no review). */
export function reviewClient(client: Pick<SpaceClient, 'base'>): {
  submit: (id: string) => Promise<{ item: SpaceItemRow }>;
  recall: (id: string) => Promise<{ item: SpaceItemRow }>;
} {
  return isClientSpace(client) ? clientSpace : memberSpace;
}

/** The discussion on an own item (or a teammate's) for the space an item
 *  view reads: a client's review talk on its own submitted item lives under
 *  /api/client/space/:id/comments, a member's under its own routes. */
export function spaceCommentsPath(
  client: Pick<SpaceClient, 'base'>,
  source: 'mine' | 'team',
  id: string,
): string {
  return isClientSpace(client)
    ? `${ownItemPath(id, CLIENT_SPACE_BASE)}/comments`
    : `${itemBase(source, id)}/comments`;
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
  next: { src?: WorkspaceSource; id?: string | null },
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
  next: { src?: WorkspaceSource; id?: string | null },
): 'push' | 'replace' {
  if (!next.id) return 'replace';
  const sp = new URLSearchParams(current);
  const open = sp.get('id') ?? sp.get('selected');
  return next.id === open ? 'replace' : 'push';
}

/**
 * Which source an item id opens from, for a link to its own route
 * (/pages/<id>, /draw/<id>, /notes/<id>, /tables/<id>, /n/<id>): Mine first,
 * then Team drafts, the Library, and last what the member wrote and an admin
 * accepted (at any level). `probe` reads the item from one source and answers
 * what that source sent, so the item's kind comes with it. A 404 (or a 400
 * for an id that is no item's) means "not in this source"; any other failure
 * stops the search and answers Mine with no kind, whose screen says it could
 * not load the item. Null when no source has it.
 */
export async function resolveMemberItem(
  probe: (source: SpaceSource) => Promise<unknown>,
): Promise<{ source: SpaceSource; kind: SpaceKind | null; withAdmin?: true } | null> {
  for (const source of ['mine', 'team', 'library', 'accepted'] as const) {
    try {
      return { source, kind: memberItemKind(await probe(source)) };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) continue;
      // An own item an admin took over: it is the member's, but nothing of it
      // can be opened until it is accepted or given back (audit F07).
      if (source === 'mine' && isWithAdminRefusal(err)) {
        return { source: 'mine', kind: null, withAdmin: true };
      }
      return { source: 'mine', kind: null };
    }
  }
  return null;
}

/** `resolveMemberItem`, the source only. */
export async function resolveMemberSource(
  probe: (source: SpaceSource) => Promise<unknown>,
): Promise<SpaceSource | null> {
  return (await resolveMemberItem(probe))?.source ?? null;
}

/** The kind of one item read: Mine and Team drafts answer `{ row, body }`,
 *  the Library and Accepted `{ item }`. Null for anything else. */
export function memberItemKind(read: unknown): SpaceKind | null {
  const r = (read ?? {}) as { row?: { type?: unknown }; item?: { type?: unknown } };
  const type = r.row?.type ?? r.item?.type;
  return typeof type === 'string' && (MEMBER_ITEM_KINDS as readonly string[]).includes(type)
    ? (type as SpaceKind)
    : null;
}

/** Where a resolved item opens: its kind's member screen with the source and
 *  the item in the query. `fallbackPath` (the route the link named) serves
 *  when the kind is unknown; null when there is neither. */
export function memberItemHref(
  found: { source: SpaceSource; kind: SpaceKind | null },
  id: string,
  fallbackPath?: string,
): string | null {
  const path = found.kind ? MEMBER_KIND[found.kind].path : fallbackPath;
  if (!path) return null;
  return `${path}?${workspaceQuery('', { src: found.source, id })}`;
}

/** The read `resolveMemberSource` probes with: one item from one source. */
export function probeMemberItem(id: string): (source: SpaceSource) => Promise<unknown> {
  return (source) =>
    source === 'library' || source === 'accepted'
      ? apiFetch(`/api/member/${source}/${encodeURIComponent(id)}`)
      : apiFetch(itemBase(source, id));
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
 *  and accepted items are read-only until Recall or Return; one an admin
 *  holds (`with-admin`) is not the member's to open at all. `taken` is an
 *  ADMIN's row for an item they took over: theirs to edit (audit F07). */
export function isEditable(row: Pick<SpaceItemRow, 'reviewState'>): boolean {
  return (
    row.reviewState === 'draft' || row.reviewState === 'returned' || row.reviewState === 'taken'
  );
}

/** Commenting is open on an own item while it is shared or submitted. */
export function commentsOpen(row: Pick<SpaceItemRow, 'sharing' | 'reviewState'>): boolean {
  return row.sharing === 'team' || row.reviewState === 'submitted';
}

/**
 * An accepted file or drawing an admin changed after Accept (audit F07): the
 * brain keeps the author's snapshot but no longer serves the bytes, so the
 * reader says so instead of a broken image. The reader passes Library items
 * through here too; they never carry the flag.
 */
export function acceptedBytesChanged(
  item: Pick<MemberAcceptedItem, 'type'> & { changedByAdmin?: boolean },
): boolean {
  return (item.type === 'file' || item.type === 'draw') && item.changedByAdmin === true;
}

/** What the reader shows in place of a changed file or drawing. A client
 *  reads "the reviewer" (audit U3: no staff role). */
export function acceptedChangedText(type: SpaceKind, client = false): string {
  if (client) {
    return type === 'draw'
      ? 'The reviewer changed this drawing after accepting it, so the picture you submitted is not shown any more.'
      : 'The reviewer changed this file after accepting it, so the file you submitted is not served any more.';
  }
  return type === 'draw'
    ? 'An admin changed this drawing after accepting it, so the picture you submitted is not shown any more.'
    : 'An admin changed this file after accepting it, so the file you submitted is not served any more.';
}
