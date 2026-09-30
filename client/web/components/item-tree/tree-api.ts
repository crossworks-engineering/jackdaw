/**
 * The item tree's wire: query keys, URLs and writes for /api/tree (the brain's
 * docs/folder-tree.md). Everything a kind's tree caches sits under
 * `['tree', kind]`, so one invalidation refreshes every open folder, the
 * flat views and the pins together.
 */
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import type {
  TreeFilter,
  TreeFolder,
  TreeFolderPage,
  TreeKind,
  TreeMarkList,
  TreeMarkView,
  TreeSearchResult,
  TreeShareLevel,
  TreeSort,
  TreeTagList,
} from '@mantle/web-ui/types/tree';

/**
 * Who the tree is read as. The owner's tree is /api/tree (read and write);
 * a member login's and a client login's are read-only views of what they may
 * read (/api/member/tree, /api/client/tree: the kinds their shell lists in
 * `treeKinds`). A client's answers carry no level, share or system flag; the
 * rows treat those as absent.
 */
export type TreeSource = 'owner' | 'member' | 'client';

const BASE: Record<TreeSource, string> = {
  owner: '/api/tree',
  member: '/api/member/tree',
  client: '/api/client/tree',
};

/** The cache scope of a kind's tree: the kind for the owner, prefixed for a
 *  reader, so the three never share a cached folder. */
export const treeScope = (kind: TreeKind, source: TreeSource = 'owner'): string =>
  source === 'owner' ? kind : `${source}:${kind}`;

export const treeKey = (kind: TreeKind, source: TreeSource = 'owner') =>
  ['tree', treeScope(kind, source)] as const;

export const folderKey = (
  kind: TreeKind,
  folderId: string | null,
  sort: TreeSort,
  source: TreeSource = 'owner',
) => ['tree', treeScope(kind, source), 'folder', folderId ?? 'root', sort] as const;

export const searchKey = (
  kind: TreeKind,
  q: string,
  filter: TreeFilter = {},
  source: TreeSource = 'owner',
) =>
  ['tree', treeScope(kind, source), 'search', q, filter.level ?? null, filter.tag ?? null] as const;

export const tagsKey = (kind: TreeKind) => ['tree', kind, 'tags'] as const;

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
  source: TreeSource = 'owner',
): string {
  return `${BASE[source]}/${kind}${query({ folder: folderId, sort, cursor })}`;
}

/** An empty `q` is the A to Z view: every item by name, no folders. A
 *  filter narrows the items and drops the folders. */
export function searchUrl(
  kind: TreeKind,
  q: string,
  cursor: string | null,
  filter: TreeFilter = {},
  source: TreeSource = 'owner',
): string {
  // A reader's search takes no level or tag (it is not offered one).
  const rest = query(
    source === 'owner' ? { cursor, level: filter.level, tag: filter.tag } : { cursor },
  ).replace(/^\?/, '&');
  return `${BASE[source]}/${kind}/search?q=${encodeURIComponent(q.trim())}${rest}`;
}

export function marksUrl(kind: TreeKind, view: TreeMarkView): string {
  return `/api/tree/${kind}/marks?view=${view}`;
}

// A client's page is the owner's shape without its level fields: read as it,
// those are simply absent (the rows show no level, share or state then).
export const fetchFolderPage = (
  kind: TreeKind,
  folderId: string | null,
  sort: TreeSort,
  cursor: string | null,
  source: TreeSource = 'owner',
) => apiFetch<TreeFolderPage>(folderUrl(kind, folderId, sort, cursor, source));

export const fetchSearch = (
  kind: TreeKind,
  q: string,
  cursor: string | null,
  filter: TreeFilter = {},
  source: TreeSource = 'owner',
) => apiFetch<TreeSearchResult>(searchUrl(kind, q, cursor, filter, source));

export const fetchTags = (kind: TreeKind) => apiFetch<TreeTagList>(`/api/tree/${kind}/tags`);

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
  /** Share it, and everything below it, with the team or clients; null
   *  stops sharing it. */
  share?: TreeShareLevel | null;
  /** Go ahead although it changes who can see items (else a visibility
   *  refusal, 409). */
  confirm?: boolean;
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
 *  a 409 and nothing moves, and so is a lift that changes who can see
 *  something, until it is repeated with `confirm`. */
export const deleteTreeFolder = (kind: TreeKind, id: string, confirm = false) =>
  apiSend<{ ok: true }>(
    `/api/tree/${kind}/folders/${id}${confirm ? '?confirm=true' : ''}`,
    'DELETE',
  );

export type TreeMoveResult = { moved: number; failed: Array<{ id: string; error: string }> };

/** Refused whole (nothing moves) when it changes who can see any of them,
 *  until it is repeated with `confirm`. */
export const moveTreeItems = (
  kind: TreeKind,
  ids: string[],
  folderId: string | null,
  confirm = false,
) =>
  apiSend<TreeMoveResult>(`/api/tree/${kind}/move`, 'POST', {
    ids,
    folderId,
    ...(confirm ? { confirm: true } : {}),
  });

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
