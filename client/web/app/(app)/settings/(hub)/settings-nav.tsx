'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Blocks,
  CalendarDays,
  DatabaseBackup,
  FileKey,
  GitMerge,
  Mailbox,
  Network,
  Palette,
  ScrollText,
  Shapes,
  UserRound,
  Spline,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { ListCard, ListCardSnippet, ListCardTitle } from '@mantle/web-ui/ui/list-card';

/**
 * The settings hub's list column: one `ListCard` per single-panel settings
 * screen, carrying what the screen is for.
 *
 * ── Why only these thirteen ────────────────────────────────────────────────
 * Half the settings cluster is a master-detail screen with a COLLECTION behind
 * it (accounts, agents, API keys, tools…). Those are already "a list of
 * things" and stay outside this hub — a list inside a list helps nobody. What
 * is left is thirteen single panels that had no list at all, each centring
 * itself in a column no divider governed. This is their list.
 *
 * ── On stats ───────────────────────────────────────────────────────────────
 * `/debug`'s cards each carry a live number, and the plan for this hub wants
 * the same for the five worth knowing before you click (updates, entities,
 * mcp, network, backups). They are deliberately NOT in this first pass: the
 * shape and the deep links are worth proving on their own, and a stat query
 * per card means thirteen requests fired by merely opening `/settings`. When
 * they land they must reuse each screen's OWN react-query key and URL, so the
 * card and the screen share one cache entry instead of fetching twice.
 */

type Screen = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

const SCREENS: Screen[] = [
  {
    href: '/settings/profile',
    label: 'Profile',
    icon: UserRound,
    description: 'Your name, timezone, locale and reminder preferences.',
  },
  {
    href: '/settings/appearance',
    label: 'Appearance',
    icon: Palette,
    description: 'Light or dark, and which colour theme the whole app wears.',
  },
  {
    href: '/settings/microsoft',
    label: 'Microsoft 365',
    icon: Blocks,
    description: 'Connect SharePoint, OneDrive and Outlook, and pick what syncs.',
  },
  {
    href: '/settings/calendar',
    label: 'Calendars',
    icon: CalendarDays,
    description: 'Subscribed calendar feeds and how often each one refreshes.',
  },
  {
    href: '/settings/discover',
    label: 'Discover contacts',
    icon: Mailbox,
    description: 'People who recently emailed you but are not contacts yet.',
  },
  {
    href: '/settings/mcp',
    label: 'MCP connector',
    icon: Shapes,
    description: 'Remote MCP servers this brain can reach, and their live status.',
  },
  {
    href: '/settings/embedding',
    label: 'Embedding',
    icon: Spline,
    description: 'The embedder behind search and recall — model, route and backup.',
  },
  {
    href: '/settings/network',
    label: 'Local network',
    icon: Network,
    description: 'Reach this brain from your other devices, over the LAN or a tailnet.',
  },
  {
    href: '/settings/entities',
    label: 'Entities',
    icon: GitMerge,
    description: 'People and things the brain thinks may be duplicates of each other.',
  },
  {
    href: '/settings/pdf-passwords',
    label: 'PDF passwords',
    icon: FileKey,
    description: 'Passwords tried, in order, when a locked PDF arrives.',
  },
  {
    href: '/settings/backups',
    label: 'Backups',
    icon: DatabaseBackup,
    description: 'Scheduled local database backups, and what to keep.',
  },
  {
    href: '/settings/updates',
    label: 'Updates',
    icon: Bell,
    description: 'The build you are on, the latest release, and one-click upgrade.',
  },
  {
    href: '/settings/audit',
    label: 'Audit log',
    icon: ScrollText,
    description: 'Who did what, when — filterable by actor, action and date.',
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div
      data-testid="settings-nav"
      className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin"
    >
      {SCREENS.map((screen) => {
        // `startsWith`, so a sub-route keeps its parent card selected —
        // `/settings/network/connect` is still Local network.
        const active = pathname.startsWith(screen.href);
        const Icon = screen.icon;
        return (
          <ListCard key={screen.href} asChild selected={active} data-testid="settings-nav-card">
            <Link href={screen.href} className="flex items-start gap-2.5">
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <ListCardTitle>{screen.label}</ListCardTitle>
                <ListCardSnippet>{screen.description}</ListCardSnippet>
              </div>
            </Link>
          </ListCard>
        );
      })}
    </div>
  );
}
