'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Who this app shell is rendering for (member logins, the real app shell).
 * Seeded by the (app) layout from the UX-only member hint cookie, so the
 * first paint already has the right chrome; the shell then confirms it
 * against the brain (/api/shell for an admin, /api/member/shell for a member)
 * and reloads when the hint was wrong. It gates what the CLIENT renders and
 * requests; the brain's 403s stay the real lock.
 */
export type ViewerRole = 'admin' | 'member';

const ViewerRoleContext = createContext<ViewerRole>('admin');

export function ViewerRoleProvider({ role, children }: { role: ViewerRole; children: ReactNode }) {
  return <ViewerRoleContext.Provider value={role}>{children}</ViewerRoleContext.Provider>;
}

export function useViewerRole(): ViewerRole {
  return useContext(ViewerRoleContext);
}

export function useIsMember(): boolean {
  return useContext(ViewerRoleContext) === 'member';
}

/** Render `member` for a member login and `children` for an admin. The owner
 *  screen never mounts for a member, so none of its admin requests fire. */
export function RoleSwitch({ member, children }: { member: ReactNode; children: ReactNode }) {
  return useIsMember() ? <>{member}</> : <>{children}</>;
}
