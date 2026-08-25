'use client';

/**
 * The /team member workspace shell — the owner app shell's geometry, member-sized.
 *
 * NO HEADER, NO FOOTER. The rail owns the chrome, exactly as the owner shell
 * does (style guide §8): the brand block (wordmark or logo + peer name) heads
 * the column, the section nav and the shared-folder links fill it, and the
 * member's name with the light/dark toggle sit at its foot. What a member has
 * is a subset of what an owner has — no account menu, no search, no Highlight,
 * no Assistant — so this mirrors the SHAPE and carries only the controls that
 * mean something here.
 *
 * Below `md` the rail becomes a drawer and a 3rem bar holds the trigger, the
 * brand and the theme toggle — the same trade the owner's MobileBar makes: a
 * closed drawer needs something to open it, and a phone has no room to keep
 * the column open. Unlike the owner shell this surface lays out with flex
 * rather than fixed regions, so the bar is a `md:hidden` flex row and needs no
 * `--top-bar-h` for others to offset against; nothing here is positioned
 * against it.
 *
 * Client-fetch on purpose (teamFetch, not apiFetch): /team is the external
 * member surface — auth is the team credential (cookie same-origin, bearer on
 * the split client origin), 401 renders the TokenGate, and pages stay free of
 * server DB reads (detached-safe, same as the old hub).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppWindow,
  BookText,
  CalendarDays,
  CheckSquare,
  FileText,
  Folder,
  FolderTree,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { navItemMatches } from '@mantle/web-ui/layout/nav-items';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@mantle/web-ui/ui/sheet';
import { ThemeToggle } from '@mantle/web-ui/theme-toggle';
import { RailHandle } from '@mantle/web-ui/ui/rail-handle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@mantle/web-ui/ui/tooltip';
import { BrandBlock } from '@/components/layout/rail/brand-block';
import { BrandLogo } from '@/components/layout/rail/brand-logo';
import { TokenGate } from '@/components/team-chat/token-gate';
import { NeatSurface } from '@/components/neat-surface';
import { teamFetch, upgradeTeamCookie } from '@mantle/web-ui/team-fetch';
import { cn } from '@mantle/web-ui/lib/utils';

export type WorkspaceData = {
  memberName: string | null;
  siteName: string | null;
  /** The brain's federation label — set beside the wordmark, as in the owner rail. */
  peerName: string | null;
  /** Brand logo version; set ⇒ an image replaces the wordmark text. */
  logoVersion: string | null;
  logoDarkVersion?: string | null;
  colorTheme: string | null;
  version: string;
  counts: Record<string, number>;
  folders: Array<{ token: string; title: string }>;
};

/** The left-nav sections, in display order — mirrors the owner sidebar's
 *  Workspace group (same icons), minus everything a member can't have.
 *  Shaped as NavItem (+ the share `type`) so active-route matching reuses the
 *  canonical navItemMatches helper instead of a drifting reimplementation. */
export const WORKSPACE_NAV: Array<{
  type: string;
  name: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}> = [
  // Dashboard = the /team overview itself — exact so it doesn't stay lit on
  // every subroute (same trick the owner sidebar uses for "/").
  { type: 'dashboard', name: 'Dashboard', href: '/team', icon: LayoutDashboard, exact: true },
  // The Forum leads the sections: it's the team's shared threads with the
  // brain — the successor to the 1:1 Assistant chat (now the read-only Archive).
  { type: 'forum', name: 'Forum', href: '/team/forum', icon: MessagesSquare },
  { type: 'note', name: 'Notes', href: '/team/notes', icon: FileText },
  { type: 'page', name: 'Pages', href: '/team/pages', icon: BookText },
  { type: 'table', name: 'Tables', href: '/team/tables', icon: Table2 },
  { type: 'draw', name: 'Drawings', href: '/team/draw', icon: PenTool },
  { type: 'app', name: 'Apps', href: '/team/apps', icon: AppWindow },
  { type: 'task', name: 'Tasks', href: '/team/tasks', icon: CheckSquare },
  { type: 'event', name: 'Events', href: '/team/events', icon: CalendarDays },
  // Shared folders — the same section the rail's folder links deep-link into
  // (count = shared folders, not files; every file under one is downloadable).
  { type: 'branch', name: 'Files', href: '/team/files', icon: FolderTree },
];

