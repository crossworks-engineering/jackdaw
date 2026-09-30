'use client';

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, GripVertical, Handshake, MoreHorizontal, Users } from 'lucide-react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { DropdownMenu, DropdownMenuTrigger } from '@mantle/web-ui/ui/dropdown-menu';
import {
  TREE_KIND_SPECS,
  type TreeCrumb,
  type TreeFolder,
  type TreeFolderPage,
  type TreeItem,
  type TreeKind,
  type TreeSort,
} from '@mantle/web-ui/types/tree';
import { AppTile } from '@/components/app-nav/app-tile';
import { TREE_INDENT, TREE_ROW_PAD, TreeGuides } from '@/components/app-nav/tree-guides';
import { shareTitle, shownShare } from './sharing';
import { fetchFolderPage, folderKey, treeScope, type TreeSource } from './tree-api';
import {
  crumbLine,
  flattenTree,
  mergeFolderPages,
  type FolderLoad,
  type TreeRow,
} from './tree-model';
import { useTreeCtx, type DragData } from './tree-context';

/**
 * The rows of the item tree. Every row is one line, 32px high: an optional
 * drag grip (manage mode, on hover), the dotted guides, a lead, the title and
 * a small status slot, and the "…" menu (on hover and right-click). A folder
 * row has a chevron, its tile, its name and its count.
 *
 * The tree is flattened (tree-model's `flattenTree`) and drawn through one
 * virtual list, so only the rows near the viewport exist, however many
 * folders are open. The root and each open folder keep their own pages
 * (`useInfiniteQuery` per folder, 50 items a page) through an invisible
 * loader; the last row of a folder with more to come asks for the next page
 * as it comes into view.
 */

const ROW_BUTTON =
  'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-8 text-left text-sm focus-visible:z-10';

/** One slot of the list: a 32px row and the 1px gap below it. */
const ROW_SIZE = 33;
const SIZE: Record<TreeRow['type'], number> = {
  folder: ROW_SIZE,
  item: ROW_SIZE,
  hit: ROW_SIZE,
  root: ROW_SIZE,
  status: ROW_SIZE,
  more: ROW_SIZE,
  note: 33,
  divider: 9,
};

// ── Loading folders ─────────────────────────────────────────────────────

/** What a folder's loader lends the rows: the next page, and a retry. */
type FolderHandle = { fetchMore: () => void; retry: () => void };

function readFolderLoad(
  state: ReturnType<ReturnType<typeof useQueryClient>['getQueryState']>,
): FolderLoad {
  const data = state?.data as InfiniteData<TreeFolderPage> | undefined;
  if (!data) {
    if (state?.status !== 'error') return { status: 'pending' };
    return { status: 'error', gone: state.error instanceof ApiError && state.error.status === 404 };
  }
  const fetchMore = (state?.fetchMeta as { fetchMore?: { direction?: string } } | null)?.fetchMore;
  return {
    status: 'ok',
    children: mergeFolderPages(data.pages),
    loadingMore: state?.fetchStatus === 'fetching' && fetchMore?.direction === 'forward',
  };
}

/** Keeps one folder's pages loaded and fresh; draws nothing. */
function FolderLoader({
  kind,
  source,
  sort,
  folderId,
  handles,
  onUnsupported,
}: {
  kind: TreeKind;
  source: TreeSource;
  sort: TreeSort;
  folderId: string | null;
  handles: Map<string, FolderHandle>;
  onUnsupported?: () => void;
}) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: folderKey(kind, folderId, sort, source),
    queryFn: ({ pageParam }) => fetchFolderPage(kind, folderId, sort, pageParam, source),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // A 404 is a brain without the tree (the root) or a folder deleted
    // elsewhere: neither gets better by asking again.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
    // A reader's tree hears of no change (the realtime stream is the
    // owner's): coming back to the window is when it asks again.
    refetchOnWindowFocus: source !== 'owner',
  });
  const { fetchNextPage, refetch } = q;
  const busy = useRef(false);
  const id = folderId ?? 'root';
  useEffect(() => {
    handles.set(id, {
      fetchMore: () => {
        // Marked busy at once: two asks before the next render (a row
        // mounting twice in dev, two sentinels) must make one request.
        if (busy.current) return;
        busy.current = true;
        void fetchNextPage().finally(() => {
          busy.current = false;
        });
      },
      retry: () => void refetch(),
    });
    return () => void handles.delete(id);
  }, [handles, id, fetchNextPage, refetch]);
  const notFound = q.error instanceof ApiError && q.error.status === 404;
  const unsupported = folderId === null && notFound;
  useEffect(() => {
    if (unsupported) onUnsupported?.();
  }, [unsupported, onUnsupported]);
  // A folder that answers 404 left the tree (deleted, or no longer shared
  // with a reader): the folders above it are stale, so they ask again (not
  // this one, which would only answer 404 again). Once per time it fails.
  const goneAt = folderId !== null && notFound ? q.errorUpdatedAt : 0;
  useEffect(() => {
    if (!goneAt) return;
    const scope = treeScope(kind, source);
    void qc.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return key[0] === 'tree' && key[1] === scope && key[2] === 'folder' && key[3] !== folderId;
      },
    });
  }, [goneAt, qc, kind, source, folderId]);
  return null;
}

