/**
 * The assistant chat for every login (workspaces W7c), the pure half: what a
 * refused send says, and which parts of the chat a login gets. Pinned by
 * assistant-turn-refusal.test.ts.
 *
 * Every login chats on /assistant in its own threads. A turn to the
 * assistant of a workspace that is not the Admin one runs on the workspace
 * turn engine: text only, with the member limits for a login that is not an
 * Admin user. The live-stream routes of a turn (/api/assistant/turn/:id/
 * stream, cancel, suggestion) and /api/assistant/turn/stage stay Admin-only,
 * so any other login gets its reply from the thread itself (no live tokens
 * yet) and sends no attachments.
 */

/** The JSON body of a refused POST /api/assistant/turn. */
export type TurnRefusalBody = { error?: unknown; reason?: unknown };

/** A refused send in a few plain words, by status and the brain's reason. */
export const TURN_REFUSAL_TEXT = {
  textOnly: 'This chat takes text only. Send your message without the attachment.',
  dailyCap: 'You reached today’s message limit for this chat. Try again tomorrow.',
  tokenBudget:
    'You reached today’s usage limit for this chat. Try again tomorrow, or ask an admin to raise it.',
  tooFast: 'Too many messages at once. Wait a moment, then send again.',
  keyReused: 'That message clashed with an earlier send. Send it again.',
  noAssistant: 'There is no assistant to chat with here. Ask an admin to give your workspace one.',
} as const;

/**
 * What a refused send says (POST /api/assistant/turn answered `status`):
 *
 *  - 415: an attachment to a chat that takes text only;
 *  - 429 `daily_cap` or `token_budget`: the login's daily limit; any other
 *    429 is the per-minute rate;
 *  - 409 `idempotency-key-reused`: the key of an earlier send with other
 *    text (a fresh send gets a fresh key);
 *  - 404 `no-chat-agent`: no assistant this login can reach.
 *
 * Anything else: the brain's own words, else the status.
 */
export function turnRefusalText(status: number, body: TurnRefusalBody | null | undefined): string {
  const reason = typeof body?.reason === 'string' ? body.reason : null;
  if (status === 415) return TURN_REFUSAL_TEXT.textOnly;
  if (status === 429) {
    if (reason === 'daily_cap') return TURN_REFUSAL_TEXT.dailyCap;
    if (reason === 'token_budget') return TURN_REFUSAL_TEXT.tokenBudget;
    return TURN_REFUSAL_TEXT.tooFast;
  }
  if (status === 409 && reason === 'idempotency-key-reused') return TURN_REFUSAL_TEXT.keyReused;
  if (status === 404 && reason === 'no-chat-agent') return TURN_REFUSAL_TEXT.noAssistant;
  const said = typeof body?.error === 'string' ? body.error.trim() : '';
  return said || `request failed (${status})`;
}

/** The parts of the assistant chat a login gets. */
export type ChatFeatures = {
  /** Attach a file, paste or pick one: an Admin user's (a workspace chat
   *  takes text only). */
  attachments: boolean;
  /** Pick content on the screen behind (pick mode is an Admin user's). */
  pick: boolean;
  /** The live tokens, the thought trail and the stage label of a turn, Stop,
   *  the premature-Enter replace and the follow-up suggestion: all on the
   *  Admin-only live-stream routes. */
  live: boolean;
  /** The pending questions and active runs strips (Admin-only routes). */
  runs: boolean;
};

/** Which parts of the chat a login gets: everything for an Admin user, the
 *  thread and a text composer for anyone else. */
export function chatFeatures(adminUser: boolean): ChatFeatures {
  return { attachments: adminUser, pick: adminUser, live: adminUser, runs: adminUser };
}
