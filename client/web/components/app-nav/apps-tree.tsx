'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import Link from 'next/link';
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
import {
  ChevronRight,
  FolderPlus,
  Inbox,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  Tag,
} from 'lucide-react';
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
} from '@mantle/client-types/app-nav';
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
} from '@mantle/content-core/app-nav';
import { AppTile } from './app-tile';
import { AppLookPicker, type AppLook } from './app-look-picker';
import { DeleteFolderDialog, FolderNameDialog } from './folder-dialogs';
import {
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
 * The /apps list column, organised: pinned apps, the brain's folder tree, and
 * the unsorted apps below it. Folders nest up to three deep; expanding one
 * draws dotted guides from each child back to its parent. Selecting an app
 * shows it in the page's preview pane.
 *
 * What syncs and what doesn't:
 *  - the tree, folder names/icons/colours and each app's icon/colour are the
 *    BRAIN's (every admin, every device);
 *  - pins and the Recent / Most used counts are this LOGIN's;
 *  - which folders are open and the chosen view are this BROWSER's
 *    (localStorage): how a list is folded on a laptop says nothing about how
 *    it should look on a phone.
 *
 * The search box lists matching apps flat, each with its folder path.
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

export function AppsTree({
  selectedId,
  onSelect,
  actions,
}: {
  selectedId: string | null;
  onSelect: (appId: string) => void;
  /** Extra toolbar controls (the page's New app button). */
  actions?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const { data, query: q, unsupported, editLayout, togglePin, setAppLook } = useAppNav();
  const qc = useQueryClient();
  const toast = useToast();

  const [closedList, setClosed] = useLocal<string[]>(
    'mantle_app_nav_closed_v1',
    [],
    parseStringArray,
  );
  const closed = useMemo(() => new Set(closedList), [closedList]);
  const [view, setView] = useLocal<View>('mantle_app_nav_view_v1', 'tree', (r) =>
    VIEWS.some((v) => v.id === r) ? (r as View) : null,
  );
  const [tag, setTag] = useState<string | null>(null);

  const [folderDialog, setFolderDialog] = useState<
    { mode: 'new'; parent: AppNavFolder | null } | { mode: 'rename'; folder: AppNavFolder } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<AppNavFolder | null>(null);
  // The icon-and-colour picker: ONE popover for the whole tree, anchored to
  // the row it was opened from. Wrapping the row itself in a popover on demand
  // remounted the row, and the closing row menu handed focus back to its
  // trigger, which the new popover took as a click outside and closed on.
  const [lookFor, setLookFor] = useState<string | null>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggleFolder = (id: string) =>
    setClosed(closed.has(id) ? closedList.filter((c) => c !== id) : [...closedList, id]);

  // After the menu's own close has run, so the picker isn't born into it.
  const openLook = (key: string) => window.setTimeout(() => setLookFor(key), 0);

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

  // Where a drop would land, from the dragged row's position over its target.
  // Used for the live indicator AND at release: a quick drag can end without
  // a move event after activation, so the drop must not rely on hint state.
  const dropAt = (e: DragMoveEvent | DragEndEvent): DropHint => {
    const { active, over } = e;
    const rect = active.rect.current.translated;
    if (!over || !rect) return null;
    const overId = String(over.id);
    if (overId === UNSORTED || overId.startsWith('u:')) {
      return String(active.id).startsWith('t:') ? { over: UNSORTED, pos: 'unsort' } : null;
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
    return dropTarget(String(active.id), overId, pos) !== null ? { over: overId, pos } : null;
  };

  const onDragMove = (e: DragMoveEvent) => setHint(dropAt(e));

  const onDragEnd = (e: DragEndEvent) => {
    const h = dropAt(e);
    setHint(null);
    setDragging(null);
    if (!h) return;
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
      <DropdownMenuContent
        align="start"
        side="right"
        className="w-52"
        // Focus must not return to the "…" trigger: when the menu opens the
        // picker, that focus lands outside the picker and closes it.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem onSelect={() => togglePin(app.id)}>
          {pinned ? <PinOff /> : <Pin />}
          {pinned ? 'Unpin' : 'Pin to top'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openLook(key)}>Icon and colour…</DropdownMenuItem>
        <DropdownMenuSeparator />
        {moveToItems(app.id, false)}
        {orderItems(app.id)}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/apps/${app.id}`}>Open editor</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  };

  const folderMenu = (folder: AppNavFolder, depth: number, key: string) => (
    <DropdownMenuContent
      align="start"
      side="right"
      className="w-52"
      // Focus must not return to the "…" trigger: when the menu opens the
      // picker, that focus lands outside the picker and closes it.
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      {depth + 1 < APP_NAV_MAX_DEPTH && (
        <DropdownMenuItem onSelect={() => setFolderDialog({ mode: 'new', parent: folder })}>
          <FolderPlus />
          New folder inside
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => setFolderDialog({ mode: 'rename', folder })}>
        Rename…
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openLook(key)}>Icon and colour…</DropdownMenuItem>
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

  // Every row's look, collected as the rows render, for the one picker.
  const looks = new Map<string, NonNullable<Parameters<typeof rowShell>[0]['look']>>();
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
  }): ReactNode => {
    if (opts.look) looks.set(opts.key, opts.look);
    return (
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
              ref={(el) => {
                if (el) rowEls.current.set(opts.key, el);
                else rowEls.current.delete(opts.key);
              }}
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
          return row;
        }}
      </DndRow>
    );
  };

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
        <RowButton
          onClick={() => {
            recordAppOpen(qc, app.id);
            onSelect(app.id);
          }}
          aria-current={selectedId === app.id ? 'true' : undefined}
          title={o.path?.length ? `${o.path.join(' / ')} / ${app.title}` : app.title}
          style={style}
          className={cn(
            'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-8 text-sm',
            selectedId === app.id
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground/90 hover:bg-foreground/[0.06]',
          )}
        >
          <AppTile icon={app.icon} color={app.color} size="sm" />
          <span className="min-w-0 flex-1 truncate">{app.title}</span>
          {o.path && o.path.length > 0 && (
            <span className="max-w-[45%] shrink truncate text-[11px] text-muted-foreground">
              {o.path.join(' / ')}
            </span>
          )}
        </RowButton>
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
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-8 text-sm font-medium text-foreground/85 hover:bg-foreground/[0.06]"
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
                      className="flex h-8 w-full items-center gap-2 rounded-md pr-2 text-sm text-muted-foreground hover:bg-foreground/[0.06]"
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
            <p className="p-6 text-center text-sm text-muted-foreground">
              No apps yet. Create one, or ask Saskia to “build me an app”.
            </p>
          )}
        </div>
      </DndContext>
    );
  }

  if (searching && body === null) {
    body = (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No apps match. Try a folder name or a tag.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Search apps, folders, tags"
              aria-label="Search apps"
              className="h-9 pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="New folder"
            title="New folder"
            onClick={() => setFolderDialog({ mode: 'new', parent: null })}
          >
            <FolderPlus />
          </Button>
          {actions}
        </div>
        {!searching && data.apps.length > 0 && (
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(v) => v && setView(v as View, String)}
              aria-label="How to list apps"
              className="grid flex-1 grid-cols-4"
            >
              {VIEWS.map((v) => (
                <ToggleGroupItem key={v.id} value={v.id} className="h-8 px-1 text-xs">
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {tags.length > 0 && view === 'az' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="Filter by tag"
                    title={tag ? `Tag: ${tag}` : 'Filter by tag'}
                    className={cn(tag && 'bg-accent text-accent-foreground')}
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
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-2">{body}</div>

      {lookFor && looks.get(lookFor) && (
        <AppLookPicker
          open
          onOpenChange={(o) => !o && setLookFor(null)}
          virtualAnchor={rowEls.current.get(lookFor) ?? null}
          side="right"
          align="start"
          {...looks.get(lookFor)!}
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