/** Re-renders when any of this kind's folder pages change in the cache. */
function useFolderCacheVersion(kind: TreeKind, source: TreeSource): number {
  const qc = useQueryClient();
  const version = useRef(0);
  const subscribe = useCallback(
    (onChange: () => void) =>
      qc.getQueryCache().subscribe((e) => {
        const key = e.query.queryKey;
        if (key[0] !== 'tree' || key[1] !== treeScope(kind, source) || key[2] !== 'folder') {
          return;
        }
        if (e.type !== 'updated' && e.type !== 'removed') return;
        version.current += 1;
        // Deferred: a loader's query can report while another component
        // renders, and a re-render must not be asked for from inside one.
        queueMicrotask(onChange);
      }),
    [qc, kind, source],
  );
  return useSyncExternalStore(
    subscribe,
    () => version.current,
    () => 0,
  );
}

/**
 * The tree's rows below the root, from what the cache holds, plus the
 * loaders that keep every folder on screen fetching. Render `loaders`
 * anywhere; hand `handles` to the rows.
 */
export function useFolderRows({
  kind,
  source = 'owner',
  sort,
  isOpen,
  foldersOnly = false,
  emptyText,
  goneText,
  onUnsupported,
}: {
  kind: TreeKind;
  /** Who the tree is read as (tree-api's TreeSource). */
  source?: TreeSource;
  sort: TreeSort;
  isOpen: (folderId: string) => boolean;
  foldersOnly?: boolean;
  emptyText: string;
  /** What a folder the brain no longer shows says (flattenTree's). */
  goneText?: string;
  onUnsupported?: () => void;
}): { rows: TreeRow[]; loaders: ReactNode; handles: Map<string, FolderHandle> } {
  const qc = useQueryClient();
  useFolderCacheVersion(kind, source);
  const handles = useRef(new Map<string, FolderHandle>()).current;
  const { rows, needed } = flattenTree(
    (folderId) => readFolderLoad(qc.getQueryState(folderKey(kind, folderId, sort, source))),
    isOpen,
    { foldersOnly, emptyText, goneText },
  );
  const loaders = needed.map((folderId) => (
    <FolderLoader
      key={folderId ?? 'root'}
      kind={kind}
      source={source}
      sort={sort}
      folderId={folderId}
      handles={handles}
      onUnsupported={folderId === null ? onUnsupported : undefined}
    />
  ));
  return { rows, loaders, handles };
}

// ── The list ────────────────────────────────────────────────────────────

/**
 * Draws `rows` through a virtual list inside `scrollRoot` (which scrolls and
 * carries no vertical padding: the list pads itself). When `activeKey` names
 * a row, the list scrolls to it once it exists, and again whenever the key
 * changes.
 */
