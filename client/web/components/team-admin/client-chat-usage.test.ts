import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { isUsageMissing, usageLimitsText, usageLine, usageRows } from '../../lib/client-chat-usage';
import type { ClientChatUsage } from '../../lib/contract-next';
import { ClientChatUsageView } from './client-chat-usage';

/**
 * Team admin > Clients > Chat use today (client logins C4): each client
 * login's chat today against the daily limits, a login at a limit marked,
 * and the card left out on a brain before C4 (404).
 */
const PAT = '11111111-1111-4111-8111-111111111111';
const SAM = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';
const clients = [
  { id: PAT, email: 'pat@example.invalid', displayName: 'Pat Client' },
  { id: SAM, email: 'sam@example.invalid', displayName: null },
];
const usage: ClientChatUsage = {
  limits: { dailyTurns: 50, dailyTokens: 200_000 },
  rows: [
    { loginId: PAT, turnsToday: 3, tokensToday: 1_200 },
    { loginId: GONE, turnsToday: 9, tokensToday: 9 },
  ],
};

describe('usageRows', () => {
  it('one row per listed client, in order; none yet is zero; a deleted login is left out', () => {
    expect(usageRows(clients, usage)).toEqual([
      { id: PAT, name: 'Pat Client', turnsToday: 3, tokensToday: 1_200, atLimit: false },
      { id: SAM, name: 'sam@example.invalid', turnsToday: 0, tokensToday: 0, atLimit: false },
    ]);
  });

  it('either cap reached is at the limit', () => {
    const at = (turnsToday: number, tokensToday: number) =>
      usageRows(clients.slice(0, 1), {
        ...usage,
        rows: [{ loginId: PAT, turnsToday, tokensToday }],
      })[0]!.atLimit;
    expect(at(49, 199_999)).toBe(false);
    expect(at(50, 0)).toBe(true);
    expect(at(0, 200_000)).toBe(true);
  });
});

describe('the words', () => {
  it('a row: turns and tokens against the caps', () => {
    expect(usageLine({ turnsToday: 3, tokensToday: 1_200 }, usage.limits)).toBe(
      '3 of 50 turns · 1,200 of 200,000 tokens',
    );
  });

  it('the caps, and when they reset', () => {
    expect(usageLimitsText(usage.limits)).toBe(
      'Each client may chat 50 turns and 200,000 tokens a day. The count starts again at midnight UTC.',
    );
  });

  it('a 404 is a brain before C4 (no card); anything else is an error', () => {
    expect(isUsageMissing(new ApiError('Not found.', 404))).toBe(true);
    expect(isUsageMissing(new ApiError('boom', 500))).toBe(false);
    expect(isUsageMissing(new Error('offline'))).toBe(false);
  });
});

describe('ClientChatUsageView', () => {
  it('lists each client with its use, and marks one at a limit', () => {
    const html = renderToStaticMarkup(
      createElement(ClientChatUsageView, {
        rows: usageRows(clients, {
          ...usage,
          rows: [{ loginId: SAM, turnsToday: 50, tokensToday: 10 }],
        }),
        limits: usage.limits,
      }),
    );
    expect(html).toContain('Chat use today');
    expect(html).toContain('Pat Client');
    expect(html).toContain('0 of 50 turns · 0 of 200,000 tokens');
    expect(html).toContain('50 of 50 turns · 10 of 200,000 tokens · limit reached');
    expect(html.match(/limit reached/g)).toHaveLength(1);
  });
});
