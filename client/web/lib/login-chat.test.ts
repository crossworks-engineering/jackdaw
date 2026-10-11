import { describe, expect, it } from 'vitest';
import type { MemberChatsResponse } from './contract/member-apps';
import { loginChatOf, loginHasChat, rosterIds } from './login-chat';

const A = '0b8f3c2e-1111-4111-8111-111111111111';
const B = '0b8f3c2e-2222-4222-8222-222222222222';

const row = (loginId: string, messageCount: number) => ({
  loginId,
  name: 'Sam',
  email: 'sam@example.invalid',
  active: true,
  role: 'member' as const,
  lastMessageAt: null,
  lastMessageText: null,
  lastMessageDirection: null,
  messageCount,
});

const answer = (selectedId: string | null): MemberChatsResponse => ({
  members: [row(A, 120), row(B, 3)],
  selected: selectedId
    ? { loginId: selectedId, thread: [], windowSize: 50, portalThread: null }
    : null,
});

/** Settings > Logins > Chat reads GET /api/team-admin/member-chats?login=,
 *  which falls back to the roster's first login. */
describe('loginChatOf', () => {
  it("is this login's thread, with the roster's count", () => {
    const chat = loginChatOf(answer(B), B);
    expect(chat?.selected.loginId).toBe(B);
    expect(chat?.messageCount).toBe(3);
  });

  it("never shows another login's thread (the route's fallback)", () => {
    expect(loginChatOf(answer(A), B)).toBeNull();
    expect(loginChatOf(answer(null), B)).toBeNull();
  });
});

describe('loginHasChat', () => {
  it('a member chats with the team agent; an admin or a client does not', () => {
    expect(loginHasChat('member')).toBe(true);
    expect(loginHasChat('client')).toBe(false);
    expect(loginHasChat('admin')).toBe(false);
  });

  it('an admin with an old team thread (a former member) keeps its Chat', () => {
    const ids = rosterIds(answer(null));
    expect(loginHasChat('admin', ids.has(A))).toBe(true);
    expect(loginHasChat('admin', ids.has('someone-else'))).toBe(false);
    expect(rosterIds(undefined).size).toBe(0);
  });
});
