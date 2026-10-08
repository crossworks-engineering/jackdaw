'use client';

/**
 * Team admin > Member apps (brain access matrix N2): the apps members built
 * and shared with the team or submitted, never a private draft. An admin
 * sees who built each, whether that author is still an active member (an
 * app whose author is not runs for nobody), what it did (Activity), and can
 * Unshare it (back to private, nothing deleted) or Delete it (confirmed; the
 * brain moves it to its trash with its code and data, M4 audit). Recently
 * deleted apps, below, bring one back for 30 days. A brain without the
 * routes answers 404: the tab says to update it.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
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
import {
  DELETED_APPS_KEY,
  DELETED_APPS_PATH,
  MEMBER_APPS_ADMIN_KEY,
  MEMBER_APPS_ADMIN_PATH,
  MEMBER_APP_DELETED_TOAST,
  MEMBER_APP_DELETE_CONFIRM,
  MEMBER_APP_UNSHARE_HINT,
  activityLabel,
  activityRefused,
  activityWho,
  activityWrite,
  adminMemberAppStatus,
  deletedAppRestorePath,
  memberAppAdminPath,
  type AdminMemberApp,
  type DeletedApp,
  type MemberAppActivity,
} from '@/lib/space-apps';

/** The members' apps an admin sees; null on a brain without the route. */
export function useAdminMemberApps() {
  return useQuery({
    queryKey: MEMBER_APPS_ADMIN_KEY,
    queryFn: async () => {
      try {
        return (await apiFetch<{ apps: AdminMemberApp[] }>(MEMBER_APPS_ADMIN_PATH)).apps;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: 60_000,
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

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

function Activity({ id }: { id: string }) {
  const q = useQuery({
    queryKey: [...MEMBER_APPS_ADMIN_KEY, id, 'activity'],
    queryFn: () =>
      apiFetch<{ entries: MemberAppActivity[] }>(memberAppAdminPath(id, 'activity')).then(
        (r) => r.entries,
      ),
  });
  if (q.isPending) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (q.isError)
    return <p className="text-xs text-destructive-ink">Could not load the activity.</p>;
  if (q.data.length === 0) return <p className="text-xs text-muted-foreground">Nothing yet.</p>;
  return (
    <ul className="max-h-64 space-y-2 overflow-y-auto text-xs scrollbar-thin">
      {q.data.map((e) => (
        <ActivityRow key={e.id} e={e} />
      ))}
    </ul>
  );
}

function Row({ app }: { app: AdminMemberApp }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [showActivity, setShowActivity] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: MEMBER_APPS_ADMIN_KEY });
    void qc.invalidateQueries({ queryKey: DELETED_APPS_KEY });
    toast.success(msg);
  };
  const unshare = useMutation({
    mutationFn: () => apiSend(memberAppAdminPath(app.id, 'unshare'), 'POST'),
    onSuccess: () => done('Unshared: only its author runs it now'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not unshare it.'),
  });
  const remove = useMutation({
    mutationFn: () => apiSend(memberAppAdminPath(app.id, 'delete'), 'POST', { confirm: true }),
    onSuccess: () => done(MEMBER_APP_DELETED_TOAST),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete it.'),
  });
  const busy = unshare.isPending || remove.isPending;
  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{app.title || 'Untitled'}</span>
            {!app.author.active ? <Badge variant="secondary">Author inactive</Badge> : null}
            {app.reviewState === 'submitted' ? <Badge variant="secondary">Submitted</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{adminMemberAppStatus(app)}</p>
          {app.declaredTools.length ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Tools: {app.declaredTools.join(', ')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setShowActivity((v) => !v)}>
            {showActivity ? 'Hide activity' : 'Activity'}
          </Button>
          {app.sharing === 'team' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              title={MEMBER_APP_UNSHARE_HINT}
              onClick={() => unshare.mutate()}
            >
              Unshare
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        </div>
      </div>
      {showActivity ? <Activity id={app.id} /> : null}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{app.title || 'Untitled'}”?</AlertDialogTitle>
            <AlertDialogDescription>{MEMBER_APP_DELETE_CONFIRM}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false);
                remove.mutate();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** The brain's trash of apps: a member app an admin deleted waits here, as
 *  any deleted app does, and comes back as an admin-only app. Hidden on a
 *  brain without the route, and while it is empty. */
function RecentlyDeleted() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: DELETED_APPS_KEY,
    queryFn: async () => {
      try {
        return (await apiFetch<{ apps: DeletedApp[] }>(DELETED_APPS_PATH)).apps;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
  const restore = useMutation({
    mutationFn: (id: string) => apiSend(deletedAppRestorePath(id), 'POST'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DELETED_APPS_KEY });
      toast.success('Restored: it is in Apps, for admins only');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not restore it.'),
  });
  if (!q.data?.length) return null;
  return (
    <section className="space-y-2 pt-2">
      <div>
        <h3 className="text-sm font-semibold">Recently deleted apps</h3>
        <p className="text-xs text-muted-foreground">
          A deleted app can come back for 30 days, with its data. It returns to Apps for admins
          only; share it again from there.
        </p>
      </div>
      <ul className="space-y-2">
        {q.data.map((d) => (
          <li
            key={d.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium">{d.title || 'Untitled'}</span>
              <p className="text-xs text-muted-foreground">
                Deleted {fmtDay(d.deletedAt)}. Restore until {fmtDay(d.purgeAfter)}.
                {d.hasData ? '' : ' No data was kept.'}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={restore.isPending}
              onClick={() => restore.mutate(d.id)}
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MemberAppsPanel() {
  const q = useAdminMemberApps();
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
      <div>
        <h2 className="text-sm font-semibold">Member apps</h2>
        <p className="text-xs text-muted-foreground">
          Apps members built and shared with the team or submitted. A private draft is its author’s
          alone. An app whose author is no longer an active member runs for nobody.
        </p>
      </div>
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.isError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive-ink">Could not load the member apps.</p>
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </div>
      ) : q.data === null ? (
        <p className="text-sm text-muted-foreground">Update the brain to see members’ apps here.</p>
      ) : q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No member has shared or submitted an app.</p>
      ) : (
        <ul className="space-y-2">
          {q.data.map((a) => (
            <Row key={a.id} app={a} />
          ))}
        </ul>
      )}
      <RecentlyDeleted />
    </div>
  );
}