/**
 * Rail width bounds, in px, and where the member's choice is kept.
 *
 * ⚠ **localStorage, not a cookie — and that is not a copy/paste slip.** The
 * owner rail persists to a cookie because `app/(app)/layout.tsx` seeds the
 * width SERVER-side, so the rail paints at the user's width on the very first
 * frame. `/team` is a client-fetch surface on purpose (no server DB reads,
 * detached-dev safe), so there is no server render to seed from and a cookie
 * would buy nothing but a cookie. The cost is one frame at the default width,
 * and it is hidden in practice: the rail is not painted until the workspace
 * fetch resolves, which is already client-side.
 *
 * They live here rather than in their own module for the mirror of the reason
 * the owner's DO have one (`lib/nav-width.ts`): that file exists because a
 * SERVER component imports it, and a server component importing a value from a
 * `'use client'` module gets a client *reference* — `NaN` widths. Nothing on
 * `/team` renders on the server, so the hazard does not exist here.
 */
const NAV_W_DEFAULT = 224;
const NAV_W_MIN = 180;
const NAV_W_MAX = 400;
const NAV_W_KEY = 'mantle_team_nav_w';
const NAV_COLLAPSED_KEY = 'mantle_team_nav_collapsed';

/** Read a stored width. Hand-editable storage, so junk has to survive. */
function readStoredWidth(): number {
  if (typeof window === 'undefined') return NAV_W_DEFAULT;
  const parsed = Number.parseInt(window.localStorage.getItem(NAV_W_KEY) ?? '', 10);
  if (!Number.isFinite(parsed)) return NAV_W_DEFAULT;
  return Math.min(NAV_W_MAX, Math.max(NAV_W_MIN, parsed));
}

function readStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1';
}

const WorkspaceContext = createContext<WorkspaceData | null>(null);

/** Shell data for section screens (greeting, counts). Null until loaded —
 *  children render inside the shell only after auth, so it's always set for
 *  them in practice. */
export function useWorkspace(): WorkspaceData | null {
  return useContext(WorkspaceContext);
}

/** One nav row. Matches the owner sidebar's row: same active fill, same
 *  `aria-current`, same `<Badge>` for the count, and the label truncates so a
 *  long section name can't shove the badge out of the column. The hover is the
 *  neutral `foreground/[0.06]` overlay §2 requires on a `bg-sidebar` surface —
 *  a coloured accent tint muddies grey text there.
 *
 *  Collapsed it becomes an icon row, keyed off the shell root exactly as the
 *  owner's does (`group-data-[nav-collapsed=true]/shell:`) rather than off a
 *  prop — that is what lets BrandBlock, which is SHARED with the owner rail,
 *  pick up its own collapsed form here for free. The label then lives in a
 *  tooltip, and the count becomes a dot, because a 3.5rem column has no room
 *  for either and shrinking them until they fit reads as a bug. */
