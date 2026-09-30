'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import { FolderInput, FolderPlus, ListFilter, Pin, PinOff, Search, X } from 'lucide-react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import {
  TREE_KIND_SPECS,
  TREE_MAX_DEPTH,
  type TreeCrumb,
  type TreeFilter,
  type TreeFolder,
  type TreeItem,
  type TreeKind,
  type TreeSort,
} from '@mantle/web-ui/types/tree';
import type { AccessLevel } from '@mantle/client-types';
import { AppLookPicker } from '@/components/app-nav/app-look-picker';
import { LEVEL_LABEL, LEVEL_ORDER } from '@/lib/access-levels';
import { DeleteFolderDialog, FolderNameDialog } from '@/components/app-nav/folder-dialogs';
import { useRealtime } from '@/components/realtime/use-realtime';
import { oneOf, usePersistedState } from '@/lib/use-persisted-state';
import type { TreeKindAdapter } from './kinds/types';
import {
  createTreeFolder,
  deleteTreeFolder,
  fetchMarks,
  fetchSearch,
  fetchTags,
  marksKey,
  moveTreeItems,
  patchTreeFolder,
  recordTreeItemOpened,
  searchKey,
  setTreeItemPinned,
  tagsKey,
  treeKey,
  type TreeFolderPatch,
} from './tree-api';
import {
  TreeContext,
  type DragData,
  type DropHint,
  type ItemWhere,
  type TreeCtx,
} from './tree-context';
import {
  afterFor,
  afterForStep,
  canNestFolder,
  dropPosition,
  isAtOrBelow,
  isOnTheWayTo,
  rangeOfItems,
  type TreeRow,
} from './tree-model';
import {
  FolderHitRow,
  FolderTile,
  FolderTreeRow,
  Sentinel,
  TreeRowShell,
  useFolderRows,
  VirtualRows,
} from './tree-rows';
import { FolderPickerDialog } from './folder-picker';

/**
 * The item tree: one navigation for every kind (the brain's
 * docs/folder-tree.md). Folders (tile, name, count) nest three deep; items
 * show a title and a small status slot. Grown from the /apps tree, whose
 * guides, tiles, look picker and folder dialogs it reuses.
 *
 * What syncs and what doesn't:
 *  - folders, their names, looks and order, and where items sit are the
 *    BRAIN's (every admin, every device);
 *  - pins, Recent and Most used are this LOGIN's (item marks);
 *  - which folders are open, the chosen view and the sort are this
 *    BROWSER's (localStorage, a convenience only).
 *
 * The search box searches the brain (folders first, then items, each with
 * where it lives). The chips list items flat: Recent, Most used, A to Z.
 */

type View = 'tree' | 'recent' | 'used' | 'az';
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'tree', label: 'Folders' },
  { id: 'recent', label: 'Recent' },
  { id: 'used', label: 'Most used' },
  { id: 'az', label: 'A to Z' },
];

const SORT_LABEL: Record<TreeSort, string> = {
  name: 'Name',
  updated: 'Last changed',
  start: 'Start',
  due: 'Due',
};

/** The open-folder set for a kind, merged rather than replaced so the stored
 *  set (read after hydration) and a reveal can arrive in either order. */
function useOpenFolders(kind: TreeKind) {
  const key = `mantle_tree_open_v1:${kind}`;
  const [open, setOpenSet] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
      const stored = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      if (stored.length) setOpenSet((prev) => new Set([...prev, ...stored]));
    } catch {
      /* no storage: everything starts folded */
    }
  }, [key]);
  const setOpen = useCallback(
    (id: string, o: boolean) => {
      setOpenSet((prev) => {
        if (prev.has(id) === o) return prev;
        const next = new Set(prev);
        if (o) next.add(id);
        else next.delete(id);
        try {
          window.localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* private mode: it just won't persist */
        }
        return next;
      });
    },
    [key],
  );
  return [open, setOpen] as const;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type MoveTarget =
  | { type: 'items'; items: TreeItem[]; from: string | null | undefined }
  | { type: 'folder'; folder: TreeFolder };

/** Private items have no folder yet: they cannot be moved or picked. */
const movable = (item: TreeItem) => item.state !== 'private';

