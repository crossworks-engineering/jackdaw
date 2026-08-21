'use client';

/**
 * One /team workspace section: the list of team-visible shares of one type
 * (left, mirroring the owner screens' master-detail list pane) and a
 * read-only INLINE reader for the selected item (right) — ShareReader
 * fetching GET /s/<token>/view and mounting the share presenters directly
 * (no iframe). The share surface stays the only content door: /view is a
 * sub-path of /s with the same authorization, not a second one.
 *
 * Only a GENUINELY cross-origin client (isCrossOrigin — the API on another
 * origin, not merely configured absolutely) falls back to opening shares
 * top-level via OpenShare → the SSO handoff: inline reading there would
 * strand cookie-authenticated subresources (page images, downloads).
 *
 * List state is URL-driven (the /pages pattern): `?q=` search, `?tag=`
 * filter, `?sort=` order, `?page=` pager, `?s=<token>` selection — so
 * everything is linkable and refresh-safe. On mobile the list and reader
 * stack: list first, reader with a back button.
 *
 * The PAGES section (`tree` prop) mirrors the owner /pages pane, which now
 * DRILLS instead of expanding: the column shows one LEVEL of the shared subset
 * at a time (an unshared parent leaves its children as roots —
 * buildChildrenIndex's orphan rule), with a breadcrumb back out. That is what
 * makes it pageable: a tree cannot be paged, because page 2 of a tree cuts a
 * branch in half, and a level is just a list. Same cards as every other
 * section, same search/sort/tag controls — minus every owner action (no New,
 * no drag, no delete). Search or a tag filter drops to flat list mode, same as
 * the owner screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Search,
  Tag,
} from 'lucide-react';
import { Button, buttonVariants } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@mantle/web-ui/ui/command';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { buildChildrenIndex } from '@mantle/web-ui/page-tree';
import { formatDate, formatDayTime } from '@mantle/web-ui/lib/format-datetime';
import { teamFetch } from '@mantle/web-ui/team-fetch';
import { isCrossOrigin } from '@mantle/web-ui/runtime-env';
import { OpenShare } from './open-on-server';
import { ShareReader } from './share-reader';
import { cn } from '@mantle/web-ui/lib/utils';
import {
  ListCard,
  ListCardMeta,
  ListCardSnippet,
  ListCardTags,
  ListCardTitle,
} from '@mantle/web-ui/ui/list-card';
import { TagPill } from '@mantle/web-ui/tag-pill';

type Item = {
  token: string;
  nodeId: string;
  title: string;
  icon: string | null;
  summary: string | null;
  updatedAt: string;
  mode: 'team' | 'public';
  parentId: string | null;
  tags: string[];
  /** EVENTS ONLY — when the event HAPPENS, not when its row was written.
   *  Optional: it arrives with the brain that ships it, and an older server
   *  simply omits it, in which case the card falls back to `updatedAt`. */
  startsAt?: string | null;
};

type TagCount = { tag: string; count: number };

type SectionResponse = {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
  tags?: TagCount[];
  truncated?: boolean;
};

type Sort = 'newest' | 'oldest' | 'updated' | 'title';

const SORT_LABELS: Record<Sort, string> = {
  newest: 'Newest shared',
  oldest: 'Oldest shared',
  updated: 'Recently updated',
  title: 'Title A–Z',
};

const SORTS = Object.keys(SORT_LABELS) as Sort[];

/** Cards in a drilled level page client-side at this size, because the tree
 *  arrives whole (`?tree=1`) rather than paged. Matches the owner screen's
 *  LEVEL_PAGE_SIZE; the server's own flat pageSize is bigger because a compact
 *  row was smaller than a card. */
const LEVEL_PAGE_SIZE = 25;

