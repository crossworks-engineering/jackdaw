'use client';

/**
 * The /team INLINE share reader — renders shared content in the workspace's
 * own reader pane, no /s iframe. Fetches GET /s/<token>/view through teamFetch
 * (cookie same-origin, bearer cross-origin — the endpoint accepts both) and
 * mounts the same presenters the /s surface renders, from @mantle/web-ui/share.
 *
 * Two kinds differ from their /s twins:
 *  - `page` arrives as pre-rendered SANITIZED html + toc (renderPageDoc runs
 *    server-side only) and is injected verbatim into the editor CSS container;
 *  - `folder` navigates sub-folders by refetching `?p=` in place instead of
 *    anchor navigation.
 *
 * `app` mounts AppSandbox exactly like the /s island — the sandbox iframe
 * (opaque origin, allow-scripts only) is the app's EXECUTION boundary, not a
 * reading surface, and stays. It renders in the `viewport` frame and returns
 * BEFORE the scroll container below: an app scrolls itself, and the 'card'
 * frame's reported-height sizing cuts a tall one off at its 4000px clamp.
 *
 * Failure shapes: 401 = no live team session for a team-mode share (the pane
 * offers the top-level open, which can re-establish one via SSO); anything
 * else = a plain retry.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { PageOutline } from '@mantle/web-ui/page-outline';
import { teamFetch, upgradeTeamCookie } from '@mantle/web-ui/team-fetch';
import { buttonVariants } from '@mantle/web-ui/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mantle/web-ui/ui/table';
import { formatBytes } from '@mantle/web-ui/lib/format-bytes';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { describeFile } from '@mantle/web-ui/lib/mime-label';
import { cn } from '@mantle/web-ui/lib/utils';
import type { ShareViewPayload, ShareFolderListing } from '@mantle/share-ui/view-payload';
import { NotePresenter } from '@mantle/share-ui/note-presenter';
import { DrawPresenter } from '@mantle/share-ui/draw-presenter';
import { TaskPresenter } from '@mantle/share-ui/task-presenter';
import { EventPresenter } from '@mantle/share-ui/event-presenter';
import { FilePresenter } from '@mantle/share-ui/file-presenter';
import { TablePresenter } from '@mantle/share-ui/table-presenter';
import { FormulaPresenter } from '@mantle/share-ui/formula-presenter';
import { FormulaCalculator } from '@mantle/share-ui/formula-calculator';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import {
  ChevronsUpDown,
  Download,
  ExternalLink,
  Folder as FolderIcon,
  type LucideIcon,
} from 'lucide-react';
import { OpenShare } from './open-on-server';
import { TeamTaskComments } from './team-task-comments';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'unauthorized' }
  | { phase: 'gone' }
  | { phase: 'failed' }
  | { phase: 'ready'; view: ShareViewPayload };

const assetUrl = (token: string) => (fileId: string) => `/s/${token}/a/${fileId}`;

export function ShareReader({
  token,
  title,
  nodeId,
}: {
  token: string;
  title: string;
  /** When set and the share is a task, a member comment thread renders under
   *  the presenter (POST/GET /api/team/comments — gated on the active share). */
  nodeId?: string;
}) {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  const load = useCallback(
    async (p?: string) => {
      setState({ phase: 'loading' });
      try {
        // Sessions minted in bearer mode hold no cookie yet — the view fetch
        // itself rides the bearer, but the content it renders loads
        // cookie-authenticated subresources (page images, downloads, rows,
        // the app bundle). Await the one-shot upgrade so the FIRST open
        // doesn't race the Set-Cookie; settles instantly when moot.
        await upgradeTeamCookie();
        const qs = p ? `?p=${encodeURIComponent(p)}` : '';
        const r = await teamFetch(`/s/${token}/view${qs}`, { cache: 'no-store' });
        if (r.status === 401) {
          setState({ phase: 'unauthorized' });
          return;
        }
        if (r.status === 404) {
          // Revoked / deleted since the list loaded — retry can't help.
          setState({ phase: 'gone' });
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { view: ShareViewPayload };
        setState({ phase: 'ready', view: d.view });
      } catch {
        setState({ phase: 'failed' });
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (state.phase !== 'ready') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-muted-foreground">
            {state.phase === 'unauthorized'
              ? 'Your team session doesn’t cover this item here.'
              : state.phase === 'gone'
                ? 'This item is no longer shared.'
                : 'Could not load this item.'}
          </p>
          {state.phase === 'unauthorized' ? (
            <OpenShare token={token} className={cn(buttonVariants(), 'mt-4')}>
              <ExternalLink />
              <span className="max-w-56 truncate">Open {title}</span>
            </OpenShare>
          ) : state.phase === 'failed' ? (
            <button
              type="button"
              onClick={() => void load()}
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const { view } = state;

  // An APP owns its own viewport and its own scrolling, so it must not sit in
  // the reader's scroll container below. In the default 'card' frame the iframe
  // is sized to the height the app REPORTS, clamped to 4000px — a taller app is
  // simply cut off, with no scrollbar of its own to recover it. 'viewport' hands
  // the app the pane and lets it scroll itself, which is what the owner /apps
  // screen and /hub already do.
  if (view.kind === 'app') {
    return (
      <div className="min-h-0 flex-1">
        <AppSandbox appId={view.appId} shareToken={token} frame="viewport" />
      </div>
    );
  }

  // A TABLE also owns its height: the embedded presenter is a full-bleed
  // column with its own bounded scroller (sticky header/totals stick to it).
  // Nesting it in the reader's overflow-y-auto pane painted a scroller inside
  // a scroller inside a border — the "boxed grid with an outer margin".
  if (view.kind === 'table') {
    return (
      <div className="min-h-0 flex-1 overflow-hidden">
        <TablePresenter view={view} token={token} chrome="embedded" />
      </div>
    );
  }

  return (
    // `relative` is load-bearing, not decoration: a position:static
    // overflow-y-auto pane leaks its scrollable overflow into the outer region
    // once the content is much taller than the viewport, which paints a second
    // scrollbar that clips the bottom of a long page or table. See the style
    // guide §8 — min-h-0 sizes the pane, `relative` closes the boundary.
    // No pane fill: the workspace shell's Neat backdrop shows through here the
    // same way it does behind the owner reader panes; the shell's layout root
    // already paints `bg-background` when no background is saved. The sticky
    // rows that need an opaque ground (table header/totals) carry their own.
    <div className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      {/* `chrome="embedded"` on every presenter: this pane already draws the
          title in TeamSection's §8 header and owns the padding, so the
          standalone page's hero title and centred cap are both wrong here.
          The public /s page passes nothing and keeps the centred form —
          'share' is the default for exactly that reason. share-ui ≥ 0.231.0. */}
      {view.kind === 'page' && <PageReader view={view} />}
      {view.kind === 'note' && <NotePresenter view={view} chrome="embedded" />}
      {view.kind === 'draw' && (
        <DrawPresenter view={view} src={`/s/${token}/draw`} chrome="embedded" />
      )}
      {view.kind === 'task' && (
        <>
          <TaskPresenter view={view} chrome="embedded" />
          {nodeId && <TeamTaskComments nodeId={nodeId} />}
        </>
      )}
      {view.kind === 'event' && <EventPresenter view={view} chrome="embedded" />}
      {view.kind === 'file' && (
        <FilePresenter view={view} assetUrl={assetUrl(token)} chrome="embedded" />
      )}
      {view.kind === 'formula' && (
        <FormulaPresenter
          view={view}
          calculator={<FormulaCalculator token={token} signature={view.signature} />}
        />
      )}
      {view.kind === 'folder' && (
        <FolderReader
          rootTitle={view.title}
          rootPath={view.path}
          listing={view.listing}
          token={token}
          onNavigate={(sub) => void load(sub)}
        />
      )}
    </div>
  );
}

/** Pre-rendered page html + outline — the inline twin of PagePresenter (which
 *  stays server-side with renderPageDoc). Same container classes, so the
 *  editor CSS in globals.css styles it identically.
 *
 *  This one is jackdaw-local, so it takes the embedded treatment directly
 *  rather than through a `chrome` prop.
 *
 *  No max-width cap: the pane DIVIDER is the measure here, exactly like the
 *  owner editor (`max-w-none`). The old `max-w-3xl/5xl` cap meant dragging
 *  the handle wider just grew empty gutter once the cap was hit — the pane
 *  opens at a readable 900px default, and a member who drags wider gets the
 *  width they asked for. */
function PageReader({ view }: { view: Extract<ShareViewPayload, { kind: 'page' }> }) {
  return (
    <div className="flex w-full gap-8 px-6 py-6">
      {view.toc.length > 0 && (
        <aside className="hidden w-56 shrink-0 xl:block">
          {/* `top-0`, not `top-12`: the offset was matching the py-12 the
              container no longer has, so the outline would have stuck a
              half-screen below where the prose starts. */}
          <div className="sticky top-0 max-h-[calc(100dvh-6rem)] overflow-y-auto scrollbar-thin">
            <PageOutline entries={view.toc} />
          </div>
        </aside>
      )}
      <div className="min-w-0 flex-1">
        <article className="w-full">
          <div
            className="ProseMirror prose dark:prose-invert prose-accent prose-document max-w-none"
            // Sanitized server-side by renderPageDoc — built from a known tag
            // set with all text + attributes escaped, never user HTML.
            dangerouslySetInnerHTML={{ __html: view.html }}
          />
        </article>
      </div>
    </div>
  );
}

/** How many rows are in the DOM before the sentinel grows the window. A shared
 *  drive folder can hold hundreds of files, and the listing arrives WHOLE — the
 *  share view has no `?page`, so the cap is the only thing between a member and
 *  800 rows painted at once. */
const FOLDER_PAGE = 200;

type SortKey = 'name' | 'type' | 'size' | 'modified';

/** One listing row, folders and files flattened to the same shape so a single
 *  comparator can sort both — with `isFolder` kept so folders still group
 *  first, the way every file manager behaves. */
type Row = {
  id: string;
  isFolder: boolean;
  name: string;
  typeLabel: string;
  icon: LucideIcon;
  /** Bytes for a file; a folder sorts by its child count instead, which is why
   *  the two never share a sort bucket. */
  size: number;
  sizeLabel: string;
  /** Epoch ms for sorting; 0 when the server did not send one. A folder has no
   *  mtime of its own in the share payload, so it sorts to the bottom of its
   *  own group rather than pretending to a date. */
  modified: number;
  modifiedLabel: string;
  /** Folders navigate, files download. Exactly one is set. */
  sub?: string;
  href?: string;
  filename?: string;
};

/**
 * Inline folder listing — a full-bleed table, not the centred column the public
 * `/s` page draws.
 *
 * Three things changed from the share layout, all for the same reason: this
 * renders inside `TeamSection`'s detail pane, which can be two thousand pixels
 * wide, not on a standalone page.
 *
 * - **No `max-w`.** The centred cap was what made dragging the divider feel
 *   broken: the handle worked, the content ignored it and only the margins grew.
 * - **No `<h1>`.** `TeamSection` already draws the title in its §8 detail header
 *   (team-section.tsx), so the presenter's own hero title was the second of
 *   three on screen. The breadcrumb stays — it is the part that says *where*.
 * - **A table, with a real Type column.** The old row printed
 *   `f.mimeType` raw, so a member read
 *   `application/vnd.openxmlformats-officedocument…` instead of "Word document".
 *
 * There is no Modified column because the share view does not carry one
 * (`ShareFolderListing` is `{id, filename, mimeType, sizeBytes}`); adding it is
 * a mantle-side change to the share payload.
 */
function FolderReader({
  rootTitle,
  rootPath,
  listing,
  token,
  onNavigate,
}: {
  rootTitle: string;
  rootPath: string;
  listing: ShareFolderListing;
  token: string;
  onNavigate: (sub: string) => void;
}) {
  const { currentPath, folders, files } = listing;
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false });
  const [shown, setShown] = useState(FOLDER_PAGE);
  // Memoised because it is a `rows` dependency: `assetUrl(token)` returns a new
  // closure every call, so an inline one would bust the sort on every render.
  const toAsset = useMemo(() => assetUrl(token), [token]);

  const relLabels =
    currentPath === rootPath ? [] : currentPath.slice(rootPath.length + 1).split('.');
  const crumbs = [
    { label: rootTitle, sub: '' },
    ...relLabels.map((label, i) => ({
      label: label.replace(/_/g, '-'),
      sub: relLabels.slice(0, i + 1).join('.'),
    })),
  ];

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      ...folders.map((f) => ({
        id: f.id,
        isFolder: true,
        name: f.slug,
        typeLabel: 'Folder',
        icon: FolderIcon as LucideIcon,
        size: f.fileCount,
        sizeLabel: `${f.fileCount} file${f.fileCount === 1 ? '' : 's'}`,
        modified: 0,
        modifiedLabel: '—',
        sub: f.path.slice(rootPath.length + 1),
      })),
      ...files.map((f) => {
        const described = describeFile(f.mimeType, f.filename);
        return {
          id: f.id,
          isFolder: false,
          name: f.filename,
          typeLabel: described.label,
          icon: described.icon,
          size: f.sizeBytes,
          sizeLabel: formatBytes(f.sizeBytes),
          // `updatedAt` is optional: it arrived with share-ui 0.231.0, so a
          // brain still on an older server sends a payload without it. An
          // em dash is the honest answer, not a fabricated date.
          modified: f.updatedAt ? Date.parse(f.updatedAt) : 0,
          modifiedLabel: f.updatedAt ? formatDateTime(f.updatedAt) : '—',
          href: toAsset(f.id),
          filename: f.filename,
        };
      }),
    ];

    const dir = sort.desc ? -1 : 1;
    return all.sort((a, b) => {
      // Folders first regardless of direction — reversing the sort should flip
      // the names, not turn the listing inside out.
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      if (sort.key === 'size') return (a.size - b.size) * dir;
      // Undated rows hold the bottom in BOTH directions — flipping the sort
      // should reorder the dates, not float the blanks to the top.
      if (sort.key === 'modified') {
        if (!a.modified || !b.modified) return a.modified ? -1 : b.modified ? 1 : 0;
        return (a.modified - b.modified) * dir;
      }
      const left = sort.key === 'type' ? a.typeLabel : a.name;
      const right = sort.key === 'type' ? b.typeLabel : b.name;
      // `numeric` so `page2` sorts before `page10`, which plain lexical order
      // gets backwards on any folder of numbered scans.
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [folders, files, rootPath, toAsset, sort]);

  // A new folder is a new listing: start again at the top of the window, or
  // navigating into a small folder inherits a huge one's already-grown cap.
  useEffect(() => setShown(FOLDER_PAGE), [currentPath, sort]);

  const visible = rows.slice(0, shown);
  const more = rows.length - visible.length;

  const toggleSort = (key: SortKey) =>
    setSort((prev) => ({ key, desc: prev.key === key ? !prev.desc : false }));

  const sortProps = (key: SortKey) => ({
    'aria-sort': (sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none') as
      'ascending' | 'descending' | 'none',
    onClick: () => toggleSort(key),
  });

  return (
    <div className="flex min-h-0 flex-col">
      {/* Rules span the pane; only what sits between them insets. */}
      <nav
        aria-label="Folder"
        className="flex flex-wrap items-center gap-1 border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground"
      >
        {crumbs.map((c, i) => (
          <span key={c.sub} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {i === crumbs.length - 1 ? (
              <span className="font-medium text-foreground">{c.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(c.sub)}
                className="rounded-sm hover:text-foreground hover:underline"
              >
                {c.label}
              </button>
            )}
          </span>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          This folder is empty.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead className="pl-4" {...sortProps('name')} active={sort.key === 'name'}>
                  Name
                </SortableHead>
                <SortableHead className="w-48" {...sortProps('type')} active={sort.key === 'type'}>
                  Type
                </SortableHead>
                <SortableHead
                  className="w-28 text-right"
                  {...sortProps('size')}
                  active={sort.key === 'size'}
                >
                  Size
                </SortableHead>
                <SortableHead
                  className="hidden w-44 lg:table-cell"
                  {...sortProps('modified')}
                  active={sort.key === 'modified'}
                >
                  Modified
                </SortableHead>
                <TableHead className="w-32 pr-4">
                  <span className="sr-only">Download</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-0 pl-4">
                    {r.isFolder ? (
                      <button
                        type="button"
                        onClick={() => onNavigate(r.sub!)}
                        className="flex w-full min-w-0 items-center gap-2 text-left font-medium hover:underline"
                      >
                        <r.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{r.name}</span>
                      </button>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <r.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{r.name}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {r.typeLabel}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {r.sizeLabel}
                  </TableCell>
                  {/* Hidden below lg: the pane can be dragged down to 420px,
                      and Name/Type/Size are what a member is scanning for. */}
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                    {r.modifiedLabel}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {r.href && (
                      <a
                        href={r.href}
                        download={r.filename}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                      >
                        <Download className="size-3.5" aria-hidden /> Download
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {more > 0 && (
            // Auto-reveal rather than a "Load more" button: scrolling toward the
            // end is already the gesture that means "show me the rest". The root
            // is the viewport, which is correct even though the pane is the
            // element that scrolls — a row inside it still enters the viewport.
            <MoreSentinel
              onReveal={() => setShown((n) => n + FOLDER_PAGE)}
              label={`${visible.length} of ${rows.length}`}
            />
          )}
        </>
      )}
    </div>
  );
}

/** A `<TableHead>` that sorts on click and says so to a screen reader. */
function SortableHead({
  active,
  className,
  children,
  onClick,
  ...rest
  // `onClick` is re-declared because it lands on the inner <button>, not on the
  // cell — inheriting the cell's handler type would type the event wrong.
}: Omit<ComponentProps<typeof TableHead>, 'onClick'> & { active: boolean; onClick: () => void }) {
  return (
    <TableHead className={className} {...rest}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          active && 'text-foreground',
        )}
      >
        {children}
        <ChevronsUpDown className="size-3 opacity-60" aria-hidden />
      </button>
    </TableHead>
  );
}

/** Grows the visible window when it scrolls into view. */
function MoreSentinel({ onReveal, label }: { onReveal: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // The callback changes identity every render, so the observer reads it from a
  // ref — re-creating the observer on each render would disconnect it mid-scroll
  // and the listing would stop growing until the member scrolled again.
  const reveal = useRef(onReveal);
  reveal.current = onReveal;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && reveal.current(),
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="px-4 py-6 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}
