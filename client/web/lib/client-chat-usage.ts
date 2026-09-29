/**
 * Team admin > Clients > Chat use today (client logins C4), the pure half.
 * Each client login's own chat is capped per UTC day, in turns and in
 * tokens; the brain answers each login's use so far (GET
 * /api/team-admin/clients/usage). A brain before C4 has no such route (404):
 * the card is left out. Nothing here fetches, so each wording is pinned by a
 * test (client-chat-usage.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { ClientLoginRow } from '@mantle/client-types';
import type { ClientChatUsage } from './contract-next';
import { clientName } from './client-logins';

export const CLIENT_CHAT_USAGE_PATH = '/api/team-admin/clients/usage';
export const CLIENT_CHAT_USAGE_KEY = ['team-admin', 'client-chat-usage'] as const;

/** A brain before C4: no usage route, so no card (not an error). */
export function isUsageMissing(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

export type UsageRow = {
  id: string;
  name: string;
  turnsToday: number;
  tokensToday: number;
  /** Either cap reached: the client cannot send again today. */
  atLimit: boolean;
};

/**
 * One row per client login, in the list's order, with its use today (none
 * yet: zero). The brain's rows for a login no longer listed (deleted) are
 * left out.
 */
export function usageRows(
  clients: readonly Pick<ClientLoginRow, 'id' | 'email' | 'displayName'>[],
  usage: ClientChatUsage,
): UsageRow[] {
  const byLogin = new Map(usage.rows.map((r) => [r.loginId, r]));
  return clients.map((c) => {
    const u = byLogin.get(c.id);
    const turnsToday = u?.turnsToday ?? 0;
    const tokensToday = u?.tokensToday ?? 0;
    return {
      id: c.id,
      name: clientName(c),
      turnsToday,
      tokensToday,
      atLimit: turnsToday >= usage.limits.dailyTurns || tokensToday >= usage.limits.dailyTokens,
    };
  });
}

const n = (v: number) => v.toLocaleString('en-US');

/** "3 of 50 turns · 1,200 of 200,000 tokens". */
export function usageLine(
  row: Pick<UsageRow, 'turnsToday' | 'tokensToday'>,
  limits: ClientChatUsage['limits'],
): string {
  return (
    `${n(row.turnsToday)} of ${n(limits.dailyTurns)} turns · ` +
    `${n(row.tokensToday)} of ${n(limits.dailyTokens)} tokens`
  );
}

/** The card's line under its title: what the caps are, and when they reset. */
export function usageLimitsText(limits: ClientChatUsage['limits']): string {
  return (
    `Each client may chat ${n(limits.dailyTurns)} turns and ${n(limits.dailyTokens)} ` +
    'tokens a day. The count starts again at midnight UTC.'
  );
}
