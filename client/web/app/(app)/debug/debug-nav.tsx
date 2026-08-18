'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Coins,
  Gauge,
  Lightbulb,
  MessagesSquare,
  Newspaper,
  Route,
  ScanSearch,
  Send,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { formatMicroUsd } from '@mantle/web-ui/traces-format';
import { cn } from '@mantle/web-ui/lib/utils';
import { ListCard, ListCardSnippet, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import type {
  AgentActivityRow,
  AgentSpend,
  ContentIndexCoverage,
  DuplicateEdgeStats,
  FactCostCapStats,
  PersonaNotesRow,
  ToolValidationAgg,
  TopError,
  Traffic,
} from '@mantle/client-types';
import type { ActivityItem } from '@mantle/client-types/journey-format';

/**
 * The debug section's list column: one `ListCard` per tab, each carrying what
 * the tab is for and the one number worth knowing before you open it.
 *
 * This replaced a horizontal tab strip. Twelve tabs never fitted the row — it
 * scrolled sideways, so half the section was permanently off-screen — and a
 * tab label alone cannot say "there are 3 duplicate edges in here". A card can,
 * and the section now reads like every other workspace screen (§8).
 *
 * ── On the stat queries ────────────────────────────────────────────────────
 * Every query below reuses the EXACT queryKey and URL of the tab it describes,
 * so the cards and the tab share one react-query cache entry instead of
 * fetching the same thing twice. Opening a tab whose card is already loaded is
 * therefore free, and the card list warms the cache for the rest.
 *
 * This component lives in the LAYOUT, so it mounts once for the whole section
 * rather than once per navigation — the queries do not re-fire as you move
 * between tabs.
 *
 * Two tabs deliberately have NO live stat: `sanity` runs its checks when asked
 * and `integrity`'s corpus audit is a full scan, so fetching either just to
 * decorate a card would make opening /debug do real work on the box. Integrity
 * borrows the overview bundle's cheap counters instead; sanity says plainly
 * that it runs on open.
 */

type OverviewBundle = {
  traffic24h: Traffic;
  spend7d: AgentSpend[];
  errors7d: TopError[];
  dupes: DuplicateEdgeStats;
  coverage: ContentIndexCoverage;
  factCap7d: FactCostCapStats[];
};

type ToolValidationBundle = {
  mode: 'off' | 'warn' | 'enforce';
  byTool: ToolValidationAgg[];
};

/** A card's one-line reading. `warn` turns it amber and adds the triangle. */
type Stat = { text: string; warn?: boolean };

type Tab = {
  href: string;
  label: string;
  exact?: boolean;
  icon: LucideIcon;
  description: string;
};

const TABS: Tab[] = [
  {
    href: '/debug',
    label: 'Overview',
    exact: true,
    icon: Gauge,
    description: 'Traffic, spend, embed cache and failures at a glance.',
  },
  {
    href: '/debug/spend',
    label: 'Spend',
    icon: Coins,
    description: 'Token cost broken down by model and by agent, last 7 days.',
  },
  {
    href: '/debug/topics',
    label: 'Topics',
    icon: MessagesSquare,
    description: 'Conversation topics the brain has clustered out of your turns.',
  },
  {
    href: '/debug/digests',
    label: 'Digests',
    icon: Newspaper,
    description: 'Rolled-up summaries the digest job has written.',
  },
  {
    href: '/debug/facts',
    label: 'Facts',
    icon: Lightbulb,
    description: 'Facts the extractor pulled out of your content.',
  },
  {
    href: '/debug/context',
    label: 'Context',
    icon: ScanSearch,
    description: 'Per-turn retrieval audit: the question, the context sent, the reply.',
  },
  {
    href: '/debug/agents',
    label: 'Agents',
    icon: Bot,
    description: "Configured agents and the reflector's persona notes.",
  },
  {
    href: '/debug/telegram',
    label: 'Telegram',
    icon: Send,
    description: 'Paired chats and the traffic that came through them.',
  },
  {
    href: '/debug/journey',
    label: 'Journey',
    icon: Route,
    description: 'The activity → reaction feed, one action at a time.',
  },
  {
    href: '/debug/integrity',
    label: 'Integrity',
    icon: ShieldCheck,
    description: 'What lands in the brain as you add it, plus a corpus invariant scan.',
  },
  {
    href: '/debug/tool-validation',
    label: 'Tool validation',
    icon: Wrench,
    description: 'What the central arg validator flagged, and what enforce would bounce.',
  },
  {
    href: '/debug/sanity',
    label: 'Sanity check',
    icon: Stethoscope,
    description: 'Config-correctness checks, each failure shown with its fix.',
  },
];

/** The paginated debug lists all answer `{ …rows, total }` and all key on
 *  `{ page, query }`. Page 1 with no search is exactly what the tab requests
 *  when you land on it, so this shares that cache entry rather than adding one. */
function useListTotal(kind: string) {
  return useQuery({
    queryKey: ['debug', kind, { page: 1, query: '' }],
    queryFn: () => apiFetch<{ total: number }>(`/api/debug/${kind}?page=1`),
    staleTime: 30_000,
  });
}

function useDebugStats(): Record<string, Stat | undefined> {
  const overview = useQuery({
    queryKey: ['debug', 'overview'],
    queryFn: () => apiFetch<OverviewBundle>('/api/debug/overview'),
    staleTime: 30_000,
  });
  const topics = useListTotal('topics');
  const digests = useListTotal('digests');
  const facts = useListTotal('facts');
  const telegram = useListTotal('telegram');
  const context = useListTotal('context');
  const agents = useQuery({
    queryKey: ['debug', 'agents'],
    queryFn: () =>
      apiFetch<{ agents: AgentActivityRow[]; personaNotes: PersonaNotesRow[] }>(
        '/api/debug/agents',
      ),
    staleTime: 30_000,
  });
  const journey = useQuery({
    queryKey: ['debug', 'journey', { category: 'all', processedOnly: false }],
    queryFn: () => apiFetch<{ items: ActivityItem[] }>('/api/debug/journey'),
    staleTime: 30_000,
  });
  const toolValidation = useQuery({
    queryKey: ['debug', 'tool-validation', 7],
    queryFn: () => apiFetch<ToolValidationBundle>('/api/debug/tool-validation?days=7'),
    staleTime: 30_000,
  });

  const stats: Record<string, Stat | undefined> = {};

  const o = overview.data;
  if (o) {
    const ok =
      o.traffic24h.count > 0
        ? ((o.traffic24h.count - o.traffic24h.errorCount) / o.traffic24h.count) * 100
        : 100;
    stats['/debug'] =
      o.traffic24h.count === 0
        ? { text: 'no traces in the last 24h' }
        : {
            text: `${o.traffic24h.count} traces · ${ok.toFixed(0)}% ok (24h)`,
            warn: o.traffic24h.errorCount > 0,
          };

    const spend = o.spend7d.reduce((sum, a) => sum + a.costMicroUsd, 0);
    stats['/debug/spend'] = {
      text: `${formatMicroUsd(spend)} across ${o.spend7d.length} agent${
        o.spend7d.length === 1 ? '' : 's'
      } (7d)`,
    };

    // Integrity's own endpoints are a live feed and a full corpus scan, so its
    // card reads the overview's cheap counters instead. Duplicate edges are the
    // actionable half — they name a CLI fix.
    const dropped = o.factCap7d.reduce((sum, f) => sum + f.factsDropped, 0);
    stats['/debug/integrity'] =
      o.dupes.redundant > 0
        ? { text: `${o.dupes.redundant} duplicate edges — run pnpm dedupe:edges`, warn: true }
        : {
            text:
              o.coverage.total === 0
                ? 'nothing indexed yet'
                : `${o.coverage.indexed}/${o.coverage.total} indexed · no duplicate edges`,
          };

    if (dropped > 0) {
      stats['/debug/facts'] = {
        text: `${dropped} facts dropped to the cost cap (7d)`,
        warn: true,
      };
    }
  }

  // The plain row counts. Facts keeps a cost-cap warning above if it has one —
  // a count is the less urgent reading of the two.
  if (topics.data) stats['/debug/topics'] = { text: rows(topics.data.total, 'topic') };
  if (digests.data) stats['/debug/digests'] = { text: rows(digests.data.total, 'digest') };
  if (facts.data && !stats['/debug/facts'])
    stats['/debug/facts'] = { text: rows(facts.data.total, 'fact') };
  if (telegram.data) stats['/debug/telegram'] = { text: rows(telegram.data.total, 'chat') };
  // `rows` pluralises the LAST word, so the noun has to be the last word:
  // 'turn audited' would read "0 turn auditeds".
  if (context.data)
    stats['/debug/context'] = { text: `${rows(context.data.total, 'turn')} audited` };

  if (agents.data) {
    const notes = agents.data.personaNotes.length;
    stats['/debug/agents'] = {
      text: `${rows(agents.data.agents.length, 'agent')}${
        notes > 0 ? ` · ${rows(notes, 'persona note')}` : ''
      }`,
    };
  }

  if (journey.data) stats['/debug/journey'] = { text: rows(journey.data.items.length, 'action') };

  if (toolValidation.data) {
    const flagged = toolValidation.data.byTool.reduce((sum, t) => sum + t.flaggedCalls, 0);
    stats['/debug/tool-validation'] =
      flagged > 0
        ? { text: `${flagged} flagged calls · mode ${toolValidation.data.mode} (7d)`, warn: true }
        : { text: `nothing flagged · mode ${toolValidation.data.mode} (7d)` };
  }

  // Not a live reading — see the note at the top of the file. Said out loud so
  // a blank line under this card doesn't read as "nothing to report".
  stats['/debug/sanity'] = { text: 'runs its checks when you open it' };

  return stats;
}

function rows(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function DebugNav() {
  const pathname = usePathname();
  const stats = useDebugStats();

  return (
    <div
      data-testid="debug-nav"
      className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin"
    >
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const stat = stats[tab.href];
        const Icon = tab.icon;
        return (
          <ListCard key={tab.href} asChild selected={active} data-testid="debug-nav-card">
            <Link href={tab.href} className="flex items-start gap-2.5">
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <ListCardTitle>{tab.label}</ListCardTitle>
                <ListCardSnippet>{tab.description}</ListCardSnippet>
                {stat && (
                  <div
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
