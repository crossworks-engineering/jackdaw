'use client';

import Link from 'next/link';
import { ChevronsUpDown, Layers } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import {
  ALL_WORKSPACES,
  ALL_WORKSPACES_LABEL,
  SWITCHER_NOTE,
  currentWorkspaceLabel,
  resolveCurrentWorkspace,
  sortWorkspaces,
  type ShellWorkspace,
} from '@/lib/workspaces';
import { useCurrentWorkspace } from '@/lib/workspace-current';
import { useShellWorkspaces } from './use-shell-workspaces';

export type SwitcherOption = { value: string; label: string; hint: string | null };

/** The menu's choices, top to bottom: All my workspaces, then each workspace
 *  (Admin first, then by name), each Moderator one marked. */
export function switcherOptions(workspaces: readonly ShellWorkspace[]): SwitcherOption[] {
  const sorted = sortWorkspaces(workspaces.map((w) => ({ ...w, archived: false })));
  return [
    { value: ALL_WORKSPACES, label: ALL_WORKSPACES_LABEL, hint: null },
    ...sorted.map((w) => ({ value: w.id, label: w.name, hint: w.moderator ? 'Moderator' : null })),
  ];
}

/**
 * The workspace switcher (plan 7.1): in the rail head under the brand, and in
 * the phone bar. It lists the login's workspaces and keeps the choice per
 * login. The lists follow it (useListWorkspace, W5b).
 *
 * Renders nothing for a brain that sends no workspaces (before W5a).
 */
export function WorkspaceSwitcher({
  variant = 'rail',
  onNavigate,
}: {
  /** `rail`: a full-width row (an icon in the collapsed rail). `bar`: an
   *  icon button for the phone bar. */
  variant?: 'rail' | 'bar';
  onNavigate?: () => void;
}) {
  const info = useShellWorkspaces();
  const [stored, setStored] = useCurrentWorkspace(info?.login);
  if (!info?.hasWorkspaces) return null;
  const current = resolveCurrentWorkspace(stored, info.workspaces);
  return (
    <WorkspaceSwitcherView
      variant={variant}
      workspaces={info.workspaces}
      current={current}
      onChange={(id) => setStored(id === ALL_WORKSPACES ? null : id)}
      onNavigate={onNavigate}
    />
  );
}

export function WorkspaceSwitcherView({
  variant,
  workspaces,
  current,
  onChange,
  onNavigate,
}: {
  variant: 'rail' | 'bar';
  workspaces: readonly ShellWorkspace[];
  current: string;
  onChange: (id: string) => void;
  onNavigate?: () => void;
}) {
  const label = currentWorkspaceLabel(current, workspaces);
  const options = switcherOptions(workspaces);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'bar' ? (
          <Button variant="ghost" size="icon" aria-label={`Workspace: ${label}`} title={label}>
            <Layers />
          </Button>
        ) : (
          <RowButton
            data-tour="workspace-switcher"
            aria-label={`Workspace: ${label}`}
            title={label}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              'hover:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.06]',
              'group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:gap-0 group-data-[nav-collapsed=true]/shell:px-0',
            )}
          >
            <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground group-data-[nav-collapsed=true]/shell:hidden">
              {label}
            </span>
            <ChevronsUpDown
              className="size-3.5 shrink-0 text-muted-foreground group-data-[nav-collapsed=true]/shell:hidden"
              aria-hidden
            />
          </RowButton>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === 'rail' ? 'start' : 'end'}
        side="bottom"
        className="w-64"
      >
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint ? (
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{o.hint}</span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{SWITCHER_NOTE}</p>
        <DropdownMenuItem asChild>
          <Link href="/settings/workspaces" onClick={onNavigate}>
            Manage workspaces
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
