/**
 * A workspace's look (task 5edc9149): its colour and its icon, picked on
 * the workspace screen the way a folder's are (one palette, one icon set),
 * and shown in the switcher, on the workspace screens and on the share
 * marks of the lists and the item tree. The brain sends `color` and `icon`
 * (null = not picked) and the workspace's `kind`; this module says what is
 * drawn when nothing is picked, so every surface draws the same.
 *
 * Pure, so the node test runner covers it (workspace-look.test.ts).
 */
import { isAppTint, type AppTint } from '@mantle/client-types/app-nav';
import type { WorkspaceKind, WorkspaceLook } from './contract/workspaces';

/** The icon a workspace shows when none is picked, by its kind. Each is in
 *  the curated set (components/app-nav/app-icons.ts). */
export const WORKSPACE_DEFAULT_ICONS: Readonly<Record<WorkspaceKind, string>> = {
  admin: 'lucide:shield-check',
  team: 'lucide:users',
  private: 'lucide:lock',
  other: 'lucide:layers',
};

const KINDS = Object.keys(WORKSPACE_DEFAULT_ICONS) as WorkspaceKind[];

/** What a look is read from: a workspace row, a switcher entry or a chip.
 *  `isAdmin` and `private` stand in for `kind` from an older brain. */
export type LookSource = WorkspaceLook & { isAdmin?: boolean; private?: true };

/** A look ready to draw: a tint or null (the neutral colour), and an icon. */
export type ResolvedLook = { color: AppTint | null; icon: string; kind: WorkspaceKind };

/** The workspace's kind: the brain's, else what an older brain's fields say. */
export function workspaceKindOf(w: LookSource | null | undefined): WorkspaceKind {
  if (w?.kind && KINDS.includes(w.kind)) return w.kind;
  if (w?.isAdmin) return 'admin';
  if (w?.private) return 'private';
  return 'other';
}

/** The look to draw: the picked colour and icon, else the defaults. */
export function resolveWorkspaceLook(w: LookSource | null | undefined): ResolvedLook {
  const kind = workspaceKindOf(w);
  const icon = typeof w?.icon === 'string' && w.icon.trim() ? w.icon : null;
  return {
    kind,
    color: isAppTint(w?.color) ? w.color : null,
    icon: icon ?? WORKSPACE_DEFAULT_ICONS[kind],
  };
}
