import { describe, expect, it } from 'vitest';
import { actsAsOptions, actsAsValue, mayListUsers, type ActsAsLogin } from './peer-acts-as';

const member: ActsAsLogin = {
  id: 'm1',
  email: 'm@example.test',
  displayName: 'Member One',
  role: 'member',
  disabledAt: null,
};
const client: ActsAsLogin = {
  ...member,
  id: 'c1',
  displayName: null,
  email: 'c@example.test',
  role: 'client',
};
const gone: ActsAsLogin = { ...member, id: 'm2', disabledAt: '2026-01-01T00:00:00Z' };
const admin: ActsAsLogin = { ...member, id: 'a1', role: 'admin' };

describe('the Acts as choices of a peer', () => {
  it('lists nobody, the owner and the live member and client logins', () => {
    const opts = actsAsOptions([member, client, gone, admin], {
      actsAsLoginId: null,
      actsAsRole: null,
    });
    expect(opts).toEqual([
      { value: 'none', label: 'Nobody (share only)' },
      { value: 'owner', label: 'Owner (admin)' },
      { value: 'm1', label: 'Member One (member)' },
      { value: 'c1', label: 'c@example.test (client)' },
    ]);
  });

  it('keeps the bound login as "Another login" when the list is not readable', () => {
    // An Admin user without the Users area: GET /api/users is not asked.
    const opts = actsAsOptions(undefined, { actsAsLoginId: 'm9', actsAsRole: 'member' });
    expect(opts.map((o) => o.value)).toEqual(['none', 'owner', 'm9']);
    expect(opts[2]).toEqual({ value: 'm9', label: 'Another login' });
  });

  it('keeps the bound login when the list does not name it', () => {
    const opts = actsAsOptions([member, gone], { actsAsLoginId: 'm2', actsAsRole: 'member' });
    expect(opts.at(-1)).toEqual({ value: 'm2', label: 'Another login' });
  });

  it('adds no fallback for a listed login, the owner or nobody', () => {
    expect(actsAsOptions([member], { actsAsLoginId: 'm1', actsAsRole: 'member' })).toHaveLength(3);
    expect(actsAsOptions([], { actsAsLoginId: 'a1', actsAsRole: 'admin' })).toHaveLength(2);
    expect(actsAsOptions([], { actsAsLoginId: null, actsAsRole: null })).toHaveLength(2);
  });

  it('a bound client the list does not name reads as "Another login" too', () => {
    const opts = actsAsOptions(undefined, { actsAsLoginId: 'c9', actsAsRole: 'client' });
    expect(opts.at(-1)).toEqual({ value: 'c9', label: 'Another login' });
  });

  it('asks GET /api/users only once the areas are known and hold users', () => {
    expect(mayListUsers(undefined)).toBe(false);
    expect(mayListUsers(null)).toBe(false);
    expect(mayListUsers([])).toBe(false);
    expect(mayListUsers(['settings', 'peers'])).toBe(false);
    expect(mayListUsers(['settings', 'users'])).toBe(true);
  });

  it('the select value: owner for an admin binding, the login, or nobody', () => {
    expect(actsAsValue({ actsAsLoginId: 'a1', actsAsRole: 'admin' })).toBe('owner');
    expect(actsAsValue({ actsAsLoginId: 'm1', actsAsRole: 'member' })).toBe('m1');
    expect(actsAsValue({ actsAsLoginId: null, actsAsRole: null })).toBe('none');
  });
});
