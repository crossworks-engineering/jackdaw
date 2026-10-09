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
 *  agent; an admin login only when it has a team thread from before (a
 *  member later made admin: the roster still lists its old thread). */
export function loginHasChat(role: string, inRoster = false): boolean {
  return role === 'member' || role === 'client' || inRoster;
}

/** The logins the chat roster lists (GET /api/team-admin/member-chats). */
export function rosterIds(res: MemberChatsResponse | undefined): Set<string> {
  return new Set((res?.members ?? []).map((m) => m.loginId));
}
