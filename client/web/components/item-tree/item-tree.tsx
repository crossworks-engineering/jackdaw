'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import { ArrowUpDown, FolderPlus, Pin, PinOff, Search, X } from 'lucide-react';
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
  type TreeFolder,
  type TreeItem,
  type TreeKind,
  type TreeSort,
} from '@mantle/web-ui/types/tree';
import { AppLookPicker } from '@/components/app-nav/app-look-picker';
import { DeleteFolderDialog, FolderNameDialog } from '@/components/app-nav/folder-dialogs';
import { useRealtime } from '@/components/realtime/use-realtime';
import { oneOf, usePersistedState } from '@/lib/use-persisted-state';
import type { TreeKindAdapter } from './kinds/types';
import {
  createTreeFolder,
  deleteTreeFolder,
  fetchMarks,
  fetchSearch,
  marksKey,
  moveTreeItems,
  patchTreeFolder,
  recordTreeItemOpened,
  searchKey,
  setTreeItemPinned,
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
import { afterFor, afterForStep, canNestFolder, dropPosition, isAtOrBelow } from './tree-model';
import {
  FolderChildren,
  FolderHitRow,
  FolderTile,
  ItemRow,
  Sentinel,
  TreeRowShell,
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
  { type: 'item'; item: TreeItem; from: string | null } | { type: 'folder'; folder: TreeFolder };

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

  // A to Z is the empty search; a search is the same query with a term.
  const flatTerm = searching ? term : '';
  const flatQ = useInfiniteQuery({
    queryKey: searchKey(kind, flatTerm),
    queryFn: ({ pageParam }) => fetchSearch(kind, flatTerm, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: searching ? term.length > 0 : view === 'az',
  });

  // ── Opening ───────────────────────────────────────────────────────────
  const openItem = (item: TreeItem, where: ItemWhere) => {
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
                  onSelect={() => setMoveTarget({ type: 'item', item, from: where.folderId })}
                >
                  Move to…
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
      const dest = o.type === 'folder' ? o.folder.id : null;
      void write(async () => {
        const res = await moveTreeItems(kind, [a.item.id], dest);
        if (res.failed.length) throw new ApiError(res.failed[0]!.error, 409);
        if (dest) setOpen(dest, true);
      }, `Could not move the ${adapter.noun.one}`);
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
    onItemClick: openItem,
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
    scrollRoot,
    onUnsupported,
  };

  // ── Body by view ──────────────────────────────────────────────────────
  const where = (crumbs: readonly { id: string }[]): ItemWhere => ({
    folderId: crumbs.at(-1)?.id ?? null,
    folderPath: null,
  });

  let body: ReactNode;
  if (searching || view === 'az') {
    const pages = flatQ.data?.pages ?? [];
    const folders = pages[0]?.folders ?? [];
    const items = pages.flatMap((p) => p.items);
    const pendingSearch = searching && (term !== query.trim() || flatQ.isPending);
    body =
      pendingSearch && !items.length && !folders.length ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
      ) : !folders.length && !items.length ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {searching ? `Nothing matches “${query.trim()}”.` : `No ${adapter.noun.many} yet.`}
        </p>
      ) : (
        <div className="flex flex-col gap-px">
          {folders.map((f) => (
            <FolderHitRow
              key={`sf:${f.id}`}
              folder={f}
              crumbs={f.crumbs}
              onClick={() => openFolderHit(f)}
            />
          ))}
          {items.map((it) => (
            <ItemRow
              key={`s:${it.id}`}
              rowKey={`s:${it.id}`}
              item={it}
              where={where(it.crumbs)}
              depth={0}
              isLast={false}
              guides={[]}
              crumbs={it.crumbs}
            />
          ))}
          {flatQ.hasNextPage && (
            <Sentinel
              depth={0}
              guides={[]}
              loading={flatQ.isFetchingNextPage}
              onVisible={() => {
                if (!flatQ.isFetchingNextPage) void flatQ.fetchNextPage();
              }}
            />
          )}
        </div>
      );
  } else if (listView) {
    const items = marksQ.data?.items ?? [];
    body = marksQ.isPending ? (
      <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
    ) : items.length === 0 ? (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        {`${adapter.noun.many.charAt(0).toUpperCase()}${adapter.noun.many.slice(1)} you open show up here.`}
      </p>
    ) : (
      <div className="flex flex-col gap-px">
        {items.map((it) => (
          <ItemRow
            key={`l:${it.id}`}
            rowKey={`l:${it.id}`}
            item={it}
            where={where(it.crumbs)}
            depth={0}
            isLast={false}
            guides={[]}
            crumbs={it.crumbs}
          />
        ))}
      </div>
    );
  } else {
    const pins = pinsQ.data?.items ?? [];
    const rootSelected = selectedFolderPath === spec.root;
    body = (
      <div className="flex flex-col gap-px">
        {pins.length > 0 && (
          <>
            {pins.map((it) => (
              <ItemRow
                key={`p:${it.id}`}
                rowKey={`p:${it.id}`}
                item={it}
                where={where(it.crumbs)}
                depth={0}
                isLast={false}
                guides={[]}
                crumbs={it.crumbs}
              />
            ))}
            <div className="mx-3 my-1 border-t border-border/60" />
          </>
        )}
        {rootLabel && (
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
        )}
        <FolderChildren folder={null} depth={0} guides={[]} />
      </div>
    );
  }

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
                value={view}
                onValueChange={(v) => v && setView(v as View)}
                aria-label={`How to list ${adapter.noun.many}`}
                className="grid flex-1 grid-cols-4"
              >
                {VIEWS.map((v) => (
                  <ToggleGroupItem key={v.id} value={v.id} className="h-8 px-1 text-xs">
                    {v.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {view === 'tree' && spec.sorts.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      aria-label="Sort"
                      title={`Sort: ${SORT_LABEL[sort]}`}
                    >
                      <ArrowUpDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
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
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>

        <div ref={scrollRoot} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-2">
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
            {body}
          </DndContext>
        </div>
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
          moveTarget
            ? `Move “${moveTarget.type === 'item' ? moveTarget.item.title : moveTarget.folder.name}” to…`
            : ''
        }
        rootLabel={rootLabel ?? 'Top level'}
        currentFolderId={
          moveTarget?.type === 'item'
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
          if (target.type === 'item') {
            void write(async () => {
              const res = await moveTreeItems(kind, [target.item.id], dest?.id ?? null);
              if (res.failed.length) throw new ApiError(res.failed[0]!.error, 409);
            }, `Could not move the ${adapter.noun.one}`);
          } else {
            void patchFolder(target.folder, { parentId: dest?.id ?? null });
          }
          if (dest) setOpen(dest.id, true);
        }}
      />
    </TreeContext.Provider>
  );
}
