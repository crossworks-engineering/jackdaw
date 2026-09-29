/**
 * A client's own chat (client logins C4), the pure half: its route, how often
 * the thread is asked again, and what a refused send means in words. A
 * client has no live stream, so the dock polls: quickly while a reply is on
 * its way, slowly while it sits open, never while it is closed. Nothing here
 * fetches, so each rule is pinned by a test (client-chat.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import { ASSISTANT_TURN_MAX_CHARS } from '@mantle/web-ui/assistant-limits';
import { CLIENT_API_BASE } from './client-portal';
import type { ClientChatRefusedReason } from '@mantle/client-types';

/** GET the thread, POST a message. The client's own route: never a member's. */
export const CLIENT_CHAT_PATH = `${CLIENT_API_BASE}/chat`;
export const CLIENT_CHAT_KEY = ['client-chat'] as const;

/** While a send is in flight or a reply is pending. */
export const CLIENT_CHAT_BUSY_POLL_MS = 3_000;
/** While the dock is open and nothing is on its way: a reply an admin
 *  nudged, or a thread changed in another tab, still shows. */
export const CLIENT_CHAT_IDLE_POLL_MS = 30_000;

/** How often to ask for the thread again, or false for not at all. Closed:
 *  never (the dock asks once when it opens again). */
export function clientChatPollMs(s: { open: boolean; waiting: boolean }): number | false {
  if (!s.open) return false;
  return s.waiting ? CLIENT_CHAT_BUSY_POLL_MS : CLIENT_CHAT_IDLE_POLL_MS;
}

/** The longest message one send may carry: the brain's limit for a turn. */
export const CLIENT_CHAT_MAX_CHARS = ASSISTANT_TURN_MAX_CHARS;

export function clientChatTooLongText(max = CLIENT_CHAT_MAX_CHARS): string {
  return `That message is too long. Keep it under ${max.toLocaleString('en-US')} characters.`;
}

export const CLIENT_CHAT_CLOSED_TEXT = 'Chat is not open yet.';

/** What a refused send shows, and what the dock does about it. */
export type ClientChatRefusal = {
  /** In words, under the thread; null for nothing (a 401 is on its way to
   *  sign-in already). */
  message: string | null;
  /** Ask for the thread again: the brain's state changed (chat closed). */
  reload: boolean;
  /** Forget the last send's Idempotency-Key, so the next try is a new turn. */
  freshKey: boolean;
};

const REFUSED: Record<ClientChatRefusedReason, string> = {
  'chat-closed': 'Chat is not open right now.',
  'idempotency-key-reused': 'That did not send. Try again.',
  'rate-limited': 'That is too fast. Wait a minute, then send again.',
  daily_cap: 'You have reached today’s limit for messages. You can send again tomorrow.',
  token_budget: 'You have reached today’s usage limit. You can send again tomorrow.',
};

function reasonOf(body: Record<string, unknown> | undefined): ClientChatRefusedReason | null {
  const reason = body?.reason;
  return typeof reason === 'string' && Object.hasOwn(REFUSED, reason)
    ? (reason as ClientChatRefusedReason)
    : null;
}

/** A failed POST /api/client/chat in plain words: each known refusal its own
 *  line, the brain's text for a bad message (400, 413), else one generic
 *  line (never a code like "forbidden"). */
export function clientChatRefusal(e: unknown): ClientChatRefusal {
  if (!(e instanceof ApiError)) {
    return {
      message: 'Could not send that. Check the connection and try again.',
      reload: false,
      freshKey: false,
    };
  }
  if (e.status === 401) return { message: null, reload: false, freshKey: false };
  const reason = reasonOf(e.body);
  if (reason) {
    return {
      message: REFUSED[reason],
      reload: reason === 'chat-closed',
      freshKey: reason === 'idempotency-key-reused',
    };
  }
  if (e.status === 429) return { message: REFUSED['rate-limited'], reload: false, freshKey: false };
  if (e.status === 409) return { message: REFUSED['chat-closed'], reload: true, freshKey: false };
  // A message the brain wrote for the sender (too long, empty): its words.
  if ((e.status === 400 || e.status === 413) && typeof e.body?.error === 'string' && e.body.error) {
    return { message: e.body.error, reload: false, freshKey: false };
  }
  return { message: 'Could not send that. Try again.', reload: false, freshKey: false };
}