export function VirtualRows({
  rows,
  scrollRoot,
  activeKey = null,
  render,
}: {
  rows: readonly TreeRow[];
  scrollRoot: RefObject<HTMLElement | null>;
  activeKey?: string | null;
  render: (row: TreeRow) => ReactNode;
}) {
  // The scroll element is the parent's, and a parent's ref attaches after its
  // children's layout effects: the virtualizer's first look finds nothing.
  // One render after mount lets it find the element even when nothing else
  // changes (the picker over a cached tree).
  const [, remeasure] = useReducer((n: number) => n + 1, 0);
  useEffect(() => remeasure(), []);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRoot.current,
    estimateSize: (i) => SIZE[rows[i]!.type],
    getItemKey: (i) => rows[i]!.key,
    overscan: 12,
    paddingStart: 8,
    paddingEnd: 8,
  });
  const activeIndex = activeKey ? rows.findIndex((r) => r.key === activeKey) : -1;
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activeKey) {
      scrolledFor.current = null;
      return;
    }
    if (activeIndex < 0 || scrolledFor.current === activeKey) return;
    scrolledFor.current = activeKey;
    v.scrollToIndex(activeIndex, { align: 'auto' });
  }, [activeKey, activeIndex, v]);
  return (
    <div className="relative w-full" style={{ height: v.getTotalSize() }}>
      {v.getVirtualItems().map((vi) => (
        // `top`, not a transform: a transform would make each slot its own
        // stacking context and the dragged row could not rise above the rest.
        <div
          key={vi.key}
          data-index={vi.index}
          ref={v.measureElement}
          className="absolute inset-x-0 pb-px"
          style={{ top: vi.start }}
        >
          {render(rows[vi.index]!)}
        </div>
      ))}
    </div>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────

/** The shell every row shares: guides, the drag and drop wiring, the drop
 *  indicator, and the menu. The body is the row's own. */
export function TreeRowShell({
  rowKey,
  depth,
  isLast,
  guides,
  drag,
  drop,
  menu,
  badge,
  children,
}: {
  rowKey: string;
  depth: number;
  isLast: boolean;
  guides: readonly boolean[];
  /** Draggable, carrying this. */
  drag?: DragData;
  /** A drop target, carrying this. */
  drop?: DragData;
  menu?: ReactNode;
  /** Shown on the row while it is dragged (how many go with it). */
  badge?: ReactNode;
  children: (style: CSSProperties) => ReactNode;
}) {
  const ctx = useTreeCtx();
  const manage = ctx.mode === 'manage';
  const draggable = useDraggable({ id: rowKey, data: drag, disabled: !manage || !drag });
  const droppable = useDroppable({ id: rowKey, data: drop, disabled: !manage || !drop });
  const pos = ctx.hint?.over === rowKey ? ctx.hint.pos : null;
  const isDragging = ctx.dragging === rowKey;
  // Listeners only, not dnd-kit's `attributes`: those make the row a
  // role="button" wrapping a button. The row menu's "Move to" is the keyboard
  // path.
  const listeners = manage && drag ? draggable.listeners : undefined;
  const menuOpen = ctx.menuFor === rowKey;
  return (
    <div
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
        ctx.registerRow(rowKey, node);
      }}
      className={cn(
        'group/tree-row relative flex items-center rounded-md',
        isDragging && 'z-20 bg-sidebar shadow-sm ring-1 ring-border',
        pos === 'inside' && 'ring-2 ring-ring/60',
      )}
      style={
        isDragging && draggable.transform
          ? { transform: `translate3d(0, ${draggable.transform.y}px, 0)` }
          : undefined
      }
      onContextMenu={
        menu
          ? (e) => {
              e.preventDefault();
              ctx.setMenuFor(rowKey);
            }
          : undefined
      }
      {...listeners}
    >
      {pos === 'before' && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 -top-px h-0.5 rounded bg-ring"
        />
      )}
      {pos === 'after' && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded bg-ring"
        />
      )}
      {manage && drag && (
        <GripVertical
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 size-3 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/tree-row:opacity-60"
        />
      )}
      <TreeGuides depth={depth} isLast={isLast} guides={guides} />
      {children({ paddingLeft: TREE_ROW_PAD + depth * TREE_INDENT })}
      {isDragging && badge}
      {menu && (
        <DropdownMenu open={menuOpen} onOpenChange={(o) => ctx.setMenuFor(o ? rowKey : null)}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-2xs"
              aria-label="More actions"
              className={cn(
                'absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/tree-row:opacity-100',
                menuOpen && 'opacity-100',
              )}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      )}
    </div>
  );
}

/** The shared glyph on a folder row: people for the team, a handshake for
 *  clients. A share taken from a folder above is drawn quieter. */
export function ShareGlyph({
  folder,
  selected = false,
}: {
  folder: Pick<TreeFolder, 'share' | 'inherited'>;
  selected?: boolean;
}) {
  const shown = shownShare(folder);
  if (!shown) return null;
  const Icon = shown.level === 'team' ? Users : Handshake;
  const title = shareTitle(folder)!;
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        'flex shrink-0 items-center',
        selected
          ? 'text-accent-foreground/70'
          : shown.own
            ? 'text-foreground/70'
            : 'text-muted-foreground/60',
      )}
    >
      <Icon className="size-3.5" strokeWidth={shown.own ? 2 : 1.5} aria-hidden />
    </span>
  );
}

/** A folder's face: its tile, or the neutral folder glyph. */
export function FolderTile({ folder }: { folder: Pick<TreeFolder, 'icon' | 'color'> | null }) {
  return <AppTile icon={folder?.icon} color={folder?.color} kind="folder" size="sm" />;
}

/** Any row of a folder tree (not the flat lists' own rows, not the root
 *  row: their owner draws those). */
