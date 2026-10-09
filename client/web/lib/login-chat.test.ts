import { describe, expect, it } from 'vitest';
import type { MemberChatsResponse } from '@mantle/client-types';
import { loginChatOf, loginHasChat } from './login-chat';

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
  it('members and clients chat with the team agent; an admin does not', () => {
    expect(loginHasChat('member')).toBe(true);
    expect(loginHasChat('client')).toBe(true);
    expect(loginHasChat('admin')).toBe(false);
  });
});
