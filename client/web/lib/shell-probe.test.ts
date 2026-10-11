import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  SHELL_RETRY_MAX_MS,
  shellProbeFailure,
  shellRetryDelayMs,
  type ShellProbe,
} from './shell-probe';

/**
 * The shell's one probe (phase W5c): GET /api/shell answers every login, so
 * the only question is whether it answered, and if not, why.
 */
const pending: ShellProbe = { hasData: false, error: null };
const failed = (error: unknown, hasData = false): ShellProbe => ({ hasData, error });

describe('shellProbeFailure', () => {
  it('is no failure while the probe loads, or once it answered', () => {
    expect(shellProbeFailure(pending)).toBeNull();
    expect(shellProbeFailure({ hasData: true, error: null })).toBeNull();
  });

  it('a probe parked offline with no answer is a failure (offline), not Loading', () => {
    expect(shellProbeFailure({ hasData: false, error: null, paused: true })).toBe('offline');
    // Offline after an earlier failure: still offline, the words say so.
    expect(shellProbeFailure({ ...failed(new ApiError('boom', 500)), paused: true })).toBe(
      'offline',
    );
  });

  it('a good answer survives going offline and a failed refetch', () => {
    expect(shellProbeFailure({ hasData: true, error: null, paused: true })).toBeNull();
    expect(shellProbeFailure(failed(new ApiError('boom', 500), true))).toBeNull();
  });

  it('tells an unanswered request from an answer that carried no shell', () => {
    expect(shellProbeFailure(failed(new TypeError('fetch failed')))).toBe('unreachable');
    expect(shellProbeFailure(failed(new ApiError('boom', 500)))).toBe('error');
    expect(shellProbeFailure(failed(new ApiError('Forbidden', 403)))).toBe('error');
  });

  it('never for a 401: apiFetch is already on its way to /login', () => {
    expect(shellProbeFailure(failed(new ApiError('unauthorized', 401)))).toBeNull();
  });
});

describe('shellRetryDelayMs (the failed screen retries on its own)', () => {
  it('backs off 2, 4, 8 s and then holds at 15 s, for good', () => {
    expect([0, 1, 2, 3, 4, 5, 50, 5000].map(shellRetryDelayMs)).toEqual([
      2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000,
    ]);
    expect(SHELL_RETRY_MAX_MS).toBe(15_000);
  });

  it('never waits less than the first step, whatever it is handed', () => {
    expect(shellRetryDelayMs(-3)).toBe(2000);
    expect(shellRetryDelayMs(Number.NaN)).toBe(2000);
  });
});
