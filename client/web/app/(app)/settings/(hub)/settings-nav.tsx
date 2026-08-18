'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
  Spline,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { cn } from '@mantle/web-ui/lib/utils';
import { ListCard, ListCardSnippet, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import type { BackupConfig, BackupStatus, TailnetResult, UpdateCheck } from '@mantle/client-types';

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
 * ── On the stat lines ──────────────────────────────────────────────────────
 * FIVE of the thirteen carry one, and the other eight deliberately do not.
 * A stat earns its place when it is *actionable* — something you would want to
 * know before deciding whether to open the screen at all. "There are 3 merge
 * candidates waiting" and "an update is available" are the two that genuinely
 * change what you do next; MCP, network and backups answer "is this thing on,
 * and did it last work". Profile, Appearance and the rest have no such reading,
 * and a line saying "you have a profile" is noise.
 *
 * That is also thirteen-versus-five requests on merely opening `/settings`,
 * which is the other half of the argument.
 *
 * Every query below reuses the EXACT queryKey and URL of the screen it
 * describes, so the card and the screen share one react-query cache entry
 * instead of fetching the same thing twice. Opening a screen whose card has
 * already loaded is therefore free, and the card list warms the cache for it.
 *
 * This component lives in the LAYOUT, so it mounts once for the whole section
 * rather than once per navigation — the queries do not re-fire as you move
 * between cards.
 */

/** A card's one-line reading. `warn` turns it amber and adds the triangle. */
type Stat = { text: string; warn?: boolean };

type McpSettings = { enabled: boolean; clients: unknown[] };
type UpdatesData = { check: UpdateCheck };
type NetworkData = { status: TailnetResult };
type BackupsData = { config: BackupConfig; status: BackupStatus | null };

function rows(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Rough relative reading for the backups card — "3 days ago" is what you want
 *  at a glance; the screen itself shows the exact timestamp. Only ever called
 *  with resolved query data, which never exists during a server render, so the
 *  clock cannot cause a hydration mismatch. */
function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${rows(hours, 'hour')} ago`;
  return `${rows(Math.round(hours / 24), 'day')} ago`;
}

function useSettingsStats(): Record<string, Stat | undefined> {
  // Each of these five keys/URLs is copied from the screen it describes.
  const updates = useQuery({
    queryKey: ['updates'],
    queryFn: () => apiFetch<UpdatesData>('/api/updates'),
    staleTime: 30_000,
  });
  const entities = useQuery({
    queryKey: ['entities', 'candidates'],
    queryFn: () => apiFetch<{ candidates: unknown[] }>('/api/entities/candidates'),
    staleTime: 30_000,
  });
  const mcp = useQuery({
    queryKey: ['mcp-settings'],
    queryFn: () => apiFetch<McpSettings>('/api/mcp-settings'),
    staleTime: 30_000,
  });
  const network = useQuery({
    queryKey: ['network'],
    queryFn: () => apiFetch<NetworkData>('/api/network'),
    staleTime: 30_000,
  });
  const backups = useQuery({
    queryKey: ['backups'],
    queryFn: () => apiFetch<BackupsData>('/api/backups'),
    staleTime: 30_000,
  });

  const stats: Record<string, Stat | undefined> = {};

  if (updates.data) {
    const c = updates.data.check;
    stats['/settings/updates'] = c.error
      ? { text: `${c.currentVersion} · couldn’t check for updates`, warn: true }
      : c.updateAvailable
        ? {
            // `version` and not `tag`: the tag carries a leading `v` that
            // `currentVersion` does not, and "0.230.66 → v0.230.67" reads like
            // two different kinds of thing.
            text: `${c.currentVersion} → ${c.latest?.version ?? 'newer'} available`,
            warn: true,
          }
        : { text: `${c.currentVersion} · up to date` };
  }

  if (entities.data) {
    const n = entities.data.candidates.length;
    stats['/settings/entities'] =
      n > 0
        ? { text: `${rows(n, 'merge candidate')} waiting`, warn: true }
        : { text: 'nothing to review' };
  }

  if (mcp.data) {
    const n = mcp.data.clients.length;
    stats['/settings/mcp'] = mcp.data.enabled
      ? { text: `on · ${rows(n, 'client')} connected` }
      : { text: 'off' };
  }

  if (network.data) {
    const st = network.data.status;
    stats['/settings/network'] = !st.available
      ? { text: st.reason }
      : st.backendState === 'Running'
        ? { text: `connected · ${rows(st.peers.length, 'device')}` }
        : { text: st.backendState.toLowerCase(), warn: true };
  }

  if (backups.data) {
    const { config, status } = backups.data;
    stats['/settings/backups'] = !config.enabled
      ? { text: 'off — no scheduled backups' }
      : !status
        ? { text: `${config.frequency}, never run yet`, warn: true }
        : status.ok
          ? { text: `last backup ${ago(status.lastRunAt)}` }
          : { text: `last backup FAILED ${ago(status.lastRunAt)}`, warn: true };
  }

  return stats;
}

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
  const stats = useSettingsStats();

  return (
    <div
      data-testid="settings-nav"
      className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin"
    >
      {SCREENS.map((screen) => {
        // `startsWith`, so a sub-route keeps its parent card selected —
        // `/settings/network/connect` is still Local network.
        const active = pathname.startsWith(screen.href);
        const stat = stats[screen.href];
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
                {stat && (
                  <div
                    data-testid="settings-nav-stat"
                    className={cn(
                      'mt-1 flex items-center gap-1 text-xs tabular-nums',
                      stat.warn ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                    )}
                  >
                    {stat.warn && <TriangleAlert className="size-3 shrink-0" aria-hidden />}
                    <span className="truncate">{stat.text}</span>
                  </div>
                )}
              </div>
            </Link>
          </ListCard>
        );
      })}
    </div>
  );
}