export function ItemTree({
  kind,
  adapter,
  mode = 'manage',
  rootLabel,
  selectedItemId = null,
  selectedFolderPath = null,
  revealPath,
  query,
  onQueryChange,
  searchPlaceholder,
  actions,
  onOpenItem,
  onOpenFolder,
  itemActions,
  onChanged,
  onUnsupported,
}: {
  kind: TreeKind;
  adapter: TreeKindAdapter;
  mode?: 'manage' | 'read';
  /** A row for the kind's root above the folders ("All files"). */
  rootLabel?: string;
  selectedItemId?: string | null;
  /** The folder the page shows: highlighted, and unfolded to. */
  selectedFolderPath?: string | null;
  /** Unfold to this path instead (a folder whose item is open). Defaults to
   *  the selected folder. */
  revealPath?: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder?: string;
  /** Extra toolbar controls (a New button). */
  actions?: ReactNode;
  onOpenItem: (item: TreeItem, where: ItemWhere) => void;
  /** A folder click (null = the root row). Absent: a click folds. */
  onOpenFolder?: (folder: TreeFolder | null) => void;
  /** Extra entries at the foot of an item's menu (Rename, Delete). */
  itemActions?: (item: TreeItem, where: ItemWhere) => ReactNode;
  /** After any write the tree made. */
  onChanged?: () => void;
  /** A tree call answered 404: the brain does not serve this kind. */
  onUnsupported?: () => void;
}) {
  const spec = TREE_KIND_SPECS[kind];
  const qc = useQueryClient();
  const toast = useToast();
  const manage = mode === 'manage';

  const [view, setView] = usePersistedState<View>(
    `mantle_tree_view_v1:${kind}`,
    'tree',
    oneOf('tree', 'recent', 'used', 'az'),
  );
  const [sort, setSort] = usePersistedState<TreeSort>(
    `mantle_tree_sort_v1:${kind}`,
    spec.sorts[0]!,
    (s) => (spec.sorts.includes(s as TreeSort) ? (s as TreeSort) : null),
  );
  const [open, setOpen] = useOpenFolders(kind);
  // Where to unfold to: the page's latest destination, or a folder search
  // hit chosen since. The latest of the two wins.
  const hostReveal = revealPath === undefined ? selectedFolderPath : revealPath;
  const [reveal, setReveal] = useState<string | null>(hostReveal);
  useEffect(() => {
    if (hostReveal) setReveal(hostReveal);
  }, [hostReveal]);

  const term = useDebounced(query.trim(), 250);
  const searching = query.trim().length > 0;

  // The filter menu (State, Tag): a question about items, so it lists them
  // flat by name, like A to Z. Not remembered: a filter left on from last
  // time would quietly hide things.
  const [filter, setFilter] = useState<TreeFilter>({});
  const filtering = filter.level !== undefined || filter.tag !== undefined;
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const tagsQ = useQuery({
    queryKey: tagsKey(kind),
    queryFn: () => fetchTags(kind),
    enabled: filterMenuOpen,
    staleTime: 60_000,
  });

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  const scrollRoot = useRef<HTMLDivElement>(null);

  const [folderDialog, setFolderDialog] = useState<
    { mode: 'new'; parent: TreeFolder | null } | { mode: 'rename'; folder: TreeFolder } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<TreeFolder | null>(null);
  const [lookFor, setLookFor] = useState<{ key: string; folder: TreeFolder } | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  // Items picked for a move (cmd/ctrl or shift click), in pick order, and
  // the anchor a shift-click ranges from. Kept by id, so the pick survives
  // a refetch and a switch of view.
  const [picked, setPicked] = useState<ReadonlyMap<string, TreeItem>>(() => new Map());
  const anchor = useRef<string | null>(null);
  const clearPicked = useCallback(() => {
    setPicked((prev) => (prev.size ? new Map() : prev));
    anchor.current = null;
  }, []);
  const pickedIds = useMemo(() => new Set(picked.keys()), [picked]);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: treeKey(kind) });
  }, [qc, kind]);

  // Another device, an agent or an upload changed the tree. Bursts (a folder
  // of uploads) coalesce into one refetch of what is on screen.
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(['tree', spec.nodeType, 'branch'], (c) => {
    if (c.type === 'tree' && c.id !== kind) return;
    if (pendingRefresh.current) clearTimeout(pendingRefresh.current);
    pendingRefresh.current = setTimeout(refresh, 300);
  });
  useEffect(
    () => () => {
      if (pendingRefresh.current) clearTimeout(pendingRefresh.current);
    },
    [],
  );

  /** Run a write, then refresh the tree; a refusal is a toast. */
  const write = async <T,>(fn: () => Promise<T>, failure: string): Promise<T | undefined> => {
    try {
      const out = await fn();
      refresh();
      onChanged?.();
      return out;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : failure);
      return undefined;
    }
  };

  const patchFolder = (folder: TreeFolder, patch: TreeFolderPatch) =>
    write(() => patchTreeFolder(kind, folder.id, patch), 'Could not change the folder');

  // ── Queries beside the tree ───────────────────────────────────────────
  const pinsQ = useQuery({
    queryKey: marksKey(kind, 'pinned'),
    queryFn: () => fetchMarks(kind, 'pinned'),
    enabled: manage,
  });
  const pinned = useMemo(() => new Set(pinsQ.data?.items.map((i) => i.id)), [pinsQ.data]);

  const listView = view === 'recent' || view === 'used' ? view : null;
  const marksQ = useQuery({
    queryKey: marksKey(kind, listView ?? 'recent'),
    queryFn: () => fetchMarks(kind, listView ?? 'recent'),
    enabled: !searching && listView !== null,
  });

  // A to Z is the empty search; a search is the same query with a term; a
  // filter narrows either.
  const flatTerm = searching ? term : '';
  const flatQ = useInfiniteQuery({
    queryKey: searchKey(kind, flatTerm, filter),
    queryFn: ({ pageParam }) => fetchSearch(kind, flatTerm, pageParam, filter),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: searching ? term.length > 0 : view === 'az' || filtering,
  });

  // ── Opening ───────────────────────────────────────────────────────────
  const openItem = (item: TreeItem, where: ItemWhere) => {
    clearPicked();
    onOpenItem(item, where);
    if (item.state !== 'private') {
      void recordTreeItemOpened(item.id).then(() =>
        qc.invalidateQueries({ queryKey: ['tree', kind, 'marks'] }),
      );
    }
  };

  const openFolder = (folder: TreeFolder) => {
    if (onOpenFolder) {
      onOpenFolder(folder);
      setOpen(folder.id, true);
    } else {
      setOpen(folder.id, !open.has(folder.id));
    }
  };

  /** A plain click opens; cmd/ctrl adds or drops the item from the pick;
   *  shift picks every movable item from the last one picked to this. */
  const clickItem = (item: TreeItem, where: ItemWhere, e?: MouseEvent) => {
    const toggle = e && (e.metaKey || e.ctrlKey);
    const range = e?.shiftKey && anchor.current !== null;
    if (!manage || !movable(item) || (!toggle && !e?.shiftKey)) {
      openItem(item, where);
      return;
    }
    e.preventDefault();
    if (range) {
      const ids = rangeOfItems(allRows, anchor.current!, item.id, movable);
      const byId = new Map<string, TreeItem>();
      for (const r of allRows) if (r.type === 'item') byId.set(r.item.id, r.item);
      setPicked((prev) => {
        const next = new Map(prev);
        for (const id of ids) {
          const it = byId.get(id);
          if (it) next.set(id, it);
        }
        return next;
      });
      return;
    }
    anchor.current = item.id;
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  };

  /** Move items (one, or the pick) into a folder; null = the top level. */
  const moveItems = (items: readonly TreeItem[], dest: string | null) =>
    write(
      async () => {
        const res = await moveTreeItems(
          kind,
          items.map((i) => i.id),
          dest,
        );
        if (items.length > 1) clearPicked();
        if (res.failed.length) {
          const what =
            items.length === 1
              ? `the ${adapter.noun.one}`
              : `${res.failed.length} of ${items.length} ${adapter.noun.many}`;
          throw new ApiError(`Could not move ${what}: ${res.failed[0]!.error}`, 409);
        }
        if (dest) setOpen(dest, true);
      },
      `Could not move the ${items.length === 1 ? adapter.noun.one : adapter.noun.many}`,
    );

  /** What a move of `item` carries: the whole pick when it is part of it. */
  const carried = (item: TreeItem): TreeItem[] =>
    picked.has(item.id) && picked.size > 1 ? [...picked.values()] : [item];

  /** A folder search hit: back to the tree, unfolded to it. */
  const openFolderHit = (folder: TreeFolder) => {
    onQueryChange('');
    setView('tree');
    setReveal(folder.path);
    openFolder(folder);
  };

  const togglePin = (item: TreeItem) =>
    void write(() => setTreeItemPinned(item.id, !pinned.has(item.id)), 'Could not change the pin');

  // ── Menus ─────────────────────────────────────────────────────────────
  const openLook = (key: string, folder: TreeFolder) =>
    // After the menu's own close has run, so the picker isn't born into it.
    window.setTimeout(() => setLookFor({ key, folder }), 0);

  const folderMenu = manage
    ? (folder: TreeFolder, _parent: TreeFolder | null, siblings: TreeFolder[]) => {
        const up = afterForStep(siblings, folder.id, -1);
        const down = afterForStep(siblings, folder.id, 1);
        return (
          <DropdownMenuContent
            align="start"
            side="right"
            className="w-52"
            // Focus must not return to the "…" trigger: when the menu opens
            // the picker, that focus lands outside the picker and closes it.
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {onOpenFolder && (
              <DropdownMenuItem onSelect={() => openFolder(folder)}>Open</DropdownMenuItem>
            )}
            {folder.depth < TREE_MAX_DEPTH && (
              <DropdownMenuItem onSelect={() => setFolderDialog({ mode: 'new', parent: folder })}>
                <FolderPlus />
                New folder inside…
              </DropdownMenuItem>
            )}
            {!folder.system && (
              <DropdownMenuItem onSelect={() => setFolderDialog({ mode: 'rename', folder })}>
                Rename…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => openLook(`f:${folder.id}`, folder)}>
              Icon and colour…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!folder.system && (
              <DropdownMenuItem onSelect={() => setMoveTarget({ type: 'folder', folder })}>
                Move to…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={up === undefined}
              onSelect={() => up !== undefined && void patchFolder(folder, { after: up })}
            >
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={down === undefined}
              onSelect={() => down !== undefined && void patchFolder(folder, { after: down })}
            >
              Move down
            </DropdownMenuItem>
            {!folder.system && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive-ink focus:text-destructive-ink"
                  onSelect={() => setDeleteTarget(folder)}
                >
                  Delete folder…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        );
      }
    : undefined;

  const itemMenu = manage
    ? (item: TreeItem, where: ItemWhere) => {
        const extra = itemActions?.(item, where);
        return (
          <DropdownMenuContent align="start" side="right" className="w-52">
            <DropdownMenuItem onSelect={() => openItem(item, where)}>Open</DropdownMenuItem>
            {item.state !== 'private' && (
              <>
                <DropdownMenuItem onSelect={() => togglePin(item)}>
                  {pinned.has(item.id) ? <PinOff /> : <Pin />}
                  {pinned.has(item.id) ? 'Unpin' : 'Pin to top'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    const items = carried(item);
                    setMoveTarget({
                      type: 'items',
                      items,
                      from: items.length > 1 ? undefined : where.folderId,
                    });
                  }}
                >
                  <FolderInput />
                  {picked.has(item.id) && picked.size > 1
                    ? `Move ${picked.size} ${adapter.noun.many} to…`
                    : 'Move to…'}
                </DropdownMenuItem>
              </>
            )}
            {extra && (
              <>
                <DropdownMenuSeparator />
                {extra}
              </>
            )}
          </DropdownMenuContent>
        );
      }
    : undefined;

  // ── Drag and drop ─────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /** Where a drop would land, or null when it can't. Used for the live
   *  indicator AND at release: a quick drag can end without a move event. */
  const dropAt = (e: DragMoveEvent | DragEndEvent): DropHint => {
    const { active, over } = e;
    const rect = active.rect.current.translated;
    const a = active.data.current as DragData | undefined;
    const o = over?.data.current as DragData | undefined;
    if (!over || !rect || !a || !o || a.type === 'root') return null;
    const overId = String(over.id);
    if (o.type === 'root') {
      return a.parent === null ? null : { over: overId, pos: 'inside' };
    }
    if (o.type !== 'folder') return null;
    const rel = (rect.top + rect.height / 2 - over.rect.top) / over.rect.height;
    const pos = dropPosition(rel, a.type);
    if (a.type === 'item') {
      return a.parent?.id === o.folder.id ? null : { over: overId, pos };
    }
    if (a.folder.id === o.folder.id || isAtOrBelow(o.folder.path, a.folder.path)) return null;
    if (pos === 'inside') return canNestFolder(a.folder, o.folder) ? { over: overId, pos } : null;
    return canNestFolder(a.folder, o.parent) ? { over: overId, pos } : null;
  };

  const onDragEnd = (e: DragEndEvent) => {
    const h = dropAt(e);
    setHint(null);
    setDragging(null);
    if (!h) return;
    const a = e.active.data.current as DragData;
    const o = e.over!.data.current as DragData;
    if (a.type === 'item') {
      void moveItems(carried(a.item), o.type === 'folder' ? o.folder.id : null);
      return;
    }
    if (a.type !== 'folder') return;
    if (o.type === 'root') {
      void patchFolder(a.folder, { parentId: null });
    } else if (o.type === 'folder' && h.pos === 'inside') {
      void patchFolder(a.folder, { parentId: o.folder.id }).then(() => setOpen(o.folder.id, true));
    } else if (o.type === 'folder') {
      const parentId = o.parent?.id ?? null;
      void patchFolder(a.folder, {
        ...(parentId !== (a.parent?.id ?? null) ? { parentId } : {}),
        after: afterFor(o.siblings, a.folder.id, o.folder.id, h.pos as 'before' | 'after'),
      });
    }
  };

  // ── The context every row reads ───────────────────────────────────────
  const ctx: TreeCtx = {
    kind,
    adapter,
    sort,
    mode,
    isOpen: (id) => open.has(id),
    setOpen,
    reveal,
    selectedItemId,
    selectedFolderPath,
    onFolderClick: openFolder,
    onItemClick: clickItem,
    picked: pickedIds,
    folderMenu,
    itemMenu,
    menuFor,
    setMenuFor,
    registerRow: (key, el) => {
      if (el) rowEls.current.set(key, el);
      else rowEls.current.delete(key);
    },
    hint,
    dragging,
  };

  // ── Rows by view ──────────────────────────────────────────────────────
  // Every view is one flat list of rows drawn through the virtual list: the
  // tree (pins, the root row, then the folders as far as they are open),
  // Recent and Most used, and search or A to Z.
  const flatView = searching || filtering || view === 'az';
  const folderRows = useFolderRows({
    kind,
    sort,
    isOpen: (id) => open.has(id),
    emptyText: `No ${adapter.noun.many} or folders yet.`,
    onUnsupported,
  });

  const flatRow = (it: TreeItem & { crumbs: TreeCrumb[] }, prefix: string): TreeRow => ({
    type: 'item',
    key: `${prefix}:${it.id}`,
    item: it,
    parent: null,
    folderPath: null,
    depth: 0,
    isLast: false,
    guides: [],
    crumbs: it.crumbs,
  });

  let allRows: TreeRow[];
  if (flatView) {
    const pages = flatQ.data?.pages ?? [];
    const folders = pages[0]?.folders ?? [];
    const items = pages.flatMap((p) => p.items);
    const pendingSearch = searching && (term !== query.trim() || flatQ.isPending);
    const flatMore = flatQ.hasNextPage;
    allRows =
      pendingSearch && !items.length && !folders.length
        ? [{ type: 'note', key: 'note', text: 'Searching…' }]
        : !folders.length && !items.length
          ? [
              {
                type: 'note',
                key: 'note',
                text: searching
                  ? `Nothing matches “${query.trim()}”${filtering ? ' with this filter' : ''}.`
                  : filtering
                    ? `No ${adapter.noun.many} match this filter.`
                    : `No ${adapter.noun.many} yet.`,
              },
            ]
          : [
              ...folders.map((f): TreeRow => ({
                type: 'hit',
                key: `sf:${f.id}`,
                folder: f,
                crumbs: f.crumbs,
              })),
              ...items.map((it) => flatRow(it, 's')),
              ...(flatMore
                ? [
                    {
                      type: 'more' as const,
                      key: `m:flat:${items.length}`,
                      source: 'flat',
                      depth: 0,
                      guides: [],
                      loading: flatQ.isFetchingNextPage,
                    },
                  ]
                : []),
            ];
  } else if (listView) {
    const items = marksQ.data?.items ?? [];
    allRows = marksQ.isPending
      ? [{ type: 'note', key: 'note', text: 'Loading…' }]
      : items.length === 0
        ? [
            {
              type: 'note',
              key: 'note',
              text: `${adapter.noun.many.charAt(0).toUpperCase()}${adapter.noun.many.slice(1)} you open show up here.`,
            },
          ]
        : items.map((it) => flatRow(it, 'l'));
  } else {
    const pins = pinsQ.data?.items ?? [];
    allRows = [
      ...pins.map((it) => flatRow(it, 'p')),
      ...(pins.length ? [{ type: 'divider' as const, key: 'pins-end' }] : []),
      ...(rootLabel ? [{ type: 'root' as const, key: 'root' }] : []),
      ...folderRows.rows,
    ];
  }

  // Unfold the way to what is on screen: the folders above the folder the
  // page shows (or a folder search hit), and when an item is open the
  // folder holding it as well, so the item's row is there to see. Each folder
  // opens once per destination, so one folded by hand afterwards stays shut.
  const revealKey = reveal ? `${reveal}|${selectedItemId ?? ''}` : null;
  const revealed = useRef<{ to: string | null; done: Set<string> }>({ to: null, done: new Set() });
  useEffect(() => {
    if (revealed.current.to !== revealKey) revealed.current = { to: revealKey, done: new Set() };
    if (!reveal) return;
    for (const r of folderRows.rows) {
      if (r.type !== 'folder' || !isOnTheWayTo(reveal, r.folder.path)) continue;
      if (r.folder.path === reveal && !selectedItemId) continue;
      if (revealed.current.done.has(r.folder.id)) continue;
      revealed.current.done.add(r.folder.id);
      setOpen(r.folder.id, true);
    }
  });

  // The row the page is about, scrolled to when it changes: the open item
  // in its folder, else the folder the page shows.
  const activeKey =
    view === 'tree' && !flatView
      ? selectedItemId && allRows.some((r) => r.key === `i:${selectedItemId}`)
        ? `i:${selectedItemId}`
        : selectedFolderPath
          ? (allRows.find((r) => r.type === 'folder' && r.folder.path === selectedFolderPath)
              ?.key ?? null)
          : null
      : null;

  const rootSelected = selectedFolderPath === spec.root;
  const renderRow = (row: TreeRow): ReactNode => {
    switch (row.type) {
      case 'hit':
        return (
          <FolderHitRow
            folder={row.folder}
            crumbs={row.crumbs}
            onClick={() => openFolderHit(row.folder)}
          />
        );
      case 'root':
        return (
          <TreeRowShell rowKey="root" depth={0} isLast={false} guides={[]} drop={{ type: 'root' }}>
            {(style) => (
              <RowButton
                onClick={() => onOpenFolder?.(null)}
                aria-current={rootSelected ? 'true' : undefined}
                style={style}
                className={cn(
                  'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left text-sm',
                  rootSelected
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-foreground/90 hover:bg-foreground/[0.06]',
                )}
              >
                <FolderTile folder={null} />
                <span className="min-w-0 flex-1 truncate">{rootLabel}</span>
              </RowButton>
            )}
          </TreeRowShell>
        );
      case 'more':
        if (row.source === 'flat') {
          return (
            <Sentinel
              depth={0}
              guides={[]}
              loading={row.loading}
              onVisible={() => {
                if (!flatQ.isFetchingNextPage) void flatQ.fetchNextPage();
              }}
            />
          );
        }
        return <FolderTreeRow row={row} handles={folderRows.handles} />;
      default:
        return <FolderTreeRow row={row} handles={folderRows.handles} />;
    }
  };

  const lookFolder = lookFor?.folder ?? null;

  return (
    <TreeContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-2 border-b border-border p-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && onQueryChange('')}
                placeholder={searchPlaceholder ?? `Search ${adapter.noun.many} and folders`}
                aria-label={`Search ${adapter.noun.many}`}
                className="h-9 pl-8 pr-8"
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon-2xs"
                  aria-label="Clear search"
                  onClick={() => onQueryChange('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
            {manage && (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="New folder"
                title="New folder"
                onClick={() => setFolderDialog({ mode: 'new', parent: null })}
              >
                <FolderPlus />
              </Button>
            )}
            {actions}
          </div>
          {!searching && (
            <div className="flex items-center gap-1.5">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={filtering ? '' : view}
                onValueChange={(v) => {
                  if (!v) return;
                  setView(v as View);
                  setFilter({});
                }}
                aria-label={`How to list ${adapter.noun.many}`}
                className="flex min-w-0 flex-1"
              >
                {VIEWS.map((v) => (
                  <ToggleGroupItem key={v.id} value={v.id} className="h-8 flex-auto px-1.5 text-xs">
                    {v.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <DropdownMenu open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={filtering ? 'secondary' : 'outline'}
                    size="icon-xs"
                    aria-label={filtering ? 'Sort and filter (filter on)' : 'Sort and filter'}
                    title={`Sort: ${SORT_LABEL[sort]}. Filter by state or tag`}
                  >
                    <ListFilter />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-96 w-52 overflow-y-auto scrollbar-thin"
                >
                  {view === 'tree' && !filtering && spec.sorts.length > 1 && (
                    <>
                      <DropdownMenuLabel>Sort {adapter.noun.many}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={sort}
                        onValueChange={(v) => setSort(v as TreeSort)}
                      >
                        {spec.sorts.map((s) => (
                          <DropdownMenuRadioItem key={s} value={s}>
                            {SORT_LABEL[s]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuLabel>State</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={filter.level ?? 'any'}
                    onValueChange={(v) =>
                      setFilter((f) => ({
                        ...f,
                        level: v === 'any' ? undefined : (v as AccessLevel),
                      }))
                    }
                  >
                    <DropdownMenuRadioItem value="any">Any</DropdownMenuRadioItem>
                    {LEVEL_ORDER.map((l) => (
                      <DropdownMenuRadioItem key={l} value={l}>
                        {l === 'admin' ? 'Admin only' : LEVEL_LABEL[l]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Tag</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={filter.tag ?? ''}
                    onValueChange={(v) =>
                      setFilter((f) => ({ ...f, tag: v === '' ? undefined : v }))
                    }
                  >
                    <DropdownMenuRadioItem value="">Any</DropdownMenuRadioItem>
                    {filter.tag && !tagsQ.data?.tags.some((t) => t.tag === filter.tag) && (
                      <DropdownMenuRadioItem value={filter.tag}>{filter.tag}</DropdownMenuRadioItem>
                    )}
                    {tagsQ.data?.tags.map((t) => (
                      <DropdownMenuRadioItem key={t.tag} value={t.tag}>
                        <span className="min-w-0 flex-1 truncate">{t.tag}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {t.count}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {tagsQ.isPending && <DropdownMenuItem disabled>Loading tags…</DropdownMenuItem>}
                  {tagsQ.isError && (
                    <DropdownMenuItem disabled>Couldn’t load the tags.</DropdownMenuItem>
                  )}
                  {tagsQ.data && tagsQ.data.tags.length === 0 && (
                    <DropdownMenuItem disabled>No tags yet.</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {filtering && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ListFilter className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {[
                  filter.level &&
                    (filter.level === 'admin' ? 'Admin only' : LEVEL_LABEL[filter.level]),
                  filter.tag && `tagged “${filter.tag}”`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
              <Button
                variant="link"
                size="2xs"
                className="h-auto p-0"
                onClick={() => setFilter({})}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        <div
          ref={scrollRoot}
          className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && picked.size) {
              e.stopPropagation();
              clearPicked();
            }
          }}
        >
          {view === 'tree' && !flatView && folderRows.loaders}
          <DndContext
            sensors={sensors}
            onDragStart={(e) => setDragging(String(e.active.id))}
            onDragMove={(e) => setHint(dropAt(e))}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setHint(null);
              setDragging(null);
            }}
          >
            <VirtualRows
              rows={allRows}
              scrollRoot={scrollRoot}
              activeKey={activeKey}
              render={renderRow}
            />
          </DndContext>
        </div>

        {/* At the foot, so picking never moves the rows under the pointer. */}
        {picked.size > 0 && (
          <div
            role="status"
            className="flex items-center gap-1.5 border-t border-border bg-primary/5 px-3 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              {picked.size} {picked.size === 1 ? adapter.noun.one : adapter.noun.many} picked
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                setMoveTarget({ type: 'items', items: [...picked.values()], from: undefined })
              }
            >
              <FolderInput />
              Move to…
            </Button>
            <Button
              variant="ghost"
              size="icon-2xs"
              aria-label="Clear the pick"
              title="Clear the pick (Esc)"
              onClick={clearPicked}
            >
              <X />
            </Button>
          </div>
        )}
      </div>

      {lookFor && lookFolder && (
        <AppLookPicker
          open
          onOpenChange={(o) => !o && setLookFor(null)}
          virtualAnchor={rowEls.current.get(lookFor.key) ?? null}
          side="right"
          align="start"
          icon={lookFolder.icon}
          color={lookFolder.color}
          kind="folder"
          label={lookFolder.name}
          onChange={(l) => {
            const patch: TreeFolderPatch = {};
            if (l.icon !== undefined) patch.icon = l.icon || null;
            if (l.color !== undefined) patch.color = l.color;
            // The picker previews the choice at once; the row follows the save.
            setLookFor((cur) =>
              cur
                ? {
                    ...cur,
                    folder: {
                      ...cur.folder,
                      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
                      ...(l.color !== undefined ? { color: l.color } : {}),
                    },
                  }
                : cur,
            );
            void patchFolder(lookFolder, patch);
          }}
        />
      )}

      <FolderNameDialog
        open={folderDialog !== null}
        onOpenChange={(o) => !o && setFolderDialog(null)}
        initial={folderDialog?.mode === 'rename' ? folderDialog.folder.name : undefined}
        parentName={folderDialog?.mode === 'new' ? (folderDialog.parent?.name ?? null) : null}
        onSubmit={(name) => {
          if (!folderDialog) return;
          if (folderDialog.mode === 'rename') {
            void patchFolder(folderDialog.folder, { name });
            return;
          }
          const parent = folderDialog.parent;
          void write(
            () => createTreeFolder(kind, parent?.id ?? null, name),
            'Could not create the folder',
          ).then((made) => {
            if (made && parent) setOpen(parent.id, true);
          });
        }}
      />
      <DeleteFolderDialog
        folderName={deleteTarget?.name ?? null}
        contents={adapter.noun.many}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void write(() => deleteTreeFolder(kind, target.id), 'Could not delete');
        }}
      />
      <FolderPickerDialog
        kind={kind}
        adapter={adapter}
        sort={sort}
        open={moveTarget !== null}
        onOpenChange={(o) => !o && setMoveTarget(null)}
        title={
          !moveTarget
            ? ''
            : moveTarget.type === 'folder'
              ? `Move “${moveTarget.folder.name}” to…`
              : moveTarget.items.length === 1
                ? `Move “${moveTarget.items[0]!.title}” to…`
                : `Move ${moveTarget.items.length} ${adapter.noun.many} to…`
        }
        rootLabel={rootLabel ?? 'Top level'}
        currentFolderId={
          moveTarget?.type === 'items'
            ? moveTarget.from
            : moveTarget?.type === 'folder'
              ? moveTarget.folder.parentId
              : null
        }
        disabled={
          moveTarget?.type === 'folder' ? (f) => !canNestFolder(moveTarget.folder, f) : undefined
        }
        onPick={(dest) => {
          const target = moveTarget;
          if (!target) return;
          if (target.type === 'items') {
            void moveItems(target.items, dest?.id ?? null);
          } else {
            void patchFolder(target.folder, { parentId: dest?.id ?? null });
            if (dest) setOpen(dest.id, true);
          }
        }}
      />
    </TreeContext.Provider>
  );
}
