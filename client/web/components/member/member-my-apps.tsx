'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import { useToast } from '@mantle/web-ui/ui/toast';
import { AppDataPills } from '@/components/app-nav/app-data-pill';
import { memberAppHref } from '@/lib/member-apps';
import {
  MY_APPS_HOWTO,
  MY_APP_SHARE_HINT,
  MY_APP_SUBMIT_HINT,
  MY_APPS_KEY,
  MY_APPS_PATH,
  myAppActionPath,
  myAppHistoryPath,
  spaceAppActions,
  spaceAppStatus,
  spaceAppSubmitHint,
  type SpaceAppCard,
} from '@/lib/space-apps';

type HistoryEntry = {
  id: string;
  seq: number;
  kind: 'version' | 'snapshot';
  trigger: string;
  note: string | null;
  createdAt: string;
};

/** The member's apps: none on an older brain (its route answers 404). */
export function useMyApps() {
  return useQuery({
    queryKey: MY_APPS_KEY,
    queryFn: async () => {
      try {
        return (await apiFetch<{ apps: SpaceAppCard[] }>(MY_APPS_PATH)).apps;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function HistoryDialog({ app, onClose }: { app: SpaceAppCard; onClose: () => void }) {
  const q = useQuery({
    queryKey: [...MY_APPS_KEY, 'history', app.id],
    queryFn: () => apiFetch<{ entries: HistoryEntry[] }>(myAppHistoryPath(app.id)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>History of {app.title || 'Untitled'}</DialogTitle>
          <DialogDescription>
            Versions are what each publish made run. Snapshots also hold a copy of the data. To
            restore one, ask your MCP client to use my_app_snapshot_restore.
          </DialogDescription>
        </DialogHeader>
        {q.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-destructive-ink">Could not load the history.</p>
        ) : q.data.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm scrollbar-thin">
            {q.data.entries.map((e) => (
              <li key={e.id} className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 font-medium">v{e.seq}</span>
                <span className="shrink-0 text-muted-foreground">
                  {e.kind === 'version' ? 'version' : 'snapshot'}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.note ?? ''}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmt(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MyAppRow({ app }: { app: SpaceAppCard }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [history, setHistory] = useState(false);
  const actions = spaceAppActions(app);
  const hint = spaceAppSubmitHint(app);
  const act = useMutation({
    mutationFn: (
      a: { kind: 'share'; sharing: 'private' | 'team' } | { kind: 'submit' | 'recall' },
    ) =>
      apiSend(
        myAppActionPath(app.id, a.kind),
        'POST',
        a.kind === 'share' ? { sharing: a.sharing } : undefined,
      ),
    onSuccess: (_res, a) => {
      void qc.invalidateQueries({ queryKey: MY_APPS_KEY });
      void qc.invalidateQueries({ queryKey: ['member-apps'] });
      toast.success(
        a.kind === 'share'
          ? a.sharing === 'team'
            ? 'Shared with the team'
            : 'Private again'
          : a.kind === 'submit'
            ? 'Submitted for review'
            : 'Taken back from review',
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not change that.'),
  });
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{app.title || 'Untitled'}</span>
          {app.mine && app.reviewState === 'submitted' ? (
            <Badge variant="secondary" className="shrink-0">
              Waiting for approval
            </Badge>
          ) : app.mine && app.reviewState === 'returned' ? (
            <Badge variant="outline" className="shrink-0">
              Sent back
            </Badge>
          ) : null}
          <AppDataPills app={app} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{spaceAppStatus(app)}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        {/* What Share and Submit do, before the click (M3 audit, low 4). */}
        {actions.share === 'team' ? (
          <p className="mt-1 text-xs text-muted-foreground">Share: {MY_APP_SHARE_HINT}</p>
        ) : null}
        {actions.submit ? (
          <p className="mt-1 text-xs text-muted-foreground">Submit: {MY_APP_SUBMIT_HINT}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {actions.run ? (
          <Button asChild size="sm" variant="outline">
            <Link href={memberAppHref(app.id)}>Open</Link>
          </Button>
        ) : null}
        {actions.share ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={act.isPending}
            onClick={() => act.mutate({ kind: 'share', sharing: actions.share! })}
          >
            {actions.share === 'team' ? 'Share with team' : 'Make private'}
          </Button>
        ) : null}
        {actions.submit ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={act.isPending}
            onClick={() => act.mutate({ kind: 'submit' })}
          >
            Submit
          </Button>
        ) : null}
        {actions.recall ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={act.isPending}
            onClick={() => act.mutate({ kind: 'recall' })}
          >
            Recall
          </Button>
        ) : null}
        {app.mine ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="History"
            title="History"
            onClick={() => setHistory(true)}
          >
            <History className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {history ? <HistoryDialog app={app} onClose={() => setHistory(false)} /> : null}
    </li>
  );
}

/**
 * Apps members build (brain team apps Phase 3), on the member's Apps page:
 * their own (private, shared, submitted or returned) and the ones teammates
 * shared with the team. Building happens over the member's own MCP; here
 * they share, submit, recall, read the history and open them. Hidden on a
 * brain without the route.
 */
export function MemberMyApps() {
  const q = useMyApps();
  if (q.isPending || q.data === null) return null;
  if (q.isError) {
    return <p className="text-sm text-destructive-ink">Could not load the apps members build.</p>;
  }
  const mine = q.data.filter((a) => a.mine);
  const theirs = q.data.filter((a) => !a.mine);
  return (
    <section aria-labelledby="my-apps" className="space-y-3">
      <h2 id="my-apps" className="text-sm font-semibold">
        Your apps
      </h2>
      {mine.length ? (
        <ul className="space-y-2">
          {mine.map((a) => (
            <MyAppRow key={a.id} app={a} />
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">{MY_APPS_HOWTO}</p>
      {theirs.length ? (
        <>
          <h2 className="pt-2 text-sm font-semibold">Built by the team</h2>
          <ul className="space-y-2">
            {theirs.map((a) => (
              <MyAppRow key={a.id} app={a} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
