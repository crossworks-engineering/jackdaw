import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { TELEGRAM_LEVEL_CODE, telegramLevelRefusal } from './telegram-level';

const MESSAGE =
  "Helper is a team-level agent. Only an admin-level agent's bot can be paired, because a paired Telegram chat acts as the owner. Raise Helper to admin first, or block this chat.";

describe('telegramLevelRefusal', () => {
  it("returns the brain's message for its level refusal", () => {
    const e = new ApiError(MESSAGE, 400, { error: MESSAGE, code: TELEGRAM_LEVEL_CODE });
    expect(telegramLevelRefusal(e)).toBe(MESSAGE);
  });

  it('leaves every other failure to the toast', () => {
    expect(telegramLevelRefusal(new ApiError('Telegram rejected this token (401).', 400))).toBe(
      null,
    );
    expect(
      telegramLevelRefusal(new ApiError('Chat not found for this bot.', 400, { error: 'x' })),
    ).toBe(null);
    expect(
      telegramLevelRefusal(new ApiError('boom', 500, { error: 'boom', code: TELEGRAM_LEVEL_CODE })),
    ).toBe(null);
    expect(telegramLevelRefusal(new Error(MESSAGE))).toBe(null);
    expect(telegramLevelRefusal('nope')).toBe(null);
  });
});
