'use client';

/**
 * Team admin > Clients > Client comments (client logins C5 audit fix U2):
 * the items at client level whose client thread had a CLIENT comment in the
 * last 7 days, newest first, each a link to the item, where an admin reads
 * and answers the thread. A brain before the fix answers 404 here: the card
 * is left out (and so is "Delete this client's comments" on each login),
 * and it is not asked again in the page load.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
// Relative, not '@/': the node test runner renders this
// (client-comments-card.test.ts).
import { kindLabel } from '../../lib/access-levels';
import { askUnlessMissing, isMissingRoute } from '../../lib/client-requests';
import {
  CLIENT_COMMENTS_ADMIN_KEY,
  CLIENT_COMMENTS_EMPTY,
  CLIENT_COMMENTS_PATH,
  CLIENT_COMMENTS_ROUTE,
  commentItemHref,
  commentRowLine,
} from '../../lib/client-spaces-admin';
import type { ClientThreadActivity } from '@mantle/client-types';

/** The week's client comments. Also what says whether this brain has the
 *  per-client delete (the same release): no 404, the action is offered. */
export function useClientComments() {
  return useQuery({
    queryKey: CLIENT_COMMENTS_ADMIN_KEY,
    queryFn: () =>
      askUnlessMissing(CLIENT_COMMENTS_ROUTE, () =>
        apiFetch<ClientThreadActivity>(CLIENT_COMMENTS_PATH),
      ),
    refetchOnMount: 'always',
    retry: (count, err) => !isMissingRoute(err) && count < 1,
  });
}

/** The card: owns the query; the markup is the view. */
export function ClientCommentsPanel() {
  const q = useClientComments();
  if (q.isPending) return null;
  if (q.isError) {
    if (isMissingRoute(q.error)) return null;
    return (
      <section className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Couldn&apos;t load the clients&apos; comments.
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Retry
        </Button>
      </section>
    );
  }
  return <ClientCommentsView activity={q.data} />;
}

/** The card as markup: no state and no requests (the tests render it). */
export function ClientCommentsView({ activity }: { activity: ClientThreadActivity }) {
  return (
    <section
      className="rounded-lg border border-border bg-card text-card-foreground"
      aria-labelledby="client-comments-title"
    >
      <div className="border-b border-border p-4">
        <h2 id="client-comments-title" className="flex items-center gap-2 text-sm font-semibold">
          <MessagesSquare className="size-4 text-muted-foreground" aria-hidden />
          Client comments
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Items shared with clients where a client commented this week. Open one to read the thread
          and answer it.
        </p>
      </div>
      {activity.rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{CLIENT_COMMENTS_EMPTY}</p>
      ) : (
        <ul className="divide-y divide-border" aria-label="Client comments">
          {activity.rows.map((r) => (
            <li key={r.nodeId} className="space-y-0.5 px-4 py-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <Link
                  href={commentItemHref(r.nodeId)}
                  className="min-w-0 truncate text-sm font-medium text-primary-ink underline-offset-4 hover:underline"
                >
                  {r.title.trim() || 'Untitled'}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">{kindLabel(r.type)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{commentRowLine(r)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
