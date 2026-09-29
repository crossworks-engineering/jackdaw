import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  SHELL_RETRY_MAX_MS,
  resolveShellRole,
  shellProbeFailed,
  shellProbeFailure,
  shellRetryDelayMs,
  type ShellProbe,
  type ShellRoleInput,
} from './shell-role';

/**
 * The shell's role (client logins C0): three roles and "not known yet", and
 * nothing ever defaults to admin. Admin is /api/shell answering 200 and
 * nothing else.
 */
const refused = (reason: string) => new ApiError('forbidden', 403, { error: 'forbidden', reason });
const pending: ShellProbe = { hasData: false, error: null };
const answered: ShellProbe = { hasData: true, error: null };
const failed = (error: unknown, hasData = false): ShellProbe => ({ hasData, error });

const input = (over: Partial<ShellRoleInput>): ShellRoleInput => ({
  seed: null,
  shell: pending,
  member: pending,
  ...over,
});

describe('resolveShellRole', () => {
  it('is not known, never admin, before the brain has answered', () => {
    expect(resolveShellRole(input({}))).toBeNull();
  });

  it('is admin only once /api/shell answered', () => {
    expect(resolveShellRole(input({ shell: answered }))).toBe('admin');
  });

  it('is a client on a client-login refusal from either shell', () => {
    expect(resolveShellRole(input({ shell: failed(refused('client-login')) }))).toBe('client');
    expect(
      resolveShellRole(input({ seed: 'member', member: failed(refused('client-login')) })),
    ).toBe('client');
  });

  it('is a client even over an earlier admin answer (the login changed)', () => {
    expect(resolveShellRole(input({ shell: failed(refused('client-login'), true) }))).toBe(
      'client',
    );
  });

  it('is not known while a member-login refusal reloads as the member', () => {
    expect(resolveShellRole(input({ shell: failed(refused('member-login')) }))).toBeNull();
  });

  it('is not known on any other failure: a 500, a network error, a bare proxy 403', () => {
    expect(resolveShellRole(input({ shell: failed(new ApiError('boom', 500)) }))).toBeNull();
    expect(resolveShellRole(input({ shell: failed(new TypeError('fetch failed')) }))).toBeNull();
    expect(resolveShellRole(input({ shell: failed(new ApiError('Forbidden', 403)) }))).toBeNull();
    expect(resolveShellRole(input({ shell: failed(refused('guest-login')) }))).toBeNull();
    expect(
      resolveShellRole(input({ shell: failed(new ApiError('unauthorized', 401)) })),
    ).toBeNull();
  });

  it('keeps admin when a later refetch fails with no role in it', () => {
    expect(resolveShellRole(input({ shell: failed(new ApiError('boom', 500), true) }))).toBe(
      'admin',
    );
  });

  it('seeded as a member: the member shell until the member route says admin', () => {
    expect(resolveShellRole(input({ seed: 'member' }))).toBe('member');
    expect(resolveShellRole(input({ seed: 'member', member: answered }))).toBe('member');
    expect(
      resolveShellRole(input({ seed: 'member', member: failed(refused('admin-login')) })),
    ).toBeNull();
  });

  it('never reads a member seed as admin, whatever /api/shell holds', () => {
    // The shell query is off for a member seed; even a stale admin answer in
    // the cache does not make this login an admin.
    expect(resolveShellRole(input({ seed: 'member', shell: answered }))).toBe('member');
  });

  // Client logins C2: the client hint seeds the client portal.
  it('seeded as a client: the client portal from the first paint, and while it loads', () => {
    expect(resolveShellRole(input({ seed: 'client' }))).toBe('client');
    expect(resolveShellRole(input({ seed: 'client', client: pending }))).toBe('client');
    expect(resolveShellRole(input({ seed: 'client', client: answered }))).toBe('client');
  });

  it('a client seed never reads as admin or member, whatever the other probes hold', () => {
    // The admin and member queries are off for a client seed; even stale
    // answers in the cache do not make this login anything but a client.
    expect(resolveShellRole(input({ seed: 'client', shell: answered, member: answered }))).toBe(
      'client',
    );
    // A failed client shell (a 500, a network error, an old brain's 404)
    // is still no reason to show the owner or member chrome.
    for (const err of [new ApiError('boom', 500), new TypeError('x'), new ApiError('nf', 404)]) {
      expect(resolveShellRole(input({ seed: 'client', client: failed(err) }))).toBe('client');
    }
  });

  it('a client seed the brain contradicts is not known while the shell reloads', () => {
    for (const reason of ['admin-login', 'member-login']) {
      expect(
        resolveShellRole(input({ seed: 'client', client: failed(refused(reason)) })),
        reason,
      ).toBeNull();
    }
  });

  it('a client-login refusal wins a member seed and a stale admin answer alike', () => {
    expect(
      resolveShellRole(
        input({ seed: 'member', member: failed(refused('client-login')), shell: answered }),
      ),
    ).toBe('client');
  });
});