/** The glyph a card falls back to when the shared item has none of its own, so
 *  the icon slot is never empty and the titles stay on one left edge. Per TYPE,
 *  the way each owner screen picks its own default (`/pages` uses 📄, `/apps`
 *  uses 🧩); a literal map because Tailwind aside, a lookup reads better than a
 *  switch and this is data, not logic. */
const TYPE_ICON: Record<string, string> = {
  note: '📝',
  page: '📄',
  table: '🧮',
  draw: '✏️',
  app: '🧩',
  task: '✅',
  event: '📅',
  branch: '📁',
};

/**
 * How the detail pane is shaped, per section type — style guide §8's table,
 * applied to the eight `/team` sections.
 *
 * Three shapes, and the question that picks one is always the same: is this
 * content the member READS, or content that was short of room?
 *
 * - **Fills** — `table`, `branch` (a file listing), `app`, `draw`. Not reading
 *   text. A cap would shrink the thing the screen exists for, so the detail
 *   takes the slack and there is no spacer.
 * - **Prose** — `note`, `page`. Wants a measure AND a right edge. The
 *   three-panel default gives it both: it opens readable at 900px, tucks left,
 *   and `maxDetailSize="100%"` means its own handle has no ceiling, so a member
 *   who wants the whole window can still drag for it. `/pages` shipped
 *   `detailFills` for prose once and it was wrong — the page just sprawled.
 * - **Bounded** — `task`, `event`. A short stack of metadata: status chips, a
 *   time, a location, a body. The 672px default is the measure that stops it
 *   spreading a four-line item across a 2000px pane.
 *
 * ⚠ Safe to vary per type because `type` is fixed for the life of a mount —
 * each section is its own route. `detailFills` changes the PANEL SET, not just
 * sizing, and `react-resizable-panels` keys saved layout on panel identity, so
 * a value that toggled at runtime would swap `[LIST, DETAIL]` ↔
 * `[LIST, DETAIL, SPACER]` under a saved layout. Nothing here toggles, and
 * `id={team-<type>}` already gives each section its own storage key.
 */
function paneShape(type: string): {
  detailFills?: true;
  defaultDetailSize?: string;
  maxDetailSize?: string;
} {
  switch (type) {
    case 'table':
    case 'branch':
    case 'app':
    case 'draw':
      return { detailFills: true };
    case 'note':
    case 'page':
      return { defaultDetailSize: '900px', maxDetailSize: '100%' };
    default:
      return {};
  }
}

