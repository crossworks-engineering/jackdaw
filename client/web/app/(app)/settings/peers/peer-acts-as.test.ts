import { describe, expect, it } from 'vitest';
import {
  actsAsOptions,
  actsAsOwner,
  actsAsValue,
  mayListUsers,
  ownerLoginId,
  type ActsAsLogin,
} from './peer-acts-as';

const member: ActsAsLogin = {
  id: 'm1',
  email: 'm@example.test',
  displayName: 'Member One',
  role: 'member',
  disabledAt: null,
};
const plain: ActsAsLogin = { ...member, id: 'm3', displayName: null, email: 'p@example.test' };
const gone: ActsAsLogin = { ...member, id: 'm2', disabledAt: '2026-01-01T00:00:00Z' };
const owner: ActsAsLogin = { ...member, id: 'a1', role: 'admin', isOwner: true };
const admin: ActsAsLogin = { ...member, id: 'a2', role: 'admin' };

/** W8: a peer keeps only the login it acts as; there is no client login. */
describe('the Acts as choices of a peer', () => {
  it('lists nobody, the owner and the live member logins', () => {
    const opts = actsAsOptions([member, plain, gone, owner, admin], { actsAsLoginId: null }, 'a1');
    expect(opts).toEqual([
      { value: 'none', label: 'Nobody (share only)' },
      { value: 'owner', label: 'Owner (admin)' },
      { value: 'm1', label: 'Member One (member)' },
      { value: 'm3', label: 'p@example.test (member)' },
    ]);
    expect(opts.map((o) => o.label).join(' ')).not.toMatch(/client/i);
  });

  it('keeps the bound login as "Another login" when the list is not readable', () => {
    // An Admin user without the Users area: GET /api/users is not asked.
    const opts = actsAsOptions(undefined, { actsAsLoginId: 'm9' }, null);
    expect(opts.map((o) => o.value)).toEqual(['none', 'owner', 'm9']);
    expect(opts[2]).toEqual({ value: 'm9', label: 'Another login' });
  });

  it('keeps the bound login when the list does not name it', () => {
    const opts = actsAsOptions([member, gone], { actsAsLoginId: 'm2' }, null);
    expect(opts.at(-1)).toEqual({ value: 'm2', label: 'Another login' });
  });

  it('adds no fallback for a listed login, the owner or nobody', () => {
    expect(actsAsOptions([member], { actsAsLoginId: 'm1' }, null)).toHaveLength(3);
    expect(actsAsOptions([], { actsAsLoginId: 'a1' }, 'a1')).toHaveLength(2);
    expect(actsAsOptions([], { actsAsLoginId: null }, null)).toHaveLength(2);
  });

  it('asks GET /api/users only once the areas are known and hold users', () => {
    expect(mayListUsers(undefined)).toBe(false);
    expect(mayListUsers(null)).toBe(false);
    expect(mayListUsers([])).toBe(false);
    expect(mayListUsers(['settings', 'peers'])).toBe(false);
    expect(mayListUsers(['settings', 'users'])).toBe(true);
  });
});

describe('the owner binding (no actsAsRole since W8)', () => {
  it('the owner is the list owner row, else the viewer when the viewer is the owner', () => {
    expect(ownerLoginId([member, owner], undefined)).toBe('a1');
    expect(ownerLoginId(undefined, { loginId: 'a1', isOwner: true })).toBe('a1');
    expect(ownerLoginId(undefined, { loginId: 'a2', isOwner: false })).toBeNull();
    expect(ownerLoginId([member], undefined)).toBeNull();
  });

  it('the select value: owner for the owner login, the login, or nobody', () => {
    expect(actsAsValue({ actsAsLoginId: 'a1' }, 'a1')).toBe('owner');
    expect(actsAsValue({ actsAsLoginId: 'm1' }, 'a1')).toBe('m1');
    expect(actsAsValue({ actsAsLoginId: null }, 'a1')).toBe('none');
    // The owner not known (no Users area, viewer not the owner): the login.
    expect(actsAsValue({ actsAsLoginId: 'a1' }, null)).toBe('a1');
  });

  it('a brain before W8 still names the owner binding by its role', () => {
    expect(actsAsOwner({ actsAsLoginId: 'a1', actsAsRole: 'admin' }, null)).toBe(true);
    expect(actsAsValue({ actsAsLoginId: 'a1', actsAsRole: 'admin' }, null)).toBe('owner');
    expect(actsAsOwner({ actsAsLoginId: 'm1', actsAsRole: 'member' }, null)).toBe(false);
  });
});
