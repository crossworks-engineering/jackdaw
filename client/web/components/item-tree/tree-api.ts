/**
 * The item tree's wire: query keys, URLs and writes for /api/tree (the brain's
 * docs/folder-tree.md). Everything a kind's tree caches sits under
 * `['tree', kind]`, so one invalidation refreshes every open folder, the
 * flat views and the pins together.
 */
import { noteListAnswer } from '@/lib/workspace-filter';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import type { AppTint } from '@mantle/client-types/app-nav';
import type {
  ClientTreeFolder,
  ClientTreeFolderPage,
  ClientTreeItem,
  ClientTreeSearchResult,
  TreeCrumb,
  TreeFilter,
  TreeFolder,
  TreeFolderPage,
  TreeItem,
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

/** `ws`: the switcher's workspace (W5b; null = all). It ends every list key,
 *  so a switch loads the lists again and a `['tree', scope]` refresh still
 *  reaches them all. Only the owner's tree takes it. */
export const folderKey = (
  kind: TreeKind,
  folderId: string | null,
  sort: TreeSort,
  source: TreeSource = 'owner',
  ws: string | null = null,
) => ['tree', treeScope(kind, source), 'folder', folderId ?? 'root', sort, ws ?? 'all'] as const;

export const searchKey = (
  kind: TreeKind,
  q: string,
  filter: TreeFilter = {},
  source: TreeSource = 'owner',
  ws: string | null = null,
) => ['tree', treeScope(kind, source), 'search', q, filter.tag ?? null, ws ?? 'all'] as const;

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
  ws: string | null = null,
): string {
  return `${BASE[source]}/${kind}${query({ folder: folderId, sort, cursor, ws: source === 'owner' ? ws : null })}`;
}

/** An empty `q` is the A to Z view: every item by name, no folders. A
 *  filter narrows the items and drops the folders. */
export function searchUrl(
  kind: TreeKind,
  q: string,
  cursor: string | null,
  filter: TreeFilter = {},
  source: TreeSource = 'owner',
  ws: string | null = null,
): string {
  // A reader's search takes no tag or workspace (it is not offered one). The
  // level filter is gone (W5b2 contract 29): `ws` narrows by workspace.
  const rest = query(source === 'owner' ? { cursor, tag: filter.tag, ws } : { cursor }).replace(
    /^\?/,
    '&',
  );
  return `${BASE[source]}/${kind}/search?q=${encodeURIComponent(q.trim())}${rest}`;
}

export function marksUrl(kind: TreeKind, view: TreeMarkView): string {
  return `/api/tree/${kind}/marks?view=${view}`;
}

// A client's answers are their own shapes (ClientTreeFolderPage,
// ClientTreeSearchResult): no level, share, state or system flag, which are
// staff information. The rows draw one shape, so a client's is carried into
// it here, and only here: a folder shares nothing and is no system folder as
// far as a client's rows go, an item has no review state, and no level is
// made up (the rows show none where it is absent).

function clientFolder<F extends ClientTreeFolder>(f: F): F & TreeFolder {
  return { ...f, share: null, system: false };
}

function clientItem<I extends ClientTreeItem>(it: I): I & TreeItem {
  // `level` stays absent: a client is never told an item's level, and the
  // status slot draws nothing without one.
  return { ...it, state: null } as I & TreeItem;
}

/** A client login's folder page in the rows' shape. */
export function clientPageAsTree(p: ClientTreeFolderPage): TreeFolderPage {
  return {
    ...p,
    folder: p.folder ? clientFolder(p.folder) : null,
    folders: p.folders.map(clientFolder),
    items: p.items.map(clientItem),
  };
}

/** A client login's search answer in the rows' shape. */
export function clientSearchAsTree(r: ClientTreeSearchResult): TreeSearchResult {
  return {
    ...r,
    folders: r.folders.map((f): TreeFolder & { crumbs: TreeCrumb[] } => clientFolder(f)),
    items: r.items.map((it): TreeItem & { crumbs: TreeCrumb[] } => clientItem(it)),
  };
}

