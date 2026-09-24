'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import { ChevronRight, FolderPlus, Inbox, MoreHorizontal, Pin, PinOff, Tag } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import {
  APP_NAV_MAX_DEPTH,
  type AppNavEntry,
  type AppNavFolder,
  type AppNavItem,
} from '@mantle/web-ui/types/app-nav';
import {
  canMoveAppNavEntry,
  dissolveAppNavFolder,
  findAppNavEntry,
  flattenAppNav,
  moveAppNavEntry,
  placeAppNavApp,
  pruneAppNav,
  updateAppNavFolder,
  type AppNavRow,
} from '@mantle/web-ui/lib/app-nav-tree';
import { AppTile } from './app-tile';
import { AppLookPicker, type AppLook } from './app-look-picker';
import { DeleteFolderDialog, FolderNameDialog } from './folder-dialogs';
import {
  appRunHref,
  appTags,
  folderAppCount,
  folderPaths,
  listApps,
  searchApps,
  unsortedApps,
  type AppListMode,
} from './app-nav-view';
import { recordAppOpen, useAppNav, type LayoutOp } from './use-app-nav';

/**
 * The sidebar's Apps section: pinned apps, the brain's folder tree, and the
 * unsorted apps below it. Folders nest up to three deep; expanding one draws
 * dotted ├ / └ guides from each child back to its parent.
 *
 * What syncs and what doesn't:
 *  - the tree, folder names/icons/colours and each app's icon/colour are the
 *    BRAIN's (every admin, every device);
 *  - pins and the Recent / Most used counts are this LOGIN's;
 *  - which folders are open, the section fold and the chosen view are this
 *    BROWSER's (localStorage): how a list is folded on a laptop says nothing
 *    about how it should look on a phone.
 *
 * Searching is the sidebar's own "Filter menu…" box (`query`): while it holds
 * text this section lists matching apps flat, each with its folder path.
 */

const INDENT = 20; // px per level; the guide for level d sits at d*INDENT + 10
const ROW_PAD = 8; // px before the first tile
const UNSORTED = 'unsorted';

type View = 'tree' | AppListMode;
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'tree', label: 'Folders' },
  { id: 'recent', label: 'Recent' },
  { id: 'used', label: 'Most used' },
  { id: 'az', label: 'A to Z' },
];

function useLocal<T>(key: string, initial: T, parse: (raw: string) => T | null) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw != null ? parse(raw) : null;
      if (parsed != null) setValue(parsed);
    } catch {
      /* private mode: defaults it is */
    }
    // Read once per key on mount. `parse` is an inline lambda at each call
    // site (new every render); depending on it would re-read storage on every
    // render and clobber the value just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (next: T, serialise: (v: T) => string = JSON.stringify) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, serialise(next));
      } catch {
        /* quota / private mode: it just won't persist */
      }
    },
    [key],
  );
  return [value, set] as const;
}

const parseStringArray = (raw: string) => {
  const v = JSON.parse(raw) as unknown;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
};

type DropPos = 'before' | 'after' | 'inside' | 'unsort';
type DropHint = { over: string; pos: DropPos } | null;

/** Drag ids: `t:` a tree entry, `u:` an unsorted app, plus the Unsorted row. */
const treeKey = (id: string) => `t:${id}`;
const unsortedKey = (id: string) => `u:${id}`;

