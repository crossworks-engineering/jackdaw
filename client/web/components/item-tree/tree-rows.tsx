'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, GripVertical, MoreHorizontal } from 'lucide-react';
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
  type TreeItem,
} from '@mantle/web-ui/types/tree';
import { AppTile } from '@/components/app-nav/app-tile';
import { TREE_INDENT, TREE_ROW_PAD, TreeGuides } from '@/components/app-nav/tree-guides';
import { fetchFolderPage, folderKey } from './tree-api';
import { childEntries, childGuides, crumbLine, isOnTheWayTo, mergeFolderPages } from './tree-model';
import { useTreeCtx, type DragData, type ItemWhere } from './tree-context';

/**
 * The rows of the item tree. Every row is one line, 32px high: an optional
 * drag grip (manage mode, on hover), the dotted guides, a lead, the title and
 * a small status slot, and the "…" menu (on hover and right-click). A folder
 * row has a chevron, its tile, its name and its count.
 *
 * The root and each open folder fetch their own pages (`useInfiniteQuery`
 * per folder, 50 items a page); the last row of a folder with more to come
 * is a sentinel that asks for the next page as it scrolls into view.
 */

const ROW_BUTTON =
  'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-8 text-left text-sm focus-visible:z-10';

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
  active = false,
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
  /** The row the page is about: scrolled into view when it becomes so (a
   *  search hit opened, a folder chosen in the page). */
  active?: boolean;
  children: (style: CSSProperties) => ReactNode;
}) {
  const ctx = useTreeCtx();
  const el = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) el.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
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
        el.current = node;
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

/** A folder's face: its tile, or the neutral folder glyph. */
export function FolderTile({ folder }: { folder: Pick<TreeFolder, 'icon' | 'color'> | null }) {
  return <AppTile icon={folder?.icon} color={folder?.color} kind="folder" size="sm" />;
}

/** The children of one folder (null = the kind's root), fetched a page at a
 *  time. */
