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

/** How long a pending reply keeps the thread polling, counted from when THIS
 *  browser first saw it pending (never the brain's clock). */
export const PENDING_POLL_MS = 120_000;

/**
 * Should the thread keep polling for pending rows? Yes while any pending row
 * is younger than PENDING_POLL_MS since this browser first saw it. A row the
 * brain left pending for good (a turn that never finished) stops the polling
 * instead of refetching every 1.5 s forever. `firstSeen` is updated in place:
 * pending ids are added, and ids no longer pending are dropped.
 */
export function pollForPending(
  messages: readonly MemberChatMessage[],
  firstSeen: Map<string, number>,
  now: number,
): boolean {
  const pending = new Set(messages.filter((m) => m.status === 'pending').map((m) => m.id));
  for (const id of firstSeen.keys()) if (!pending.has(id)) firstSeen.delete(id);
  let fresh = false;
  for (const id of pending) {
    const seen = firstSeen.get(id) ?? now;
    if (!firstSeen.has(id)) firstSeen.set(id, now);
    if (now - seen < PENDING_POLL_MS) fresh = true;
  }
  return fresh;
}

/**
 * The Idempotency-Key for one send. The same text sent again (a retry after a
 * network error) reuses the key, so the brain runs the turn once; new text
 * gets a new key. `last` is the previous send, updated in place.
 */
export function sendKey(
  text: string,
  last: { text: string; key: string } | null,
  fresh: () => string,
) {
  return last && last.text === text ? last.key : fresh();
}