export function TeamSection({
  type,
  emptyHint,
  tree = false,
}: {
  type: string;
  /** Section-specific empty-state hint, e.g. "Nothing shared yet." */
  emptyHint?: string;
  /** Pages: collapsible sub-page tree when no search/tag filter is active. */
  tree?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedToken = searchParams.get('s');
  const query = searchParams.get('q')?.trim() ?? '';
  const activeTag = searchParams.get('tag')?.trim() || null;
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const sortParam = searchParams.get('sort');
  const sort: Sort = SORTS.includes(sortParam as Sort) ? (sortParam as Sort) : 'newest';
  // Which level the column is showing. Tree sections only — a search spans
  // levels, so its results have no parent to sit under.
  const parentParam = searchParams.get('parent')?.trim() || null;

  // Tree view only without filters — search/tag results are flat (owner rule).
  const treeActive = tree && !query && !activeTag;

  const [data, setData] = useState<SectionResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [searchInput, setSearchInput] = useState(query);

  // Merge a patch into the query string (null/'' deletes a key) and replace —
  // keeps selection/pager out of history like the rest of the workspace.
  const go = useCallback(
    (patch: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') params.delete(k);
        else params.set(k, String(v));
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const qs = new URLSearchParams({ type });
      if (query) qs.set('q', query);
      if (activeTag) qs.set('tag', activeTag);
      if (sort !== 'newest') qs.set('sort', sort);
      if (treeActive) qs.set('tree', '1');
      else if (page > 1) qs.set('page', String(page));
      const r = await teamFetch(`/api/team/list?${qs.toString()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as SectionResponse);
    } catch {
      setFailed(true);
    }
  }, [type, query, activeTag, sort, page, treeActive]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced search: push `q` when the INPUT changes (resetting to page 1 and
  // dropping any selection a new result set may not contain). When ?q= moves
  // without an input edit (back/forward, external link), adopt it into the box
  // instead of re-pushing stale text — lastInputRef tells the two cases apart.
  const lastInputRef = useRef(searchInput);
  useEffect(() => {
    if (searchInput === lastInputRef.current) {
      if (query !== searchInput.trim()) {
        lastInputRef.current = query;
        setSearchInput(query);
      }
      return;
    }
    lastInputRef.current = searchInput;
    if (searchInput.trim() === query) return;
    const t = setTimeout(
      () => go({ q: searchInput.trim() || null, page: null, s: null, parent: null }),
      300,
    );
    return () => clearTimeout(t);
  }, [searchInput, query, go]);

  const select = (token: string | null) => go({ s: token });

  /**
   * Clicking a card opens it in the reader AND, when it has shared sub-pages,
   * drills the column into them — both, exactly as the owner screen behaves.
   * `page: null` because the level you land on starts at its own page 1.
   */
  const openItem = (item: (typeof treeItems)[number]) => {
    if (treeActive && childCountOf(item.id) > 0) go({ s: item.token, parent: item.id, page: null });
    else select(item.token);
  };

  const items = data?.items ?? null;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 30;
  const tags = data?.tags ?? [];
  const selected = items?.find((i) => i.token === selectedToken) ?? null;

  // Tree index over the loaded (shared) pages; sibling order = server sort.
  const treeItems = useMemo(() => (items ?? []).map((i) => ({ ...i, id: i.nodeId })), [items]);
  const childrenByParent = useMemo(() => buildChildrenIndex(treeItems), [treeItems]);
  const childCountOf = useCallback(
    (id: string) => (childrenByParent.get(id) ?? []).length,
    [childrenByParent],
  );

  // ── The level on screen ──────────────────────────────────────────────────
  // A `parent` that isn't in the loaded (shared) subset falls back to the top
  // level rather than showing an empty column — the same defensiveness
  // buildChildrenIndex applies to an unshared parent's children.
  const drillParent =
    treeActive && parentParam ? (treeItems.find((i) => i.id === parentParam) ?? null) : null;
  const drillId = drillParent?.id ?? null;
  /** The level the breadcrumb returns to — the drilled page's own parent. */
  const backParent = drillParent?.parentId
    ? (treeItems.find((i) => i.id === drillParent.parentId) ?? null)
    : null;

  const levelItems = treeActive ? (childrenByParent.get(drillId) ?? []) : treeItems;
  const levelTotal = treeActive ? levelItems.length : total;
  const levelPageSize = treeActive ? LEVEL_PAGE_SIZE : pageSize;
  const visibleItems = treeActive
    ? levelItems.slice((page - 1) * LEVEL_PAGE_SIZE, page * LEVEL_PAGE_SIZE)
    : treeItems;

  if (items === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {failed ? 'Could not load this section.' : 'Loading…'}
        </p>
      </div>
    );
  }

  // A genuinely empty section (nothing shared, no active search/filter) keeps
  // the clean centered hint; once a filter is active we always show controls.
  const isEmptySection = total === 0 && !query && !activeTag;
  if (isEmptySection) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-center text-sm text-muted-foreground">
          {emptyHint ?? 'Nothing shared here yet.'}
        </p>
      </div>
    );
  }

  /**
   * One shared item, as a card. The SAME anatomy for every section — icon in a
   * fixed slot so the titles line up down the column, then title, summary,
   * tags and the date. `subPages` is the tree sections' extra: a count that
   * doubles as the affordance for the drill, since clicking the card is what
   * opens that level.
   *
   * The title WRAPS here where the other sections truncate. This column exists
   * to find a page by name, and two pages that differ only past the ellipsis
   * are the same card to a reader.
   */
  const itemCard = (item: (typeof treeItems)[number], subPages: number | null) => {
    // Guarded on the type as well as the field: only the events section should
    // grow a lead time line, and only when the brain actually sent one.
    const eventStart = type === 'event' ? (item.startsAt ?? null) : null;
    return (
      <li key={item.token}>
        <ListCard onClick={() => openItem(item)} selected={item.token === selectedToken}>
          {/* The icon is a fixed-width SLOT, not an inline prefix. Inline, a row
            with an icon starts further right than one without and the titles
            stop lining up down the column — which is most of what makes a list
            hard to scan. The owner cards resolved this the same way. */}
          <div className="flex items-start gap-2">
            <span className="mt-0.5 size-4 shrink-0 text-center text-sm leading-4" aria-hidden>
              {item.icon ?? TYPE_ICON[type] ?? '📄'}
            </span>
            <div className="min-w-0 flex-1">
              {/* An event's WHEN is its identity — a member scanning this column
                is asking "what is coming up", and a title alone cannot answer
                that. So the time leads, above the title, rather than sitting
                in the muted meta line where every other type's date goes.
                Inside `min-w-0 flex-1`, so the titles still line up down the
                column against the icon slot. */}
              {eventStart && (
                <p className="mb-0.5 text-xs font-medium tabular-nums text-primary-ink">
                  {formatDayTime(eventStart)}
                </p>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <ListCardTitle wrap={subPages !== null} className="min-w-0 flex-1">
                  {item.title}
                </ListCardTitle>
                {item.mode === 'public' && (
                  <Globe
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-label="Also shared publicly"
                  />
                )}
              </div>
              {item.summary && <ListCardSnippet>{item.summary}</ListCardSnippet>}
              {/* The tags were in the payload all along and never rendered, while
                the header above offers a tag FILTER built from them — so a
                member could filter by a tag no card ever showed. */}
              {item.tags.length > 0 && (
                <ListCardTags>
                  {item.tags.map((t) => (
                    <TagPill key={t} tag={t} />
                  ))}
                </ListCardTags>
              )}
              <ListCardMeta className="flex items-center gap-1.5">
                {/* `Updated` is only worth the word where a bare date would now
                  be ambiguous — an event card already shows one above. */}
                <span>
                  {eventStart
                    ? `Updated ${formatDate(item.updatedAt)}`
                    : formatDate(item.updatedAt)}
                </span>
                {subPages !== null && subPages > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                      {subPages} sub-page{subPages === 1 ? '' : 's'}
                      <ChevronRight className="size-3.5 opacity-70" aria-hidden />
                    </span>
                  </>
                )}
              </ListCardMeta>
            </div>
          </div>
        </ListCard>
      </li>
    );
  };

  return (
    <MasterDetail
      // Per SECTION, so Notes and Tables each remember their own width — the
      // same per-view rule /tasks and /tasks-board follow.
      id={`team-${type}`}
      // ⚠ Per TYPE. This used to be an unconditional `detailFills`, and that
      // one word is what made the pane feel wrong in two different directions.
      //
      // `detailFills` drops the SPACER and the detail's max size, so the pane
      // has no right edge and the divider shoves a boundary instead of sizing
      // a card. With the presenters' old `mx-auto max-w-2xl` inside it, that
      // read as a box floating in the middle of a 2000px pane; once the
      // presenters went `chrome="embedded"` and lost the cap, the same pane
      // read as content hugging the left with dead space beside it. One prop,
      // both complaints.
      //
      // Style guide §8 is explicit that the prop belongs to content that is
      // NOT reading text, so it is granted by type rather than by default.
      {...paneShape(type)}
      // The list clamps match the FORUM's (topic-list-client.tsx), because the
      // cards are the same shape: an icon slot, a title, a summary line, tags
      // and a meta row. The scaffold's 260/340/560 defaults were tuned for a
      // one-line settings row, so the summary had ~120px less than the forum
      // gave the identical element on the screen next door.
      minListSize="220px"
      defaultListSize="360px"
      maxListSize="720px"
      list={
        // `h-full`, not `flex-1`: MasterDetail's pane wrappers are blocks, so a
        // flex property here would be inert and the column would size to its
        // content. Below `md` the scaffold falls back to a stacked grid, where
        // this resolves to `auto` and the panes flow — which is why the
        // mobile-only hides below are `max-md:` and not unconditional.
        <div className={cn('flex h-full min-h-0 flex-col', selected && 'max-md:hidden')}>
          {/* Search + sort + tag header */}
          <div className="space-y-2 border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search…"
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1 text-muted-foreground"
                    title="Sort"
                  >
                    <ArrowUpDown className="size-3.5" />
                    {SORT_LABELS[sort]}
                    <ChevronDown className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(v) => go({ sort: v === 'newest' ? null : v, page: null })}
                  >
                    {SORTS.map((s) => (
                      <DropdownMenuRadioItem key={s} value={s}>
                        {SORT_LABELS[s]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {tags.length > 0 && (
                <TagFilter
                  tags={tags}
                  activeTag={activeTag}
                  onSelect={(t) => go({ tag: t, page: null, s: null, parent: null })}
                />
              )}
            </div>
          </div>

          {/* A later fetch failed (params changed, session hiccup) — the list
            below is the last successful load, say so instead of going silent. */}
          {failed && (
            <p className="border-b border-border bg-destructive/5 px-3 py-1.5 text-xs text-destructive-ink">
              Couldn&rsquo;t refresh — showing the last loaded results.
            </p>
          )}
          {data?.truncated && (
            <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              Showing the first {items.length} shared pages — search to find the rest.
            </p>
          )}

          {/* Scrollable list — the same cards for every section. Keyed on the
              level so a drill can't leave the previous one's cards on screen. */}
          <div key={drillId ?? 'root'} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {drillParent && (
              <div className="border-b border-border px-2 py-2">
                <button
                  type="button"
                  onClick={() => go({ parent: backParent?.id ?? null, page: null })}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="size-3.5" />
                  <span className="truncate">
                    Back to {backParent ? backParent.title : 'all pages'}
                  </span>
                </button>
                <div className="mt-0.5 flex items-center gap-1.5 pl-0.5">
                  <span className="size-4 shrink-0 text-center text-sm leading-4" aria-hidden>
                    {drillParent.icon ?? TYPE_ICON[type] ?? '📄'}
                  </span>
                  <span className="min-w-0 break-words text-sm font-semibold">
                    {drillParent.title}
                  </span>
                </div>
              </div>
            )}
            {visibleItems.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {query ? (
                  <>No matches for “{query}”.</>
                ) : activeTag ? (
                  <>Nothing tagged “{activeTag}”.</>
                ) : (
                  <>Nothing shared under this page.</>
                )}
              </p>
            ) : tree ? (
              <ul className="flex flex-col gap-1 p-2">
                {visibleItems.map((item) =>
                  itemCard(item, treeActive ? childCountOf(item.id) : null),
                )}
              </ul>
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {visibleItems.map((item) => itemCard(item, null))}
              </ul>
            )}
          </div>

          {/* Every mode pages now. In tree mode the numbers are the LEVEL's
              and the slicing is client-side, because `?tree=1` returns the
              hierarchy whole; in flat mode page/total/pageSize come from the
              same response snapshot, so the pager never mixes a new URL page
              with a stale total. */}
          <ListPager
            page={treeActive ? page : (data?.page ?? page)}
            total={levelTotal}
            pageSize={levelPageSize}
            onGo={(p) => go({ page: p <= 1 ? null : p })}
          />
        </div>
      }
      detail={
        <div className={cn('flex h-full min-h-0 flex-col', !selected && 'max-md:hidden')}>
          {selected ? (
            <>
              {type === 'app' ? (
                /* Apps get NO title header — an app names itself in its own
                   UI (and the card in the list already carries it), so the §8
                   h2 was a duplicate stealing height from the app's viewport.
                   Only the controls remain, in one slim row. */
                <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 md:hidden"
                    onClick={() => select(null)}
                    aria-label="Back to the list"
                  >
                    <ArrowLeft />
                  </Button>
                  <div className="flex-1" />
                  <OpenShare
                    token={selected.token}
                    ariaLabel="Open in a new tab"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                      'shrink-0',
                    )}
                  >
                    <ExternalLink />
                  </OpenShare>
                </div>
              ) : (
                /* The §8 detail header: the entity title at `text-xl
                   font-semibold` with its glyph INSIDE the h2 (so the two share
                   a baseline and the icon can't drift when the title wraps),
                   `min-w-0 truncate` on the title and `shrink-0` on the actions.
                   It used to be a centred `text-sm` paragraph, which walked the
                   title away from the list it belongs to and read a step
                   quieter than the cards it was heading. */
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-3 py-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 md:hidden"
                    onClick={() => select(null)}
                    aria-label="Back to the list"
                  >
                    <ArrowLeft />
                  </Button>
                  <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold">
                    <span aria-hidden>{selected.icon ?? TYPE_ICON[type] ?? '📄'}</span>
                    <span className="min-w-0 truncate">{selected.title}</span>
                  </h2>
                  <OpenShare
                    token={selected.token}
                    ariaLabel="Open in a new tab"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                      'shrink-0',
                    )}
                  >
                    <ExternalLink />
                  </OpenShare>
                </div>
              )}
              {!isCrossOrigin() ? (
                <ShareReader
                  key={selected.token}
                  token={selected.token}
                  title={selected.title}
                  nodeId={selected.nodeId}
                />
              ) : (
                // Genuinely cross-origin client: inline reading would strand the
                // cookie-authenticated subresources (page images, downloads), so
                // shares open top-level on the server origin via the SSO handoff.
                <div className="flex flex-1 items-center justify-center p-6">
                  <div className="max-w-sm text-center">
                    <p className="text-sm text-muted-foreground">
                      This item opens on the brain&rsquo;s own site.
                    </p>
                    <OpenShare token={selected.token} className={cn(buttonVariants(), 'mt-4')}>
                      <ExternalLink />
                      <span className="max-w-56 truncate">Open {selected.title}</span>
                    </OpenShare>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">Select an item to read it.</p>
            </div>
          )}
        </div>
      }
    />
  );
}

/** The owner /pages tag filter, member-sized: a popover command list of the
 *  section's tags with counts; picking the active tag again clears it. */
function TagFilter({
  tags,
  activeTag,
  onSelect,
}: {
  tags: TagCount[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
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
          size="xs"
          role="combobox"
          aria-expanded={open}
          className={cn('gap-1 text-muted-foreground', activeTag && 'text-foreground')}
          title="Filter by tag"
        >
          <Tag className="size-3.5" />
          <span className="max-w-32 truncate">{activeTag ?? 'All tags'}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          <CommandInput placeholder="Search tags…" className="border-0 focus:ring-0" />
          <CommandList className="max-h-72 scrollbar-thin">
            <CommandEmpty className="px-3 py-6 text-center text-xs text-muted-foreground">
              No tags found.
            </CommandEmpty>
            <CommandGroup>
              {/* Sentinel value so a tag search doesn't accidentally match it. */}
              <CommandItem value="__all_items__" onSelect={() => choose(null)}>
                <Check className={cn('size-4', activeTag === null ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1">All items</span>
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
                  <span className="text-xs text-muted-foreground group-data-[selected=true]/command-item:text-accent-foreground">
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
