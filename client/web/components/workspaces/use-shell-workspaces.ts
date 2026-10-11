'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import type { Shell } from '@/lib/contract/shell';
import {
  isAdminUserShell,
  shellAreasOf,
  shellWorkspacesOf,
  type ShellWorkspace,
} from '@/lib/workspaces';

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
    queryFn: () => apiFetch<Shell>('/api/shell'),
    enabled: false,
    select: (d: Shell): ShellWorkspaceInfo => ({
      workspaces: shellWorkspacesOf(d),
      hasWorkspaces: Array.isArray(d?.workspaces),
      areas: shellAreasOf(d),
      login: d?.email ?? null,
    }),
  });
  return data;
}

/** The areas the login holds, from the shell (undefined from a brain that
 *  names none: before W5a it served the shell to admins only). */
export function useViewerAreas(): string[] | undefined {
  return useShellWorkspaces()?.areas;
}

/**
 * Whether the login is an Admin user (isAdminUserShell in lib/workspaces.ts):
 * false until the shell has answered. The admin private rows (personal
 * spaces, until phase W6b) read /api/admin/space*, which answers Admin
 * users only, so they render for this login only.
 */
export function useIsAdminUser(): boolean {
  const { data } = useQuery({
    queryKey: ['shell'],
    queryFn: () => apiFetch<Shell>('/api/shell'),
    enabled: false,
    select: (d: Shell) => isAdminUserShell(d),
  });
  return data === true;
}
