/**
 * Team admin > Member chats, the roster's words (client logins audit B26).
 * The roster lists member logins, and (brains with the audit fixes) client
 * logins that have a thread, each with its role. A client is labelled
 * "Client", never "no longer a member": it never was one. Pure, pinned by
 * member-chats-roster.test.ts.
 */
import type { MemberChatRow } from '@mantle/client-types';

/** The tag a roster row wears, or null for an active member. */
export function chatRosterTag(row: Pick<MemberChatRow, 'role' | 'active'>): string | null {
  if (row.role === 'client') return row.active ? 'Client' : 'Client, disabled';
  return row.active ? null : 'no longer a member';
}

/** Whether a roster row is a client login's chat (C4: clients chat too). */
export function isClientChat(row: Pick<MemberChatRow, 'role'>): boolean {
  return row.role === 'client';
}

/**
 * The words under a row's name, before its last message. A client row
 * wears a "Client" badge instead, so only a disabled client says more; a
 * member row keeps its tag.
 */
export function chatRowMetaTag(row: Pick<MemberChatRow, 'role' | 'active'>): string | null {
  if (isClientChat(row)) return row.active ? null : 'disabled';
  return chatRosterTag(row);
}

/** The roster filter (C4): everyone, members only, or clients only. */
export type ChatRosterFilter = 'all' | 'members' | 'clients';

export const CHAT_ROSTER_FILTERS: readonly { value: ChatRosterFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'members', label: 'Members' },
  { value: 'clients', label: 'Clients' },
];

/** The rows a filter shows. A row with no role (a brain before the audit
 *  fixes, or a former member) counts as a member's. */
export function filterChatRoster<T extends Pick<MemberChatRow, 'role'>>(
  rows: readonly T[],
  filter: ChatRosterFilter,
): T[] {
  if (filter === 'all') return [...rows];
  const clients = filter === 'clients';
  return rows.filter((r) => isClientChat(r) === clients);
}

/** What the list says when a filter leaves nothing. */
export function chatRosterEmptyText(filter: ChatRosterFilter): string {
  return filter === 'clients' ? 'No client has chatted yet.' : 'No member chats here.';
}
