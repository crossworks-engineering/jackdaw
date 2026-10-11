/**
 * Settings > Users > Chat, the pure half (login-chat.test.ts). GET
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

/** The kept member chats route (W5c brain contract): the roster, plus a
 *  window of one login's thread with `?login=`. */
export const MEMBER_CHATS_PATH = '/api/team-admin/member-chats';

/** Whether a login has a Chat view: a member chats with the team agent; any
 *  other login only when the roster lists a thread from before (a member
 *  later made admin, or a former client: its old thread stays readable). */
export function loginHasChat(role: string, inRoster = false): boolean {
  return role === 'member' || inRoster;
}

/** The logins the chat roster lists (GET /api/team-admin/member-chats). */
export function rosterIds(res: MemberChatsResponse | undefined): Set<string> {
  return new Set((res?.members ?? []).map((m) => m.loginId));
}
