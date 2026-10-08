'use client';

/**
 * Team admin > App review (brain team apps Phase 3): the apps members
 * submitted, oldest first. The detail shows the PUBLISHED source (what will
 * run once accepted) and the tools it declares, and the two answers:
 * Accept into the brain at Admin or Team level (client and public stay a
 * later choice, as for any app), with or without trusting its tools, or
 * Return with a note.
 *
 * Without "trust its tools" the app keeps the author ceiling: it runs its
 * tools at team rules for every runner, admins too. A brain without the
 * routes answers 404: the tab says to update it.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { Label } from '@mantle/web-ui/ui/label';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  APP_ACCEPT_LEVEL_MEANING,
  APP_SUBMISSIONS_KEY,
  APP_SUBMISSIONS_PATH,
  APP_TRUST_TOOLS_HINT,
  appSubmissionPath,
  submissionFiles,
  type AppAcceptLevel,
  type AppSubmission,
  type AppSubmissionDetail,
} from '@/lib/space-apps';

/** The submitted apps; null on a brain without the route. */
export function useAppSubmissions() {
  return useQuery({
    queryKey: APP_SUBMISSIONS_KEY,
    queryFn: async () => {
      try {
        return (await apiFetch<{ submissions: AppSubmission[] }>(APP_SUBMISSIONS_PATH)).submissions;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: 60_000,
  });
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AppReviewDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [level, setLevel] = useState<AppAcceptLevel>('team');
  const [trust, setTrust] = useState(false);
  const [note, setNote] = useState('');
  const q = useQuery({
    queryKey: [...APP_SUBMISSIONS_KEY, id],
    queryFn: () =>
      apiFetch<{ submission: AppSubmissionDetail }>(appSubmissionPath(id)).then(
        (r) => r.submission,
      ),
  });
  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: APP_SUBMISSIONS_KEY });
    toast.success(msg);
  };
  const accept = useMutation({
    mutationFn: () =>
      apiSend(appSubmissionPath(id, 'accept'), 'POST', { level, trustTools: trust }),
    onSuccess: () => done(level === 'team' ? 'Accepted at Team level' : 'Accepted at Admin level'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not accept it.'),
  });
  const giveBack = useMutation({
    mutationFn: () => apiSend(appSubmissionPath(id, 'return'), 'POST', { note }),
    onSuccess: () => done('Returned to its author'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not return it.'),
  });
  if (q.isPending) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (q.isError) {
    return <p className="p-4 text-sm text-muted-foreground">This app is not waiting any more.</p>;
  }
  const app = q.data;
  const busy = accept.isPending || giveBack.isPending;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
      <div>
        <h2 className="text-base font-semibold">{app.title || 'Untitled'}</h2>
        <p className="text-xs text-muted-foreground">
          By {app.author.name ?? 'a member'} · version {app.version} · submitted{' '}
          {fmtWhen(app.submittedAt)}
        </p>
        {app.description ? <p className="mt-1 text-sm">{app.description}</p> : null}
      </div>

      <section className="space-y-1">
        <h3 className="text-sm font-medium">Tools it declares</h3>
        {app.declaredTools.length ? (
          <ul className="flex flex-wrap gap-1">
            {app.declaredTools.map((t) => (
              <li key={t}>
                <code className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{t}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">None: it calls no brain tools.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Accept into the brain</h3>
        <ToggleGroup
          type="single"
          value={level}
          onValueChange={(v) => v && setLevel(v as AppAcceptLevel)}
          aria-label="Level"
          className="justify-start"
        >
          <ToggleGroupItem value="team">Team</ToggleGroupItem>
          <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">{APP_ACCEPT_LEVEL_MEANING[level]}</p>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox
            checked={trust}
            onCheckedChange={(v) => setTrust(v === true)}
            className="mt-0.5"
            disabled={app.declaredTools.length === 0}
          />
          <span>
            I checked its tools: let it use them at the runner&apos;s own rules.
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {APP_TRUST_TOOLS_HINT}
            </span>
          </span>
        </label>
        <Button size="sm" disabled={busy} onClick={() => accept.mutate()}>
          Accept
        </Button>
      </section>

      <section className="space-y-2 rounded-lg border border-border p-3">
        <Label htmlFor="app-return-note" className="text-sm font-medium">
          Return with a note
        </Label>
        <Textarea
          id="app-return-note"
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What to change before you accept it."
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => giveBack.mutate()}>
          Return
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Source (published)</h3>
        {submissionFiles(app).map((f) => (
          <details
            key={f.path}
            className="rounded-md border border-border"
            open={f.path === app.entry}
          >
            <summary className="cursor-pointer px-2 py-1 font-mono text-xs">{f.path}</summary>
            <pre className="max-h-96 overflow-auto border-t border-border p-2 text-xs scrollbar-thin">
              {f.text}
            </pre>
          </details>
        ))}
      </section>
    </div>
  );
}

export function AppReviewPanel({ appId }: { appId?: string }) {
  const q = useAppSubmissions();
  if (q.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm">
        <p className="text-muted-foreground">Could not load the apps to review.</p>
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (q.isPending) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (q.data === null) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Update the brain to review apps members build.
      </p>
    );
  }
  const rows = q.data;
  const selectedId = appId && rows.some((r) => r.id === appId) ? appId : (rows[0]?.id ?? null);
  return (
    <MasterDetail
      id="team-admin-app-review"
      className="min-h-0 flex-1"
      defaultListSize="340px"
      defaultDetailSize="768px"
      maxDetailSize="100%"
      list={
        <>
          <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">App review</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {rows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No app waits for review. When a member submits an app, it shows here.
              </div>
            ) : (
              <ul className="flex flex-col gap-2 p-3">
                {rows.map((r) => (
                  <li key={r.id}>
                    <ListCard asChild selected={r.id === selectedId}>
                      <Link href={`/team-admin?view=app-review&app=${r.id}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <ListCardTitle>{r.title || 'Untitled'}</ListCardTitle>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {fmtWhen(r.submittedAt)}
                          </span>
                        </div>
                        <ListCardMeta>
                          App · {r.author.name ?? 'a member'} · {r.declaredTools.length} tool
                          {r.declaredTools.length === 1 ? '' : 's'}
                        </ListCardMeta>
                      </Link>
                    </ListCard>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      }
      detail={
        selectedId ? (
          <AppReviewDetail key={selectedId} id={selectedId} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-sm text-muted-foreground">
              <ClipboardCheck className="mx-auto mb-2 size-6" />
              <p>A submitted app shows here, with its tools and its source.</p>
            </div>
          </div>
        )
      }
    />
  );
}
