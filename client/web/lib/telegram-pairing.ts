/**
 * Telegram per user (workspaces W7d), the pure half. A chat is paired to ONE
 * user, by that user, signed in, with the six character code the bot sent
 * them on Telegram: a preview first (which chat, which bot, which
 * assistant), then a confirm that carries the preview's token. Moderators of
 * the bot's assistant's workspace, and Admin users with the users area, only
 * block or unpair a chat. Logins carry no permission and there are no levels.
 *
 * Used by components/telegram/ (the pair form, Settings > Telegram and the
 * bot section on an assistant). Pinned by telegram-pairing.test.ts.
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { AgentTelegramChat } from './contract/telegram';

/** The routes. */
export const TELEGRAM_PAIR_PATH = '/api/telegram/pair';
export const MY_TELEGRAM_CHATS_PATH = '/api/telegram/my-chats';
export const MODERATED_TELEGRAM_CHATS_PATH = '/api/telegram/moderated-chats';
export const myTelegramChatPath = (id: string) =>
  `${MY_TELEGRAM_CHATS_PATH}/${encodeURIComponent(id)}`;
export const moderateTelegramChatPath = (id: string, action: 'block' | 'unpair') =>
  `/api/telegram/chats/${encodeURIComponent(id)}/${action}`;

/** The query keys. */
export const MY_TELEGRAM_CHATS_KEY = ['telegram', 'my-chats'] as const;
export const MODERATED_TELEGRAM_CHATS_KEY = ['telegram', 'moderated-chats'] as const;

/** The code as the brain takes it (six hex digits), from what was typed:
 *  spaces and a leading `#` dropped, lower case. Null when it is not one. */
export function normalisePairCode(input: string): string | null {
  const code = input.replace(/\s+/g, '').replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(code) ? code : null;
}

/** The preview request body. */
export function pairPreviewBody(code: string): { code: string } {
  return { code };
}

/** The confirm request body: the same code, and ALWAYS the preview's token,
 *  so the brain pairs the chat that was shown and no other. */
export function pairConfirmBody(
  code: string,
  previewToken: string,
): { code: string; confirm: true; previewToken: string } {
  return { code, confirm: true, previewToken };
}

/** A refusal as the screen shows it: the brain's own words (first letter up),
 *  its code, and whether the person must start again with a code (the one
 *  they had expired, or no longer names the chat they were shown). */
export type PairRefusal = { code: string | null; message: string; restart: boolean };

/** Codes after which the preview is stale: back to entering a code. */
const RESTART_CODES = new Set(['preview_mismatch', 'code_expired', 'no_such_code']);

/** What the screen says when the brain sends no words of its own. */
const FALLBACK_BY_STATUS: Record<number, string> = {
  400: 'That is not a pairing code. It is six letters and digits.',
  403: 'You cannot pair a Telegram chat to this bot.',
  404: 'No chat is waiting with that code. Send the bot a new message for a fresh one.',
  409: 'That chat cannot be paired now.',
  429: 'Too many tries. Wait a few minutes, then try again.',
};

function sentence(text: string): string {
  const t = text.trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

/** The refusal of a pairing call, or null when `e` is not the brain's answer
 *  (a 401 has bounced to sign in already; anything else is a toast). */
export function pairRefusal(e: unknown): PairRefusal | null {
  if (!(e instanceof ApiError) || e.status === 401) return null;
  const code = typeof e.body?.code === 'string' ? e.body.code : null;
  const fromBrain = typeof e.body?.error === 'string' ? e.body.error : '';
  const message =
    sentence(fromBrain) || FALLBACK_BY_STATUS[e.status] || 'Could not pair this chat.';
  return { code, message, restart: code !== null && RESTART_CODES.has(code) };
}

/** What a chat on a bot is, for the list of a bot's chats. No level: a chat
 *  is waiting for its user, paired to a user, or blocked. */
export function telegramChatStatusText(
  chat: Pick<AgentTelegramChat, 'status' | 'pairedTo' | 'loginId'>,
): string {
  switch (chat.status) {
    case 'allowed':
      return chat.pairedTo ? `Paired to ${chat.pairedTo}` : 'Paired, its user is gone';
    case 'denied':
      return 'Blocked';
    default:
      return 'Waiting for its user to pair it with the code the bot sent them';
  }
}

/** What a Moderator (or an Admin user with the users area) may do to a chat:
 *  block a waiting or paired chat; unpair a paired one (back to waiting); and
 *  unblock a blocked one (the same unpair: back to waiting, with no user).
 *  Never pair: only its own user pairs a chat. */
export type ModerateAction = { action: 'block' | 'unpair'; label: string };

export function moderateActions(chat: Pick<AgentTelegramChat, 'status'>): ModerateAction[] {
  switch (chat.status) {
    case 'allowed':
      return [
        { action: 'unpair', label: 'Unpair' },
        { action: 'block', label: 'Block' },
      ];
    case 'denied':
      return [{ action: 'unpair', label: 'Unblock' }];
    default:
      return [{ action: 'block', label: 'Block' }];
  }
}

/** The status the bot section's route takes for an action ('denied' blocks,
 *  'pending' unpairs; 'allowed' is refused: pair with the code). */
export function agentChatStatusFor(action: 'block' | 'unpair'): 'denied' | 'pending' {
  return action === 'block' ? 'denied' : 'pending';
}

/** The toast after a moderation. */
export function moderatedText(action: 'block' | 'unpair', wasBlocked: boolean): string {
  if (action === 'block') return 'Blocked';
  return wasBlocked ? 'Unblocked' : 'Unpaired';
}
