'use client';

import { useCallback } from 'react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { cn } from '@mantle/web-ui/lib/utils';
import { useCurrentWorkspace } from '@/lib/workspace-current';
import { hitLabel, switchFor } from '@/lib/workspace-hits';
import type { ShellWorkspace } from '@/lib/workspaces';
import { useListWorkspace } from './use-list-workspace';
import { useShellWorkspaces } from './use-shell-workspaces';
import { WorkspaceTile } from './workspace-tile';

/**
 * Search across workspaces (brain task f26a516e): what a search hit from
 * another workspace needs. `target` names the workspace a hit opens in when
 * that is not the switcher's (null: open it here); `switchTo` is the
 * switcher's own pick, so the lists follow it at once; `workspaces` are the
 * login's, for the hint under an empty folder.
 */
export function useWorkspaceJump() {
  const info = useShellWorkspaces();
  const [, setStored] = useCurrentWorkspace(info?.login);
  const current = useListWorkspace();
  const workspaces = info?.workspaces;
  const target = useCallback(
    (hit: unknown) => switchFor(hit, current, workspaces ?? []),
    [current, workspaces],
  );
  return { current, workspaces: workspaces ?? [], target, switchTo: setStored };
}

/**
 * The small tag on a hit from another workspace: that workspace's tile and
 * name, quiet, after the title. Its text follows a selected row's colour
 * (`selectedText`, the palette's rows fill with `bg-accent`).
 */
export function WorkspaceHitTag({
  workspace,
  selectedText,
  className,
}: {
  workspace: Pick<ShellWorkspace, 'name' | 'private'> & Partial<ShellWorkspace>;
  selectedText?: string;
  className?: string;
}) {
  const label = hitLabel(workspace);
  return (
    <Badge
      variant="outline"
      title={`In ${label}. Opening it switches to ${label}.`}
      className={cn(
        'max-w-32 shrink-0 gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground',
        selectedText,
        className,
      )}
    >
      <WorkspaceTile workspace={workspace} size="xs" />
      <span className="truncate">
        {/* Read after the title: "Budget, in Admin", not "Budget Admin". */}
        <span className="sr-only">in </span>
        {label}
      </span>
    </Badge>
  );
}
