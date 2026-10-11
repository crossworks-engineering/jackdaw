/**
 * The app shell's one probe, GET /api/shell (phase W5c): every signed-in
 * login gets the same shell, so the probe says only whether the shell can
 * render yet. While it has no answer the shell shows a neutral loading
 * screen; when it could not be asked, a failure card that retries on its own.
 *
 * Pure: no React, so every answer is unit-tested (shell-probe.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';

/** The probe, as far as the shell goes: whether it has answered with data
 *  (ever: a later failed refetch keeps it), its latest error, and whether
 *  TanStack parked it for want of a network (`fetchStatus` 'paused':
 *  offline, so it never reaches an error on its own). */
export type ShellProbe = { hasData: boolean; error: unknown; paused?: boolean };

/** Why the probe has nothing for the shell, when it has not: `offline` (the
 *  device has no network: TanStack parks the query, which then never fails
 *  on its own), `unreachable` (the request never got an answer: DNS, refused,
 *  CORS) or `error` (the brain answered, but not with a shell: a 500, a
 *  proxy's bare 403). */
export type ShellProbeFailure = 'offline' | 'unreachable' | 'error';

/** The probe failed, and how (null: it has not). The shell offers Try again
 *  (and retries on its own) rather than guessing. Never a 401 (apiFetch is
 *  already on its way to /login), and never once the probe has answered. */
export function shellProbeFailure({
  hasData,
  error,
  paused,
}: ShellProbe): ShellProbeFailure | null {
  if (hasData) return null;
  if (paused) return 'offline';
  if (error == null) return null;
  if (error instanceof ApiError) return error.status === 401 ? null : 'error';
  return 'unreachable';
}

/** The first automatic retry after a failed probe, and the ceiling. */
export const SHELL_RETRY_FIRST_MS = 2_000;
export const SHELL_RETRY_MAX_MS = 15_000;

/** How long the failed screen waits before its `attempt`th automatic retry
 *  (0-based): 2, 4, 8 s, then every 15 s for as long as the screen shows. */
export function shellRetryDelayMs(attempt: number): number {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return Math.min(SHELL_RETRY_FIRST_MS * 2 ** Math.min(n, 10), SHELL_RETRY_MAX_MS);
}
