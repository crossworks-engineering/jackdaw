'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import type { Shell, ShellRole } from '@/lib/contract/shell';
import { shellRoleOf } from '@/lib/workspaces';

export type { ShellRole };

/**
 * The login's role, from the shell the app frame already fetched (GET
 * /api/shell `role`, W5c contract). Never fetches it again from here; null
 * until the frame has it. One shell, one nav and one set of data routes for
 * every role (W6b): the role picks the chat, the app runner, the byte routes
 * and the MCP screen.
 */
export function useShellRole(): ShellRole | null {
  const { data } = useQuery({
    queryKey: ['shell'],
    queryFn: () => apiFetch<Shell>('/api/shell'),
    enabled: false,
    select: (d: Shell) => shellRoleOf(d),
  });
  return data ?? null;
}

/** What a client login sees on a screen with nothing for it yet: an app's
 *  run screen (the app runner is a member's) and the MCP screen. */
export const CLIENT_EMPTY_TEXT = 'There is nothing here for your login yet.';

export function ClientEmpty() {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
      <p className="max-w-sm">{CLIENT_EMPTY_TEXT}</p>
    </div>
  );
}

/**
 * A screen that differs by the brain's role (W6b: never for data; the MCP
 * screen and an app's run screen): `children` for an admin, `member` for a
 * member, `client` (else the plain empty state) for a client. A spinner while the shell has not answered,
 * which the frame's own gate makes rare: it renders pages only after.
 */
export function RoleSwitch({
  member,
  client,
  children,
}: {
  member: ReactNode;
  client?: ReactNode;
  children: ReactNode;
}) {
  const role = useShellRole();
  switch (role) {
    case 'admin':
      return <>{children}</>;
    case 'member':
      return <>{member}</>;
    case 'client':
      return <>{client ?? <ClientEmpty />}</>;
    default:
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      );
  }
}

/** A client-side replace to `href`: a deep link that is a redirect for an
 *  admin, inside a RoleSwitch (a server redirect would run for every role). */
export function RedirectTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );
}
