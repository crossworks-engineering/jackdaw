/**
 * Which role the app shell renders for, from what the brain has said so far
 * (client logins C0). Three roles, and a fourth answer that is not a role:
 * null, "not known yet". Nothing defaults to admin. The owner chrome, the
 * owner screens and every request they make wait for the brain to confirm an
 * admin: /api/shell answering 200. Before that the shell shows a neutral
 * loading screen, and a client login (403 `client-login`, or the client hint
 * the brain has not contradicted) gets the client portal (C2) for good.
 *
 * Pure: no React, so every answer is unit-tested (shell-role.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { LoginKind } from '@mantle/client-types';
import { isLoginRefusal, loginRefusalReason } from './member-destination';

/** Who the shell is rendering for. The brain's own login roles. */
export type ViewerRole = LoginKind;

/** One of the shell's probes, as far as the role goes: whether it has
 *  answered with data (ever: a later failed refetch keeps it), its latest
 *  error, and whether TanStack parked it for want of a network (`fetchStatus`
 *  'paused': offline, so it never reaches an error on its own). */
export type ShellProbe = { hasData: boolean; error: unknown; paused?: boolean };

export type ShellRoleInput = {
  /** From the UX-only hint cookies: 'member' seeds the member shell and
   *  'client' the client portal for the first paint; null asks the brain
   *  first. Never 'admin'. */
  seed: 'member' | 'client' | null;
  /** GET /api/shell: asked unless seeded. 200 only for an admin. */
  shell: ShellProbe;
  /** GET /api/member/shell: asked when seeded as a member. */
  member: ShellProbe;
  /** GET /api/client/shell: asked when seeded as a client, or once another
   *  probe named a client. 200 only for a client. Absent: never asked. */
  client?: ShellProbe;
};

/**
 * The role, or null while it is not known.
 *
 * - A `client-login` refusal from the admin or the member probe is a client,
 *   whatever was cached before it: the login in this browser changed.
 * - Seeded as a client: the client portal, until the client route says this
 *   is an admin or a member (`admin-login` / `member-login`: the shell
 *   reloads without the hint, null meanwhile). The portal's requests are
 *   client routes only, so a wrong hint costs nothing but that reload.
 * - Seeded as a member: the member shell, until the member route says this
 *   is an admin (`admin-login`: the shell reloads without the hint, null
 *   meanwhile). Member chrome is not owner chrome, and member requests are
 *   member routes.
 * - Otherwise admin only once /api/shell has answered with data. A
 *   `member-login` refusal is null while the shell reloads as the member;
 *   pending, a network failure or any other error is null too. A failed
 *   refetch after a good answer keeps admin (the data is still there).
 */
export function resolveShellRole({
  seed,
  shell,
  member,
  client,
}: ShellRoleInput): ViewerRole | null {
  if (
    loginRefusalReason(shell.error) === 'client-login' ||
    loginRefusalReason(member.error) === 'client-login'
  ) {
    return 'client';
  }
  if (seed === 'client') {
    const refused = loginRefusalReason(client?.error);
    return refused === 'admin-login' || refused === 'member-login' ? null : 'client';
  }
  if (seed === 'member') {
    return loginRefusalReason(member.error) === 'admin-login' ? null : 'member';
  }
  if (loginRefusalReason(shell.error) === 'member-login') return null;
  return shell.hasData ? 'admin' : null;
}

/** Why the role probe has nothing to say about the role, when it has not:
 *  `offline` (the device has no network: TanStack parks the query, which then
 *  never fails on its own), `unreachable` (the request never got an answer:
 *  DNS, refused, CORS) or `error` (the brain answered, but not with a role: a
 *  500, a proxy's bare 403). */
export type ShellProbeFailure = 'offline' | 'unreachable' | 'error';

/** The role probe failed, and how (null: it has not, or it is not the shell's
 *  to say). The shell offers Try again (and retries on its own) rather than
 *  guessing. Not a login refusal (the role is in it), not a 401 (apiFetch is
 *  already on its way to /login), and never once the brain gave a role or a
 *  hint seeded one. */
export function shellProbeFailure(
  input: ShellRoleInput,
  role: ViewerRole | null,
): ShellProbeFailure | null {
  if (role !== null || input.seed !== null) return null;
  const { error, hasData, paused } = input.shell;
  if (isLoginRefusal(error)) return null;
  if (paused && !hasData) return 'offline';
  if (error == null) return null;
  if (error instanceof ApiError) return error.status === 401 ? null : 'error';
  return 'unreachable';
}

export function shellProbeFailed(input: ShellRoleInput, role: ViewerRole | null): boolean {
  return shellProbeFailure(input, role) !== null;
}

/** The first automatic retry after a failed role probe, and the ceiling. */
export const SHELL_RETRY_FIRST_MS = 2_000;
export const SHELL_RETRY_MAX_MS = 15_000;

/** How long the failed screen waits before its `attempt`th automatic retry
 *  (0-based): 2, 4, 8 s, then every 15 s for as long as the screen shows. */
export function shellRetryDelayMs(attempt: number): number {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return Math.min(SHELL_RETRY_FIRST_MS * 2 ** Math.min(n, 10), SHELL_RETRY_MAX_MS);
}
