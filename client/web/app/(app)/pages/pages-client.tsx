'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CornerLeftUp,
  FolderInput,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Button } from '@mantle/web-ui/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@mantle/web-ui/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import type { PageSort } from '@mantle/client-types';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';
import { Input } from '@mantle/web-ui/ui/input';
import { Label } from '@mantle/web-ui/ui/label';
import { Skeleton } from '@mantle/web-ui/ui/skeleton';
import { Switch } from '@mantle/web-ui/ui/switch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { TagPill } from '@mantle/web-ui/tag-pill';
import { ListCard, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { TagInput } from '@/components/tag-input';
import { PageView } from '@/components/page-editor/page-view';
import { ShareControl } from '@/components/share-control';
import { PageOutline } from '@mantle/web-ui/page-outline';
import { buildPageToc } from '@mantle/content-core/page-toc';
import { FocusToggle } from '@/components/layout/focus-toggle';
import { useZenMode } from '@/components/layout/zen-mode';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { MeasurePane } from '@mantle/web-ui/ui/measure-pane';
import { ExportMenu } from '@/components/export/export-menu';
import { cn } from '@mantle/web-ui/lib/utils';
import { formatDateTime, updatedAgo } from '@mantle/web-ui/lib/format-datetime';
import { buildChildrenIndex } from '@mantle/web-ui/page-tree';
import type { PageRow } from '@mantle/client-types';

// Wire shape is the GET /api/pages mapper's output — single source of truth
// (the canonical row also carries `width`, unused by this list view). Drift
// between the mapper and what this screen renders is now a compile error.

type TagCount = { tag: string; count: number };

/** Droppable id for the "move to the top level" zone shown while dragging a
 *  nested page. A literal sentinel — page ids are uuids, so it never collides. */
const TOP_LEVEL_DROP_ID = '__pages_root__';

/** Droppable id for the breadcrumb, which un-nests a page by one level while
 *  drilled in (§5.3 of the handover). Same sentinel rule as above. */
const UP_LEVEL_DROP_ID = '__pages_up__';

/** Cards are ~4x the height of the old tree rows, so a level pages at 25 where
 *  the server's flat search list pages at 50. Client-side for now: tree mode
 *  ships the whole corpus (see the handover §3b) — when mantle grows
 *  `?parent=` + `childCount`, this becomes the server's `pageSize`. */
const LEVEL_PAGE_SIZE = 25;

/** Card density, remembered per browser. A display preference, not part of the
 *  query — putting it in the URL would paste it into every link someone
 *  shares, and it says nothing about WHICH pages you are looking at. */
const DETAILS_KEY = 'mantle_pages_card_details_v1';

const SORT_LABELS: Record<PageSort, string> = {
  edited: 'Last edited',
  newest: 'Newest',
  oldest: 'Oldest',
  title: 'Title A–Z',
};

const SORTS: PageSort[] = ['edited', 'newest', 'oldest', 'title'];

type PagesListResponse = {
  mode: 'tree' | 'list';
  pages: PageRow[];
  total: number;
  page: number;
  pageSize: number;
  tags: TagCount[];
};

export function PagesClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [navPending, startNav] = useTransition();

  // URL is the source of truth (matches the old SSR page); the data query keys
  // off these so a `go()` navigation re-fetches automatically.
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const query = searchParams.get('q')?.trim() ?? '';
  const activeTag = searchParams.get('tag')?.trim() || null;
  const sortParam = searchParams.get('sort');
  const sort: PageSort = SORTS.includes(sortParam as PageSort) ? (sortParam as PageSort) : 'edited';
  // Drill-down: which level the list column is showing. null = top level.
  // Only meaningful in tree mode — a search spans levels, so it has no parent.
  const parentParam = searchParams.get('parent')?.trim() || null;

  const listQuery = useQuery({
    queryKey: ['pages', { q: query, tag: activeTag, sort, page }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (activeTag) qs.set('tag', activeTag);
      if (sort !== 'edited') qs.set('sort', sort);
      if (page > 1) qs.set('page', String(page));
      const s = qs.toString();
      return apiFetch<PagesListResponse>(`/api/pages${s ? `?${s}` : ''}`);
    },
    placeholderData: (prev) => prev, // keep the list visible while paging/filtering
  });

  const mode = listQuery.data?.mode ?? (query || activeTag ? 'list' : 'tree');
  const pages = useMemo(() => listQuery.data?.pages ?? [], [listQuery.data?.pages]);
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.pageSize ?? 50;
  const tags = listQuery.data?.tags ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ title: string; tags: string[] }>({ title: '', tags: [] });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PageRow | null>(null);
  // Authoritative descendant count for the delete warning — fetched on open so
  // it's accurate even in filtered/paginated 'list' mode (where the client
  // doesn't hold the whole tree). null = not yet loaded.
  const [deleteDescendants, setDeleteDescendants] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState(query);

  // Card density. Defaults to OFF: the column is for FINDING a page, and a
  // title plus its sub-page count is what you scan. Summaries and tags are for
  // the reader who asks for them.
  //
  // Read AFTER mount — `localStorage` does not exist during the server render,
  // so seeding `useState` from it would hydrate-mismatch. The cost is a brief
  // flash of the compact card for someone who turned details on; the cost of
  // the alternative is a cookie.
  const [details, setDetails] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(DETAILS_KEY) === '1') setDetails(true);
    } catch {
      /* private mode / quota — the preference just won't persist */
    }
  }, []);
  const changeDetails = (on: boolean) => {
    setDetails(on);
    try {
      window.localStorage.setItem(DETAILS_KEY, on ? '1' : '0');
    } catch {
      /* as above */
    }
  };

  // Focus mode drops the list column so a page can be READ full-width, not
  // only written that way. The toggle lives in the preview header below.
  const { zen } = useZenMode();

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0] ?? null;

  // Tree index: parent id → sorted children (null key = top-level). See
  // buildChildrenIndex for the orphan-as-root + cycle-safety rules.
  const childrenByParent = useMemo(() => buildChildrenIndex(pages), [pages]);

  const childCountOf = (id: string) => childrenByParent.get(id)?.length ?? 0;
  const hasChildren = (id: string) => childCountOf(id) > 0;

  // ── The level on screen ──────────────────────────────────────────────────
  // Drill-down turns the hierarchy into ONE FLAT LIST at a time, which is what
  // makes paging it meaningful — page 2 of a tree would cut a branch in half.
  // A `parent` that isn't loaded falls back to the top level rather than
  // showing an empty column.
  const drillParent =
    mode === 'tree' && parentParam ? (pages.find((p) => p.id === parentParam) ?? null) : null;
  const drillId = drillParent?.id ?? null;
  /** The level the breadcrumb returns to — the drilled page's own parent. */
  const backParent = drillParent?.parentId
    ? (pages.find((p) => p.id === drillParent.parentId) ?? null)
    : null;

  const levelPages = mode === 'tree' ? (childrenByParent.get(drillId) ?? []) : pages;
  const levelTotal = mode === 'tree' ? levelPages.length : total;
  const levelPageSize = mode === 'tree' ? LEVEL_PAGE_SIZE : pageSize;
  const totalPages = Math.max(1, Math.ceil(levelTotal / levelPageSize));
  const visiblePages =
    mode === 'tree'
      ? levelPages.slice((page - 1) * LEVEL_PAGE_SIZE, page * LEVEL_PAGE_SIZE)
      : pages;
  const deleteHasChildren = deleteTarget ? hasChildren(deleteTarget.id) : false;
  useEffect(() => {
    if (!deleteTarget) {
      setDeleteDescendants(null);
      return;
    }
    let cancelled = false;
    setDeleteDescendants(null);
    apiFetch<{ count?: number }>(`/api/pages/${deleteTarget.id}/descendant-count`)
      .then((d) => {
        if (!cancelled && d) setDeleteDescendants(typeof d.count === 'number' ? d.count : 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deleteTarget]);

  // ── Drag-to-reparent (level mode) ────────────────────────────────────────
  // The whole hierarchy is client-side here, so re-parenting is a drag of one
  // card onto another (→ nest under it), onto the top-level zone (→ un-nest),
  // or onto the breadcrumb (→ up one level). There's no manual sibling
  // ordering (children sort by title), so a drop is purely "set parent". A 6px
  // activation distance keeps plain clicks selecting.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRow = activeId ? (pages.find((p) => p.id === activeId) ?? null) : null;

  /** All pages beneath `id` in the tree (excludes `id` itself). Cycle-safe. */
  const descendantIdsOf = useMemo(() => {
    return (id: string): Set<string> => {
      const out = new Set<string>();
      const stack = [...(childrenByParent.get(id) ?? [])];
      while (stack.length) {
        const n = stack.pop()!;
        if (out.has(n.id)) continue;
        out.add(n.id);
        const kids = childrenByParent.get(n.id);
        if (kids) stack.push(...kids);
      }
      return out;
    };
  }, [childrenByParent]);

  // Targets you can't drop onto: the dragged page itself + its descendants
  // (would create a cycle). Recomputed when a drag starts.
  const invalidDropIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const s = descendantIdsOf(activeId);
    s.add(activeId);
    return s;
  }, [activeId, descendantIdsOf]);

  const move = async (id: string, parentId: string | null) => {
    // Surface the result immediately, then re-pull the SSR tree (the same
    // refresh pattern create/delete use). The moved page lands in its new
    // parent's level; the breadcrumb is how you follow it there.
    try {
      await apiSend(`/api/pages/${id}/move`, 'POST', { parentId });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not move page');
      return;
    }
    toast.success(parentId ? 'Page moved' : 'Moved to top level');
    void queryClient.invalidateQueries({ queryKey: ['pages'] });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const sourceId = String(active.id);
    const src = pages.find((p) => p.id === sourceId);
    if (!src) return;
    const targetParent =
      over.id === TOP_LEVEL_DROP_ID
        ? null
        : over.id === UP_LEVEL_DROP_ID
          ? (drillParent?.parentId ?? null) // breadcrumb = up one level
          : String(over.id);
    if (targetParent === (src.parentId ?? null)) return; // already there — no-op
    // Belt-and-braces with the disabled drop targets + the server cycle guard.
    if (
      targetParent &&
      (targetParent === sourceId || descendantIdsOf(sourceId).has(targetParent))
    ) {
      toast.error("Can't move a page into one of its own sub-pages");
      return;
    }
    void move(sourceId, targetParent);
  };

  const buildHref = (over: {
    page?: number;
    tag?: string | null;
    q?: string | null;
    sort?: PageSort;
    parent?: string | null;
  }) => {
    const nextTag = over.tag !== undefined ? over.tag : activeTag;
    const nextQ = over.q !== undefined ? over.q : query || null;
    const nextPage = over.page !== undefined ? over.page : page;
    const nextSort = over.sort !== undefined ? over.sort : sort;
    const nextParent = over.parent !== undefined ? over.parent : drillId;
    const params = new URLSearchParams();
    if (nextTag) params.set('tag', nextTag);
    if (nextQ) params.set('q', nextQ);
    if (nextPage && nextPage > 1) params.set('page', String(nextPage));
    if (nextSort && nextSort !== 'edited') params.set('sort', nextSort); // 'edited' is default
    // A search spans levels, so it has no parent to sit under — callers that
    // set `q`/`tag` pass `parent: null` and this drops the param.
    if (nextParent) params.set('parent', nextParent);
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const go = (over: Parameters<typeof buildHref>[0]) =>
    startNav(() => router.push(buildHref(over)));

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput.trim() === query) return;
      go({ q: searchInput.trim() || null, page: 1, parent: null });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      let created: PageRow;
      try {
        ({ page: created } = await apiSend<{ page: PageRow }>('/api/pages', 'POST', {
          title: form.title.trim(),
          tags: form.tags,
        }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        toast.error(e instanceof Error ? e.message : 'request failed');
        return;
      }
      setForm({ title: '', tags: [] });
      setOpen(false);
      toast.success('Page created');
      // Refresh the list cache so the new page is present on navigate-back.
      void queryClient.invalidateQueries({ queryKey: ['pages'] });
      // New pages open straight into the editor.
      router.push(`/pages/${created.id}`);
    } finally {
      setSaving(false);
    }
  };

  // Create a sub-page under `parentId` and open it (create & edit, like New).
  const createChild = async (parentId: string) => {
    let created: PageRow;
    try {
      ({ page: created } = await apiSend<{ page: PageRow }>('/api/pages', 'POST', {
        title: 'Untitled page',
        parentId,
      }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not create sub-page');
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['pages'] }); // keep the list fresh
    router.push(`/pages/${created.id}`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiSend(`/api/pages/${deleteTarget.id}`, 'DELETE');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not delete page');
      return;
    }
    toast.success(
      deleteDescendants && deleteDescendants > 0
        ? `Page and ${deleteDescendants} sub-page${deleteDescendants === 1 ? '' : 's'} deleted`
        : deleteHasChildren
          ? 'Page and sub-pages deleted'
          : 'Page deleted',
    );
    if (selectedId === deleteTarget.id) setSelectedId(null);
    void queryClient.invalidateQueries({ queryKey: ['pages'] });
  };

  // One card per page in the CURRENT LEVEL (or per search hit). Clicking a
  // card always previews it; a card with children also drills the column into
  // them, which is what Jason described and what makes the pager meaningful.
  const renderCards = (): ReactNode[] =>
    visiblePages.map((p) => {
      const kids = mode === 'tree' ? childCountOf(p.id) : null;
      return (
        <PageCard
          key={p.id}
          row={p}
          childCount={kids}
          details={details}
          selected={selected?.id === p.id}
          allPages={pages}
          descendantIdsOf={descendantIdsOf}
          draggable={mode === 'tree'}
          disabledDrop={invalidDropIds.has(p.id)}
          dragging={activeId === p.id}
          onSelect={() => {
            setSelectedId(p.id);
            if (kids && kids > 0) go({ parent: p.id, page: 1 });
          }}
          onAddChild={() => void createChild(p.id)}
          onDelete={() => setDeleteTarget(p)}
          onMove={(parentId) => void move(p.id, parentId)}
        />
      );
    });

  const emptyState = (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
      {mode === 'list'
        ? 'No pages match your search or filter.'
        : drillParent
          ? 'This page has no sub-pages.'
          : 'No pages yet. Click “New” to start writing.'}
    </div>
  );

  if (listQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (listQuery.isError && !listQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <p className="text-muted-foreground">
          {listQuery.error instanceof Error ? listQuery.error.message : 'Failed to load pages.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <MasterDetail
        // `-reader`, not the old `pages`: the panel set changed under this key
        // ([LIST, DETAIL, SPACER] → [LIST, DETAIL]) when the spacer treatment
        // gave way to the centered measure, and a saved three-panel layout
        // must not be replayed onto two panels.
        id="pages-reader"
        // The screen's old clamps, so the column lands and stops where it did.
        defaultListSize="300px"
        minListSize="220px"
        maxListSize="560px"
        // `detailFills`, WITH a `MeasurePane` inside the detail. The pane takes
        // every spare pixel; the page centers within it at a width the reader
        // drags, margins splitting the slack equally. The earlier spacer
        // treatment solved only the width — the page always tucked left
        // against the divider, and in focus mode against the screen edge.
        detailFills
        // Focus mode. The list COLLAPSES rather than unmounting, so the search
        // box, scroll position and page survive the round trip — see the prop's
        // note in master-detail.tsx.
        listCollapsed={zen}
        list={
          <>
            <div className="space-y-3 border-b border-border p-4">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search pages…"
                    className="pl-8"
                  />
                </div>
                <Button onClick={() => setOpen(true)}>
                  <Plus /> New
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-muted-foreground"
                      title="Sort pages"
                    >
                      <ArrowUpDown className="size-3.5" />
                      {SORT_LABELS[sort]}
                      <ChevronDown className="size-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={sort}
                      onValueChange={(v) => go({ sort: v as PageSort, page: 1 })}
                    >
                      {(Object.keys(SORT_LABELS) as PageSort[]).map((s) => (
                        <DropdownMenuRadioItem key={s} value={s}>
                          {SORT_LABELS[s]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Rendered even with no tags: it also holds the density
                    switch, which is not about tags and must stay reachable on
                    a brain that has never used one. */}
                <TagFilter
                  tags={tags}
                  activeTag={activeTag}
                  onSelect={(t) => go({ tag: t, page: 1, parent: null })}
                  details={details}
                  onDetailsChange={changeDetails}
                />

                {activeTag && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-muted-foreground"
                    onClick={() => go({ tag: null, page: 1 })}
                    title="Clear tag filter"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* One DndContext for BOTH modes so `PageCard` can call the dnd
                hooks unconditionally; drag itself is off in search mode, where
                a cross-level hit list has no level to re-parent within. Keyed
                on the level so `placeholderData` can't leave the previous
                level's cards on screen mid-navigation. */}
            <div
              key={drillId ?? 'root'}
              className={cn(
                'space-y-2 p-3 transition-opacity md:flex-1 md:overflow-y-auto md:scrollbar-thin',
                navPending && 'opacity-60',
              )}
            >
              {/* The breadcrumb is itself a drop target, so it has to sit
                  INSIDE the context — a `useDroppable` rendered outside one
                  registers with nothing and silently never fires. */}
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragStart={(e) => setActiveId(String(e.active.id))}
                onDragEnd={onDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                {drillParent && (
                  <Breadcrumb
                    parent={drillParent}
                    backLabel={backParent ? backParent.title : 'all pages'}
                    // The breadcrumb doubles as the un-nest target while
                    // dragging — in a drilled level it is the "move up" gesture.
                    dropActive={activeRow !== null && activeRow.parentId === drillParent.id}
                    onBack={() => go({ parent: backParent?.id ?? null, page: 1 })}
                  />
                )}
                {visiblePages.length === 0 ? (
                  emptyState
                ) : (
                  <>
                    {/* Un-nest-to-root target — only at the top level, and only
                        while dragging a page that actually has a parent. Deeper
                        levels use the breadcrumb instead. */}
                    {drillId === null && activeRow && activeRow.parentId !== null && (
                      <TopLevelDropZone />
                    )}
                    {renderCards()}
                  </>
                )}
                <DragOverlay dropAnimation={null}>
                  {activeRow ? <DragGhost row={activeRow} /> : null}
                </DragOverlay>
              </DndContext>
            </div>

            {levelTotal > 0 && (
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {levelTotal} {levelTotal === 1 ? 'page' : 'pages'}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="tabular-nums">
                      {page} / {totalPages}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-7"
                      disabled={page <= 1 || navPending}
                      onClick={() => go({ page: page - 1 })}
                      aria-label="Previous page"
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-7"
                      disabled={page >= totalPages || navPending}
                      onClick={() => go({ page: page + 1 })}
                      aria-label="Next page"
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        }
        // The measure owns the scroller: it has to sit INSIDE the centered
        // column, or the handle (pinned to the column's viewport height)
        // would scroll away with the page. 900px, not the 672px default: the
        // preview also holds the `xl:` outline rail (a 224px aside).
        detail={
          selected ? (
            <MeasurePane id="pages-preview" defaultSize="900px" minSize="480px">
              <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
                <PagePreview
                  key={selected.id}
                  row={selected}
                  onDelete={() => setDeleteTarget(selected)}
                />
              </div>
            </MeasurePane>
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
              Select a page to preview.
            </div>
          )
        }
      />

      {/* New page dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New page</DialogTitle>
            <DialogDescription>
              Give it a title — you’ll write the body in the editor.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags</Label>
              <TagInput
                id="tags"
                value={form.tags}
                onChange={(t) => setForm({ ...form, tags: t })}
                placeholder="Type and press comma or Enter…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pending={saving}>Create page</SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDescendants && deleteDescendants > 0
                ? `This also permanently deletes ${deleteDescendants} nested page${deleteDescendants === 1 ? '' : 's'}. This can’t be undone.`
                : deleteHasChildren
                  ? 'This page and all of its sub-pages will be deleted. This can’t be undone.'
                  : 'This can’t be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** One page in the list column — the card treatment the rest of the system
 *  uses (style guide §8), replacing the old one-line tree row.
 *
 *  Anatomy, per Jason's ask: the TITLE gets the full width and wraps instead
 *  of truncating, and every control moved to a footer row inside the card so
 *  nothing crowds it. The footer carries the drag handle, the sub-page count
 *  (which also signals "clicking me drills in") and move / add / delete.
 *
 *  The whole card is a drop target — dropping another page onto it nests that
 *  page underneath, and a card is a far bigger target than the 28px row was.
 *  There is no indentation: drill-down shows ONE LEVEL at a time, so depth is
 *  carried by the breadcrumb rather than by padding. */
function PageCard({
  row,
  childCount,
  details,
  selected,
  allPages,
  descendantIdsOf,
  draggable,
  disabledDrop,
  dragging,
  onSelect,
  onAddChild,
  onDelete,
  onMove,
}: {
  row: PageRow;
  /** Children in this level's index, or null in search mode where the client
   *  holds only the hits and so cannot derive it (handover §3d). */
  childCount: number | null;
  /** Card density. Off strips the summary and the tags, leaving the title and
   *  the footer controls — the compact column the cards replaced, but still a
   *  card. */
  details: boolean;
  selected: boolean;
  allPages: PageRow[];
  descendantIdsOf: (id: string) => Set<string>;
  draggable: boolean;
  disabledDrop: boolean;
  dragging: boolean;
  onSelect: () => void;
  onAddChild: () => void;
  onDelete: () => void;
  onMove: (parentId: string | null) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: row.id,
    disabled: disabledDrop || !draggable,
  });
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
  } = useDraggable({ id: row.id, disabled: !draggable });

  // Valid "Move to…" parents: every other page except this one and its own
  // descendants (those would cycle). Built lazily — the menu mounts on open.
  const moveTargets = useMemo(() => {
    const bad = descendantIdsOf(row.id);
    return allPages
      .filter((p) => p.id !== row.id && !bad.has(p.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allPages, descendantIdsOf, row.id]);

  const nesting = isOver && !disabledDrop && draggable;
  const drills = childCount !== null && childCount > 0;

  return (
    <ListCard asChild selected={selected} dimmed={dragging}>
      <div
        ref={setDropRef}
        // The WHOLE card navigates — summary, tags and the dead space between,
        // not just the title row (the natural expectation on a card). Real
        // controls inside keep their own clicks: anything button-ish under the
        // pointer wins, and a text selection (someone copying the summary)
        // must not fire a navigation on mouse-up. Keyboard access rides the
        // title button below, so this div needs no key handler of its own.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a, [role="menuitem"]')) return;
          if (window.getSelection()?.toString()) return;
          onSelect();
        }}
        className={cn(
          'cursor-pointer space-y-1.5',
          nesting && 'border-primary bg-primary/10 ring-1 ring-primary',
        )}
      >
        {/* The page itself. Keeps the marking attributes the marking system
            reads — moving them off this element silently breaks it. */}
        <button
          type="button"
          onClick={onSelect}
          data-mark-id={row.id}
          data-mark-kind="page"
          data-mark-label={row.title}
          className="flex w-full items-start gap-2 text-left"
        >
          <span className="mt-px size-4 shrink-0 text-center text-sm leading-5" aria-hidden>
            {row.icon ?? '📄'}
          </span>
          <ListCardTitle wrap className="min-w-0 flex-1">
            {row.title}
          </ListCardTitle>
        </button>

        {details && row.summary && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{row.summary}</p>
        )}
        {details && row.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {row.tags.map((t) => (
              <TagPill key={t} tag={t} />
            ))}
          </div>
        )}

        {/* Controls, at the FOOT of the card so they never eat the title. */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1">
            {draggable && (
              <button
                type="button"
                ref={setDragRef}
                {...listeners}
                {...attributes}
                aria-label={`Drag to move “${row.title}”`}
                title="Drag onto another page to nest it there"
                className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
              >
                <GripVertical className="size-3.5" />
              </button>
            )}
            {drills ? (
              <button
                type="button"
                onClick={onSelect}
                className="flex min-w-0 items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title={`Open the ${childCount} sub-page${childCount === 1 ? '' : 's'}`}
              >
                <span className="truncate tabular-nums">
                  {childCount} sub-page{childCount === 1 ? '' : 's'}
                </span>
                <ChevronRight className="size-3.5 shrink-0 opacity-70" />
              </button>
            ) : (
              /* A leaf page leaves this slot empty, so it carries the updated
                 stamp instead — relative while fresh, the date once it's 5+
                 days old (updatedAgo). Hover gives the exact timestamp. */
              <span
                className="truncate px-1 py-0.5 text-xs text-muted-foreground"
                title={`Updated ${formatDateTime(row.updatedAt)}`}
              >
                {updatedAgo(row.updatedAt)}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center">
            {/* Kept even though the card is now a big drop target: once a level
                pages, the page you want to drop onto may be on page 2, and this
                is the only way to reach it. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  aria-label="Move page"
                  title="Move to…"
                >
                  <FolderInput />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuItem disabled={row.parentId === null} onClick={() => onMove(null)}>
                  <CornerLeftUp />
                  Top level
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {moveTargets.length === 0 ? (
                  <DropdownMenuItem disabled>No other pages</DropdownMenuItem>
                ) : (
                  moveTargets.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      disabled={t.id === row.parentId}
                      onClick={() => onMove(t.id)}
                    >
                      <span className="size-4 shrink-0 text-center text-sm leading-4" aria-hidden>
                        {t.icon ?? '📄'}
                      </span>
                      <span className="min-w-0 truncate">{t.title}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              onClick={onAddChild}
              aria-label="Add sub-page"
              title="Add sub-page"
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive-ink"
              onClick={onDelete}
              aria-label="Delete page"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </div>
    </ListCard>
  );
}

/** Header of a drilled-in level: which page you are inside, and the way back
 *  out. While dragging one of this level's own pages it is ALSO the un-nest
 *  target — dropping there moves that page up beside its current parent. */
function Breadcrumb({
  parent,
  backLabel,
  dropActive,
  onBack,
}: {
  parent: PageRow;
  backLabel: string;
  dropActive: boolean;
  onBack: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UP_LEVEL_DROP_ID, disabled: !dropActive });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border px-2 py-1.5 transition-colors',
        dropActive ? 'border-dashed' : 'border-transparent',
        isOver && dropActive && 'border-primary bg-primary/10',
      )}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        <span className="truncate">Back to {backLabel}</span>
      </button>
      <div className="mt-0.5 flex items-center gap-1.5 pl-0.5">
        <span className="size-4 shrink-0 text-center text-sm leading-4" aria-hidden>
          {parent.icon ?? '📄'}
        </span>
        <span className="min-w-0 break-words text-sm font-semibold">{parent.title}</span>
      </div>
      {dropActive && (
        <p className="mt-1 pl-0.5 text-[11px] text-muted-foreground">
          Drop here to move it out of “{parent.title}”
        </p>
      )}
    </div>
  );
}

/** The floating preview that follows the cursor while dragging a tree row. */
function DragGhost({ row }: { row: PageRow }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm font-medium shadow-lg">
      <GripVertical className="size-3.5 text-muted-foreground" />
      <span aria-hidden>{row.icon ?? '📄'}</span>
      <span className="max-w-48 truncate">{row.title}</span>
    </div>
  );
}

/** Drop band at the top of the tree (shown only while dragging a nested page)
 *  that re-parents the dragged page to the top level. */
function TopLevelDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: TOP_LEVEL_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mb-1 rounded-md border border-dashed px-3 py-2 text-center text-xs transition-colors',
        isOver
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground',
      )}
    >
      Drop here to move to the top level
    </div>
  );
}

/** Searchable tag filter — Popover + Command (cmdk) combobox. Replaces the
 *  inline pill row, which got unwieldy past a handful of tags. cmdk filters the
 *  list by each item's `value` as you type; selecting drives the URL `tag`
 *  param (SSR filtering), and re-picking the active tag clears it. */
function TagFilter({
  tags,
  activeTag,
  onSelect,
  details,
  onDetailsChange,
}: {
  tags: TagCount[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
  details: boolean;
  onDetailsChange: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (tag: string | null) => {
    onSelect(tag);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn('h-7 gap-1 px-2 text-muted-foreground', activeTag && 'text-foreground')}
          title="Filter by tag, and choose how much of each card to show"
        >
          <Tag className="size-3.5" />
          <span className="max-w-32 truncate">{activeTag ?? 'All tags'}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        {/* Density lives here rather than in the toolbar row, where it read as
            a fourth filter. It sits ABOVE `<Command>`, not inside it: cmdk owns
            arrow keys and Enter for everything in its list, and a switch in
            there would be reachable by typing at it. */}
        <label className="flex cursor-pointer items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          Details
          <Switch
            checked={details}
            onCheckedChange={onDetailsChange}
            aria-label="Show summaries and tags on cards"
            title={
              details ? 'Hide summaries and tags — titles only' : 'Show summaries and tags on cards'
            }
            className="h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3"
          />
        </label>
        <Command>
          <CommandInput placeholder="Search tags…" className="border-0 focus:ring-0" />
          {/* `scrollbar-thin`: a long tag list scrolls, and the platform
              scrollbar is too heavy for a 240px popover. */}
          <CommandList className="max-h-72 scrollbar-thin">
            <CommandEmpty className="px-3 py-6 text-center text-xs text-muted-foreground">
              No tags found.
            </CommandEmpty>
            <CommandGroup>
              {/* Sentinel value so a tag search doesn't accidentally match it. */}
              <CommandItem value="__all_pages__" onSelect={() => choose(null)}>
                <Check className={cn('size-4', activeTag === null ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1">All pages</span>
              </CommandItem>
              {tags.map((t) => (
                <CommandItem
                  key={t.tag}
                  value={t.tag}
                  onSelect={() => choose(activeTag === t.tag ? null : t.tag)}
                >
                  <Check
                    className={cn('size-4', activeTag === t.tag ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.tag}</span>
                  <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground group-data-[selected=true]/command-item:text-accent-foreground">
                    {t.count}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Right-pane read-only preview. Fetches the full document for the selected
 *  page (the list omits the body to stay lean) and renders it read-only.
 *  Prefers the uncommitted DRAFT over the published doc so a page you've edited
 *  but not committed — especially a brand-new page whose published doc is still
 *  empty — shows its content here instead of looking blank. This is render-only
 *  (no indexing); the committed doc stays the canonical version everywhere else
 *  (public share, MCP). A badge flags that the preview is showing a draft. */
function PagePreview({ row, onDelete }: { row: PageRow; onDelete: () => void }) {
  const [doc, setDoc] = useState<JSONContent | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  // The outline reads the SAME doc the preview renders — the draft when there
  // is one, so the headings match what is on screen rather than what was last
  // committed.
  const toc = useMemo(() => (doc ? buildPageToc(doc) : []), [doc]);

  // PageView renders through TipTap, which writes block ids as `data-block-id`
  // (block-id.ts avoids the native `id` on purpose). PageOutline's default jump
  // uses getElementById, which only works on the server-rendered share/print
  // surface — so this surface supplies its own.
  const jumpToBlock = useCallback((id: string) => {
    bodyRef.current
      ?.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<{ page: { doc: JSONContent; draft: JSONContent | null } }>(`/api/pages/${row.id}`)
      .then(({ page }) => {
        if (!cancelled) {
          setDoc(page.draft ?? page.doc);
          setIsDraft(!!page.draft);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold">
          <span aria-hidden>{row.icon ?? '📄'}</span>
          <span className="min-w-0 truncate">{row.title}</span>
          {isDraft && (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Draft · uncommitted
            </span>
          )}
        </h2>
        <div className="flex shrink-0 gap-2">
          <ExportMenu nodeId={row.id} />
          {/* Share without opening the editor. No `beforeEnable` here, unlike
              the editor's: a list screen holds no draft to commit, so the link
              serves the last COMMITTED page — which is what /s renders in any
              case. The "Draft · uncommitted" badge beside the title is what
              says so. */}
          <ShareControl nodeId={row.id} teamMode allowCascade />
          {/* This header survives focus mode (the shell's chrome doesn't), so
              the toggle here is the whole control, enter and exit. */}
          <FocusToggle />
          <Button asChild variant="outline" size="sm">
            <Link href={`/pages/${row.id}`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive-ink"
            onClick={onDelete}
            aria-label="Delete page"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {row.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {row.tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : doc ? (
        // Outline rail (left, wide screens) + content that fills the rest.
        // The measure is the divider, so nothing is centred and nothing is
        // capped — drag the column and the prose follows.
        <div className="flex w-full gap-6" ref={bodyRef}>
          {toc.length > 0 && (
            <aside className="hidden w-56 shrink-0 xl:block">
              <div className="sticky top-6 max-h-[calc(100vh-9rem)] overflow-y-auto scrollbar-thin">
                <PageOutline entries={toc} onJump={jumpToBlock} />
              </div>
            </aside>
          )}
          <div className="min-w-0 flex-1">
            <PageView content={doc} />
          </div>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">Couldn’t load this page.</p>
      )}

      <div className="border-t border-border pt-3 text-xs text-muted-foreground">
        Updated {formatDateTime(row.updatedAt)} · created {formatDateTime(row.createdAt)}
      </div>
    </div>
  );
}
