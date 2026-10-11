'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { shellRoleOf, type ShellRole } from '@/lib/workspaces';

export type { ShellRole };

type ShellRoleSlice = { role?: unknown };

/**
 * The login's role, from the shell the app frame already fetched (GET
 * /api/shell `role`, W5c contract). Never fetches it again from here; null
 * until the frame has it. One shell and one nav for every role: the role
 * picks only where a screen reads its data, until phase W6a scopes the
 * owner routes.
 */
export function useShellRole(): ShellRole | null {
  const { data } = useQuery({
    queryKey: ['shell'],
    queryFn: () => apiFetch<ShellRoleSlice>('/api/shell'),
    enabled: false,
    select: (d: ShellRoleSlice) => shellRoleOf(d),
  });
  return data ?? null;
}

/** What a client login sees on a screen with nothing for it yet: clients
 *  read no data routes in W5c. */
export const CLIENT_EMPTY_TEXT =
  'Nothing to show here yet. Items shared with your workspaces show here soon.';

export function ClientEmpty() {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
      <p className="max-w-sm">{CLIENT_EMPTY_TEXT}</p>
    </div>
  );
}

/**
 * Where a screen reads its data, by the brain's role: the owner screen
 * (`children`) for an admin, `member` for a member, `client` (else the plain
 * empty state) for a client. A spinner while the shell has not answered,
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
