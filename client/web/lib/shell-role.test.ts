import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  resolveShellRole,
  shellProbeFailed,
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
  });
});
