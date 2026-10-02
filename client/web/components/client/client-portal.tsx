'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { setAssetToken } from '@mantle/web-ui/asset-url';
import { onSignOut } from '@mantle/web-ui/sign-out';
import { useColorTheme } from '@mantle/web-ui/color-theme-provider';
import { useFonts } from '@mantle/web-ui/font-provider';
import { COLOR_THEMES } from '@mantle/web-ui/lib/themes';
import { ToastProvider } from '@mantle/web-ui/ui/toast';
import {
  ClientLoginScreen,
  RoleLoadingScreen,
  RoleProbeFailedScreen,
} from '@/components/member/role-screens';
import { clientTabTitle } from '@/lib/brand';
import { clientPortalView, isNewShellAnswer, refreshClientPortal } from '@/lib/client-portal';
import { clearRescues, clientRescueOwner, setRescueOwner, sweepRescues } from '@/lib/member-rescue';
import type { ClientShell } from '@mantle/client-types';
import { ClientShellFrame } from './client-shell-frame';
import { recordActiveIdentity } from '@mantle/web-ui/session-registry';
import { refreshAllSessions } from '@mantle/web-ui/token-refresh';

/**
 * A CLIENT login's whole app (client logins C2): the shell renders this in
 * place of itself, so no owner or member chrome, page or request is ever
 * mounted for a client. It waits for GET /api/client/shell (the query the
 * shell runs and polls), then draws the client chrome and "Shared with you".
 * A brain without the client routes (404) gets the plain client screen.
 */
export function ClientPortal({ query }: { query: UseQueryResult<ClientShell> }) {
  const view = clientPortalView(query);
  const shell = query.data;
  useBrand(shell);
  useFreshList(query.dataUpdatedAt);
  useRescueOwner(shell);
  useHeldClientUpkeep(shell);
  switch (view) {
    case 'ready':
      return (
        <ToastProvider>
          <ClientShellFrame shell={shell!} />
        </ToastProvider>
      );
    case 'unavailable':
      return <ClientLoginScreen fullScreen />;
    case 'failed':
      return <RoleProbeFailedScreen fullScreen client onRetry={() => void query.refetch()} />;
    case 'offline':
      return (
        <RoleProbeFailedScreen
          fullScreen
          client
          failure="offline"
          onRetry={() => void query.refetch()}
        />
      );
    default:
      return <RoleLoadingScreen fullScreen client />;
  }
}

/**
 * A client login the desktop app holds as a session (a bearer, by emailed
 * code): the client shell names it, so its row learns its name and role, and
 * every login held here is kept alive, as the owner shell does for its own.
 * No-ops for a cookie client (a browser's), which holds no session.
 */
function useHeldClientUpkeep(shell: ClientShell | undefined) {
  // Keyed on what it records, not the shell object: the shell is polled
  // about once a minute, and this is once per load or per change of name.
  const email = shell?.email;
  const displayName = shell?.displayName;
  const siteName = shell?.siteName;
  useEffect(() => {
    if (email === undefined) return;
    recordActiveIdentity({ email, displayName, siteName, role: 'client' });
    void refreshAllSessions();
  }, [email, displayName, siteName]);
}

/**
 * Big-save rescue copies (lib/member-rescue.ts) for a client's own items
 * (client tier audit U7): the owner shell's frame, which sets the owner for
 * an admin and a member, never mounts for a client, so the portal does the
 * same here. Expired copies go at boot, the rest are kept under this client
 * login, and all go at sign-out.
 */
function useRescueOwner(shell: ClientShell | undefined) {
  useEffect(() => {
    sweepRescues(Date.now());
    return onSignOut(() => {
      setRescueOwner(null);
      clearRescues();
    });
  }, []);
  const who = clientRescueOwner(shell);
  useEffect(() => {
    setRescueOwner(who);
  }, [who]);
}

/**
 * A client has no realtime: "Shared with you" and the open item are asked
 * again on every successful shell poll (about a minute) and whenever the
 * window gets focus, so something shared, unshared or changed since shows
 * without a reload (audit B27).
 */
function useFreshList(dataUpdatedAt: number) {
  const queryClient = useQueryClient();
  const last = useRef(0);
  useEffect(() => {
    if (isNewShellAnswer(last.current, dataUpdatedAt)) void refreshClientPortal(queryClient);
    last.current = dataUpdatedAt;
  }, [dataUpdatedAt, queryClient]);
  useEffect(() => {
    const onFocus = () => void refreshClientPortal(queryClient);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [queryClient]);
}

/**
 * The brand's theme and fonts, adopted once per load (the owner shell's
 * rule), and the asset token published for the byte routes. The theme
 * choices a client makes are its own browser's (the account menu's theme
 * items never write to the brain).
 */
function useBrand(shell: ClientShell | undefined) {
  const { colorTheme: active, adoptServerTheme } = useColorTheme();
  const adoptedTheme = useRef(false);
  useEffect(() => {
    if (adoptedTheme.current || shell === undefined) return;
    adoptedTheme.current = true;
    const stored = shell.colorTheme;
    if (!stored || stored === active) return;
    if (!COLOR_THEMES.some((t) => t.id === stored)) return;
    adoptServerTheme(stored);
  }, [shell, active, adoptServerTheme]);

  const { adoptServerFonts } = useFonts();
  const adoptedFonts = useRef(false);
  useEffect(() => {
    if (adoptedFonts.current || shell === undefined) return;
    adoptedFonts.current = true;
    adoptServerFonts(
      {
        logo: shell.fontLogo ?? null,
        title: shell.fontTitle ?? null,
        ui: shell.fontUi ?? null,
        prose: shell.fontProse ?? null,
      },
      {
        ui: shell.fontSize ?? null,
        logo: shell.fontLogoSize ?? null,
        title: shell.fontTitleSize ?? null,
        prose: shell.fontProseSize ?? null,
      },
    );
  }, [shell, adoptServerFonts]);

  useEffect(() => {
    setAssetToken(shell?.assetToken);
  }, [shell?.assetToken]);

  // The tab: the site name, else the product's, never the peer name (the
  // layout does the same from the client hint, for the first paint).
  const siteName = shell?.siteName ?? null;
  const confirmed = shell !== undefined;
  useEffect(() => {
    if (confirmed) document.title = clientTabTitle({ siteName });
  }, [confirmed, siteName]);
}
