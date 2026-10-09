'use client';

/**
 * A member's app in the admin's normal app screen (workspace review pattern,
 * 2026-10-09): the same header and View menu as the editor, with a banner
 * that says who sent it and what waits, and its actions.
 *
 *  - Waiting for approval: Approve (level, trust its tools, the version;
 *    then a confirm; sends the pinned version and review hash) and Send
 *    back (no note: it returns to the member, editable, to submit again).
 *  - Shared by members: Unshare, Delete (to the trash for 30 days), Activity.
 *
 * Everything is read only: Code shows the PUBLISHED source, History lists
 * versions and snapshots, Activity what the app did. Test is a TEST run:
 * at team rules, on a throwaway copy of the app's data that the brain makes
 * when the screen opens and removes when the admin leaves (or after it sits
 * idle). Nothing real changes. No comments: review flows carry no messages.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  FlaskConical,
  RotateCcw,
  Trash2,
  Undo2,
  UserMinus,
} from 'lucide-react';
import { ApiError, apiFetch, apiSend, apiUrl, withAuth } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Tabs, TabsContent } from '@mantle/web-ui/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import { BackLink } from '@mantle/web-ui/layout/back-link';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { CodeEditor } from '@mantle/web-ui/app-sandbox/code-editor';
import { FileTree } from '@mantle/web-ui/app-sandbox/file-tree';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import type { AppTint } from '@mantle/client-types';
import { SetPageTitle } from '@/components/layout/page-title';
import { AppTile } from '@/components/app-nav/app-tile';
import { AppLoader } from '@/components/app-nav/app-loader';
import { MemberAppActivity } from '@/components/app-nav/member-app-activity';
import { ReviewBanner } from '@/components/review/review-banner';
import {
  APP_ACCEPT_LEVEL_MEANING,
  APP_TRUST_TOOLS_HINT,
  DELETED_APPS_KEY,
  MEMBER_APP_DELETED_TOAST,
  MEMBER_APP_DELETE_CONFIRM,
  MEMBER_APP_UNSHARE_HINT,
  REVIEW_APPS_KEY,
  REVIEW_TEST_BLOCKED,
  REVIEW_TEST_ENDED,
  REVIEW_TEST_NOTE,
  acceptSummary,
  reviewAppChanged,
  reviewBrokerOutcome,
  reviewAppPath,
  reviewBannerText,
  reviewKind,
  sendBackConfirm,
  submissionFiles,
  type AppAcceptLevel,
  type ReviewAppDetail,
} from '@/lib/space-apps';

const VIEWS = [
  { value: 'test', label: 'Test' },
  { value: 'code', label: 'Code' },
  { value: 'history', label: 'History' },
  { value: 'activity', label: 'Activity' },
] as const;
type View = (typeof VIEWS)[number]['value'];
const viewLabel = (v: string) => VIEWS.find((x) => x.value === v)?.label ?? VIEWS[0].label;

/** One view's panel: a labelled region picked from the View menu (as in the
 *  editor), not a tab panel naming a tab list that is not there. */
