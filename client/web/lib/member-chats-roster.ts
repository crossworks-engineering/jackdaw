/**
 * Team admin > Member chats, the roster's words (client logins audit B26).
 * The roster lists member logins, and (brains with the audit fixes) client
 * logins that have a thread, each with its role. A client is labelled
 * "Client", never "no longer a member": it never was one. Pure, pinned by
 * member-chats-roster.test.ts.
 */
import type { MemberChatRow } from './contract-next';

/** The tag a roster row wears, or null for an active member. */
export function chatRosterTag(row: Pick<MemberChatRow, 'role' | 'active'>): string | null {
  if (row.role === 'client') return row.active ? 'Client' : 'Client, disabled';
  return row.active ? null : 'no longer a member';
}
