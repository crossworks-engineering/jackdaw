/**
 * Which role the app shell renders for, from what the brain has said so far
 * (client logins C0). Three roles, and a fourth answer that is not a role:
 * null, "not known yet". Nothing defaults to admin. The owner chrome, the
 * owner screens and every request they make wait for the brain to confirm an
 * admin: /api/shell answering 200. Before that the shell shows a neutral
 * loading screen, and a client login (403 `client-login`) gets the neutral
 * client screen for good.
 *
 * Pure: no React, so every answer is unit-tested (shell-role.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { LoginKind } from '@mantle/client-types';
import { isLoginRefusal, loginRefusalReason } from './member-destination';

/** Who the shell is rendering for. The brain's own login roles. */
export type ViewerRole = LoginKind;

/** One of the shell's two probes, as far as the role goes: whether it has
 *  answered with data (ever: a later failed refetch keeps it) and its
 *  latest error. */
export type ShellProbe = { hasData: boolean; error: unknown };

export type ShellRoleInput = {
  /** From the UX-only member hint cookie: 'member' seeds the member shell
   *  for the first paint; null asks the brain first. Never 'admin'. */
  seed: 'member' | null;
  /** GET /api/shell: asked unless seeded as a member. 200 only for an admin. */
  shell: ShellProbe;
  /** GET /api/member/shell: asked when seeded as a member. */
  member: ShellProbe;
};

/**
 * The role, or null while it is not known.
 *
 * - A `client-login` refusal from either probe is a client, whatever was
 *   cached before it: the login in this browser changed.
 * - Seeded as a member: the member shell, until the member route says this
 *   is an admin (`admin-login`: the shell reloads without the hint, null
 *   meanwhile). Member chrome is not owner chrome, and member requests are
 *   member routes.
 * - Otherwise admin only once /api/shell has answered with data. A
 *   `member-login` refusal is null while the shell reloads as the member;
 *   pending, a network failure or any other error is null too. A failed
 *   refetch after a good answer keeps admin (the data is still there).
 */
export function resolveShellRole({ seed, shell, member }: ShellRoleInput): ViewerRole | null {
  if (
    loginRefusalReason(shell.error) === 'client-login' ||
    loginRefusalReason(member.error) === 'client-login'
  ) {
    return 'client';
  }
  if (seed === 'member') {
    return loginRefusalReason(member.error) === 'admin-login' ? null : 'member';
  }
  if (loginRefusalReason(shell.error) === 'member-login') return null;
  return shell.hasData ? 'admin' : null;
}

/** The role probe failed with nothing to say about the role (a network
 *  failure, a 500, a proxy's bare 403): the shell offers Try again rather
 *  than guessing. A 401 is not one: apiFetch is already on its way to
 *  /login. */
export function shellProbeFailed(input: ShellRoleInput, role: ViewerRole | null): boolean {
  if (role !== null || input.seed === 'member') return false;
  const err = input.shell.error;
  if (err == null || isLoginRefusal(err)) return false;
  return !(err instanceof ApiError && err.status === 401);
}