describe('shellProbeFailed', () => {
  const at = (over: Partial<ShellRoleInput>) => {
    const i = input(over);
    return shellProbeFailed(i, resolveShellRole(i));
  };

  it('offers Try again when /api/shell failed with no role in the answer', () => {
    expect(at({ shell: failed(new ApiError('boom', 500)) })).toBe(true);
    expect(at({ shell: failed(new TypeError('fetch failed')) })).toBe(true);
    expect(at({ shell: failed(new ApiError('Forbidden', 403)) })).toBe(true);
  });

  it('not while loading, on a refusal, on a 401 (already bounced) or with a role', () => {
    expect(at({})).toBe(false);
    expect(at({ shell: failed(refused('member-login')) })).toBe(false);
    expect(at({ shell: failed(refused('client-login')) })).toBe(false);
    expect(at({ shell: failed(new ApiError('unauthorized', 401)) })).toBe(false);
    expect(at({ shell: failed(new ApiError('boom', 500), true) })).toBe(false);
    expect(at({ seed: 'member', member: failed(new ApiError('boom', 500)) })).toBe(false);
    // A client seed: the portal owns its own Try again (components/client).
    expect(at({ seed: 'client', client: failed(new ApiError('boom', 500)) })).toBe(false);
    expect(at({ seed: 'client', client: failed(refused('admin-login')) })).toBe(false);
  });
});

describe('shellProbeFailure (how it failed, for the words)', () => {
  const at = (over: Partial<ShellRoleInput>) => {
    const i = input(over);
    return shellProbeFailure(i, resolveShellRole(i));
  };
  const offline: ShellProbe = { hasData: false, error: null, paused: true };

  it('a probe parked offline with no answer is a failure (offline), not Loading', () => {
    expect(at({ shell: offline })).toBe('offline');
    // Offline after an earlier failure: still offline, the words say so.
    expect(at({ shell: { ...failed(new ApiError('boom', 500)), paused: true } })).toBe('offline');
    expect(shellProbeFailed(input({ shell: offline }), null)).toBe(true);
  });

  it('a good answer survives going offline: no failure, still admin', () => {
    const cached: ShellProbe = { hasData: true, error: null, paused: true };
    expect(resolveShellRole(input({ shell: cached }))).toBe('admin');
    expect(at({ shell: cached })).toBeNull();
  });

  it('tells an unanswered request from an answer that carried no role', () => {
    expect(at({ shell: failed(new TypeError('fetch failed')) })).toBe('unreachable');
    expect(at({ shell: failed(new ApiError('boom', 500)) })).toBe('error');
    expect(at({ shell: failed(new ApiError('Forbidden', 403)) })).toBe('error');
  });

  it('never for a refusal, a 401, a seed or a known role', () => {
    expect(at({ shell: failed(refused('member-login')) })).toBeNull();
    expect(at({ shell: { ...failed(refused('member-login')), paused: true } })).toBeNull();
    expect(at({ shell: failed(new ApiError('unauthorized', 401)) })).toBeNull();
    expect(at({ seed: 'member', shell: offline })).toBeNull();
    expect(at({ seed: 'client', shell: offline })).toBeNull();
    expect(at({})).toBeNull();
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
