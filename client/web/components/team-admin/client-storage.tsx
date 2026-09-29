'use client';

/**
 * Team admin > Clients > Client storage (client logins C5 audit fixes):
 * what the clients' own spaces hold against the brain's caps, per client,
 * and the quota refusals of the last 7 days. A brain before the fix answers
 * 404 here: the card is left out, and not asked again in the page load.
 */
import { useQuery } from '@tanstack/react-query';
import { HardDrive } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { cn } from '@mantle/web-ui/lib/utils';
// Relative, not '@/': the node test runner renders this
// (client-storage.test.ts).
import { askUnlessMissing, isMissingRoute } from '../../lib/client-requests';
import {
  CLIENT_STORAGE_KEY,
  CLIENT_STORAGE_PATH,
  nearCap,
  refusalLine,
  storageLimitsText,
  storageRowLine,
  storageRowName,
  storageTotalLine,
} from '../../lib/client-spaces-admin';
import type { ClientStorageUsage } from '../../lib/contract-next';

/** The card: owns the query; the markup is the view. */
export function ClientStoragePanel() {
  const q = useQuery({
    queryKey: CLIENT_STORAGE_KEY,
    queryFn: () =>
      askUnlessMissing(CLIENT_STORAGE_PATH, () =>
        apiFetch<ClientStorageUsage>(CLIENT_STORAGE_PATH),
      ),
    // Use moves: ask again each time the tab opens (never on a 404).
    refetchOnMount: 'always',
    retry: (count, err) => !isMissingRoute(err) && count < 1,
  });
  if (q.isPending) return null;
  if (q.isError) {
    if (isMissingRoute(q.error)) return null;
    return (
      <section className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Couldn&apos;t load the clients&apos; storage.
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Retry
        </Button>
      </section>
    );
  }
  return <ClientStorageView usage={q.data} />;
}

/** The card as markup: no state and no requests (the tests render it). */
export function ClientStorageView({ usage }: { usage: ClientStorageUsage }) {
  const { limits } = usage;
  return (
    <section
      className="rounded-lg border border-border bg-card text-card-foreground"
      aria-labelledby="client-storage-title"
    >
      <div className="border-b border-border p-4">
        <h2 id="client-storage-title" className="flex items-center gap-2 text-sm font-semibold">
          <HardDrive className="size-4 text-muted-foreground" aria-hidden />
          Client storage
        </h2>
        <p
          className={cn(
            'mt-0.5 text-sm',
            nearCap(usage.totalUsedBytes, limits.totalBytes)
              ? 'text-warning-ink'
              : 'text-foreground',
          )}
        >
          {storageTotalLine(usage)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{storageLimitsText(limits)}</p>
      </div>
      {usage.rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No client has stored anything yet.</p>
      ) : (
        <ul className="divide-y divide-border" aria-label="Storage by client">
          {usage.rows.map((r) => (
            <li
              key={r.loginId}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3"
            >
              <span className="min-w-0 truncate text-sm font-medium">{storageRowName(r)}</span>
              <span
                className={cn(
                  'text-xs',
                  nearCap(r.usedBytes, limits.perClientBytes) || r.items >= limits.itemLimit
                    ? 'text-warning-ink'
                    : 'text-muted-foreground',
                )}
              >
                {storageRowLine(r, limits)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {usage.refusals.length > 0 ? (
        <div className="border-t border-border p-4">
          <h3 className="text-xs font-semibold">Refused in the last 7 days</h3>
          <ul
            className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted-foreground scrollbar-thin"
            aria-label="Refused uploads"
          >
            {usage.refusals.map((r, i) => (
              <li key={`${r.at}:${i}`}>{refusalLine(r, usage.rows)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
