'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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
  type ServiceInfo,
  type ServiceRunPoll,
  type ServiceRunStatus,
  type ServicesView,
  type ServiceSwitchResult,
} from '@/lib/services';

const VIEW_POLL_MS = 15_000;
const RUN_POLL_MS = 2_000;

/**
 * Services: start and stop the box's optional services (sandboxes, media)
 * from the dashboard. Each row says what the service does, what needs it,
 * what stops while it is off, and what it costs; the switch asks the box's
 * updater to start or stop it. Off never removes anything. Admin-only (the
 * dashboard route is), and the routes refuse anyone else.
 */
export function ServicesCard() {
  const toast = useToast();
  const [view, setView] = useState<ServicesView | null>(null);
  const [missing, setMissing] = useState(false);
  const [poll, setPoll] = useState<ServiceRunPoll | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ svc: ServiceInfo; enable: boolean } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const following = useRef(false);
  // The toast API in a ref: the follow effect must not restart on a new object.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  // One toast per finished run, however many times the follow effect sees it.
  const announced = useRef<string | null>(null);

  const loadView = useCallback(async () => {
    try {
      setView(await apiFetch<ServicesView>('/api/services', { cache: 'no-store' }));
    } catch (err) {
      // A brain without the route (older than the switches) shows no card.
      if (err instanceof ApiError && err.status === 404) setMissing(true);
    }
  }, []);

  useEffect(() => {
    void loadView();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !following.current) void loadView();
    }, VIEW_POLL_MS);
    return () => clearInterval(t);
  }, [loadView]);

  // Follow a run: on load when one is already going, and after a switch.
  const viewBusy = runBusy(view?.run);
  useEffect(() => {
    if (!viewBusy && sentAt === null) return;
    following.current = true;
    let stopped = false;
    const tick = async () => {
      try {
        const p = await apiFetch<ServiceRunPoll>('/api/services/status', { cache: 'no-store' });
        if (stopped) return;
        setPoll(p);
        const run = currentRun(p.run, sentAt);
        if (run && !runBusy(run)) {
          stopped = true;
          following.current = false;
          setSentAt(null);
          const key = `${run.service}:${run.startedAt}:${run.phase}`;
          if (announced.current !== key) {
            announced.current = key;
            if (run.phase === 'done') toastRef.current.success(runLabel(run));
            else if (run.phase === 'error') toastRef.current.error(runLabel(run));
          }
          void loadView();
        }
      } catch {
        // The web container is not restarted by a switch, but a first-time
        // token recreates it: keep polling through the gap.
      }
    };
    void tick();
    const t = setInterval(() => void tick(), RUN_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [viewBusy, sentAt, loadView]);

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
      setPoll(null);
      setSentAt(Date.now());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the request');
    }
  }

  if (missing) return null;
  if (!view) return null;

  const run: ServiceRunStatus | null = currentRun(poll?.run ?? view.run, sentAt);
  const busy = sentAt !== null || runBusy(run);
  const lastError = run && run.phase === 'error' ? run : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Services</CardTitle>
        <CardDescription>
          Optional parts of this box. Switching one off stops it and keeps all its data.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {view.services.map((svc) => {
          const on = svc.state !== 'off';
          const mine = run && run.service === svc.name;
          return (
            <section key={svc.name} className="space-y-3 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{svc.description.title}</h3>
                    <StatePill state={svc.state} />
                  </div>
                  <p className="text-sm text-muted-foreground">{svc.description.what}</p>
                </div>
                <Switch
                  checked={on}
                  disabled={!view.switching.available || busy}
                  onCheckedChange={(enable) => setConfirm({ svc, enable })}
                  aria-label={`${on ? 'Switch off' : 'Switch on'} ${svc.description.title}`}
                  title={view.switching.reason ?? undefined}
                />
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
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
              {!on && memoryWarning(view, svc) && <Warning text={memoryWarning(view, svc)!} />}
              {mine && runBusy(run) && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                  <Spinner size={14} label="Working" />
                  {runLabel(run)}
                </p>
              )}
            </section>
          );
        })}
      </CardContent>
      {(!view.switching.available || lastError) && (
        <CardContent className="space-y-2 border-t pt-4 text-xs">
          {!view.switching.available && (
            <p className="text-muted-foreground">{view.switching.reason}</p>
          )}
          {lastError && (
            <div className="space-y-1">
              <p className="text-destructive-ink">
                Last switch of {lastError.service ?? 'a service'} did not work:{' '}
                {runLabel(lastError)}
              </p>
              <Button
                variant="link"
                size="2xs"
                className="px-0"
                onClick={() => setShowLog((v) => !v)}
              >
                {showLog ? 'Hide the log' : 'Show the log'}
              </Button>
              {showLog && <RunLog />}
            </div>
          )}
        </CardContent>
      )}
      <ConfirmSwitch
        view={view}
        pending={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(svc, enable) => void send(svc, enable)}
      />
    </Card>
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
  const [log, setLog] = useState<string | null>(null);
  useEffect(() => {
    void apiFetch<ServiceRunPoll>('/api/services/status', { cache: 'no-store' })
      .then((p) => setLog(p.log))
      .catch(() => setLog(''));
  }, []);
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-snug scrollbar-thin">
      {log === null ? 'Loading…' : log || 'The log is empty.'}
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
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
