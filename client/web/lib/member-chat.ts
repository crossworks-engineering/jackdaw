import type { MemberChatMessage } from '@mantle/client-types';

/**
 * Has the reply to a send landed? `known` is the thread's message ids from
 * just before the send. Landed = a new inbound (this send) followed by a new
 * outbound that is no longer pending (complete or failed). Ids, not clocks: a
 * browser clock ahead of the brain's made the old time check stop polling
 * before the reply arrived. A failed inbound also ends the wait.
 */
export function replyLanded(messages: readonly MemberChatMessage[], known: ReadonlySet<string>) {
  const sent = messages.findIndex((m) => !known.has(m.id) && m.direction === 'inbound');
  if (sent < 0) return false;
  if (messages[sent]!.status === 'failed') return true;
  return messages
    .slice(sent + 1)
    .some((m) => !known.has(m.id) && m.direction === 'outbound' && m.status !== 'pending');
}