function ViewPanel({ value, ...props }: ComponentProps<typeof TabsContent> & { value: View }) {
  return (
    <TabsContent
      value={value}
      role="region"
      aria-label={viewLabel(value)}
      aria-labelledby={undefined}
      tabIndex={undefined}
      {...props}
    />
  );
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

/** Outer query gate: the page stays data-free. */
export function MemberAppReviewClient({ id }: { id: string }) {
  const q = useQuery({
    queryKey: [...REVIEW_APPS_KEY, id],
    queryFn: () => apiFetch<{ app: ReviewAppDetail }>(reviewAppPath(id)).then((r) => r.app),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  if (q.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <p>
          {gone
            ? 'This app is not waiting or shared any more. Its author may have made it private.'
            : 'Could not load this app.'}
        </p>
        <BackLink href="/apps">Back to apps</BackLink>
      </div>
    );
  }
  return <ReviewView app={q.data} />;
}

/** Ending a test waits a moment, so a remount (React's dev double effect,
 *  a fast reload) keeps the copy instead of racing its own restart. */
const pendingEnds = new Map<string, number>();

function endTest(id: string) {
  void fetch(apiUrl(reviewAppPath(id, 'test')), withAuth({ method: 'DELETE', keepalive: true }));
}

/** The test run: starts a fresh copy on open, ends it on leave. */
function useTestRun(id: string, runnable: boolean) {
  const [state, setState] = useState<'starting' | 'ready' | 'failed' | 'ended'>('starting');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const startedFor = useRef<string | null>(null);

  const start = async () => {
    setState('starting');
    setError(null);
    try {
      await apiSend(reviewAppPath(id, 'test'), 'POST');
      setState('ready');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setState('failed');
      setError(err instanceof Error ? err.message : 'Could not start the test.');
    }
  };

  useEffect(() => {
    if (!runnable) return;
    const pending = pendingEnds.get(id);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      pendingEnds.delete(id);
    }
    if (startedFor.current !== id) {
      startedFor.current = id;
      void start();
    }
    const onHide = () => endTest(id);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      pendingEnds.set(
        id,
        window.setTimeout(() => {
          pendingEnds.delete(id);
          startedFor.current = null;
          endTest(id);
        }, 400),
      );
    };
    // `start` is stable enough: it reads only `id`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, runnable]);

  /** The brain said the copy is gone (idle too long, dropped for a newer
   *  copy, or ended in another tab): show it, with Restart. */
  const ended = () => setState('ended');

  return { state, error, reloadKey, restart: start, ended };
}

function ReviewView({ app }: { app: ReviewAppDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<string>('test');
  const kind = reviewKind(app);

  const files = useMemo(() => submissionFiles(app), [app]);
  const paths = useMemo(() => files.map((f) => f.path).sort(), [files]);
  const [activePath, setActivePath] = useState(app.entry);
  const activeText = app.files[activePath] ?? app.files[app.entry] ?? '';

  const test = useTestRun(app.id, app.runnable);
  // The sandbox's broker calls go through here: a gone copy switches the
  // screen to its ended state, and a tool test mode blocks is said as that
  // (and answered to the app as a plain refusal, so the sandbox does not
  // call it an undeclared tool).
  const onBroker = useRef({ ended: test.ended, blocked: () => {} });
  onBroker.current = {
    ended: test.ended,
    blocked: () => toast.info(REVIEW_TEST_BLOCKED),
  };
  const sandbox = useMemo(
    () => ({
      apiBase: apiUrl(reviewAppPath(app.id, 'test')),
      fetcher: async (input: string, init?: RequestInit) => {
        const res = await fetch(input, withAuth(init));
        if (res.status !== 409 && res.status !== 403) return res;
        const body: unknown = await res
          .clone()
          .json()
          .catch(() => null);
        const outcome = reviewBrokerOutcome(res.status, body);
        if (outcome === 'ended') onBroker.current.ended();
        if (outcome === 'blocked') {
          onBroker.current.blocked();
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return res;
      },
    }),
    [app.id],
  );

  // What Approve sends: the version and hash the admin had in front of them
  // when they opened the dialog, never a refetch that landed since.
  const [shown, setShown] = useState<{ version: number; reviewHash: string | null } | null>(null);
  // A newer version arriving (after a 409, or any refetch) is said, and the
  // test restarts on it: what the admin tested must be what they approve.
  const seen = useRef({ version: app.version, reviewHash: app.reviewHash });
  useEffect(() => {
    const before = seen.current;
    seen.current = { version: app.version, reviewHash: app.reviewHash };
    if (before.version === app.version && before.reviewHash === app.reviewHash) return;
    toast.info(reviewAppChanged(app.version));
    if (app.runnable) void test.restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.version, app.reviewHash]);

  // Approve: the form, then the confirm with exactly what is sent.
  const [approveOpen, setApproveOpen] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [level, setLevel] = useState<AppAcceptLevel>('team');
  const [trust, setTrust] = useState(false);
  const [confirmSendBack, setConfirmSendBack] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const leave = (msg: string, to = '/apps') => {
    // Every app list, but not this screen's own detail: refetched now it
    // would flash "not waiting any more" on the way out.
    void qc.invalidateQueries({
      queryKey: ['apps'],
      predicate: (q) =>
        !(
          q.queryKey[1] === REVIEW_APPS_KEY[1] &&
          q.queryKey[2] === app.id &&
          q.queryKey.length === 3
        ),
    });
    void qc.invalidateQueries({ queryKey: DELETED_APPS_KEY });
    toast.success(msg);
    router.push(to);
  };
  const fail = (fallback: string) => (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) {
      void qc.invalidateQueries({ queryKey: REVIEW_APPS_KEY });
    }
    toast.error(e instanceof Error ? e.message : fallback);
  };
  const approve = useMutation({
    mutationFn: (pinned: { version: number; reviewHash: string | null }) =>
      apiSend(reviewAppPath(app.id, 'accept'), 'POST', {
        level,
        trustTools: trust,
        version: pinned.version,
        reviewHash: pinned.reviewHash,
      }),
    onSuccess: () =>
      leave(
        level === 'team' ? 'Approved at Team level' : 'Approved at Admin level',
        `/apps/${app.id}`,
      ),
    onError: fail('Could not approve it.'),
  });
  const sendBack = useMutation({
    mutationFn: () => apiSend(reviewAppPath(app.id, 'send-back'), 'POST'),
    onSuccess: () => leave(`Sent back to ${app.author.name ?? 'its author'}`),
    onError: fail('Could not send it back.'),
  });
  const unshare = useMutation({
    mutationFn: () => apiSend(reviewAppPath(app.id, 'unshare'), 'POST'),
    onSuccess: () => leave('Unshared: only its author runs it now'),
    onError: fail('Could not unshare it.'),
  });
  const remove = useMutation({
    mutationFn: () => apiSend(reviewAppPath(app.id, 'delete'), 'POST', { confirm: true }),
    onSuccess: () => leave(MEMBER_APP_DELETED_TOAST),
    onError: fail('Could not delete it.'),
  });
  const busy = approve.isPending || sendBack.isPending || unshare.isPending || remove.isPending;

  const actions =
    kind === 'waiting' ? (
      <>
        <Button
          size="sm"
          disabled={busy || !app.reviewHash}
          onClick={() => {
            setLevel('team');
            setTrust(false);
            setShown({ version: app.version, reviewHash: app.reviewHash });
            setApproveOpen(true);
          }}
        >
          <Check />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setConfirmSendBack(true)}
        >
          <Undo2 />
          Send back
        </Button>
      </>
    ) : (
      <>
        {app.sharing === 'team' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            title={MEMBER_APP_UNSHARE_HINT}
            onClick={() => unshare.mutate()}
          >
            <UserMinus />
            Unshare
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 />
          Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTab('activity')}>
          Activity
        </Button>
      </>
    );

  const detail =
    kind === 'waiting'
      ? `Version ${app.version}, sent ${fmtWhen(app.submittedAt)}.`
      : app.author.active
        ? `Every member runs it. Last changed ${fmtWhen(app.updatedAt)}.`
        : 'Its author is no longer an active member: it runs for nobody.';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SetPageTitle title={app.title} />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border p-3">
          <div className="flex min-w-0 items-center gap-3">
            <BackLink href="/apps">Apps</BackLink>
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <AppTile icon={app.icon} color={app.color as AppTint | null} size="md" />
              <span className="min-w-0 truncate">{app.title || 'Untitled'}</span>
              <Badge variant="secondary" className="shrink-0">
                v{app.version}
              </Badge>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`View: ${viewLabel(tab)}`}
                  title="Switch view"
                >
                  {viewLabel(tab)}
                  <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={tab} onValueChange={setTab}>
                  {VIEWS.map((v) => (
                    <DropdownMenuRadioItem key={v.value} value={v.value}>
                      {v.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ReviewBanner kind={kind} text={reviewBannerText(app)} detail={detail} actions={actions} />

        {/* Test: the test run. forceMount keeps it (and its copy) while
            another view is open, as the editor keeps its preview. */}
        <ViewPanel
          value="test"
          forceMount
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
              <FlaskConical className="size-4 shrink-0 text-warning-ink" aria-hidden />
              <p className="min-w-0 flex-1 basis-60 text-sm font-medium">{REVIEW_TEST_NOTE}</p>
              {app.runnable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={test.state === 'starting'}
                  onClick={() => void test.restart()}
                  title="Start again from the app's real data"
                >
                  <RotateCcw />
                  Restart test
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">
              {!app.runnable ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  This app has no published build to test.
                </div>
              ) : test.state === 'starting' ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner />
                </div>
              ) : test.state === 'failed' || test.state === 'ended' ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                  <p>
                    {test.state === 'ended' ? REVIEW_TEST_ENDED : (test.error ?? REVIEW_TEST_ENDED)}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void test.restart()}>
                    <RotateCcw />
                    {test.state === 'ended' ? 'Restart test' : 'Try again'}
                  </Button>
                </div>
              ) : (
                <SurfaceErrorBoundary label="this app" resetKeys={[app.id, test.reloadKey]}>
                  <AppSandbox
                    appId={app.id}
                    {...sandbox}
                    loader={
                      <AppLoader
                        title={app.title}
                        icon={app.icon}
                        color={app.color as AppTint | null}
                      />
                    }
                    frame="viewport"
                    reloadKey={test.reloadKey}
                    onError={(m) => toast.error(m)}
                  />
                </SurfaceErrorBoundary>
              )}
            </div>
          </div>
        </ViewPanel>

        {/* Code: the PUBLISHED source, read only. */}
        <ViewPanel value="code" className="mt-0 flex min-h-0 flex-1 flex-col">
          <MasterDetail
            id="app-review-code"
            className="min-h-0 flex-1"
            defaultListSize="200px"
            minListSize="160px"
            maxListSize="420px"
            detailFills
            list={
              <FileTree
                paths={paths}
                entry={app.entry}
                activePath={activePath}
                onSelect={setActivePath}
                className="flex-1"
              />
            }
            detail={
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {activePath}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">Read only</span>
                </div>
                <CodeEditor
                  path={activePath}
                  value={activeText}
                  readOnly
                  className="min-h-0 flex-1"
                />
              </div>
            }
          />
        </ViewPanel>

        <ViewPanel value="history" className="mt-0 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="space-y-4 p-4">
            <ReviewHistory id={app.id} />
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
          </div>
        </ViewPanel>

        <ViewPanel value="activity" className="mt-0 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-4">
            <MemberAppActivity id={app.id} />
          </div>
        </ViewPanel>
      </Tabs>

      {/* Approve, step 1: level, trust and the version. */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve “{app.title || 'Untitled'}”</DialogTitle>
            <DialogDescription>
              Version {shown?.version ?? app.version}, the one on this screen. It moves into the
              brain&apos;s Apps with its data and history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Level</p>
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
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={trust}
                onCheckedChange={(v) => setTrust(v === true)}
                className="mt-0.5"
                disabled={app.declaredTools.length === 0}
              />
              <span>
                Trust its tools: I checked its tools and its source.
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {APP_TRUST_TOOLS_HINT}
                </span>
              </span>
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setApproveOpen(false);
                setConfirmApprove(true);
              }}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve, step 2: the confirm, with exactly what is sent. */}
      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve “{app.title || 'Untitled'}” into the brain?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {acceptSummary({ level, trust, version: shown?.version ?? app.version }).map(
                  (l) => (
                    <li key={l}>{l}</li>
                  ),
                )}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmApprove(false);
                if (shown) approve.mutate(shown);
              }}
            >
              Approve at {level === 'team' ? 'Team' : 'Admin'} level
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSendBack} onOpenChange={setConfirmSendBack}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send “{app.title || 'Untitled'}” back?</AlertDialogTitle>
            <AlertDialogDescription>{sendBackConfirm(app)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSendBack(false);
                sendBack.mutate();
              }}
            >
              Send back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{app.title || 'Untitled'}”?</AlertDialogTitle>
            <AlertDialogDescription>{MEMBER_APP_DELETE_CONFIRM}</AlertDialogDescription>
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type HistoryEntry = {
  id: string;
  seq: number;
  kind: 'version' | 'snapshot';
  trigger: string;
  note: string | null;
  createdAt: string;
};

/** Versions (each publish) and snapshots, newest first. Read only:
 *  restoring is the author's. */
function ReviewHistory({ id }: { id: string }) {
  const q = useQuery({
    queryKey: [...REVIEW_APPS_KEY, id, 'history'],
    queryFn: () => apiFetch<{ entries: HistoryEntry[] }>(reviewAppPath(id, 'history')),
  });
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-medium">History</h3>
      {q.isPending ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : q.isError ? (
        <p className="text-xs text-destructive-ink">Could not load the history.</p>
      ) : q.data.entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {q.data.entries.map((e) => (
            <li key={e.id} className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-medium">v{e.seq}</span>
              <span className="shrink-0 text-muted-foreground">
                {e.kind === 'version' ? 'version' : 'snapshot'}
              </span>
              <span className="min-w-0 flex-1 truncate">{e.note ?? ''}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtWhen(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
