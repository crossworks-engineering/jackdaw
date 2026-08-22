'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, MoreHorizontal, Search, Star, X } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Input } from '@mantle/web-ui/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@mantle/web-ui/ui/tooltip';
import { useRealtime } from '@/components/realtime/use-realtime';
import { useGroupHead } from '@/lib/nav-usage';
import { activeNavHref } from '@/lib/nav-active';
import { favoriteItems, useNavFavorites } from '@/lib/nav-favorites';
import {
  NAV_GROUPS,
  type NavGroup as BaseNavGroup,
  type NavItem as BaseNavItem,
} from '@mantle/web-ui/layout/nav-items';

/** A rendered nav item may carry a live badge (e.g. Pending approvals). */
type NavItem = BaseNavItem & { badge?: number };

type NavGroup = BaseNavGroup & { items: NavItem[] };

/** Expanded group labels, comma-separated. Mirrors the rail-collapse cookies:
 *  the server seeds first paint from it so a fold never flashes open. */
const GROUPS_COOKIE = 'mantle_nav_groups';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeGroupsCookie(labels: string[]): void {
  document.cookie = `${GROUPS_COOKIE}=${encodeURIComponent(labels.join(','))}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export function SidebarNav({
  pendingApprovals,
  onNavigate,
  collapsed = false,
  initialExpandedGroups = [],
  onRequestExpandRail,
}: {
  pendingApprovals: number;
  onNavigate?: () => void;
  /** Icon-rail mode: hide the filter box + labels, show a tooltip hint per item.
   *  The mobile drawer always passes false (it renders expanded). */
  collapsed?: boolean;
  /** Groups the user last left open, read from the cookie server-side. */
  initialExpandedGroups?: string[];
  /** Icon rail only: open the full nav so a folded group can be read. */
  onRequestExpandRail?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>(initialExpandedGroups);
  // Live pending-approval badge: when a tool call is queued/approved/rejected
  // anywhere (a chat turn, a heartbeat fire, a Telegram tap), the realtime
  // bridge pings us and we refetch the server-computed count. No polling.
  useRealtime(['pending_tool_call'], () => router.refresh());

  const { favorites, isFavorite, toggleFavorite } = useNavFavorites();

  // The shared nav list, with the live pending-approvals badge injected onto
  // the Pending item at render time.
  //
  // Every screen is a row again. Thirteen of them were briefly folded behind a
  // single "Settings" row pointing at a card hub; that is undone, so the menu
  // filter finds "Backups" or "Audit log" by typing again rather than only ⌘K.
  const groups: NavGroup[] = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((item) =>
      item.href === '/pending' ? { ...item, badge: pendingApprovals } : item,
    ),
  }));

  // Favorites is a VIEW over the groups above, not a place items move to: a
  // starred screen keeps its home row, exactly as pinning works everywhere
  // else. `favoriteItems` resolves each href against the LIVE list, which is
  // what stops a star on a since-retired route becoming a dead row.
  const pinned = favoriteItems(favorites, groups);
  // Not collapsible: a list the owner curated by hand is already the short
  // list, so ranking a head out of it would be second-guessing them. Absent
  // entirely when nothing is starred — an empty heading is worse than none,
  // and it is how this stays invisible until someone uses it.
  const allGroups: NavGroup[] =
    pinned.length > 0 ? [{ label: 'Favorites', items: pinned }, ...groups] : groups;

  // Most-specific-wins rather than a per-item match: "Settings" at `/settings`
  // is a prefix of every other settings route, so an independent test would
  // light it beside Agents on `/settings/agents`.
  const activeHref = activeNavHref(allGroups, pathname);
  const isActive = (item: NavItem) => item.href === activeHref;

  // Filter by item name (case-insensitive substring), dropping now-empty groups.
  // The filter is an expanded-only affordance — at icon-rail width there's no
  // box to type in, so a collapsed rail always shows its heads unfiltered.
  const q = query.trim().toLowerCase();
  const filtering = !collapsed && q.length > 0;
  const visibleGroups = filtering
    ? allGroups
        .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length > 0)
    : allGroups;

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      writeGroupsCookie(next);
      return next;
    });
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item);
    const Icon = item.icon;
    const hasBadge = item.badge != null && item.badge > 0;
    const className = cn(
      'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:gap-0 group-data-[nav-collapsed=true]/shell:px-0',
      active
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
    );
    const inner = (
      <>
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate group-data-[nav-collapsed=true]/shell:hidden">
          {item.name}
        </span>
        {hasBadge && (
          <>
            <Badge
              variant="secondary"
              className="h-5 min-w-5 justify-center px-1.5 text-[11px] group-data-[nav-collapsed=true]/shell:hidden"
            >
              {item.badge! > 99 ? '99+' : item.badge}
            </Badge>
            {/* Collapsed: a dot stands in for the count. */}
            <span
              className="absolute right-1.5 top-1.5 hidden size-2 rounded-full bg-primary ring-2 ring-sidebar group-data-[nav-collapsed=true]/shell:block"
              aria-hidden
            />
          </>
        )}
      </>
    );

    const trigger = (
      <Link
        href={item.href}
        onClick={() => onNavigate?.()}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? undefined : item.name}
        className={cn(className, !collapsed && 'min-w-0 flex-1')}
      >
        {inner}
      </Link>
    );

    // Collapsed rail: the label lives in a shadcn tooltip on hover/focus, and
    // there is no star — an icon column has no room for a second control, and
    // the gesture belongs where the labels are.
    if (collapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.name}
            {hasBadge && (
              <span className="rounded bg-primary-foreground/20 px-1 text-[10px] tabular-nums">
                {item.badge! > 99 ? '99+' : item.badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    const starred = isFavorite(item.href);
    return (
      // A SIBLING of the link, never inside it: nested interactive elements are
      // invalid, and a star within the anchor would navigate as well as toggle.
      <div key={item.href} className="group/nav-row flex items-center gap-0.5">
        {trigger}
        <button
          type="button"
          onClick={() => toggleFavorite(item.href)}
          aria-pressed={starred}
          aria-label={
            starred ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`
          }
          title={starred ? 'Remove from favorites' : 'Add to favorites'}
          className={cn(
            'shrink-0 rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            // Quiet until wanted: fifty always-lit stars would compete with the
            // labels they sit beside. It still occupies its space when hidden,
            // so no row jumps when the pointer arrives.
            starred
              ? 'text-foreground/70 hover:text-foreground'
              : 'text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/nav-row:opacity-100',
          )}
        >
          <Star className={cn('size-3.5', starred && 'fill-current')} aria-hidden />
        </button>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <nav
        className="flex flex-col gap-4 px-3 py-3 group-data-[nav-collapsed=true]/shell:px-2"
        aria-label="Primary"
      >
        {/* Quick filter — expanded mode only (hidden at icon-rail width). While a
            query is live it reaches into folded groups too, so this is also how
            you see the whole map without unfolding anything by hand. */}
        {!collapsed && (
          <div className="sticky top-0 z-10 -mt-3 -mx-3 bg-sidebar px-3 pb-2 pt-3 group-data-[nav-collapsed=true]/shell:hidden">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                placeholder="Filter menu…"
                aria-label="Filter navigation"
                className="h-9 pl-8 pr-8"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {visibleGroups.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>
        ) : (
          visibleGroups.map((group) => (
            <NavGroupBlock
              key={group.label}
              group={group}
              collapsed={collapsed}
              filtering={filtering}
              expanded={expandedGroups.includes(group.label)}
              onToggle={() => toggleGroup(group.label)}
              isActive={isActive}
              renderItem={renderItem}
              onRequestExpandRail={onRequestExpandRail}
            />
          ))
        )}
      </nav>
    </TooltipProvider>
  );
}

