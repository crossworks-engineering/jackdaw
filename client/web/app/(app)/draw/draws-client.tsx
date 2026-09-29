'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AccessLevel } from '@mantle/client-types';
import { AudienceBadge } from '@/components/share/audience-badge';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, PenTool, Plus, Trash2 } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { Input } from '@mantle/web-ui/ui/input';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { TagPill } from '@mantle/web-ui/tag-pill';
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
import { ExportMenu } from '@/components/export/export-menu';
import { useListNav } from '@/lib/use-list-nav';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { syncSelectionParam } from '@/lib/url-sync';
import { cn } from '@mantle/web-ui/lib/utils';
import { drawSnapshotClass } from '@/components/draw/snapshot-theme';
import { AccessControl } from '@/components/share/access-control';
import { FocusToggle } from '@/components/layout/focus-toggle';
import { DrawViewer } from '@/components/draw/draw-viewer';
import { Move } from 'lucide-react';
import { useZenMode } from '@/components/layout/zen-mode';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import type { AdminPrivateListRow } from '@mantle/client-types';
import { ItemCard, ItemIcon } from '@/components/item-list/item-card';
import { ItemListHeader, ItemListScroll, NewButton } from '@/components/item-list/item-list-header';
import { ClearFilter, SortMenu, StateFilter, TagFilter } from '@/components/item-list/item-filters';
import { useCardDetails } from '@/components/item-list/use-card-details';
import {
  ADMIN_STATE_OPTIONS,
  PrivateItemCard,
  PrivateItemDetail,
  adminStateOf,
  isPrivateRow,
  usePrivateOpen,
} from '@/components/item-list/admin-private-rows';
import { KeepPrivateField } from '@/components/member/keep-private-field';
import { createPrivateItem } from '@/lib/admin-private';

type DrawRow = {
  id: string;
  title: string;
  icon: string | null;
  tags: string[];
  description: string | null;
  summary: string | null;
  visibility: 'private' | 'public';
  hasSvg: boolean;
  hasDraft: boolean;
  createdAt: string;
  updatedAt: string;
  /** Access level; absent from brains older than the level rows. */
  audience?: AccessLevel;
};

type ListResponse = {
  /** Brain drawings, and with `state=all|private` the admin's own private
   *  drawings (AdminPrivateListRow, the `private` key marks them). */
  draws: Array<DrawRow | AdminPrivateListRow>;
  total: number;
  page: number;
  pageSize: number;
  tags: { tag: string; count: number }[];
};

type DrawSort = 'edited' | 'newest' | 'oldest' | 'title';
const SORT_LABELS: Record<DrawSort, string> = {
  edited: 'Last edited',
  newest: 'Newest',
  oldest: 'Oldest',
  title: 'Title A–Z',
};
const isSort = (v: string | null): v is DrawSort => !!v && v in SORT_LABELS;

