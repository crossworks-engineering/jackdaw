import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { ASSISTANT_TURN_MAX_CHARS } from '@mantle/web-ui/assistant-limits';
import {
  CLIENT_CHAT_BUSY_POLL_MS,
  CLIENT_CHAT_IDLE_POLL_MS,
  CLIENT_CHAT_MAX_CHARS,
  CLIENT_CHAT_PATH,
  clientChatPollMs,
  clientChatRefusal,
} from './client-chat';

/** A client's own chat (client logins C4): the pure rules. */
describe('the client chat route', () => {
  it('is the client route, never a member one', () => {
    expect(CLIENT_CHAT_PATH).toBe('/api/client/chat');
  });

  it('caps a message at the brain limit for one turn', () => {
    expect(CLIENT_CHAT_MAX_CHARS).toBe(ASSISTANT_TURN_MAX_CHARS);
  });
});

describe('clientChatPollMs', () => {
  it('polls quickly (about 3 s) while a reply is on its way', () => {
    expect(clientChatPollMs({ open: true, waiting: true })).toBe(CLIENT_CHAT_BUSY_POLL_MS);
    expect(CLIENT_CHAT_BUSY_POLL_MS).toBe(3_000);
  });

  it('polls slowly (about 30 s) while open and idle', () => {
    expect(clientChatPollMs({ open: true, waiting: false })).toBe(CLIENT_CHAT_IDLE_POLL_MS);
    expect(CLIENT_CHAT_IDLE_POLL_MS).toBe(30_000);
  });

  it('never polls while closed, even with a reply pending', () => {
    expect(clientChatPollMs({ open: false, waiting: false })).toBe(false);
    expect(clientChatPollMs({ open: false, waiting: true })).toBe(false);
  });
});

const refused = (status: number, body: Record<string, unknown>) =>
  clientChatRefusal(new ApiError(String(body.error ?? status), status, body));

describe('clientChatRefusal', () => {
  it('the daily cap and the token budget say the limit, and until when', () => {
    const cap = refused(429, { error: 'daily cap', reason: 'daily_cap' });
    expect(cap).toEqual({
      message: 'You have reached today’s limit for messages. You can send again tomorrow.',
      reload: false,
      freshKey: false,
    });
    const tokens = refused(429, { error: 'budget', reason: 'token_budget' });
    expect(tokens.message).toBe(
      'You have reached today’s usage limit. You can send again tomorrow.',
    );
    expect(tokens.message).not.toBe(cap.message);
  });

  it('too fast says wait, also from a bare 429', () => {
    const fast = 'That is too fast. Wait a minute, then send again.';
    expect(refused(429, { error: 'slow down', reason: 'rate-limited' }).message).toBe(fast);
    expect(refused(429, { error: 'Too many requests' }).message).toBe(fast);
  });

  it('chat closed says so and reloads the thread (which then shows the closed state)', () => {
    expect(refused(409, { error: 'closed', reason: 'chat-closed' })).toEqual({
      message: 'Chat is not open right now.',
      reload: true,
      freshKey: false,
    });
  });

  it('a reused key forgets it, so the next try is a new turn', () => {
    const r = refused(409, { error: 'reused', reason: 'idempotency-key-reused' });
    expect(r.freshKey).toBe(true);
    expect(r.reload).toBe(false);
    expect(r.message).toBe('That did not send. Try again.');
  });

  it('a 401 shows nothing (sign-in is on its way)', () => {
    expect(clientChatRefusal(new ApiError('unauthorized', 401))).toEqual({
      message: null,
      reload: false,
      freshKey: false,
    });
  });

  it('a bad message shows the brain text; a code word never shows', () => {
    expect(refused(400, { error: 'The message is empty.' }).message).toBe('The message is empty.');
    expect(refused(403, { error: 'forbidden', reason: 'client-login' }).message).toBe(
      'Could not send that. Try again.',
    );
    expect(refused(500, { error: 'boom' }).message).toBe('Could not send that. Try again.');
    // An inherited property name is not a known reason.
    expect(refused(403, { error: 'forbidden', reason: 'toString' }).message).toBe(
      'Could not send that. Try again.',
    );
  });

  it('no answer at all (offline) says to check the connection', () => {
    expect(clientChatRefusal(new TypeError('Failed to fetch')).message).toBe(
      'Could not send that. Check the connection and try again.',
    );
  });
});