/**
 * One group. Non-collapsible groups render whole, exactly as before.
 *
 * A collapsible group has two readings. Folded, it shows its head — the few
 * destinations this owner actually returns to. Open, it shows every item in
 * sidebar order, because that is the map and a map wants a stable shape rather
 * than a useful one. Folded is speed; open is orientation.
 */
function NavGroupBlock({
  group,
  collapsed,
  filtering,
  expanded,
  onToggle,
  isActive,
  renderItem,
  onRequestExpandRail,
}: {
  group: NavGroup;
  collapsed: boolean;
  filtering: boolean;
  expanded: boolean;
  onToggle: () => void;
  isActive: (item: NavItem) => boolean;
  renderItem: (item: NavItem) => React.ReactNode;
  onRequestExpandRail?: () => void;
}) {
  const head = useGroupHead(group);

  if (!group.collapsible) {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-data-[nav-collapsed=true]/shell:hidden">
          {group.label}
        </p>
        {group.items.map(renderItem)}
      </div>
    );
  }

  const headHrefs = new Set(head.map((i) => i.href));
  // Working inside a folded group's tail: unfold it and keep it open, or the
  // screen you are on has no row and the fold fights you on every click.
  const activeInTail = group.items.some((i) => isActive(i) && !headHrefs.has(i.href));
  // A live filter reaches into every group; so does an active tail route.
  const open = expanded || filtering || activeInTail;
  const shown = open ? group.items : head;
  const hiddenCount = group.items.length - head.length;

  // Icon rail: heads only, plus one control that opens the full nav. The rail
  // showed all fifty icons before, which is the hardest place to scan and the
  // least able to explain itself.
  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5">
        {head.map(renderItem)}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRequestExpandRail}
              aria-label={`Show all ${group.label.toLowerCase()}`}
              className="flex items-center justify-center rounded-md px-0 py-2 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4 shrink-0" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Show all {group.label.toLowerCase()}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  const listId = `nav-group-${group.label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        className="flex items-center gap-1 rounded px-3 pb-1 pt-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[nav-collapsed=true]/shell:hidden"
      >
        <ChevronRight
          className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        {group.label}
      </button>
      <div id={listId} className="flex flex-col gap-0.5">
        {shown.map(renderItem)}
        {!open && hiddenCount > 0 && (
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-3 rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
              <MoreHorizontal className="size-3.5" />
            </span>
            Show all {group.items.length}
          </button>
        )}
      </div>
    </div>
  );
}