export function DrawsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pending, go } = useListNav();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  // New asks for a title and whether to keep it private (this admin's own
  // space, not the brain); Enter in the title creates it.
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [keepPrivate, setKeepPrivate] = useState(false);
  const openCreate = () => {
    setNewTitle('');
    setKeepPrivate(false);
    setCreateOpen(true);
  };

  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const query = searchParams.get('q')?.trim() ?? '';
  const tag = searchParams.get('tag')?.trim() ?? '';
  const urlId = searchParams.get('id')?.trim() || null;
  const sortParam = searchParams.get('sort');
  const sort: DrawSort = isSort(sortParam) ? sortParam : 'edited';
  // Which items: all (default), the brain's, or this admin's private ones
  // (item-list alignment). Always sent: the brain's default is `brain`.
  const state = adminStateOf(searchParams);
  const { pid, openPrivate } = usePrivateOpen();
  const [details, changeDetails] = useCardDetails('mantle_draws_card_details_v1');

  // Selection lives in client state; `select` mirrors it to the URL with
  // replaceState (no navigation) — the param is an entry point, not truth.
  const [selectedId, setSelectedId] = useState<string | null>(urlId);
  useEffect(() => {
    if (urlId) setSelectedId(urlId);
  }, [urlId]);

  const [deleteTarget, setDeleteTarget] = useState<DrawRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Focus mode drops the list column so a drawing can be LOOKED AT full-width,
  // not only drawn that way. The toggle lives in the preview header below.
  const { zen } = useZenMode();

  async function deleteActive() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await apiSend(`/api/draws/${deleteTarget.id}`, 'DELETE');
      toast.success('Drawing deleted');
      setSelectedId(null);
      syncSelectionParam('id', null);
      await queryClient.invalidateQueries({ queryKey: ['draws'] });
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the drawing');
    } finally {
      setDeleting(false);
    }
  }

  const [searchInput, setSearchInput] = useState(query);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement === searchRef.current) return;
    setSearchInput(query);
  }, [query]);
  useEffect(() => {
    if (searchInput === query) return;
    const t = setTimeout(() => go({ q: searchInput || null, page: null }), 300);
    return () => clearTimeout(t);
  }, [searchInput, query, go]);

  const listQuery = useQuery({
    queryKey: ['draws', { q: query, tag, page, sort, state }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (tag) qs.set('tag', tag);
      if (page > 1) qs.set('page', String(page));
      if (sort !== 'edited') qs.set('sort', sort);
      qs.set('state', state);
      return apiFetch<ListResponse>(`/api/draws?${qs.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => listQuery.data?.draws ?? [], [listQuery.data]);
  const draws = useMemo(() => rows.filter((r): r is DrawRow => !isPrivateRow(r)), [rows]);
  // The first card when nothing is picked (auto-select), whichever kind.
  const first = !selectedId && !pid ? (rows[0] ?? null) : null;
  const privateOpen = pid ?? (first && isPrivateRow(first) ? first.id : null);
  const activeId = privateOpen ? null : (selectedId ?? first?.id ?? null);
  const active = draws.find((d) => d.id === activeId) ?? null;

  function select(id: string) {
    setSelectedId(id);
    syncSelectionParam('id', id);
    if (pid) openPrivate(null);
  }

  async function createDraw() {
    if (creating) return;
    setCreating(true);
    const title = newTitle.trim() || 'Untitled drawing';
    try {
      if (keepPrivate) {
        const href = await createPrivateItem('draw', { title });
        setCreateOpen(false);
        router.push(href);
        setCreating(false);
        return;
      }
      const { draw } = await apiSend<{ draw: { id: string } }>('/api/draws', 'POST', {
        title,
      });
      await queryClient.invalidateQueries({ queryKey: ['draws'] });
      router.push(`/draw/${draw.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the drawing');
      setCreating(false);
    }
  }

  if (listQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (listQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Could not load drawings.</p>
        <Button variant="outline" onClick={() => void listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <MasterDetail
        id="draw"
        // The fixed 360px column this screen has always had — draggable now.
        defaultListSize="360px"
        // The detail is a DRAWING: an SVG snapshot, or a pan-and-zoom canvas.
        // The 672px default measure exists to protect a line of text, and
        // capping a diagram at it would shrink the thing the screen is for.
        detailFills
        // Focus mode. The list COLLAPSES rather than unmounting, so the search
        // box, scroll position and page survive the round trip — see the prop's
        // note in master-detail.tsx.
        listCollapsed={zen}
        list={
          <>
            <ItemListHeader
              search={searchInput}
              onSearch={setSearchInput}
              placeholder="Search drawings…"
              actions={<NewButton onClick={openCreate} busy={creating} />}
            >
              <SortMenu
                value={sort}
                labels={SORT_LABELS}
                onChange={(v) => go({ sort: v === 'edited' ? null : v, page: null, pid: null })}
              />
              <TagFilter
                tags={listQuery.data?.tags ?? []}
                activeTag={tag || null}
                onSelect={(t) => go({ tag: t, page: null, pid: null })}
                details={details}
                onDetailsChange={changeDetails}
                allLabel="All drawings"
              />
              <StateFilter
                value={state}
                options={ADMIN_STATE_OPTIONS}
                onChange={(v) => go({ state: v === 'all' ? null : v, page: null, pid: null })}
              />
              {tag ? (
                <ClearFilter
                  onClear={() => go({ tag: null, page: null })}
                  title="Clear tag filter"
                />
              ) : null}
            </ItemListHeader>

            <ItemListScroll pending={pending}>
              {rows.length === 0 && (query || tag || state !== 'all') ? (
                <div className="space-y-3 px-1 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {state === 'private' && !query && !tag
                      ? 'You have no private drawings. Only you would see them, until you accept one into the brain.'
                      : 'Nothing matches these filters.'}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => go({ q: null, tag: null, state: null, page: null })}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : rows.length === 0 ? (
                <div className="space-y-3 px-1 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No drawings yet. Sketch an idea, an architecture, a plan. Commits land in the
                    brain like every other content type.
                  </p>
                  <Button variant="outline" size="sm" onClick={openCreate} disabled={creating}>
                    {creating ? <Spinner /> : <Plus />}
                    New drawing
                  </Button>
                </div>
              ) : (
                rows.map((d) =>
                  isPrivateRow(d) ? (
                    <PrivateItemCard
                      key={d.id}
                      row={d}
                      selected={privateOpen === d.id}
                      onSelect={() => openPrivate(d.id)}
                    />
                  ) : (
                    <ItemCard
                      key={d.id}
                      id={d.id}
                      kind="draw"
                      title={d.title}
                      icon={<ItemIcon emoji={d.icon} fallback={<PenTool />} />}
                      badge={
                        <>
                          {/* A dot, not a word: the row is a scan target and the
                              preview pane carries the full explanation. */}
                          {d.hasDraft && (
                            <span
                              className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                              title="Uncommitted edits"
                              aria-label="Uncommitted edits"
                            />
                          )}
                          <AudienceBadge level={d.audience} className="mt-0.5" />
                        </>
                      }
                      selected={activeId === d.id}
                      onSelect={() => select(d.id)}
                      updatedAt={d.updatedAt}
                    >
                      {details && d.summary ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{d.summary}</p>
                      ) : null}
                      {details && d.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {d.tags.map((t) => (
                            <TagPill key={t} tag={t} />
                          ))}
                        </div>
                      ) : null}
                    </ItemCard>
                  ),
                )
              )}
            </ItemListScroll>

            <ListPager
              page={page}
              total={listQuery.data?.total ?? 0}
              pageSize={listQuery.data?.pageSize ?? 50}
              pending={pending}
              onGo={(p) => go({ page: p > 1 ? p : null })}
              noun={{ one: 'drawing', many: 'drawings' }}
            />
          </>
        }
        // No wrapper: the preview is a plain document with no pinned header of
        // its own, so `MasterDetail`'s pane is the only scroller.
        detail={
          privateOpen ? (
            <div className="relative h-full min-h-0">
              <PrivateItemDetail
                key={privateOpen}
                id={privateOpen}
                onClose={() => openPrivate(null)}
              />
            </div>
          ) : active ? (
            <DrawPreview
              key={active.id}
              draw={active}
              onOpen={() => router.push(`/draw/${active.id}`)}
              onDelete={() => setDeleteTarget(active)}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a drawing.</p>
            </div>
          )
        }
      />

      <Dialog open={createOpen} onOpenChange={(o) => !creating && setCreateOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New drawing</DialogTitle>
            <DialogDescription>Give it a name, or leave it Untitled.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void createDraw();
            }}
          >
            <Input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Untitled drawing"
              aria-label="Drawing title"
            />
            <KeepPrivateField checked={keepPrivate} onCheckedChange={setKeepPrivate} />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Spinner /> : <Plus />}
                Create drawing
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this drawing?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title ?? ''}” and its brain index will be removed. Images embedded
              from the files area are kept there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={() => void deleteActive()}
            >
              {deleting ? 'Deleting…' : 'Delete drawing'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Read-only preview: the committed SVG snapshot plus metadata and the Open
 * button. No canvas is mounted here, so browsing the list never pays the
 * editor chunk.
 *
 * The snapshot renders as an IMAGE, not as injected markup. This screen is the
 * owner's authenticated session, which makes it the worst place to inline
 * third-party-shaped SVG: referenced as an image, the browser treats the file
 * as a separate, script-disabled document, so nothing inside it can touch this
 * page. The bytes still arrive over an authenticated fetch (an image element's
 * src can't carry a bearer in the detached deployment), then become a blob URL.
 */
function DrawPreview({
  draw,
  onOpen,
  onDelete,
}: {
  draw: DrawRow;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const svgQuery = useQuery({
    queryKey: ['draws', draw.id, 'svg'],
    queryFn: () => apiFetch<{ svg: string | null }>(`/api/draws/${draw.id}/svg`).then((r) => r.svg),
    // Deliberately NOT gated on draw.hasSvg. A drawing with no snapshot is
    // exactly the case the render fallback exists for (an agent authored it,
    // or a client-side export failed), and gating the fetch on "a snapshot
    // already exists" meant that case could never heal from this screen. The
    // route answers an empty scene straight from SQL, so a drawing with
    // nothing on it still costs no browser session.
  });

  const svg = svgQuery.data;
  // The interactive view-mode canvas, off by default. Resets per drawing (the
  // pane is keyed on the id), so selecting another row starts from the cheap
  // snapshot again rather than mounting a canvas you didn't ask for.
  const [interactive, setInteractive] = useState(false);
  const { zen } = useZenMode();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!svg) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [svg]);

  return (
    // Full-width, start-aligned — the same clean preview shell as /pages
    // (no centred max-w column, actions top-right and out of the way).
    <div className="w-full space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold">
            <span aria-hidden>{draw.icon ?? '✏️'}</span>
            <span className="min-w-0 truncate">{draw.title}</span>
            {/* Uncommitted edits exist but cannot be previewed: a draft is
                never rendered (rendering happens at commit, and the sidecar
                only ever draws the committed scene). Say so, rather than let
                the last commit read as "my work was lost" — same badge Pages
                uses for the same situation. */}
            {draw.hasDraft && (
              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Draft · uncommitted
              </span>
            )}
            <AudienceBadge level={draw.audience} />
          </h2>
          {/* The user's own one-liner wins; the extractor's summary fills in
              when none was written. */}
          {(draw.description ?? draw.summary) ? (
            <p className="mt-1 text-sm text-muted-foreground">{draw.description ?? draw.summary}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <ExportMenu nodeId={draw.id} kind="draw" />
          {/* Share without opening the canvas. No `beforeEnable` here, unlike
              the editor's: committing a drawing means capturing its snapshot in
              the editor, which a list screen cannot do, so the link serves the
              last COMMITTED scene. The "Draft · uncommitted" badge says when
              that is behind. */}
          <AccessControl nodeId={draw.id} />
          {/* The snapshot can't be panned or zoomed, so a diagram bigger than
              the pane was unreadable without opening it for EDITING. This
              mounts the real canvas in upstream's view mode instead: pan and
              zoom, no editing. Off by default so browsing the list keeps
              costing one image rather than the editor bundle. */}
          <Button
            size="sm"
            variant={interactive ? 'default' : 'outline'}
            onClick={() => setInteractive((v) => !v)}
            aria-pressed={interactive}
            aria-label={interactive ? 'Show the snapshot' : 'Pan and zoom'}
            title={
              interactive
                ? 'Back to the snapshot'
                : 'Pan and zoom the drawing (read-only, no editing)'
            }
          >
            <Move />
          </Button>
          {/* Survives focus mode (the shell's chrome doesn't), so this is the
              whole control — enter and exit. */}
          <FocusToggle />
          <Button asChild variant="outline" size="sm">
            <Link href={`/draw/${draw.id}`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive-ink"
            onClick={onDelete}
            aria-label="Delete drawing"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {draw.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {draw.tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
      )}

      {draw.hasDraft && (
        <p className="text-xs text-muted-foreground">
          Showing the last commit — your newer edits are saved in the drawing.
        </p>
      )}

      {/* The viewer reads the SCENE, not the snapshot, so it is offered ahead
          of the snapshot checks below — a drawing whose render failed (or that
          an agent authored) can still be looked at properly. */}
      {interactive ? (
        // Given real height, because a canvas has no intrinsic one — and more
        // of it in focus mode, where the shell's chrome is gone.
        <div
          className={cn(
            'w-full overflow-hidden rounded-lg border border-border',
            zen ? 'h-[calc(100vh-13rem)]' : 'h-[70vh]',
          )}
        >
          {/* Same reasoning as the detail screen: a scene this viewer cannot
              read is one row of a list, not the list. */}
          <SurfaceErrorBoundary label="this drawing" resetKeys={[draw.id]}>
            <DrawViewer drawId={draw.id} />
          </SurfaceErrorBoundary>
        </div>
      ) : svgQuery.isPending ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : src ? (
        <>
          {/* The snapshot fills its pane plainly — no border, mat or box; the
              SVG carries its own background. Still an IMAGE, never inline
              markup (see the loader note above). Under the dark theme it takes
              the canvas's own inversion so the preview matches the editor the
              drawing was made in — view-time only, nothing stored changes. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL of an owner-generated SVG; next/image can't take it */}
          <img src={src} alt={draw.title} className={cn('h-auto w-full', drawSnapshotClass(svg))} />
        </>
      ) : (
        <PreviewEmpty
          label={
            draw.hasDraft
              ? 'Your uncommitted edits are saved — open the drawing to carry on. The preview appears once you commit.'
              : 'Nothing to preview yet. Open the drawing and commit to create one.'
          }
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

function PreviewEmpty({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <RowButton
      onClick={onOpen}
      className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-muted/40"
    >
      <PenTool className="size-6" />
      {label}
    </RowButton>
  );
}
