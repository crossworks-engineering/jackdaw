'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { shellAreasOf, shellWorkspacesOf, type ShellWorkspace } from '@/lib/workspaces';
import { useViewerRole } from '@/components/member/viewer-role';

type ShellSlice = { workspaces?: unknown; areas?: unknown; email?: string | null };

export type ShellWorkspaceInfo = {
  /** The login's workspaces, as the shell names them ([] when it names none). */
  workspaces: ShellWorkspace[];
  /** Whether this brain sends workspaces at all (W5a and later). */
  hasWorkspaces: boolean;
  /** The areas the login holds; undefined from a brain that sends none. */
  areas: string[] | undefined;
  /** Who is signed in, to key the switcher's choice by login. */
  login: string | null;
};

/**
 * The workspaces and areas from the shell the app frame already fetched
 * (GET /api/shell). Never fetches it again from here; undefined until the
 * frame has it.
 */
export function useShellWorkspaces(): ShellWorkspaceInfo | undefined {
  const { data } = useQuery({
    queryKey: ['shell'],
    queryFn: () => apiFetch<ShellSlice>('/api/shell'),
    enabled: false,
    select: (d: ShellSlice): ShellWorkspaceInfo => ({
      workspaces: shellWorkspacesOf(d),
      hasWorkspaces: Array.isArray(d?.workspaces),
      areas: shellAreasOf(d),
      login: d?.email ?? null,
    }),
  });
  return data;
}

/**
 * The areas a workspaces screen goes by. A member's shell has no /api/shell
 * (members move to the one shell in W5c), and a member is never an Admin
 * user: no areas. Elsewhere, the shell's (undefined from a brain before W5a:
 * it serves the owner shell to admins only).
 */
export function useViewerAreas(): string[] | undefined {
  const role = useViewerRole();
  const areas = useShellWorkspaces()?.areas;
  return role === 'member' ? [] : areas;
}