export function SidebarApps({ query, onNavigate }: { query: string; onNavigate?: () => void }) {
  const { data, query: q, unsupported, editLayout, togglePin, setAppLook } = useAppNav();
  const qc = useQueryClient();
  const toast = useToast();
  const pathname = usePathname();

  const [closedList, setClosed] = useLocal<string[]>(
    'mantle_app_nav_closed_v1',
    [],
    parseStringArray,
  );
  const closed = useMemo(() => new Set(closedList), [closedList]);
  const [sectionOpen, setSectionOpen] = useLocal('mantle_app_nav_section_v1', true, (r) =>
    r === 'false' ? false : true,
  );
  const [view, setView] = useLocal<View>('mantle_app_nav_view_v1', 'tree', (r) =>
    VIEWS.some((v) => v.id === r) ? (r as View) : null,
  );
  const [tag, setTag] = useState<string | null>(null);

  const [folderDialog, setFolderDialog] = useState<
    { mode: 'new'; parent: AppNavFolder | null } | { mode: 'rename'; folder: AppNavFolder } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<AppNavFolder | null>(null);
  const [lookFor, setLookFor] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggleFolder = (id: string) =>
    setClosed(closed.has(id) ? closedList.filter((c) => c !== id) : [...closedList, id]);

  const edit = (op: LayoutOp, failure?: string) => {
    if (!editLayout(op) && failure) toast.error(failure);
  };

  if (unsupported || (!data && !q.isError)) return null;
  if (!data) {
    return (
      <div className="px-3 text-xs text-muted-foreground">
        Couldn’t load your apps.{' '}
        <Button variant="link" size="2xs" className="h-auto p-0" onClick={() => q.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const byId = new Map(data.apps.map((a) => [a.id, a]));
  const entries = data.nav.entries;
  const unsorted = unsortedApps(data);
  const hasFolders = entries.some((e) => e.kind === 'folder');
  const isActiveApp = (id: string) =>
    pathname === `/apps/${id}` || pathname.startsWith(`/apps/${id}/`);
  const tags = appTags(data);
  const allFolders = flattenAppNav(entries, () => true).filter(
    (r): r is AppNavRow & { entry: AppNavFolder } => r.entry.kind === 'folder',
  );

  // ── Drag and drop ──────────────────────────────────────────────────────
  const dropTarget = (activeId: string, overId: string, pos: DropPos) => {
    // Returns the op a drop would perform, or null when it can't happen.
    const fromTree = activeId.startsWith('t:');
    const id = activeId.slice(2);
    if (pos === 'unsort') {
      if (!fromTree || findAppNavEntry(entries, id)?.entry.kind !== 'app') return null;
      return ((es: AppNavEntry[]) => pruneAppNav(es, (a) => a !== id)) as LayoutOp;
    }
    if (!overId.startsWith('t:')) return null;
    const target = overId.slice(2);
    if (target === id) return null;
    const loc = findAppNavEntry(entries, target);
    if (!loc) return null;
    let parent: string | null;
    let index: number;
    if (pos === 'inside' && loc.entry.kind === 'folder') {
      parent = loc.entry.id;
      index = loc.entry.children.length;
    } else {
      parent = loc.parentId;
      index = loc.index + (pos === 'after' ? 1 : 0);
    }
    if (fromTree) {
      const from = findAppNavEntry(entries, id);
      if (!from || !canMoveAppNavEntry(entries, id, parent)) return null;
      if (from.parentId === parent && from.index < index) index -= 1;
      return ((es: AppNavEntry[]) => moveAppNavEntry(es, id, parent, index)) as LayoutOp;
    }
    return ((es: AppNavEntry[]) => placeAppNavApp(es, id, parent, index)) as LayoutOp;
  };

  const onDragMove = (e: DragMoveEvent) => {
    const { active, over } = e;
    const rect = active.rect.current.translated;
    if (!over || !rect) return setHint(null);
    const overId = String(over.id);
    if (overId === UNSORTED || overId.startsWith('u:')) {
      return setHint(
        active.id.toString().startsWith('t:') ? { over: UNSORTED, pos: 'unsort' } : null,
      );
    }
    const rel = (rect.top + rect.height / 2 - over.rect.top) / over.rect.height;
    const isFolder = findAppNavEntry(entries, overId.slice(2))?.entry.kind === 'folder';
    const pos: DropPos = isFolder
      ? rel < 0.3
        ? 'before'
        : rel > 0.7
          ? 'after'
          : 'inside'
      : rel < 0.5
        ? 'before'
        : 'after';
    const valid = dropTarget(String(active.id), overId, pos) !== null;
    setHint(valid ? { over: overId, pos } : null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const h = hint;
    setHint(null);
    setDragging(null);
    if (!h || !e.over) return;
    const op = dropTarget(String(e.active.id), h.over, h.pos);
    if (op) edit(op, `Folders nest at most ${APP_NAV_MAX_DEPTH} levels deep.`);
  };

  // ── Menus ──────────────────────────────────────────────────────────────
  const moveToItems = (id: string, isFolder: boolean) => {
    const loc = findAppNavEntry(entries, id);
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-80 overflow-y-auto scrollbar-thin">
          <DropdownMenuItem
            disabled={loc !== null && loc.parentId === null}
            onSelect={() =>
              edit((es) =>
                loc
                  ? moveAppNavEntry(es, id, null, es.length)
                  : placeAppNavApp(es, id, null, es.length),
              )
            }
          >
            Top level
          </DropdownMenuItem>
          {allFolders.map((f) => {
            const ok = loc
              ? f.entry.id !== id && canMoveAppNavEntry(entries, id, f.entry.id)
              : !isFolder;
            return (
              <DropdownMenuItem
                key={f.entry.id}
                disabled={!ok || loc?.parentId === f.entry.id}
                onSelect={() =>
                  edit((es) => {
                    const target = findAppNavEntry(es, f.entry.id);
                    if (!target || target.entry.kind !== 'folder') return null;
                    const end = target.entry.children.length;
                    return loc
                      ? moveAppNavEntry(es, id, f.entry.id, end)
                      : placeAppNavApp(es, id, f.entry.id, end);
                  }, `Folders nest at most ${APP_NAV_MAX_DEPTH} levels deep.`)
                }
                style={{ paddingLeft: 8 + f.depth * 14 }}
              >
                <AppTile icon={f.entry.icon} color={f.entry.color} kind="folder" size="sm" />
                <span className="truncate">{f.entry.name}</span>
              </DropdownMenuItem>
            );
          })}
          {!isFolder && loc && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => edit((es) => pruneAppNav(es, (a) => a !== id))}>
                <Inbox />
                Unsorted
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };

  const orderItems = (id: string) => {
    const loc = findAppNavEntry(entries, id);
    if (!loc) return null;
    const siblings =
      loc.parentId === null
        ? entries
        : (findAppNavEntry(entries, loc.parentId)!.entry as AppNavFolder).children;
    return (
      <>
        <DropdownMenuItem
          disabled={loc.index === 0}
          onSelect={() => edit((es) => moveAppNavEntry(es, id, loc.parentId, loc.index - 1))}
        >
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={loc.index === siblings.length - 1}
          onSelect={() => edit((es) => moveAppNavEntry(es, id, loc.parentId, loc.index + 1))}
        >
          Move down
        </DropdownMenuItem>
      </>
    );
  };

  const appMenu = (app: AppNavItem, key: string) => {
    const pinned = data.pins.includes(app.id);
    return (
      <DropdownMenuContent align="start" side="right" className="w-52">
        <DropdownMenuItem onSelect={() => togglePin(app.id)}>
          {pinned ? <PinOff /> : <Pin />}
          {pinned ? 'Unpin' : 'Pin to top'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLookFor(key)}>Icon and colour…</DropdownMenuItem>
        <DropdownMenuSeparator />
        {moveToItems(app.id, false)}
        {orderItems(app.id)}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/apps/${app.id}`} onClick={() => onNavigate?.()}>
            Open editor
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  };

  const folderMenu = (folder: AppNavFolder, depth: number, key: string) => (
    <DropdownMenuContent align="start" side="right" className="w-52">
      {depth + 1 < APP_NAV_MAX_DEPTH && (
        <DropdownMenuItem onSelect={() => setFolderDialog({ mode: 'new', parent: folder })}>
          <FolderPlus />
          New folder inside
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => setFolderDialog({ mode: 'rename', folder })}>
        Rename…
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setLookFor(key)}>Icon and colour…</DropdownMenuItem>
      <DropdownMenuSeparator />
      {moveToItems(folder.id, true)}
      {orderItems(folder.id)}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive-ink focus:text-destructive-ink"
        onSelect={() => setDeleteTarget(folder)}
      >
        Delete folder…
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  // ── Rows ───────────────────────────────────────────────────────────────
  const guides = (row: Pick<AppNavRow, 'depth' | 'isLast' | 'guides'>) => {
    const out: ReactNode[] = [];
    for (let c = 0; c < row.depth; c++) {
      const x = ROW_PAD + c * INDENT + 9;
      if (c === row.depth - 1) {
        out.push(
          <span
            key={`v${c}`}
            aria-hidden
            className="pointer-events-none absolute top-0 border-l-[1.5px] border-dotted border-muted-foreground/45"
            style={{ left: x, height: row.isLast ? '50%' : '100%' }}
          />,
          <span
            key={`h${c}`}
            aria-hidden
            className="pointer-events-none absolute top-1/2 border-t-[1.5px] border-dotted border-muted-foreground/45"
            style={{ left: x, width: INDENT - 9 }}
          />,
        );
      } else if (!row.guides[c + 1]) {
        out.push(
          <span
            key={`v${c}`}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 border-l-[1.5px] border-dotted border-muted-foreground/45"
            style={{ left: x }}
          />,
        );
      }
    }
    return out;
  };

  const rowShell = (opts: {
    key: string;
    dragKey?: string;
    depth: number;
    isLast: boolean;
    guideFlags: boolean[];
    menu: ReactNode;
    look?: {
      icon: string | null | undefined;
      color: AppNavItem['color'] | undefined;
      kind: 'app' | 'folder';
      label: string;
      onChange: (l: AppLook) => void;
    };
    body: (style: CSSProperties) => ReactNode;
  }) => (
    <DndRow
      key={opts.key}
      rowKey={opts.key}
      dragKey={opts.dragKey}
      hint={hint}
      dragging={dragging === opts.dragKey}
    >
      {(dnd) => {
        const row = (
          <div
            className="group/app-row relative flex items-center"
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuFor(opts.key);
            }}
            {...dnd}
          >
            {guides({ depth: opts.depth, isLast: opts.isLast, guides: opts.guideFlags })}
            {opts.body({ paddingLeft: ROW_PAD + opts.depth * INDENT })}
            <DropdownMenu
              open={menuFor === opts.key}
              onOpenChange={(o) => setMenuFor(o ? opts.key : null)}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-2xs"
                  aria-label="More actions"
                  className={cn(
                    'absolute right-0.5 top-1/2 shrink-0 -translate-y-1/2 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/app-row:opacity-100',
                    menuFor === opts.key && 'opacity-100',
                  )}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              {opts.menu}
            </DropdownMenu>
          </div>
        );
        if (lookFor !== opts.key || !opts.look) return row;
        return (
          <AppLookPicker
            open
            onOpenChange={(o) => !o && setLookFor(null)}
            anchor={row}
            side="right"
            icon={opts.look.icon}
            color={opts.look.color}
            kind={opts.look.kind}
            label={opts.look.label}
            onChange={opts.look.onChange}
          />
        );
      }}
    </DndRow>
  );

  const appRow = (
    app: AppNavItem,
    o: {
      key: string;
      dragKey?: string;
      depth: number;
      isLast: boolean;
      guides: boolean[];
      path?: string[];
    },
  ) =>
    rowShell({
      key: o.key,
      dragKey: o.dragKey,
      depth: o.depth,
      isLast: o.isLast,
      guideFlags: o.guides,
      menu: appMenu(app, o.key),
      look: {
        icon: app.icon,
        color: app.color,
        kind: 'app',
        label: app.title,
        onChange: (l) => void setAppLook(app.id, l),
      },
      body: (style) => (
        <Link
          href={appRunHref(app.id)}
          onClick={() => {
            recordAppOpen(qc, app.id);
            onNavigate?.();
          }}
          aria-current={isActiveApp(app.id) ? 'page' : undefined}
          title={o.path?.length ? `${o.path.join(' / ')} / ${app.title}` : app.title}
          style={style}
          className={cn(
            'flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md pr-7 text-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActiveApp(app.id)
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
          )}
        >
          <AppTile icon={app.icon} color={app.color} size="sm" />
          <span className="min-w-0 flex-1 truncate">{app.title}</span>
          {o.path && o.path.length > 0 && (
            <span className="max-w-[45%] shrink truncate text-[11px] text-muted-foreground/80">
              {o.path.join(' / ')}
            </span>
          )}
        </Link>
      ),
    });

  const folderRow = (row: AppNavRow & { entry: AppNavFolder }) => {
    const f = row.entry;
    const open = !closed.has(f.id);
    const key = treeKey(f.id);
    return rowShell({
      key,
      dragKey: key,
      depth: row.depth,
      isLast: row.isLast,
      guideFlags: row.guides,
      menu: folderMenu(f, row.depth, key),
      look: {
        icon: f.icon,
        color: f.color,
        kind: 'folder',
        label: f.name,
        onChange: (l) =>
          edit((es) =>
            updateAppNavFolder(es, f.id, {
              ...(l.icon !== undefined ? { icon: l.icon || null } : {}),
              ...(l.color !== undefined ? { color: l.color } : {}),
            }),
          ),
      },
      body: (style) => (
        <RowButton
          onClick={() => toggleFolder(f.id)}
          aria-expanded={open}
          style={style}
          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md pr-7 text-sm font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AppTile icon={f.icon} color={f.color} kind="folder" size="sm" />
          <span className="min-w-0 flex-1 truncate text-left">{f.name}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {folderAppCount(f)}
          </span>
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        </RowButton>
      ),
    });
  };

  // ── Body by mode ───────────────────────────────────────────────────────
  let body: ReactNode;
  const searching = query.trim().length > 0;
  if (searching) {
    const hits = searchApps(data, query).slice(0, 30);
    body =
      hits.length === 0 ? null : (
        <div className="flex flex-col gap-px">
          {hits.map((h) =>
            appRow(h.app, {
              key: `s:${h.app.id}`,
              depth: 0,
              isLast: false,
              guides: [],
              path: h.path,
            }),
          )}
        </div>
      );
  } else if (view !== 'tree') {
    const list = listApps(data, view, tag);
    const paths = folderPaths(entries);
    body =
      list.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">
          {view === 'az' ? 'No apps with this tag.' : 'Apps you open show up here.'}
        </p>
      ) : (
        <div className="flex flex-col gap-px">
          {list.map((a) =>
            appRow(a, {
              key: `l:${a.id}`,
              depth: 0,
              isLast: false,
              guides: [],
              path: paths.get(a.id),
            }),
          )}
        </div>
      );
  } else {
    const rows = flattenAppNav(entries, (id) => !closed.has(id));
    const pinned = data.pins.map((id) => byId.get(id)).filter((a): a is AppNavItem => !!a);
    const unsortedOpen = !closed.has(UNSORTED);
    body = (
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(String(e.active.id))}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setHint(null);
          setDragging(null);
        }}
      >
        <div className="flex flex-col gap-px">
          {pinned.length > 0 && (
            <>
              {pinned.map((a) =>
                appRow(a, { key: `p:${a.id}`, depth: 0, isLast: false, guides: [] }),
              )}
              <div className="mx-3 my-1 border-t border-border/60" />
            </>
          )}
          {rows.map((r) => {
            if (r.entry.kind === 'folder')
              return folderRow(r as AppNavRow & { entry: AppNavFolder });
            const app = byId.get(r.entry.id);
            if (!app) return null;
            return appRow(app, {
              key: treeKey(app.id),
              dragKey: treeKey(app.id),
              depth: r.depth,
              isLast: r.isLast,
              guides: r.guides,
            });
          })}
          {unsorted.length > 0 &&
            (hasFolders || entries.length > 0 ? (
              <>
                <DndRow
                  rowKey={UNSORTED}
                  dragKey={undefined}
                  dropKey={UNSORTED}
                  hint={hint}
                  dragging={false}
                >
                  {(dnd) => (
                    <RowButton
                      {...dnd}
                      onClick={() => toggleFolder(UNSORTED)}
                      aria-expanded={unsortedOpen}
                      style={{ paddingLeft: ROW_PAD }}
                      className="flex h-7 w-full items-center gap-2 rounded-md pr-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="inline-flex size-5 items-center justify-center rounded-[5px] border border-dashed border-muted-foreground/40">
                        <Inbox className="size-3" aria-hidden />
                      </span>
                      <span className="flex-1 text-left">Unsorted</span>
                      <span className="text-[11px] tabular-nums">{unsorted.length}</span>
                      <ChevronRight
                        aria-hidden
                        className={cn('size-3.5 transition-transform', unsortedOpen && 'rotate-90')}
                      />
                    </RowButton>
                  )}
                </DndRow>
                {unsortedOpen &&
                  unsorted.map((a, i) =>
                    appRow(a, {
                      key: unsortedKey(a.id),
                      dragKey: unsortedKey(a.id),
                      depth: 1,
                      isLast: i === unsorted.length - 1,
                      guides: [false],
                    }),
                  )}
              </>
            ) : (
              unsorted.map((a) =>
                appRow(a, {
                  key: unsortedKey(a.id),
                  dragKey: unsortedKey(a.id),
                  depth: 0,
                  isLast: false,
                  guides: [],
                }),
              )
            ))}
          {data.apps.length === 0 && (
            <p className="px-3 py-1 text-xs text-muted-foreground">
              No apps yet.{' '}
              <Link
                href="/apps"
                className="underline underline-offset-2"
                onClick={() => onNavigate?.()}
              >
                Create one
              </Link>
            </p>
          )}
        </div>
      </DndContext>
    );
  }

  if (searching && body === null) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="group/apps-head flex items-center gap-1 pr-1">
        <RowButton
          onClick={() => setSectionOpen(!sectionOpen, String)}
          aria-expanded={sectionOpen}
          className="flex flex-1 items-center gap-1 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Apps
          <ChevronRight
            aria-hidden
            className={cn('size-3 transition-transform', sectionOpen && 'rotate-90')}
          />
        </RowButton>
        {!searching && sectionOpen && (
          <>
            {tags.length > 0 && view === 'az' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-2xs"
                    aria-label="Filter by tag"
                    title="Filter by tag"
                    className={cn('text-muted-foreground', tag && 'text-foreground')}
                  >
                    <Tag />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-72 w-48 overflow-y-auto scrollbar-thin"
                >
                  <DropdownMenuLabel>Tag</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={tag ?? ''}
                    onValueChange={(v) => setTag(v || null)}
                  >
                    <DropdownMenuRadioItem value="">All tags</DropdownMenuRadioItem>
                    {tags.map((t) => (
                      <DropdownMenuRadioItem key={t} value={t}>
                        {t}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="ghost"
              size="icon-2xs"
              aria-label="New folder"
              title="New folder"
              className="text-muted-foreground"
              onClick={() => setFolderDialog({ mode: 'new', parent: null })}
            >
              <FolderPlus />
            </Button>
          </>
        )}
      </div>

      {(sectionOpen || searching) && (
        <>
          {!searching && data.apps.length > 0 && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(v) => v && setView(v as View, String)}
              aria-label="How to list apps"
              className="mb-1 grid w-full grid-cols-4 px-1"
            >
              {VIEWS.map((v) => (
                <ToggleGroupItem key={v.id} value={v.id} className="h-7 px-1 text-[11px]">
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {body}
        </>
      )}

      <FolderNameDialog
        open={folderDialog !== null}
        onOpenChange={(o) => !o && setFolderDialog(null)}
        initial={folderDialog?.mode === 'rename' ? folderDialog.folder.name : undefined}
        parentName={folderDialog?.mode === 'new' ? (folderDialog.parent?.name ?? null) : null}
        onSubmit={(name) => {
          if (!folderDialog) return;
          if (folderDialog.mode === 'rename') {
            edit((es) => updateAppNavFolder(es, folderDialog.folder.id, { name }));
            return;
          }
          const parentId = folderDialog.parent?.id ?? null;
          const folder: AppNavFolder = {
            kind: 'folder',
            id: crypto.randomUUID(),
            name,
            children: [],
          };
          edit((es) => {
            if (parentId === null) return [folder, ...es];
            const p = findAppNavEntry(es, parentId);
            if (!p || p.entry.kind !== 'folder' || p.depth + 1 >= APP_NAV_MAX_DEPTH) return null;
            return updateChildren(es, parentId, (kids) => [folder, ...kids]);
          }, `Folders nest at most ${APP_NAV_MAX_DEPTH} levels deep.`);
          if (parentId) setClosed(closedList.filter((c) => c !== parentId));
        }}
      />
      <DeleteFolderDialog
        folderName={deleteTarget?.name ?? null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) edit((es) => dissolveAppNavFolder(es, deleteTarget.id));
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

/** Replace one folder's children. */
function updateChildren(
  entries: AppNavEntry[],
  folderId: string,
  fn: (kids: AppNavEntry[]) => AppNavEntry[],
): AppNavEntry[] {
  return entries.map((e) =>
    e.kind !== 'folder'
      ? e
      : e.id === folderId
        ? { ...e, children: fn(e.children) }
        : { ...e, children: updateChildren(e.children, folderId, fn) },
  );
}

/**
 * A row that is a drag source and a drop target, and draws the drop
 * indicator: a line above or below it, or a ring when dropping INTO a folder.
 * `dragKey` undefined = drop target only (the Unsorted row, pinned rows).
 */
function DndRow({
  rowKey,
  dragKey,
  dropKey,
  hint,
  dragging,
  children,
}: {
  rowKey: string;
  dragKey: string | undefined;
  dropKey?: string;
  hint: DropHint;
  dragging: boolean;
  children: (dnd: Record<string, unknown>) => ReactNode;
}) {
  const id = dropKey ?? dragKey ?? `none:${rowKey}`;
  const drag = useDraggable({ id: dragKey ?? `none:${rowKey}`, disabled: !dragKey });
  const drop = useDroppable({ id, disabled: !dropKey && !dragKey });
  const setRef = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  const pos = hint && hint.over === id ? hint.pos : null;
  // Listeners only, not dnd-kit's `attributes`: those make the row a
  // role="button" wrapping a link, which nests interactive elements. The row
  // menu's "Move to" and "Move up/down" are the keyboard path.
  const dnd = dragKey ? { ...drag.listeners } : {};
  return (
    <div
      ref={setRef}
      className={cn(
        'relative rounded-md',
        dragging && 'bg-sidebar shadow-sm ring-1 ring-border',
        (pos === 'inside' || pos === 'unsort') && 'ring-2 ring-ring/60',
      )}
      style={
        drag.transform && dragging
          ? { transform: `translate3d(0, ${drag.transform.y}px, 0)`, zIndex: 20 }
          : undefined
      }
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
      {children(dnd)}
    </div>
  );
}
