/**
 * The member's personal-space API (member logins Phase 2), as the brain
 * serves it under /api/member/*. Types mirror the brain's member-space.ts;
 * they move into the published contract once the member UI settles.
 */
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import type { TableDetail } from '@mantle/content-core/table-model';
import type { MemberLibraryKind } from '@mantle/client-types';

export type SpaceKind = MemberLibraryKind;
export type SpaceSharing = 'private' | 'team';
export type ReviewState = 'draft' | 'submitted' | 'returned' | 'accepted';

/** Where a member's list reads from: their own items, teammates' shared
 *  items, or the Library (brain items at the team level). */
export type SpaceSource = 'mine' | 'team' | 'library';

export type SpaceItemRow = {
  id: string;
  type: SpaceKind;
  title: string;
  icon: string | null;
  sharing: SpaceSharing;
  reviewState: ReviewState;
  submittedAt: string | null;
  returnedNote: string | null;
  authorLoginId: string | null;
  updatedAt: string;
};

export type SpaceFile = {
  id: string;
  filename: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
};

type Doc = Record<string, unknown>;

export type SpaceItemBody =
  | { type: 'page'; page: { doc: Doc; draft: Doc | null; draftRev?: number; title: string } }
  | { type: 'note'; note: { content: string; title: string } }
  | { type: 'draw'; draw: { scene: Doc; draft: Doc | null; draftRev?: number } | null }
  | { type: 'table'; table: TableDetail }
  | { type: 'file'; file: SpaceFile };

export type SpaceItem = { row: SpaceItemRow; body: SpaceItemBody };

export type SpaceList = { items: SpaceItemRow[]; total: number; page: number; pageSize: number };

export type SpaceComment = {
  id: string;
  nodeId: string;
  authorKind: string;
  authorName: string;
  mine: boolean;
  body: string;
  createdAt: string;
  editedAt: string | null;
};

/** The routes one item answers on: own items vs a teammate's shared one. */
export function itemBase(source: 'mine' | 'team', id: string): string {
  return source === 'mine' ? `/api/member/space/${id}` : `/api/member/team-drafts/${id}`;
}

export function listPath(
  source: SpaceSource,
  opts: { kind: SpaceKind; q?: string; page?: number },
): string {
  const sp = new URLSearchParams({ kind: opts.kind, page: String(opts.page ?? 1) });
  if (opts.q?.trim()) sp.set('q', opts.q.trim());
  const base =
    source === 'mine'
      ? '/api/member/space'
      : source === 'team'
        ? '/api/member/team-drafts'
        : '/api/member/library';
  return `${base}?${sp.toString()}`;
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
function sendAutosave<T>(path: string, method: 'PUT' | 'PATCH', body: unknown): Promise<T> {
  const text = JSON.stringify(body);
  return apiFetch<T>(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: text,
    keepalive: new TextEncoder().encode(text).length < KEEPALIVE_MAX_BYTES,
  });
}

export const memberSpace = {
  create: (body: { type: 'page' | 'note' | 'draw' | 'table'; title: string }) =>
    apiSend<{ item: SpaceItemRow }>('/api/member/space', 'POST', body),
  get: (source: 'mine' | 'team', id: string, tabId?: string | null) =>
    apiFetch<SpaceItem>(
      `${itemBase(source, id)}${tabId ? `?tab=${encodeURIComponent(tabId)}` : ''}`,
    ),
  patch: (id: string, body: { title?: string; icon?: string; content?: string }) =>
    sendAutosave<SpaceItem>(`/api/member/space/${id}`, 'PATCH', body),
  remove: (id: string) => apiSend<{ ok: true }>(`/api/member/space/${id}`, 'DELETE'),
  /** Autosave: a page `doc`, a drawing `scene`, or a table as a whole
   *  `table` document or an `ops` batch (the owner's op schema). */
  draft: (
    id: string,
    body: { doc?: Doc; scene?: Doc; table?: Doc; ops?: unknown[]; if_rev?: number },
  ) =>
    sendAutosave<{ ok: true; draft_rev: number; created_ids?: (string | null)[] }>(
      `/api/member/space/${id}/draft`,
      'PUT',
      body,
    ),
  save: (id: string, body: { doc?: Doc; scene?: Doc; svg?: string; if_rev?: number }) =>
    apiSend<SpaceItem>(`/api/member/space/${id}/save`, 'POST', body),
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
