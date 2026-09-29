'use client';

import { useEffect, useRef } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { setAssetToken } from '@mantle/web-ui/asset-url';
import { useColorTheme } from '@mantle/web-ui/color-theme-provider';
import { useFonts } from '@mantle/web-ui/font-provider';
import { COLOR_THEMES } from '@mantle/web-ui/lib/themes';
import { ToastProvider } from '@mantle/web-ui/ui/toast';
import {
  ClientLoginScreen,
  RoleLoadingScreen,
  RoleProbeFailedScreen,
} from '@/components/member/role-screens';
import { clientPortalView } from '@/lib/client-portal';
import type { ClientShell } from '@/lib/contract-next';
import { ClientShellFrame } from './client-shell-frame';

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
      return <RoleProbeFailedScreen fullScreen onRetry={() => void query.refetch()} />;
    default:
      return <RoleLoadingScreen fullScreen />;
  }
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
}