export function FolderChildren({
  folder,
  depth,
  guides,
}: {
  folder: TreeFolder | null;
  depth: number;
  guides: readonly boolean[];
}) {
  const ctx = useTreeCtx();
  const folderId = folder?.id ?? null;
  const q = useInfiniteQuery({
    queryKey: folderKey(ctx.kind, folderId, ctx.sort),
    queryFn: ({ pageParam }) => fetchFolderPage(ctx.kind, folderId, ctx.sort, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // A 404 is a brain without the tree (the root) or a folder deleted
    // elsewhere: neither gets better by asking again.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const unsupported = folderId === null && q.error instanceof ApiError && q.error.status === 404;
  const onUnsupported = ctx.onUnsupported;
  useEffect(() => {
    if (unsupported) onUnsupported?.();
  }, [unsupported, onUnsupported]);

  if (q.isPending) return <StatusRow depth={depth} guides={guides} busy label="Loading…" />;
  if (q.isError && !q.data) {
    return (
      <StatusRow
        depth={depth}
        guides={guides}
        label="Couldn’t load this folder."
        action={{ label: 'Retry', onClick: () => void q.refetch() }}
      />
    );
  }
  const children = mergeFolderPages(q.data.pages);
  const picker = ctx.mode === 'picker';
  const entries = childEntries(children, picker);
  if (!entries.length) {
    if (picker) return null;
    if (depth === 0) {
      return (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          No {ctx.adapter.noun.many} or folders yet.
        </p>
      );
    }
    return <StatusRow depth={depth} guides={guides} label="Empty" />;
  }
  return (
    <>
      {entries.map((e) =>
        e.type === 'folder' ? (
          <FolderNode
            key={e.folder.id}
            folder={e.folder}
            parent={folder}
            siblings={children.folders}
            depth={depth}
            isLast={e.isLast}
            guides={guides}
          />
        ) : (
          <ItemRow
            key={e.item.id}
            rowKey={`i:${e.item.id}`}
            item={e.item}
            where={{ folderId, folderPath: folder?.path ?? null }}
            parent={folder}
            depth={depth}
            isLast={e.isLast}
            guides={guides}
          />
        ),
      )}
      {!picker && children.hasMore && (
        <Sentinel
          depth={depth}
          guides={guides}
          loading={q.isFetchingNextPage}
          onVisible={() => {
            if (!q.isFetchingNextPage) void q.fetchNextPage();
          }}
        />
      )}
    </>
  );
}

function FolderNode({
  folder,
  parent,
  siblings,
  depth,
  isLast,
  guides,
}: {
  folder: TreeFolder;
  parent: TreeFolder | null;
  siblings: TreeFolder[];
  depth: number;
  isLast: boolean;
  guides: readonly boolean[];
}) {
  const ctx = useTreeCtx();
  const open = ctx.isOpen(folder.id);
  const { reveal, setOpen } = ctx;
  // Unfold the way to what is on screen (the folder the page shows, or a
  // search hit). Only when the destination changes: re-running on `open`
  // would re-open a folder that was just folded.
  useEffect(() => {
    if (isOnTheWayTo(reveal, folder.path) && reveal !== folder.path) setOpen(folder.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, folder.path]);
  const rowKey = `f:${folder.id}`;
  const picker = ctx.mode === 'picker';
  const hasChildren = picker ? folder.folderCount > 0 : folder.folderCount + folder.itemCount > 0;
  const selected = ctx.selectedFolderPath === folder.path;
  const disabled = ctx.folderDisabled?.(folder) ?? false;
  const drag: DragData = { type: 'folder', folder, parent, siblings };
  return (
    <>
      <TreeRowShell
        rowKey={rowKey}
        depth={depth}
        isLast={isLast}
        guides={guides}
        drag={folder.system ? undefined : drag}
        drop={drag}
        menu={ctx.folderMenu?.(folder, parent, siblings)}
        active={selected}
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
                onClick={() => setOpen(folder.id, !open)}
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
      {open && hasChildren && (
        <FolderChildren folder={folder} depth={depth + 1} guides={childGuides(guides, isLast)} />
      )}
    </>
  );
}

/** One item: its lead, its title, and the status slot (or, in a flat list,
 *  the folder it lives in). */
export function ItemRow({
  rowKey,
  item,
  where,
  parent,
  depth,
  isLast,
  guides,
  crumbs,
}: {
  rowKey: string;
  item: TreeItem;
  where: ItemWhere;
  parent?: TreeFolder | null;
  depth: number;
  isLast: boolean;
  guides: readonly boolean[];
  /** A flat list's row: where the item lives, in the status slot's place. */
  crumbs?: readonly TreeCrumb[];
}) {
  const ctx = useTreeCtx();
  const selected = ctx.selectedItemId === item.id;
  const place = crumbs ? crumbLine(crumbs) : null;
  // Private items have no folder yet: they cannot be dragged anywhere.
  const drag: DragData | undefined =
    crumbs === undefined && item.state !== 'private'
      ? { type: 'item', item, parent: parent ?? null }
      : undefined;
  return (
    <TreeRowShell
      rowKey={rowKey}
      depth={depth}
      isLast={isLast}
      guides={guides}
      drag={drag}
      menu={ctx.itemMenu?.(item, where)}
      active={selected && crumbs === undefined}
    >
      {(style) => (
        <RowButton
          onClick={() => ctx.onItemClick(item, where)}
          aria-current={selected ? 'true' : undefined}
          title={place ? `${place} / ${item.title}` : item.title}
          style={style}
          data-mark-id={item.id}
          data-mark-kind={TREE_KIND_SPECS[ctx.kind].nodeType}
          data-mark-label={item.title}
          className={cn(
            ROW_BUTTON,
            selected
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground/90 hover:bg-foreground/[0.06]',
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

/** The last row of a folder with more to load: fetches the next page when it
 *  scrolls into view. */
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
  const ctx = useTreeCtx();
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  const root = ctx.scrollRoot;
  useEffect(() => {
    const node = el.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      { root: root.current, rootMargin: '200px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
    // Re-observed after each page lands: a sentinel still in view once the
    // new rows are in never "enters" again, so a fresh observer asks again.
  }, [root, loading]);
  return (
    <div ref={el}>
      <StatusRow
        depth={depth}
        guides={guides}
        busy={loading}
        label={loading ? 'Loading more…' : 'More below'}
      />
    </div>
  );
}
