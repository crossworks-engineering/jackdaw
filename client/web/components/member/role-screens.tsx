'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, LogOut, RotateCw } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { cn } from '@mantle/web-ui/lib/utils';
import { performSignOut } from '@mantle/web-ui/sign-out';
// Relative, not '@/': the node test runner renders these (viewer-role.test.ts)
// and does not resolve the app's path alias.
import { CLIENT_SIGNIN_PATH } from '../../lib/client-surface';
import { setClientHint, setMemberHint } from '../../lib/member-destination';
import { shellRetryDelayMs, type ShellProbeFailure } from '../../lib/shell-role';

/**
 * The neutral screens the shell shows when it must not show the owner (or
 * member) chrome (client logins C0): while the brain has not said who this
 * login is, for a client login, for a role this app does not know, and when
 * the brain could not be asked. None of them makes a request of its own
 * beyond sign-out, and none carries the rail, the nav or a page.
 *
 * `fullScreen` when the shell renders one in place of itself; without it the
 * screen fills the pane it is put in (RoleSwitch inside a page).
 */
function NeutralFrame({ fullScreen, children }: { fullScreen?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex w-full items-center justify-center bg-background p-4 text-foreground',
        fullScreen ? 'min-h-dvh' : 'h-full min-h-64',
      )}
    >
      {children}
    </div>
  );
}

/** The settings-card shell (ui-style-guide §6e): a title block over a body.
 *  `alert`: a failure the screen reader announces, focused on mount so the
 *  keyboard starts at it. */
function NeutralCard({
  title,
  alert = false,
  children,
}: {
  title: string;
  alert?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (alert) ref.current?.focus();
  }, [alert]);
  return (
    <section
      ref={ref}
      role={alert ? 'alert' : undefined}
      tabIndex={alert ? -1 : undefined}
      className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground outline-none"
    >
      <div className="border-b border-border p-4 md:p-5">
        <h1 className="text-base font-semibold">{title}</h1>
      </div>
      <div className="space-y-4 p-4 md:p-5">{children}</div>
    </section>
  );
}

/** Where Sign out on a neutral screen goes: a client login to the client
 *  sign-in page (client tier audit U12: the hints are cleared first, so the
 *  middleware can no longer send it there from /login), anyone else to
 *  /login. */
export function neutralSignOutPath(client: boolean): string {
  return client ? CLIENT_SIGNIN_PATH : '/login';
}

/** Ends the session the plain way (POST /api/auth/logout, via the shared
 *  sign-out) and goes to /login, or a client to its own sign-in page. A full
 *  navigation, so nothing of this shell survives it. */
export function NeutralSignOutButton({ client = false }: { client?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setMemberHint(false);
        setClientHint(false);
        await performSignOut();
        window.location.assign(neutralSignOutPath(client));
      }}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      Sign out
    </Button>
  );
}

/** How long the loading screen waits before it offers Sign out: a slow
 *  first answer is normal, a stuck one must not trap the login. */
export const LOADING_SIGN_OUT_AFTER_MS = 4_000;

/** Until the brain has said who this login is. Sign out joins it after
 *  `signOutAfterMs` (0: from the start). */
export function RoleLoadingScreen({
  fullScreen,
  signOutAfterMs = LOADING_SIGN_OUT_AFTER_MS,
  client = false,
}: {
  fullScreen?: boolean;
  signOutAfterMs?: number;
  /** A client login (the client portal): Sign out goes to its sign-in. */
  client?: boolean;
}) {
  const [slow, setSlow] = useState(signOutAfterMs <= 0);
  useEffect(() => {
    if (signOutAfterMs <= 0) return;
    const t = setTimeout(() => setSlow(true), signOutAfterMs);
    return () => clearTimeout(t);
  }, [signOutAfterMs]);
  return (
    <NeutralFrame fullScreen={fullScreen}>
      <div className="flex flex-col items-center gap-4">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </p>
        {slow ? <NeutralSignOutButton client={client} /> : null}
      </div>
    </NeutralFrame>
  );
}

/** A client login on a brain without the client portal's routes (before
 *  client logins C2: /api/client/shell answers 404), and the fail-closed
 *  answer of a page's RoleSwitch: this is all such a client sees. */
export function ClientLoginScreen({ fullScreen }: { fullScreen?: boolean }) {
  return (
    <NeutralFrame fullScreen={fullScreen}>
      <NeutralCard title="Client login">
        <p className="text-sm text-muted-foreground">
          This account is a client login. The client portal is not available yet.
        </p>
        <NeutralSignOutButton client />
      </NeutralCard>
    </NeutralFrame>
  );
}

/** A role this app does not know (a newer brain's): never the owner screens. */
export function UnknownRoleScreen({ fullScreen }: { fullScreen?: boolean }) {
  return (
    <NeutralFrame fullScreen={fullScreen}>
      <NeutralCard title="Not available">
        <p className="text-sm text-muted-foreground">
          This account cannot open this workspace here. Sign out and sign in with another account.
        </p>
        <NeutralSignOutButton />
      </NeutralCard>
    </NeutralFrame>
  );
}

/** What the failed screen says, by how the probe failed. Never "the brain
 *  did not answer" for an answer (a 500, a 403): that one says only that the
 *  workspace did not load. */
export const PROBE_FAILURE_TEXT: Record<ShellProbeFailure, string> = {
  offline: 'This device is offline. The workspace loads once the connection is back.',
  unreachable: 'The brain could not be reached. Check the connection.',
  error: 'Something went wrong while loading it.',
};

/** The brain could not be asked who this login is (offline, unreachable, a
 *  500): fail closed, and keep asking. It retries on its own with a backoff
 *  (2, 4, 8, then every 15 s) for as long as it shows, and Try again asks at
 *  once. The card is an alert and takes focus, so a screen reader hears it
 *  and the keyboard starts at it. */
export function RoleProbeFailedScreen({
  fullScreen,
  failure = 'error',
  retrying = false,
  onRetry,
  client = false,
}: {
  fullScreen?: boolean;
  failure?: ShellProbeFailure;
  /** A retry is in flight. */
  retrying?: boolean;
  onRetry: () => void;
  /** A client login (the client portal): Sign out goes to its sign-in. */
  client?: boolean;
}) {
  const retry = useRef(onRetry);
  retry.current = onRetry;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setAttempt((a) => a + 1);
      retry.current();
    }, shellRetryDelayMs(attempt));
    return () => clearTimeout(t);
  }, [attempt]);
  return (
    <NeutralFrame fullScreen={fullScreen}>
      <NeutralCard title="Could not load your workspace" alert>
        <p className="text-sm text-muted-foreground">{PROBE_FAILURE_TEXT[failure]}</p>
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className={cn('size-3.5', retrying && 'animate-spin')} aria-hidden />
          Reconnecting…
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetry} disabled={retrying}>
            <RotateCw aria-hidden />
            Try again
          </Button>
          <NeutralSignOutButton client={client} />
        </div>
      </NeutralCard>
    </NeutralFrame>
  );
}
