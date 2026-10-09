'use client';

/**
 * What a member's app did (access matrix N3), in plain words: who, what,
 * a mark on writes with the write's input, and refusals. Read from
 * GET /api/apps/members/:id/activity; shown in the review screen's
 * Activity view (moved from Team admin > Member apps, 2026-10-09).
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
import {
  REVIEW_APPS_KEY,
  activityLabel,
  activityRefused,
  activityWho,
  activityWrite,
  reviewAppPath,
  type MemberAppActivity,
} from '@/lib/space-apps';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActivityRow({ e }: { e: MemberAppActivity }) {
  const write = activityWrite(e);
  const refused = activityRefused(e);
  return (
    <li className="space-y-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="shrink-0 text-muted-foreground">{fmt(e.createdAt)}</span>
        <span className="shrink-0 font-medium">{activityWho(e)}</span>
        <span className="min-w-0 truncate">{activityLabel(e)}</span>
        {write ? <Badge variant="outline">Write</Badge> : null}
        {refused ? <Badge variant="secondary">Refused</Badge> : null}
      </div>
      {refused ? <p className="text-muted-foreground">{refused}</p> : null}
      {write?.input ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">Input</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 scrollbar-thin">
            {write.input}
          </pre>
        </details>
      ) : null}
    </li>
  );
}

export function MemberAppActivity({ id }: { id: string }) {
  const q = useQuery({
    queryKey: [...REVIEW_APPS_KEY, id, 'activity'],
    queryFn: () =>
      apiFetch<{ entries: MemberAppActivity[] }>(reviewAppPath(id, 'activity')).then(
        (r) => r.entries,
      ),
  });
  if (q.isPending) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (q.isError) {
    return <p className="text-xs text-destructive-ink">Could not load the activity.</p>;
  }
  if (q.data.length === 0) return <p className="text-xs text-muted-foreground">Nothing yet.</p>;
  return (
    <ul className="space-y-2 text-xs">
      {q.data.map((e) => (
        <ActivityRow key={e.id} e={e} />
      ))}
    </ul>
  );
}
