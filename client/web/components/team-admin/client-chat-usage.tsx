'use client';

/**
 * Team admin > Clients > Chat use today (client logins C4). Each client
 * login chats with the client-level agent within a daily limit, in turns
 * and in tokens (per login, per UTC day); this card shows how far each one
 * is today, so an admin can tell a client who "cannot send" why. A brain
 * before C4 answers 404 here: the card is left out.
 */
import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import type { ClientLoginRow } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { cn } from '@mantle/web-ui/lib/utils';
// Relative, not '@/': the node test runner renders this
// (client-chat-usage.test.ts).
import {
  CLIENT_CHAT_USAGE_KEY,
  CLIENT_CHAT_USAGE_PATH,
  isUsageMissing,
  usageLimitsText,
  usageLine,
  usageRows,
  type UsageRow,
} from '../../lib/client-chat-usage';
import type { ClientChatUsage } from '../../lib/contract-next';

/** The card: owns the query; the markup is the view. */
export function ClientChatUsagePanel({ clients }: { clients: readonly ClientLoginRow[] }) {
  const q = useQuery({
    queryKey: CLIENT_CHAT_USAGE_KEY,
    queryFn: () => apiFetch<ClientChatUsage>(CLIENT_CHAT_USAGE_PATH),
    // The day's use moves: ask again each time the tab opens.
    refetchOnMount: 'always',
    // A 404 is a brain before C4, not a hiccup: no retry.
    retry: (count, err) => !isUsageMissing(err) && count < 1,
  });
  if (q.isPending || clients.length === 0) return null;
  if (q.isError) {
    if (isUsageMissing(q.error)) return null;
    return (
      <section className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Couldn&apos;t load the clients&apos; chat use.
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Retry
        </Button>
      </section>
    );
  }
  return <ClientChatUsageView rows={usageRows(clients, q.data)} limits={q.data.limits} />;
}

/** The card as markup: no state and no requests (the tests render it). */
export function ClientChatUsageView({
  rows,
  limits,
}: {
  rows: readonly UsageRow[];
  limits: ClientChatUsage['limits'];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card text-card-foreground"
      aria-labelledby="client-chat-usage-title"
    >
      <div className="border-b border-border p-4">
        <h2 id="client-chat-usage-title" className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="size-4 text-muted-foreground" aria-hidden />
          Chat use today
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{usageLimitsText(limits)}</p>
      </div>
      <ul className="divide-y divide-border" aria-label="Chat use today">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3"
          >
            <span className="min-w-0 truncate text-sm font-medium">{r.name}</span>
            <span
              className={cn('text-xs', r.atLimit ? 'text-warning-ink' : 'text-muted-foreground')}
            >
              {usageLine(r, limits)}
              {r.atLimit ? ' · limit reached' : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
