import { describe, expect, it } from 'vitest';
import { OLD_RESCUE_PREFIX, clearOldRescues, loginKeyFor } from './login-key';

describe('loginKeyFor', () => {
  it('keys each login by who it is, null before the shell', () => {
    expect(loginKeyFor(undefined)).toBeNull();
    expect(loginKeyFor({ role: 'admin', email: 'a@x.test' })).toBe('admin:a@x.test');
    expect(loginKeyFor({ role: 'member', loginId: 'm1' })).toBe('member:m1');
    expect(loginKeyFor({ role: 'client', loginId: 'c1' })).toBe('client:c1');
    expect(loginKeyFor({ role: 'member' })).toBeNull();
  });
});

describe('clearOldRescues', () => {
  it('removes the copies kept before W6b and nothing else', () => {
    const data = new Map<string, string>([
      [`${OLD_RESCUE_PREFIX}member:m1:/api/member/space/x`, '{}'],
      ['jackdaw.workspace.current:a', 'w'],
    ]);
    const s = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      removeItem: (k: string) => void data.delete(k),
    };
    clearOldRescues(s);
    expect([...data.keys()]).toEqual(['jackdaw.workspace.current:a']);
  });
});