export const fetchFolderPage = (
  kind: TreeKind,
  folderId: string | null,
  sort: TreeSort,
  cursor: string | null,
  source: TreeSource = 'owner',
  ws: string | null = null,
): Promise<TreeFolderPage> => {
  const url = folderUrl(kind, folderId, sort, cursor, source, ws);
  return source === 'client'
    ? apiFetch<ClientTreeFolderPage>(url).then(clientPageAsTree)
    : apiFetch<TreeFolderPage>(url).then((r) => noteListAnswer(r, ws));
};

export const fetchSearch = (
  kind: TreeKind,
  q: string,
  cursor: string | null,
  filter: TreeFilter = {},
  source: TreeSource = 'owner',
  ws: string | null = null,
): Promise<TreeSearchResult> => {
  const url = searchUrl(kind, q, cursor, filter, source, ws);
  return source === 'client'
    ? apiFetch<ClientTreeSearchResult>(url).then(clientSearchAsTree)
    : apiFetch<TreeSearchResult>(url).then((r) => noteListAnswer(r, ws));
};

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
  /** With `confirm`: the `total` the dialog showed; a different change now is
   *  refused again with the new list. */
  seen?: number;
};

/** A brain before `seen` checks the folder PATCH strictly and refuses the
 *  field by name (400); the write is then repeated without it, as that brain
 *  would have taken it. */
function refusedSeen(err: unknown): boolean {
  return err instanceof ApiError && err.status === 400 && /\bseen\b/.test(err.message);
}

/** Who writes: the owner (/api/tree), or a member in its own folders and
 *  drafts (/api/member/tree, folder plan phase 5: no share, order, pins or
 *  confirm there). A client never writes. */
export type TreeWriter = Exclude<TreeSource, 'client'>;

/** A new folder's look, chosen in the create dialog: only what was set. */
export type TreeFolderLook = { icon?: string; color?: AppTint | null };

/** The look goes in the same POST, so a folder with a face is one write. */
export const createTreeFolder = (
  kind: TreeKind,
  parentId: string | null,
  name: string,
  source: TreeWriter = 'owner',
  look: TreeFolderLook = {},
) =>
  apiSend<{ folder: TreeFolder }>(`${BASE[source]}/${kind}/folders`, 'POST', {
    parentId,
    name,
    ...(look.icon ? { icon: look.icon } : {}),
    ...(look.color ? { color: look.color } : {}),
  }).then((r) => r.folder);

export const patchTreeFolder = async (
  kind: TreeKind,
  id: string,
  patch: TreeFolderPatch,
  source: TreeWriter = 'owner',
): Promise<TreeFolder> => {
  const url = `${BASE[source]}/${kind}/folders/${id}`;
  try {
    return (await apiSend<{ folder: TreeFolder }>(url, 'PATCH', patch)).folder;
  } catch (err) {
    if (patch.seen === undefined || !refusedSeen(err)) throw err;
    const { seen: _seen, ...older } = patch;
    return (await apiSend<{ folder: TreeFolder }>(url, 'PATCH', older)).folder;
  }
};

/** What the folder holds moves up to its parent first; a name clash there is
 *  a 409 and nothing moves, and so is a lift that changes who can see
 *  something, until it is repeated with `confirm` (and `seen`, the total the
 *  dialog showed). */
export const deleteTreeFolder = (
  kind: TreeKind,
  id: string,
  confirm = false,
  source: TreeWriter = 'owner',
  seen?: number,
) =>
  apiSend<{ ok: true }>(
    `${BASE[source]}/${kind}/folders/${id}${
      confirm ? `?confirm=true${seen !== undefined ? `&seen=${seen}` : ''}` : ''
    }`,
    'DELETE',
  );

export type TreeMoveResult = { moved: number; failed: Array<{ id: string; error: string }> };

/** Refused whole (nothing moves) when it changes who can see any of them,
 *  until it is repeated with `confirm` (and `seen`, the total shown). */
export const moveTreeItems = (
  kind: TreeKind,
  ids: string[],
  folderId: string | null,
  confirm = false,
  source: TreeWriter = 'owner',
  seen?: number,
) =>
  apiSend<TreeMoveResult>(`${BASE[source]}/${kind}/move`, 'POST', {
    ids,
    folderId,
    ...(confirm ? { confirm: true, ...(seen !== undefined ? { seen } : {}) } : {}),
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
