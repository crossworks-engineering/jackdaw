'use client';

import { createContext, useContext, type ReactNode } from 'react';
// Relative, not '@/': the node test runner renders this (viewer-role.test.ts).
import type { ViewerRole } from '../../lib/shell-role';
import {
  ClientLoginScreen,
  RoleLoadingScreen,
  RoleProbeFailedScreen,
  UnknownRoleScreen,
} from './role-screens';

export type { ViewerRole };

/**
 * Who this app shell is rendering for (member logins, the real app shell;
 * three roles since client logins C0). Null until the brain has said: the
 * context has NO default role, least of all admin. The (app) layout seeds a
 * member from the UX-only member hint cookie so a member's first paint is
 * already the member shell; anything else starts unknown, and the shell
 * confirms it against the brain (/api/shell answers only an admin,
 * /api/member/shell only a member, and both refuse a client with 403
 * `client-login`). It gates what the CLIENT renders and requests; the
 * brain's 403s stay the real lock.
 */
const ViewerRoleContext = createContext<ViewerRole | null>(null);

export function ViewerRoleProvider({
  role,
  children,
}: {
  role: ViewerRole | null;
  children: ReactNode;
}) {
  return <ViewerRoleContext.Provider value={role}>{children}</ViewerRoleContext.Provider>;
}

/** The role, or null while it is not known (or outside a provider). */
export function useViewerRole(): ViewerRole | null {
  return useContext(ViewerRoleContext);
}

export function useIsMember(): boolean {
  return useContext(ViewerRoleContext) === 'member';
}

/** True only for a confirmed admin: never while the role is unknown. */
export function useIsAdmin(): boolean {
  return useContext(ViewerRoleContext) === 'admin';
}

/**
 * Render `children` (the owner screen) for an admin and `member` for a
 * member. Each branch is explicit: a client login gets the neutral client
 * screen (the shell renders the client portal in place of every page, so a
 * page's switch never meets one; this is the fail-closed answer if it does),
 * an unknown role the neutral "not available" screen, and no role yet the
 * neutral loading screen. The owner screen mounts for `admin` and
 * nothing else, so none of its admin requests fire for anyone else.
 */
export function RoleSwitch({ member, children }: { member: ReactNode; children: ReactNode }) {
  const role = useViewerRole();
  switch (role) {
    case 'admin':
      return <>{children}</>;
    case 'member':
      return <>{member}</>;
    case 'client':
      return <ClientLoginScreen />;
    case null:
      return <RoleLoadingScreen />;
    default:
      return <UnknownRoleScreen />;
  }
}

/**
 * The shell's own gate (client logins C0, C2): the whole shell, chrome and
 * page, renders only for a confirmed admin or member; a client login gets
 * `client` (the client portal, which is its whole app) in its place, never
 * the frame or a page of the owner or member app. Anything else gets a
 * neutral full-window screen instead, with no rail, no nav and no request
 * of its own: loading while the brain has not answered (or Try again when it
 * could not be asked), "not available" for a role this app does not know.
 */
export function ShellRoleGate({
  role,
  probeFailed = false,
  onRetry,
  client,
  children,
}: {
  role: ViewerRole | null;
  probeFailed?: boolean;
  onRetry: () => void;
  /** What a client login gets: the client portal. */
  client: ReactNode;
  children: (role: 'admin' | 'member') => ReactNode;
}) {
  switch (role) {
    case 'admin':
    case 'member':
      return <>{children(role)}</>;
    case 'client':
      return <>{client}</>;
    case null:
      return probeFailed ? (
        <RoleProbeFailedScreen fullScreen onRetry={onRetry} />
      ) : (
        <RoleLoadingScreen fullScreen />
      );
    default:
      return <UnknownRoleScreen fullScreen />;
  }
}
