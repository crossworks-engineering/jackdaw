/**
 * Telegram per user on the wire (workspaces W7d). A Telegram chat is paired
 * to ONE user, by that user, signed in, with the code the bot sent them
 * (POST /api/telegram/pair, two steps: a preview, then a confirm carrying
 * the preview's token). A Moderator of the bot's assistant's workspace, or
 * an Admin user with the users area, only blocks or unpairs a chat; nobody
 * pairs another user's chat. Each user reads only their own chats.
 *
 * A copy of the W7d types in mantle packages/client-types/src/dto/views.ts
 * (brain W7d fix round 1, 4443d4235). Replace the copy by hand when the
 * published package carries them. One addition: the preview's chat may name
 * a capped `title` beside its label (the brain may send it; shown as plain
 * text only).
 *
 * Pure: no imports.
 */

/** A chat on an assistant's bot, as the bot's Settings section lists it
 *  (GET /api/agents/:id/telegram `chats`). */
export type AgentTelegramChat = {
  id: string;
  telegramChatId: string;
  label: string;
  status: 'pending' | 'allowed' | 'denied';
  lastMessageAt: string | null;
  /** The user the chat is paired to, null when none (pending, blocked, or
   *  its login is gone). Optional: absent from a brain before W7d. */
  loginId?: string | null;
  /** That user's name, else email, for the list; null with no login. */
  pairedTo?: string | null;
};

/** One of the signed-in user's own paired chats (GET /api/telegram/my-chats). */
export type MyTelegramChat = {
  id: string;
  telegramChatId: string;
  label: string;
  /** The bot the chat is on, and its assistant. */
  botUsername: string;
  agentName: string | null;
  agentSlug: string | null;
  lastMessageAt: string | null;
};

/** A chat on a bot the signed-in user moderates (GET
 *  /api/telegram/moderated-chats): block or unpair, never pair. */
export type ModeratedTelegramChat = AgentTelegramChat & {
  botUsername: string;
  agentName: string | null;
  agentSlug: string | null;
};

/** POST /api/telegram/pair `{ code }`: what the code would pair. Nothing is
 *  paired. Confirm with the same code, `confirm: true` and `previewToken`. */
export type TelegramPairPreview = {
  ok: true;
  paired: false;
  /** True when the chat is already paired to this user. */
  already: boolean;
  /** The chat: its @username, else its id; and its id. `title`, when the
   *  brain sends one, is the chat's own (capped) title: plain text. */
  chat: { label: string; telegramChatId: string; title?: string | null };
  /** The bot the chat is on (its @username). */
  bot: { name: string };
  agentName: string | null;
  /** Sent back with the confirm: it then pairs this chat and no other. */
  previewToken: string;
};

/** POST /api/telegram/pair `{ code, confirm: true, previewToken }`. */
export type TelegramPairResult = {
  ok: true;
  /** True when the chat was already paired to this user (no change). */
  already: boolean;
  chat: { id: string; telegramChatId: string; label: string; agentName: string | null };
};

/** Every `code` a pairing refusal carries: 400 (no code: a bad body), 403
 *  not_a_workspace_user | not_allowed, 404 no_such_code, 409 code_expired |
 *  paired_to_another | no_assistant | preview_mismatch, 429
 *  too_many_attempts. */
export type TelegramPairErrorCode =
  | 'not_a_workspace_user'
  | 'not_allowed'
  | 'no_such_code'
  | 'code_expired'
  | 'paired_to_another'
  | 'no_assistant'
  | 'preview_mismatch'
  | 'too_many_attempts';

/** The code POST /api/agents/:id/telegram/chats answers a status 'allowed'
 *  with (403): only the chat's own user pairs it, with its code. */
export const TELEGRAM_PAIR_WITH_CODE = 'pair_with_code';

/** The code a responder override answers when the chat's user is not a user
 *  of that assistant's workspace (PATCH /api/telegram/chats/:id, 400). */
export const TELEGRAM_NOT_A_WORKSPACE_USER = 'not_a_workspace_user';
