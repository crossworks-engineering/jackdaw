'use client';

import { useState, type ReactNode } from 'react';
import { Loader2, LogOut, RotateCw } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { cn } from '@mantle/web-ui/lib/utils';
import { performSignOut } from '@mantle/web-ui/sign-out';
// Relative, not '@/': the node test runner renders these (viewer-role.test.ts)
// and does not resolve the app's path alias.
import { setMemberHint } from '../../lib/member-destination';

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

/** The settings-card shell (ui-style-guide §6e): a title block over a body. */
function NeutralCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground">
      <div className="border-b border-border p-4 md:p-5">
        <h1 className="text-base font-semibold">{title}</h1>
      </div>
      <div className="space-y-4 p-4 md:p-5">{children}</div>
    </section>
  );
}

/** Ends the session the plain way (POST /api/auth/logout, via the shared
 *  sign-out) and goes to /login. A full navigation, so nothing of this
 *  shell survives it. */
export function NeutralSignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setMemberHint(false);
        await performSignOut();
        window.location.assign('/login');
      }}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      Sign out
    </Button>
  );
}

/** Until the brain has said who this login is. */
export function RoleLoadingScreen({ fullScreen }: { fullScreen?: boolean }) {
  return (
    <NeutralFrame fullScreen={fullScreen}>
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    </NeutralFrame>
  );
}

/** A client login (client logins C0): the client portal is not built yet, so
 *  this is all a client sees. */
export function ClientLoginScreen({ fullScreen }: { fullScreen?: boolean }) {
  return (
    <NeutralFrame fullScreen={fullScreen}>
      <NeutralCard title="Client login">
        <p className="text-sm text-muted-foreground">
          This account is a client login. The client portal is not available yet.
        </p>
        <NeutralSignOutButton />
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

/** The brain could not be asked who this login is (a network failure, a
 *  500): try again, rather than guess. */
export function RoleProbeFailedScreen({
  fullScreen,
  onRetry,
}: {
  fullScreen?: boolean;
  onRetry: () => void;
}) {
  return (
    <NeutralFrame fullScreen={fullScreen}>
      <NeutralCard title="Could not reach the workspace">
        <p className="text-sm text-muted-foreground">
          The brain did not answer. Check the connection and try again.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetry}>
            <RotateCw aria-hidden />
            Try again
          </Button>
          <NeutralSignOutButton />
        </div>
      </NeutralCard>
    </NeutralFrame>
  );
}
