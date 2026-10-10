'use client';

import { useCurrentWorkspace } from '@/lib/workspace-current';
import { ALL_WORKSPACES, resolveCurrentWorkspace } from '@/lib/workspaces';
import { useShellWorkspaces } from './use-shell-workspaces';

/**
 * The workspace the lists show (plan 7.1, W5b): the switcher's choice, or
 * null for "All my workspaces" and on a brain that sends no workspaces. A
 * list puts it in its URL (`?ws=`, withWs) and in its query key, so a switch
 * loads the list again.
 */
export function useListWorkspace(): string | null {
  const info = useShellWorkspaces();
  const [stored] = useCurrentWorkspace(info?.login);
  if (!info?.hasWorkspaces) return null;
  const current = resolveCurrentWorkspace(stored, info.workspaces);
  return current === ALL_WORKSPACES ? null : current;
}
