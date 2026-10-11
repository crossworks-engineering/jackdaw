import { ApiError } from '@mantle/web-ui/api-fetch';
import type { MemberChatMessage } from './contract/member';

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

/**
 * A refused member send: the brain's message in a toast (none for a 401,
 * which is on its way to sign-in), and a 409 reloads the thread, since the
 * brain's state changed (chat closed).
 */
export function memberChatRefusal(e: unknown): { message: string | null; reload: boolean } {
  if (e instanceof ApiError && e.status === 401) return { message: null, reload: false };
  return {
    message: e instanceof Error ? e.message : 'Could not send that',
    reload: e instanceof ApiError && e.status === 409,
  };
}

/** Chat is not open: the Team workspace has no assistant. The brain's own
 *  words: GET /api/member/chat answers `{ agent: null }`, and a send (or a
 *  brain that refuses the read too) answers 409 with this text. */
export const CHAT_NOT_OPEN_TEXT = 'Chat is not open yet: the Team workspace has no assistant.';

/** A refused thread read that is a state, not a failure: a 409 (chat not
 *  open). The brain's own words, else null. */
export function closedChatText(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  return err.message.trim() || CHAT_NOT_OPEN_TEXT;
}

/** What the closed thread says, or null while it is open (or unknown): the
 *  screen's own words when the brain sends no agent, the brain's words when
 *  it refused the read with 409. */
export function closedThreadText(
  thread: { data?: { agent: unknown } | undefined; error: unknown },
  closedText: string,
): string | null {
  if (thread.data) return thread.data.agent ? null : closedText;
  return closedChatText(thread.error);
}

/** Retry a failed thread read once, but never a 4xx: chat not open (409),
 *  gone (410) or refused stays that way, so a retry only loops. */
export function retryThreadRead(failures: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return failures < 1;
}
