/**
 * The brain's Telegram level refusal (access matrix T21): a paired Telegram
 * chat acts as the owner, so only an admin-level agent can have a bot, and a
 * team, client or public agent's chats cannot be paired. The brain refuses
 * Connect and Approve with code `agent_below_admin` and a message that names
 * the agent's level and the fix.
 *
 * That refusal is a standing condition, not a transient failure: trying again
 * gives the same answer until the agent's level changes. So the Telegram bot
 * section keeps it on screen beside the control it refused, instead of a
 * toast that is gone before it is read.
 *
 * Pure: no React, so the rule is unit-tested (telegram-level.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';

/** The `code` the brain sends with the refusal. */
export const TELEGRAM_LEVEL_CODE = 'agent_below_admin';

/** The brain's message when `e` is its Telegram level refusal, else null
 *  (any other failure stays a toast). */
export function telegramLevelRefusal(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null;
  if (e.body?.code !== TELEGRAM_LEVEL_CODE) return null;
  return e.message || null;
}
