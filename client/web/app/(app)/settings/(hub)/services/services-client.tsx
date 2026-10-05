'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Info } from 'lucide-react';
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
import { Button } from '@mantle/web-ui/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mantle/web-ui/ui/card';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Switch } from '@mantle/web-ui/ui/switch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import {
  currentRun,
  diskWarning,
  memoryWarning,
  runBusy,
  runLabel,
  stateLabel,
  SERVICE_ENABLES,
  type ServiceInfo,
  type ServiceRunPoll,
  type ServiceRunStatus,
  type ServicesView,
  type ServiceSwitchResult,
} from '@/lib/services';

/** Query keys mirror the URLs. */
const VIEW_KEY = ['/api/services'] as const;
const RUN_KEY = ['/api/services/status'] as const;
const VIEW_POLL_MS = 15_000;
const RUN_POLL_MS = 2_000;

/**
 * Settings > Services: start and stop the box's optional services
 * (sandboxes, media). A card per service says what it does, what uses it,
 * what stops while it is off, what is kept, and what it costs; its switch
 * asks the box's updater to start or stop it. Off never removes anything.
 * Admin-only: members are sent home from any settings path and clients get
 * their portal, and the brain refuses both on /api/services.
 */
export function ServicesClient() {
  const viewQuery = useQuery({
    queryKey: VIEW_KEY,
    queryFn: () => apiFetch<ServicesView>('/api/services'),
    refetchInterval: VIEW_POLL_MS,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  if (viewQuery.isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (viewQuery.isError && !viewQuery.data) {
    const tooOld = viewQuery.error instanceof ApiError && viewQuery.error.status === 404;
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <p>
          {tooOld
            ? 'This brain cannot switch services yet. Update the box, then come back here.'
            : 'Couldn’t load the services.'}
        </p>
        {!tooOld && (
          <Button variant="outline" size="sm" onClick={() => viewQuery.refetch()}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  return <ServicesScreen view={viewQuery.data} />;
}

function ServicesScreen({ view }: { view: ServicesView }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ svc: ServiceInfo; enable: boolean } | null>(null);
  const [showLog, setShowLog] = useState(false);
  // Between "the run finished" and "the new state arrived": keep showing the
  // last progress line, so a switch never flashes the old state.
  const [settling, setSettling] = useState<ServiceRunStatus | null>(null);

  const following = sentAt !== null || runBusy(view.run);
  const runQuery = useQuery({
    queryKey: RUN_KEY,
    queryFn: () => apiFetch<ServiceRunPoll>('/api/services/status'),
    enabled: following,
    refetchInterval: following ? RUN_POLL_MS : false,
  });
  const run = currentRun(runQuery.data?.run ?? view.run, sentAt);
  const lastBusy = useRef<ServiceRunStatus | null>(null);
  useEffect(() => {
    if (runBusy(run)) lastBusy.current = run;
  }, [run]);

  // The run finished: load the new state, THEN let the progress line go and
  // say how it went. Once per run, however often the poll shows it finished.
  const finishedKey = useRef<string | null>(null);
  const finished = following && !!runQuery.data && !!run && !runBusy(run);
  useEffect(() => {
    if (!finished || !run) return;
    const key = `${run.service}:${run.startedAt}:${run.phase}`;
    if (finishedKey.current === key) return;
    finishedKey.current = key;
    setSettling(lastBusy.current ?? run);
    void queryClient.refetchQueries({ queryKey: VIEW_KEY, exact: true }).finally(() => {
      setSettling(null);
      setSentAt(null);
      if (run.phase === 'done') toast.success(runLabel(run));
      else if (run.phase === 'error') toast.error(runLabel(run));
    });
  }, [finished, run, queryClient, toast]);

  async function send(svc: ServiceInfo, enable: boolean) {
    setConfirm(null);
    setShowLog(false);
    try {
      const r = await apiSend<ServiceSwitchResult>(`/api/services/${svc.name}`, 'POST', {
        enable,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: RUN_KEY, exact: true });
      setSentAt(Date.now());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the request');
    }
  }

  const progress = settling ?? (runBusy(run) ? run : null);
  const busy = following || settling !== null;
  const lastError = !busy && run && run.phase === 'error' ? run : null;

  return (
    <div className="space-y-6">
      <ServicesHelp services={view.services} />
      {!view.switching.available && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {view.switching.reason}
        </p>
      )}
      {view.services.map((svc) => {
        const on = svc.state !== 'off';
        const warning = !on ? memoryWarning(view, svc) : null;
        return (
          <Card key={svc.name}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2">
                    {svc.description.title}
                    <StatePill state={svc.state} />
                  </CardTitle>
                  <CardDescription>{svc.description.what}</CardDescription>
                </div>
                <Switch
                  checked={on}
                  disabled={!view.switching.available || busy}
                  onCheckedChange={(enable) => setConfirm({ svc, enable })}
                  aria-label={`${on ? 'Switch off' : 'Switch on'} ${svc.description.title}`}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Fact k="Used by" v={svc.description.usedBy} />
                <Fact k="When it is off" v={svc.description.whenOff} />
                <Fact k="Kept when off" v={svc.description.keeps} />
                <Fact
                  k="Cost"
                  v={`About ${svc.description.downloadMb} MB to download. Memory: ${svc.description.memory}.`}
                />
              </dl>
              {svc.description.note && (
                <p className="text-xs text-muted-foreground">{svc.description.note}</p>
              )}
              {warning && <Warning text={warning} />}
              {progress && progress.service === svc.name && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Spinner size={14} label="Working" />
                  {runLabel(progress)}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
      {lastError && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive-ink">The last switch did not work</CardTitle>
            <CardDescription>
              {lastError.service
                ? `${view.services.find((x) => x.name === lastError.service)?.description.title ?? lastError.service}: `
                : ''}
              {runLabel(lastError)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" onClick={() => setShowLog((v) => !v)}>
              {showLog ? 'Hide the log' : 'Show the log'}
            </Button>
            {showLog && <RunLog />}
          </CardContent>
        </Card>
      )}
      <ConfirmSwitch
        view={view}
        pending={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(svc, enable) => void send(svc, enable)}
      />
    </div>
  );
}

/** The screen's help box: what services are, and one line per service on
 *  what it enables. The details (cost, what stops) stay on each card. */
function ServicesHelp({ services }: { services: ServiceInfo[] }) {
  return (
    <div className="space-y-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-info-ink">
        <Info className="size-4 shrink-0" aria-hidden />
        What services are
      </p>
      <p className="text-muted-foreground">
        Optional parts of this box that you switch on or off. Off stops the service and keeps all of
        its data.
      </p>
      <ul className="space-y-1 text-muted-foreground">
        {services.map((svc) => (
          <li key={svc.name}>
            <span className="font-medium text-foreground">{svc.description.title}</span>:{' '}
            {SERVICE_ENABLES[svc.name] ?? svc.description.what}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfirmSwitch({
  view,
  pending,
  onCancel,
  onConfirm,
}: {
  view: ServicesView;
  pending: { svc: ServiceInfo; enable: boolean } | null;
  onCancel: () => void;
  onConfirm: (svc: ServiceInfo, enable: boolean) => void;
}) {
  const svc = pending?.svc;
  const enable = pending?.enable ?? false;
  const mem = svc && enable ? memoryWarning(view, svc) : null;
  const disk = svc && enable ? diskWarning(view, svc) : null;
  return (
    <AlertDialog open={pending !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {enable ? 'Switch on' : 'Switch off'} {svc?.description.title}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {enable ? (
                <>
                  <p>
                    The box downloads about {svc?.description.downloadMb} MB and starts the service.
                    This takes 1 to 3 minutes. The rest of the brain keeps running.
                  </p>
                  <p>Memory: {svc?.description.memory}.</p>
                </>
              ) : (
                <>
                  <p>{svc?.description.whenOff}</p>
                  <p className="font-medium text-foreground">
                    Kept: {svc?.description.keeps} Nothing is deleted.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mem && <Warning text={mem} />}
        {disk && <Warning text={disk} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => svc && onConfirm(svc, enable)}>
            {enable ? 'Switch on' : 'Switch off'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RunLog() {
  const { data, isPending } = useQuery({
    queryKey: RUN_KEY,
    queryFn: () => apiFetch<ServiceRunPoll>('/api/services/status'),
  });
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-snug scrollbar-thin">
      {isPending ? 'Loading…' : data?.log || 'The log is empty.'}
    </pre>
  );
}

function StatePill({ state }: { state: ServiceInfo['state'] }) {
  const tone =
    state === 'up'
      ? 'bg-success/15 text-success-ink'
      : state === 'down'
        ? 'bg-destructive/15 text-destructive-ink'
        : 'bg-muted text-muted-foreground';
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tone)}
    >
      {stateLabel(state)}
    </span>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-warning/15 p-2 text-xs text-warning-ink">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
