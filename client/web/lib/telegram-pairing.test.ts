import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  agentChatStatusFor,
  moderateActions,
  moderateTelegramChatPath,
  moderatedText,
  myTelegramChatPath,
  normalisePairCode,
  pairConfirmBody,
  pairPreviewBody,
  pairRefusal,
  telegramChatStatusText,
} from './telegram-pairing';

const refusal = (status: number, body?: Record<string, unknown>) =>
  new ApiError(typeof body?.error === 'string' ? body.error : 'x', status, body);

describe('the pairing code', () => {
  it('takes six hex digits, however they were typed', () => {
    expect(normalisePairCode('3fa9c2')).toBe('3fa9c2');
    expect(normalisePairCode(' 3F A9 C2 ')).toBe('3fa9c2');
    expect(normalisePairCode('#3fa9c2')).toBe('3fa9c2');
  });

  it('refuses anything else before a request', () => {
    for (const bad of ['', '3fa9c', '3fa9c21', 'zzzzzz', '3fa9c2;', '../x']) {
      expect(normalisePairCode(bad), bad).toBeNull();
    }
  });
});

describe('the two steps', () => {
  it('the preview sends the code only', () => {
    expect(pairPreviewBody('3fa9c2')).toEqual({ code: '3fa9c2' });
  });

  it("the confirm ALWAYS sends the preview's token with the same code", () => {
    expect(pairConfirmBody('3fa9c2', 'a'.repeat(32))).toEqual({
      code: '3fa9c2',
      confirm: true,
      previewToken: 'a'.repeat(32),
    });
  });
});

describe('a refused pairing', () => {
  it("shows the brain's own words, first letter up, with its code", () => {
    const r = pairRefusal(
      refusal(403, {
        error:
          "you are not a user of this bot's assistant's workspace, so you cannot pair a chat to it.",
        code: 'not_a_workspace_user',
      }),
    );
    expect(r).toEqual({
      code: 'not_a_workspace_user',
      message:
        "You are not a user of this bot's assistant's workspace, so you cannot pair a chat to it.",
      restart: false,
    });
  });

  it('a stale preview goes back to the code', () => {
    for (const code of ['preview_mismatch', 'code_expired', 'no_such_code']) {
      expect(pairRefusal(refusal(409, { error: 'x', code }))?.restart, code).toBe(true);
    }
    for (const code of ['paired_to_another', 'no_assistant', 'too_many_attempts', 'not_allowed']) {
      expect(pairRefusal(refusal(409, { error: 'x', code }))?.restart, code).toBe(false);
    }
  });

  it('says something plain when the brain sends no words', () => {
    expect(pairRefusal(refusal(429, {}))?.message).toMatch(/Too many tries/);
    expect(pairRefusal(refusal(400, {}))?.message).toMatch(/six letters and digits/);
    expect(pairRefusal(refusal(404, {}))?.message).toMatch(/No chat is waiting/);
  });

  it('leaves a 401 and anything not the brain to the caller', () => {
    expect(pairRefusal(refusal(401, { error: 'unauthorized' }))).toBeNull();
    expect(pairRefusal(new Error('network'))).toBeNull();
    expect(pairRefusal('nope')).toBeNull();
  });
});

describe("a bot's chats, for the people who moderate them", () => {
  it('says whose a chat is, with no level', () => {
    expect(telegramChatStatusText({ status: 'allowed', pairedTo: 'Ada', loginId: 'l-1' })).toBe(
      'Paired to Ada',
    );
    expect(telegramChatStatusText({ status: 'allowed', pairedTo: null, loginId: null })).toMatch(
      /user is gone/,
    );
    expect(telegramChatStatusText({ status: 'denied', pairedTo: null })).toBe('Blocked');
    expect(telegramChatStatusText({ status: 'pending', pairedTo: null })).toMatch(
      /Waiting for its user/,
    );
    for (const status of ['allowed', 'denied', 'pending'] as const) {
      expect(telegramChatStatusText({ status, pairedTo: 'Ada' })).not.toMatch(/level|admin/i);
    }
  });

  it('offers Block, Unpair or Unblock, never Pair or Approve', () => {
    expect(moderateActions({ status: 'allowed' })).toEqual([
      { action: 'unpair', label: 'Unpair' },
      { action: 'block', label: 'Block' },
    ]);
    expect(moderateActions({ status: 'pending' })).toEqual([{ action: 'block', label: 'Block' }]);
    expect(moderateActions({ status: 'denied' })).toEqual([{ action: 'unpair', label: 'Unblock' }]);
    for (const status of ['allowed', 'denied', 'pending'] as const) {
      for (const a of moderateActions({ status })) {
        expect(['Pair', 'Approve', 'Allow']).not.toContain(a.label);
      }
    }
  });

  it("sends the bot section's route 'denied' or 'pending', never 'allowed'", () => {
    expect(agentChatStatusFor('block')).toBe('denied');
    expect(agentChatStatusFor('unpair')).toBe('pending');
  });

  it('names the routes', () => {
    expect(myTelegramChatPath('c-1')).toBe('/api/telegram/my-chats/c-1');
    expect(moderateTelegramChatPath('c-1', 'block')).toBe('/api/telegram/chats/c-1/block');
    expect(moderateTelegramChatPath('c/1', 'unpair')).toBe('/api/telegram/chats/c%2F1/unpair');
    expect(moderatedText('unpair', true)).toBe('Unblocked');
    expect(moderatedText('unpair', false)).toBe('Unpaired');
    expect(moderatedText('block', false)).toBe('Blocked');
  });
});

describe('the Telegram screens', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const section = read('../components/telegram/telegram-bot-section.tsx');
  const form = read('../components/telegram/telegram-pair-form.tsx');

  it("the bot section sets no chat 'allowed' and names no level", () => {
    expect(section).not.toMatch(/status: 'allowed'|'allowed' \| 'denied'|^\s*Approve\s*$/m);
    expect(section).not.toMatch(/telegram-level|agent_below_admin|admin-level/);
    expect(section).toContain('<TelegramPairForm');
  });

  it('the pair form confirms with the preview token', () => {
    expect(form).toContain('pairConfirmBody(preview.code, preview.data.previewToken)');
  });
});
