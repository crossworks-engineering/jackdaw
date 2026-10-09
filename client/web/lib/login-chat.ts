/**
 * Settings > Logins > Chat, the pure half (login-chat.test.ts). GET
 * /api/team-admin/member-chats?login=<id> falls back to the roster's first
 * login when the asked one has no row, so its answer counts only when it is
 * about THIS login.
 */
import type { MemberChatsResponse } from '@mantle/client-types';

type Selected = NonNullable<MemberChatsResponse['selected']>;

/** This login's thread and its size, or null when the answer is not about
 *  it (no row: an admin, or a login that never had a thread). */
export function loginChatOf(
  res: MemberChatsResponse,
  loginId: string,
): { selected: Selected; messageCount: number } | null {
  const selected = res.selected;
  if (!selected || selected.loginId !== loginId) return null;
  const row = res.members.find((m) => m.loginId === loginId);
  return { selected, messageCount: row?.messageCount ?? selected.thread.length };
}

/** Whether a login has a Chat view: members and clients chat with the team
 *  agent; an admin login does not. */
export function loginHasChat(role: string): boolean {
  return role === 'member' || role === 'client';
}
