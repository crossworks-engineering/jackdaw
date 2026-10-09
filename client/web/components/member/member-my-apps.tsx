'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Trash2 } from 'lucide-react';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';
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
import { HeaderInfoButton } from '@/components/layout/item-header';
import { memberAppHref } from '@/lib/member-apps';
import {
  MY_APPS_DELETED_KEY,
  MY_APPS_DELETED_PATH,
  MY_APPS_HOWTO,
  MY_APPS_TRASH_INFO,
  MY_APPS_TRASH_MAX,
  MY_APP_DELETED_TOAST,
  MY_APP_IN_TRASH,
  MY_APP_RESTORED_TOAST,
  MY_APP_SHARE_HINT,
  MY_APP_SNAPSHOT_DELETED_TOAST,
  MY_APP_SUBMIT_HINT,
  MY_APPS_KEY,
  MY_APPS_PATH,
  isMyAppInTrash,
  myAppActionPath,
  myAppDeleteConfirm,
  myAppHistoryPath,
  myAppRefusal,
  myAppSnapshotPath,
  spaceAppActions,
  spaceAppStatus,
  spaceAppSubmitHint,
  type DeletedSpaceApp,
  type MyAppHistoryEntry,
  type SpaceAppCard,
} from '@/lib/space-apps';

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