export function FolderTreeRow({
  row,
  handles,
}: {
  row: TreeRow;
  handles: Map<string, FolderHandle>;
}) {
  switch (row.type) {
    case 'folder':
      return <FolderRow row={row} />;
    case 'item':
      return (
        <ItemRow
          rowKey={row.key}
          item={row.item}
          parent={row.parent}
          folderPath={row.folderPath}
          depth={row.depth}
          isLast={row.isLast}
          guides={row.guides}
          crumbs={row.crumbs}
        />
      );
    case 'status': {
      const retry = row.retry;
      return (
        <StatusRow
          depth={row.depth}
          guides={row.guides}
          label={row.label}
          busy={row.busy}
          action={
            retry !== undefined
              ? { label: 'Retry', onClick: () => handles.get(retry ?? 'root')?.retry() }
              : undefined
          }
        />
      );
    }
    case 'more':
      return (
        <Sentinel
          depth={row.depth}
          guides={row.guides}
          loading={row.loading}
          onVisible={() => handles.get(row.source ?? 'root')?.fetchMore()}
        />
      );
    case 'note':
      return (
        <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          {row.text}
          {row.retry && (
            <Button variant="link" size="2xs" className="h-auto p-0" onClick={row.retry}>
              Retry
            </Button>
          )}
        </p>
      );
    case 'divider':
      return <div className="mx-3 my-1 border-t border-border/60" />;
    default:
      return null;
  }
}

function FolderRow({ row }: { row: Extract<TreeRow, { type: 'folder' }> }) {
  const ctx = useTreeCtx();
  const { folder, parent, siblings, depth, isLast, guides, open, hasChildren } = row;
  const picker = ctx.mode === 'picker';
  const selected = ctx.selectedFolderPath === folder.path;
  const disabled = ctx.folderDisabled?.(folder) ?? false;
  const drag: DragData = { type: 'folder', folder, parent, siblings };
  return (
    <TreeRowShell
      rowKey={row.key}
      depth={depth}
      isLast={isLast}
      guides={guides}
      drag={folder.system || ctx.canMoveFolder?.(folder) === false ? undefined : drag}
      drop={drag}
      menu={ctx.folderMenu?.(folder, parent, siblings)}
    >
      {(style) => (
        <>
          <RowButton
            onClick={() => ctx.onFolderClick(folder)}
            aria-current={selected ? 'true' : undefined}
            disabled={disabled}
            title={folder.name}
            style={style}
            className={cn(
              ROW_BUTTON,
              'pr-14',
              selected
                ? 'bg-accent font-medium text-accent-foreground'
                : 'font-medium text-foreground/85 hover:bg-foreground/[0.06]',
            )}
          >
            <FolderTile folder={folder} />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            <ShareGlyph folder={folder} selected={selected} />
            {!picker && folder.itemCount > 0 && (
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  selected ? 'text-accent-foreground/70' : 'text-muted-foreground',
                )}
                title={`${folder.itemCount} ${folder.itemCount === 1 ? ctx.adapter.noun.one : ctx.adapter.noun.many}`}
              >
                {folder.itemCount}
              </span>
            )}
          </RowButton>
          {hasChildren && (
            <Button
              variant="ghost"
              size="icon-2xs"
              aria-label={open ? `Fold ${folder.name}` : `Unfold ${folder.name}`}
              aria-expanded={open}
              onClick={() => ctx.setOpen(folder.id, !open)}
              className={cn(
                'absolute top-1/2 -translate-y-1/2 hover:text-foreground',
                picker ? 'right-1' : 'right-7',
                selected ? 'text-accent-foreground/70' : 'text-muted-foreground',
              )}
            >
              <ChevronRight className={cn('transition-transform', open && 'rotate-90')} />
            </Button>
          )}
        </>
      )}
    </TreeRowShell>
  );
}

/** One item: its lead, its title, and the status slot (or, in a flat list,
 *  the folder it lives in). */
