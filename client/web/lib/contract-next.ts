/**
 * Wire types the brain is about to have and the pinned contract does not yet
 * (client logins C4: a client's own chat, and the admin's view of its use).
 * This app pins @crossworks/client-types@0.232.333, which predates them; the
 * C4 release publishes them (0.232.334 or later).
 *
 * Every NEW field on a published type is optional: this app must work
 * against a brain that does not send it yet.
 *
 * Temporary: drop when the pin reaches the C4 release. Delete this file and
 * import each type from '@mantle/client-types' instead (every import of
 * '@/lib/contract-next' or '../lib/contract-next' becomes one of
 * '@mantle/client-types').
 */
import type { TeamRequest as PublishedTeamRequest } from '@mantle/client-types';

/** One message of a client's own chat thread. */
export type ClientChatMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  text: string;
  status: 'pending' | 'complete' | 'failed';
  failed: boolean;
  createdAt: string;
};

/** GET /api/client/chat[?before=ISO]: the client's own thread with the client-responder, newest page first (50 a page). `agent` null = the chat is not open (no enabled client-level client-responder): the dock says so and offers no input. Poll it (every few seconds while a reply is pending): there is no live stream for clients. */
export type ClientChatThread = { agent: { name: string } | null; messages: ClientChatMessage[] };

/** POST /api/client/chat { text } -> 202 { turnId }: the turn is queued; the reply lands in the thread. A retry with the same Idempotency-Key header is the same turn. */
export type ClientChatQueued = { turnId: string };

/** Why a send was refused (the 4xx `reason`): 409 chat-closed (no client-level agent), 409 idempotency-key-reused, 429 rate-limited (6 a minute), 429 daily_cap or token_budget (per client login per UTC day). */
export type ClientChatRefusedReason =
  'chat-closed' | 'idempotency-key-reused' | 'rate-limited' | 'daily_cap' | 'token_budget';

/** GET /api/team-admin/clients/usage (admin): each client login's chat use today (UTC) against the caps. */
export type ClientChatUsage = {
  limits: { dailyTurns: number; dailyTokens: number };
  rows: { loginId: string; turnsToday: number; tokensToday: number }[];
};

/** A Requests tab row. `fromClient`: true for a request a client filed;
 *  absent = a member's. */
export type TeamRequest = PublishedTeamRequest & { fromClient?: boolean };