/** The member's trash: none on a brain before it (404). */
export function useMyAppsTrash(enabled = true) {
  return useQuery({
    queryKey: MY_APPS_DELETED_KEY,
    enabled,
    queryFn: async () => {
      try {
        return (await apiFetch<{ apps: DeletedSpaceApp[] }>(MY_APPS_DELETED_PATH)).apps;
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

/** What a refused change says: the plain words, else the brain's. */
function refusalText(e: unknown, fallback: string): string {
  return myAppRefusal(e) ?? (e instanceof Error && e.message ? e.message : fallback);
}

function HistoryDialog({ app, onClose }: { app: SpaceAppCard; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = [...MY_APPS_KEY, 'history', app.id];
  const [confirming, setConfirming] = useState<string | null>(null);
  const q = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<{ entries: MyAppHistoryEntry[] }>(myAppHistoryPath(app.id)),
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });
  const remove = useMutation({
    mutationFn: (snapshotId: string) => apiSend(myAppSnapshotPath(app.id, snapshotId), 'DELETE'),
    onSuccess: () => {
      setConfirming(null);
      void qc.invalidateQueries({ queryKey: key });
      toast.success(MY_APP_SNAPSHOT_DELETED_TOAST);
    },
    onError: (e) => {
      setConfirming(null);
      void qc.invalidateQueries({ queryKey: key });
      if (isMyAppInTrash(e)) void qc.invalidateQueries({ queryKey: MY_APPS_KEY });
      toast.error(
        e instanceof ApiError && e.status === 404
          ? 'That snapshot is already gone.'
          : refusalText(e, 'Could not delete the snapshot.'),
      );
    },
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
          <p className="text-sm text-destructive-ink">
            {isMyAppInTrash(q.error) ? MY_APP_IN_TRASH : 'Could not load the history.'}
          </p>
        ) : q.data.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm scrollbar-thin">
            {q.data.entries.map((e) =>
              confirming === e.id ? (
                <li
                  key={e.id}
                  className="flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-muted px-2 py-1"
                >
                  <span className="min-w-0 flex-1">
                    Delete snapshot v{e.seq} and its copy of the data?
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(e.id)}
                  >
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </Button>
                </li>
              ) : (
                <li key={e.id} className="flex min-h-7 min-w-0 items-center gap-2">
                  <span className="shrink-0 font-medium">v{e.seq}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {e.kind === 'version' ? 'version' : 'snapshot'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{e.note ?? ''}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmt(e.createdAt)}</span>
                  {e.deletable ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete snapshot v${e.seq}`}
                      title="Delete snapshot"
                      disabled={remove.isPending}
                      onClick={() => setConfirming(e.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ),
            )}
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const actions = spaceAppActions(app);
  const hint = spaceAppSubmitHint(app);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: MY_APPS_KEY });
    void qc.invalidateQueries({ queryKey: ['member-apps'] });
  };
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
      refresh();
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
    onError: (e) => {
      // Moved to Trash from another tab or over MCP: the list catches up.
      if (isMyAppInTrash(e)) refresh();
      toast.error(refusalText(e, 'Could not change that.'));
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend(myAppActionPath(app.id, 'delete'), 'POST'),
    onSuccess: () => {
      refresh();
      toast.success(MY_APP_DELETED_TOAST);
    },
    onError: (e) => {
      if (isMyAppInTrash(e)) refresh();
      toast.error(refusalText(e, 'Could not delete the app.'));
    },
  });
  const busy = act.isPending || remove.isPending;
  const confirm = myAppDeleteConfirm(app.title);
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
              Rejected
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
            disabled={busy}
            onClick={() => act.mutate({ kind: 'share', sharing: actions.share! })}
          >
            {actions.share === 'team' ? 'Share with team' : 'Make private'}
          </Button>
        ) : null}
        {actions.submit ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => act.mutate({ kind: 'submit' })}
          >
            Submit
          </Button>
        ) : null}
        {actions.recall ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => act.mutate({ kind: 'recall' })}
          >
            Recall
          </Button>
        ) : null}
        {app.mine ? (
          <div role="group" aria-label="App actions" className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="History"
              title="History"
              onClick={() => setHistory(true)}
            >
              <History className="size-4" aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete"
              title="Delete"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      {history ? <HistoryDialog app={app} onClose={() => setHistory(false)} /> : null}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDelete(false);
                remove.mutate();
              }}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function TrashRow({ app }: { app: DeletedSpaceApp }) {
  const qc = useQueryClient();
  const toast = useToast();
  const restore = useMutation({
    mutationFn: () => apiSend(myAppActionPath(app.id, 'undelete'), 'POST'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MY_APPS_KEY });
      void qc.invalidateQueries({ queryKey: ['member-apps'] });
      toast.success(MY_APP_RESTORED_TOAST);
    },
  });
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium">{app.title || 'Untitled'}</span>
        <p className="mt-0.5 text-xs text-muted-foreground">Deleted {fmt(app.deletedAt)}</p>
        {/* The refusal stays on the row (the 50 app limit), not a toast. */}
        {restore.isError ? (
          <p role="alert" className="mt-1 text-xs text-destructive-ink">
            {refusalText(restore.error, 'Could not restore the app.')}
          </p>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={restore.isPending}
        onClick={() => restore.mutate()}
      >
        Restore
      </Button>
    </li>
  );
}

/** The member's trash: their deleted apps, each with Restore. Hidden while
 *  empty and on a brain without it. */
function MyAppsTrash() {
  const q = useMyAppsTrash();
  const ref = useRef<HTMLElement>(null);
  const shown = !!q.data?.length;
  // /apps#trash (from an app that is in Trash): the section loads after the
  // page, so the browser's own jump to the anchor finds nothing.
  useEffect(() => {
    if (shown && window.location.hash === '#trash') ref.current?.scrollIntoView();
  }, [shown]);
  if (q.isPending || !q.data?.length) {
    return q.isError ? (
      <p className="text-sm text-destructive-ink">Could not load your Trash.</p>
    ) : null;
  }
  return (
    <section ref={ref} id="trash" aria-labelledby="my-apps-trash" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="my-apps-trash" className="text-sm font-semibold">
          Trash
        </h2>
        <Badge variant="secondary">
          {q.data.length} of {MY_APPS_TRASH_MAX}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <HeaderInfoButton label="About Trash">
            {MY_APPS_TRASH_INFO.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </HeaderInfoButton>
        </div>
      </div>
      <ul className="space-y-2">
        {q.data.map((a) => (
          <TrashRow key={a.id} app={a} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Apps members build (brain team apps Phase 3), on the member's Apps page:
 * their own (private, shared, submitted or returned) and the ones teammates
 * shared with the team. Building happens over the member's own MCP; here
 * they share, submit, recall, read the history, open them, and move their
 * own to Trash and back (access matrix N6). Hidden on a brain without the
 * route.
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
    <div className="space-y-4">
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
      <MyAppsTrash />
    </div>
  );
}
