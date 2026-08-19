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
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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
  PenTool,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { navItemMatches } from '@mantle/web-ui/layout/nav-items';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@mantle/web-ui/ui/sheet';
import { ThemeToggle } from '@mantle/web-ui/theme-toggle';
import { BrandBlock } from '@/components/layout/rail/brand-block';
import { BrandLogo } from '@/components/layout/rail/brand-logo';
import { TokenGate } from '@/components/team-chat/token-gate';
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
 *  a coloured accent tint muddies grey text there. */
function NavRow({
  item,
  count,
  active,
  onNavigate,
}: {
  item: (typeof WORKSPACE_NAV)[number];
  count: number;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{item.name}</span>
      {count > 0 && (
        <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[11px]">
          {count > 99 ? '99+' : count}
        </Badge>
      )}
    </Link>
  );
}

/** Everything between the brand block and the rail's foot. Shared by the aside
 *  and the mobile drawer so the two cannot drift. */
function RailBody({ data, onNavigate }: { data: WorkspaceData; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <nav className="flex flex-col gap-0.5 p-2">
        {WORKSPACE_NAV.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            count={data.counts[item.type] ?? 0}
            active={navItemMatches(item, pathname)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* The shared folders, which used to be chips in a footer bar spanning
          the window. They are links into one section, so the rail is where
          they belong — and it can show more than two of them. */}
      {data.folders.length > 0 && (
        <div className="border-t border-sidebar-border p-2">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Shared folders
          </p>
          {data.folders.map((f) => (
            <Link
              key={f.token}
              href={`/team/files?s=${encodeURIComponent(f.token)}`}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <Folder className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{f.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** The rail's foot: who you are, and the one setting a member owns. The owner
 *  shell's equivalent strip holds four controls; a member has one, so this is
 *  the same position carrying the same weight, not the same list. */
function RailFoot({ memberName }: { memberName: string | null }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-sidebar-border px-3 py-2">
      {memberName && (
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={memberName}>
          {memberName}
        </span>
      )}
      <div className={cn('shrink-0', !memberName && 'ml-auto')}>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function TeamWorkspaceShell({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null); // null = resolving
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      <div className="flex min-h-0 flex-1 flex-col">
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
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            {brand(false)}
            <RailBody data={data} />
            <RailFoot memberName={data.memberName} />
          </aside>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
