/**
 * The item tree's wire: query keys, URLs and writes for /api/tree (the brain's
 * docs/folder-tree.md). Everything a kind's tree caches sits under
 * `['tree', kind]`, so one invalidation refreshes every open folder, the
 * flat views and the pins together.
 */
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import type {
  TreeFolder,
  TreeFolderPage,
  TreeKind,
  TreeMarkList,
  TreeMarkView,
  TreeSearchResult,
  TreeSort,
} from '@mantle/web-ui/types/tree';

export const treeKey = (kind: TreeKind) => ['tree', kind] as const;

export const folderKey = (kind: TreeKind, folderId: string | null, sort: TreeSort) =>
  ['tree', kind, 'folder', folderId ?? 'root', sort] as const;

export const searchKey = (kind: TreeKind, q: string) => ['tree', kind, 'search', q] as const;

export const marksKey = (kind: TreeKind, view: TreeMarkView) =>
  ['tree', kind, 'marks', view] as const;

function query(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function folderUrl(
  kind: TreeKind,
  folderId: string | null,
  sort: TreeSort,
  cursor: string | null,
): string {
  return `/api/tree/${kind}${query({ folder: folderId, sort, cursor })}`;
}

/** An empty `q` is the A to Z view: every item by name, no folders. */
export function searchUrl(kind: TreeKind, q: string, cursor: string | null): string {
  return `/api/tree/${kind}/search?q=${encodeURIComponent(q.trim())}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
}

export function marksUrl(kind: TreeKind, view: TreeMarkView): string {
  return `/api/tree/${kind}/marks?view=${view}`;
}

export const fetchFolderPage = (
  kind: TreeKind,
  folderId: string | null,
  sort: TreeSort,
  cursor: string | null,
) => apiFetch<TreeFolderPage>(folderUrl(kind, folderId, sort, cursor));

export const fetchSearch = (kind: TreeKind, q: string, cursor: string | null) =>
  apiFetch<TreeSearchResult>(searchUrl(kind, q, cursor));

export const fetchMarks = (kind: TreeKind, view: TreeMarkView) =>
  apiFetch<TreeMarkList>(marksUrl(kind, view));

export type TreeFolderPatch = {
  name?: string;
  icon?: string | null;
  color?: string | null;
  /** Move under this folder; null = the top level. */
  parentId?: string | null;
  /** Place directly after this sibling; null = first. */
  after?: string | null;
};

export const createTreeFolder = (kind: TreeKind, parentId: string | null, name: string) =>
  apiSend<{ folder: TreeFolder }>(`/api/tree/${kind}/folders`, 'POST', { parentId, name }).then(
    (r) => r.folder,
  );

export const patchTreeFolder = (kind: TreeKind, id: string, patch: TreeFolderPatch) =>
  apiSend<{ folder: TreeFolder }>(`/api/tree/${kind}/folders/${id}`, 'PATCH', patch).then(
    (r) => r.folder,
  );

/** What the folder holds moves up to its parent first; a name clash there is
 *  a 409 and nothing moves. */
export const deleteTreeFolder = (kind: TreeKind, id: string) =>
  apiSend<{ ok: true }>(`/api/tree/${kind}/folders/${id}`, 'DELETE');

export type TreeMoveResult = { moved: number; failed: Array<{ id: string; error: string }> };

export const moveTreeItems = (kind: TreeKind, ids: string[], folderId: string | null) =>
  apiSend<TreeMoveResult>(`/api/tree/${kind}/move`, 'POST', { ids, folderId });

export const setTreeItemPinned = (id: string, pinned: boolean) =>
  apiSend<{ ok: true }>(`/api/tree/items/${id}/pin`, 'PUT', { pinned });

/** Count an open for Recent and Most used. Fire-and-forget: it must never
 *  delay or fail the open itself, and a private item has no counter. */
export function recordTreeItemOpened(id: string): Promise<void> {
  return apiSend(`/api/tree/items/${id}/opened`, 'POST').then(
    () => undefined,
    () => undefined,
  );
}