export function ItemRow({
  rowKey,
  item,
  parent = null,
  folderPath = null,
  depth,
  isLast,
  guides,
  crumbs,
}: {
  rowKey: string;
  item: TreeItem;
  parent?: TreeFolder | null;
  folderPath?: string | null;
  depth: number;
  isLast: boolean;
  guides: readonly boolean[];
  /** A flat list's row: where the item lives, in the status slot's place. */
  crumbs?: readonly TreeCrumb[];
}) {
  const ctx = useTreeCtx();
  const selected = ctx.selectedItemId === item.id;
  const picked = ctx.picked.has(item.id);
  const place = crumbs ? crumbLine(crumbs) : null;
  const where = crumbs
    ? { folderId: crumbs.at(-1)?.id ?? null, folderPath: null }
    : { folderId: parent?.id ?? null, folderPath };
  // Only a tree that manages drags (never a client's). An owner's private
  // items have no folder yet: they cannot be dragged anywhere. A member's
  // tree says which of its rows move.
  const drag: DragData | undefined =
    ctx.mode === 'manage' &&
    crumbs === undefined &&
    (ctx.canMoveItem?.(item) ?? item.state !== 'private')
      ? { type: 'item', item, parent: parent ?? null }
      : undefined;
  const carried = picked ? ctx.picked.size : 1;
  return (
    <TreeRowShell
      rowKey={rowKey}
      depth={depth}
      isLast={isLast}
      guides={guides}
      drag={drag}
      menu={ctx.itemMenu?.(item, where)}
      badge={
        carried > 1 ? (
          <span className="absolute -right-1 -top-1.5 rounded-full bg-primary px-1.5 text-[10px] font-medium tabular-nums text-primary-foreground">
            {carried}
          </span>
        ) : null
      }
    >
      {(style) => (
        <RowButton
          onClick={(e: MouseEvent) => ctx.onItemClick(item, where, e)}
          aria-current={selected ? 'true' : undefined}
          aria-pressed={ctx.picked.size ? picked : undefined}
          title={place ? `${place} / ${item.title}` : item.title}
          style={style}
          data-mark-id={item.id}
          data-mark-kind={TREE_KIND_SPECS[ctx.kind].nodeType}
          data-mark-label={item.title}
          className={cn(
            ROW_BUTTON,
            selected
              ? 'bg-accent text-accent-foreground'
              : picked
                ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary/30 hover:bg-primary/15'
                : 'text-foreground/90 hover:bg-foreground/[0.06]',
            selected && picked && 'ring-1 ring-inset ring-primary/40',
          )}
        >
          {ctx.adapter.lead(item)}
          <span className="min-w-0 flex-1 truncate">{item.title}</span>
          {place !== null ? (
            place && (
              <span className="max-w-[45%] shrink truncate text-[11px] text-muted-foreground">
                {place}
              </span>
            )
          ) : (
            <span className="flex shrink-0 items-center gap-1">{ctx.adapter.status(item)}</span>
          )}
        </RowButton>
      )}
    </TreeRowShell>
  );
}

/** A search hit that is a folder: its tile, name and where it lives. */
export function FolderHitRow({
  folder,
  crumbs,
  onClick,
}: {
  folder: TreeFolder;
  crumbs: readonly TreeCrumb[];
  onClick: () => void;
}) {
  const place = crumbLine(crumbs);
  return (
    <RowButton
      onClick={onClick}
      title={place ? `${place} / ${folder.name}` : folder.name}
      style={{ paddingLeft: TREE_ROW_PAD }}
      className={cn(ROW_BUTTON, 'pr-2 font-medium text-foreground/85 hover:bg-foreground/[0.06]')}
    >
      <FolderTile folder={folder} />
      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
      <ShareGlyph folder={folder} />
      {place && (
        <span className="max-w-[45%] shrink truncate text-[11px] font-normal text-muted-foreground">
          {place}
        </span>
      )}
    </RowButton>
  );
}

/** A quiet one-line row inside the tree: loading, empty, or an error. */
function StatusRow({
  depth,
  guides,
  label,
  busy,
  action,
}: {
  depth: number;
  guides: readonly boolean[];
  label: string;
  busy?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="relative flex h-8 items-center">
      <TreeGuides depth={depth} isLast guides={guides} />
      <span
        className="flex items-center gap-2 text-xs text-muted-foreground"
        style={{ paddingLeft: TREE_ROW_PAD + depth * TREE_INDENT + 4 }}
      >
        {busy && <Spinner className="size-3" />}
        {label}
        {action && (
          <Button variant="link" size="2xs" className="h-auto p-0" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </span>
    </div>
  );
}

/**
 * The last row of a list with more to load. The list only draws rows near
 * the viewport, so being drawn is being nearly in view: it asks for the next
 * page when it appears, and again when a page lands while it is still drawn
 * (its key carries the count, so a new page makes it a new row).
 */
export function Sentinel({
  depth,
  guides,
  loading,
  onVisible,
}: {
  depth: number;
  guides: readonly boolean[];
  loading: boolean;
  onVisible: () => void;
}) {
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    if (!loading) cb.current();
    // Only on appearing: a failed page must not be asked for in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <StatusRow
      depth={depth}
      guides={guides}
      busy={loading}
      label={loading ? 'Loading more…' : ''}
      action={loading ? undefined : { label: 'Load more', onClick: () => cb.current() }}
    />
  );
}