function NavRow({
  item,
  count,
  active,
  collapsed,
  onNavigate,
}: {
  item: (typeof WORKSPACE_NAV)[number];
  count: number;
  active: boolean;
  /** Drives the tooltip only. The row's own layout follows the shell root. */
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const row = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? undefined : item.name}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        'group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:gap-0 group-data-[nav-collapsed=true]/shell:px-0',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate group-data-[nav-collapsed=true]/shell:hidden">
        {item.name}
      </span>
      {count > 0 && (
        <>
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center px-1.5 text-[11px] group-data-[nav-collapsed=true]/shell:hidden"
          >
            {count > 99 ? '99+' : count}
          </Badge>
          {/* Collapsed: a dot stands in for the count. */}
          <span
            className="absolute right-1.5 top-1.5 hidden size-2 rounded-full bg-primary ring-2 ring-sidebar group-data-[nav-collapsed=true]/shell:block"
            aria-hidden
          />
        </>
      )}
    </Link>
  );

  if (!collapsed) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {item.name}
        {count > 0 && (
          <span className="rounded bg-primary-foreground/20 px-1 text-[10px] tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Everything between the brand block and the rail's foot. Shared by the aside
 *  and the mobile drawer so the two cannot drift. */
function RailBody({
  data,
  collapsed,
  onNavigate,
}: {
  data: WorkspaceData;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <nav className="flex flex-col gap-0.5 p-2 group-data-[nav-collapsed=true]/shell:px-1.5">
        {WORKSPACE_NAV.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            count={data.counts[item.type] ?? 0}
            active={navItemMatches(item, pathname)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* The shared folders, which used to be chips in a footer bar spanning
          the window. They are links into one section, so the rail is where
          they belong — and it can show more than two of them. */}
      {data.folders.length > 0 && (
        <div className="border-t border-sidebar-border p-2 group-data-[nav-collapsed=true]/shell:px-1.5">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground group-data-[nav-collapsed=true]/shell:hidden">
            Shared folders
          </p>
          {data.folders.map((f) => {
            const row = (
              <Link
                href={`/team/files?s=${encodeURIComponent(f.token)}`}
                onClick={onNavigate}
                title={collapsed ? undefined : f.title}
                className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:gap-0 group-data-[nav-collapsed=true]/shell:px-0"
              >
                <Folder className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate group-data-[nav-collapsed=true]/shell:hidden">
                  {f.title}
                </span>
              </Link>
            );
            if (!collapsed) return <div key={f.token}>{row}</div>;
            return (
              <Tooltip key={f.token}>
                <TooltipTrigger asChild>{row}</TooltipTrigger>
                <TooltipContent side="right">{f.title}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The rail's foot: who you are, the one setting a member owns, and the
 *  collapse toggle. The owner shell's equivalent strip holds four controls; a
 *  member has these, so this is the same position carrying the same weight,
 *  not the same list.
 *
 *  The toggle is the OWNER of the collapsed width — style guide §8: a collapsed
 *  rail draws no handle, because there would be nothing left to grab and
 *  dragging would fight the toggle. Collapsed, the strip stacks so both
 *  controls still fit a 3.5rem column. It is absent from the mobile drawer:
 *  a drawer is either open or closed, and collapsing one to an icon rail
 *  inside a sheet means nothing. */
function RailFoot({
  memberName,
  collapsed,
  onToggleCollapsed,
}: {
  memberName: string | null;
  collapsed?: boolean;
  /** Omitted in the mobile drawer, where collapsing has no meaning. */
  onToggleCollapsed?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-sidebar-border px-3 py-2 group-data-[nav-collapsed=true]/shell:flex-col group-data-[nav-collapsed=true]/shell:px-1.5">
      {memberName && (
        <span
          className="min-w-0 flex-1 truncate text-sm text-muted-foreground group-data-[nav-collapsed=true]/shell:hidden"
          title={memberName}
        >
          {memberName}
        </span>
      )}
      <div
        className={cn(
          'shrink-0',
          !memberName && 'ml-auto group-data-[nav-collapsed=true]/shell:ml-0',
        )}
      >
        <ThemeToggle />
      </div>
      {onToggleCollapsed && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand navigation (Ctrl+B)' : 'Collapse navigation (Ctrl+B)'}
          title={collapsed ? 'Expand navigation (⌘B)' : 'Collapse navigation (⌘B)'}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      )}
    </div>
  );
}

export function TeamWorkspaceShell({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null); // null = resolving
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Seeded from localStorage in a lazy initializer. The `typeof window` guard
  // inside the reader is load-bearing: this component DOES render on the
  // server (it returns the loading branch), and an unguarded read throws there.
  const [navWidth, setNavWidth] = useState(readStoredWidth);
  const [navCollapsed, setNavCollapsed] = useState(readStoredCollapsed);
  // True for the duration of a resize, by pointer OR keyboard. Published as
  // `data-resizing` on the shell root, where one rule suspends the width
  // transition — without it the rail eases 200ms behind the pointer.
  const [resizing, setResizing] = useState(false);
  const resizeIdle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyNavWidth = useCallback((px: number) => {
    setResizing(true);
    setNavWidth(px);
    window.localStorage.setItem(NAV_W_KEY, String(px));
    if (resizeIdle.current) clearTimeout(resizeIdle.current);
    // Restore the transition once the user stops, so a later collapse glides.
    resizeIdle.current = setTimeout(() => setResizing(false), 250);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setNavCollapsed((v) => {
      window.localStorage.setItem(NAV_COLLAPSED_KEY, v ? '0' : '1');
      return !v;
    });
  }, []);

  const refetch = useCallback(async () => {
    try {
      const r = await teamFetch('/api/team/workspace', { cache: 'no-store' });
      if (r.status === 401) {
        setAuthed(false);
        return;
      }
      if (!r.ok) return;
      setData((await r.json()) as WorkspaceData);
      setAuthed(true);
    } catch {
      // network blip — leave the current state; the member can retry
    }
  }, []);

  useEffect(() => {
    // Same-origin sessions minted in bearer mode regain the cookie the /s
    // subresources (inline-reader images, downloads, rows) authenticate by.
    void upgradeTeamCookie();
    void refetch();
  }, [refetch]);

  // ⌘/Ctrl+B collapses the rail, the same shortcut the owner shell uses —
  // suppressed while the member is typing, or ⌘B would stop bolding in every
  // composer on the surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'b') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  // No theme stamping here: the OWNER's brand + the `data-color-theme-owner`
  // lock arrive server-rendered on <html> (root layout + middleware member
  // flag) — see team-hub-client for the full rationale. Light/dark stays the
  // member's own toggle.

  if (authed === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!authed || !data) {
    return <TokenGate heading="Team Workspace" onAuthed={() => void refetch()} />;
  }

  const brand = (inDrawer: boolean) => (
    <BrandBlock
      siteName={data.siteName}
      peerName={data.peerName}
      logoVersion={data.logoVersion}
      logoDarkVersion={data.logoDarkVersion}
      // A member has no route to `/` — this surface's home is the overview.
      href="/team"
      inDrawer={inDrawer}
      onNavigate={inDrawer ? () => setMobileNavOpen(false) : undefined}
    />
  );

  return (
    <WorkspaceContext.Provider value={data}>
      <TooltipProvider delayDuration={0}>
        <div
          // `group/shell` + `data-nav-collapsed` are the SAME contract the owner
          // shell publishes, which is what lets BrandBlock — shared between the
          // two rails — render its collapsed form here without a prop. Anything
          // added to this rail later should key off the root the same way.
          //
          // `--nav-w` is published even though nothing outside the aside reads
          // it yet. The /team audit's finding was that hardcoding the width is
          // exactly how this surface drifted from the owner app; a variable
          // costs nothing and is there when something needs to frame against it.
          className="mantle-team-shell group/shell flex min-h-0 flex-1 flex-col"
          data-nav-collapsed={navCollapsed ? 'true' : 'false'}
          data-resizing={resizing ? 'true' : 'false'}
          style={{ '--nav-w': navCollapsed ? '3.5rem' : `${navWidth}px` } as React.CSSProperties}
        >
          {/* ── Mobile bar: the only chrome across the top, and only below md.
               The rail is a closed drawer at this width, so something has to
               open it and name the brain. ─────────────────────────────── */}
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar px-2 md:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0">
                <SheetTitle className="sr-only">Sections</SheetTitle>
                {brand(true)}
                <RailBody data={data} onNavigate={() => setMobileNavOpen(false)} />
                <RailFoot memberName={data.memberName} />
              </SheetContent>
            </Sheet>

            <Link
              href="/team"
              className="flex min-w-0 flex-1 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label={`${data.siteName || 'Mantle'} team home`}
            >
              <BrandLogo
                name={data.siteName || 'mantle'}
                logoVersion={data.logoVersion}
                logoDarkVersion={data.logoDarkVersion}
                imgClassName="h-7 w-auto max-w-[40vw] object-contain object-left"
                renderWordmark={(visibility) => (
                  /* Width-only clipping: the wordmark faces overshoot the em box
                   and a plain `truncate` shaves the letterforms rather than
                   ending the line. The visibility class MUST be forwarded, or a
                   brain with only a DARK logo shows wordmark and logo at once. */
                  <span
                    className={cn(
                      'wordmark -mx-1 max-w-[40vw] overflow-x-clip overflow-y-visible whitespace-nowrap px-1 leading-none text-primary-ink',
                      visibility,
                    )}
                  >
                    {data.siteName || 'mantle'}
                  </span>
                )}
              />
            </Link>
            <ThemeToggle />
          </header>

          {/* ── Body: the rail + the screen ─────────────────────────── */}
          {/* `relative` anchors the Neat backdrop below as well as the rail
              handle's positioning chain. */}
          <div className="relative flex min-h-0 flex-1">
            {/* `relative` is what the handle positions against — it is `absolute
              inset-y-0`, and the owner's rails give it a `fixed` ancestor
              instead. No `transition-[width]` here: `--nav-w` animates (see
              globals.css), and a transition on the property that READS a
              variable stops the element tracking the variable entirely. */}
            <aside className="relative hidden w-[var(--nav-w)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
              {brand(false)}
              <RailBody data={data} collapsed={navCollapsed} />
              <RailFoot
                memberName={data.memberName}
                collapsed={navCollapsed}
                onToggleCollapsed={toggleCollapsed}
              />
              {/* A collapsed rail draws no handle — the toggle owns that width
                (style guide §8), and a drag could otherwise fight it. */}
              {navCollapsed ? null : (
                <RailHandle
                  label="Resize navigation"
                  value={navWidth}
                  min={NAV_W_MIN}
                  max={NAV_W_MAX}
                  onChange={applyNavWidth}
                />
              )}
            </aside>
            {/* The saved Neat background behind the screen — the same shared-
                surface treatment the /s reader gets (honours the shareNeat
                switch). A sibling pinned to the row, not a child of <main>:
                screens scroll internally and an absolute child would scroll
                away with the content. Earlier in DOM order, so the positioned
                <main> paints over it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 right-0 md:left-[var(--nav-w)]"
            >
              <NeatSurface shared />
            </div>
            <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
          </div>
        </div>
      </TooltipProvider>
    </WorkspaceContext.Provider>
  );
}
