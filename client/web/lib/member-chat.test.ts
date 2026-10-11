import { describe, expect, it } from 'vitest';
import type { MemberChatMessage } from './contract/member';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  CHAT_NOT_OPEN_TEXT,
  PENDING_POLL_MS,
  closedChatText,
  closedThreadText,
  memberChatRefusal,
  retryThreadRead,
  pollForPending,
  replyLanded,
  sendKey,
} from './member-chat';

const msg = (
  id: string,
  direction: 'inbound' | 'outbound',
  status: MemberChatMessage['status'] = 'complete',
): MemberChatMessage => ({
  id,
  direction,
  text: id,
  status,
  failed: status === 'failed',
  // Deliberately in the past: the check must not depend on any clock.
  createdAt: '2020-01-01T00:00:00.000Z',
});

describe('replyLanded', () => {
  const before = [msg('a', 'inbound'), msg('b', 'outbound')];
  const known = new Set(before.map((m) => m.id));

  it('waits while the new inbound has no reply, or the reply is pending', () => {
    expect(replyLanded(before, known)).toBe(false);
    expect(replyLanded([...before, msg('c', 'inbound')], known)).toBe(false);
    expect(
      replyLanded([...before, msg('c', 'inbound'), msg('d', 'outbound', 'pending')], known),
    ).toBe(false);
  });

  it('lands on a finished new outbound after the new inbound, whatever the timestamps', () => {
    expect(replyLanded([...before, msg('c', 'inbound'), msg('d', 'outbound')], known)).toBe(true);
    expect(
      replyLanded([...before, msg('c', 'inbound'), msg('d', 'outbound', 'failed')], known),
    ).toBe(true);
  });

  it('ends the wait when the send itself failed', () => {
    expect(replyLanded([...before, msg('c', 'inbound', 'failed')], known)).toBe(true);
  });

  it('never counts an old outbound as the reply', () => {
    expect(replyLanded([msg('c', 'inbound'), ...before], known)).toBe(false);
  });
});

describe('pollForPending', () => {
  it('polls while a pending row is new, then stops for good', () => {
    const seen = new Map<string, number>();
    const rows = [msg('a', 'inbound'), msg('b', 'outbound', 'pending')];
    expect(pollForPending(rows, seen, 1_000)).toBe(true);
    expect(pollForPending(rows, seen, 1_000 + PENDING_POLL_MS - 1)).toBe(true);
    expect(pollForPending(rows, seen, 1_000 + PENDING_POLL_MS)).toBe(false);
  });

  it('a new pending row polls again; a finished one is forgotten', () => {
    const seen = new Map<string, number>([['b', 0]]);
    const rows = [msg('b', 'outbound'), msg('c', 'outbound', 'pending')];
    expect(pollForPending(rows, seen, PENDING_POLL_MS * 5)).toBe(true);
    expect(seen.has('b')).toBe(false);
  });

  it('nothing pending: no polling', () => {
    expect(pollForPending([msg('a', 'inbound')], new Map(), 0)).toBe(false);
  });
});

describe('sendKey', () => {
  let n = 0;
  const fresh = () => `k${++n}`;
  it('reuses the key for the same text, a new one for new text', () => {
    const first = sendKey('hi', null, fresh);
    expect(sendKey('hi', { text: 'hi', key: first }, fresh)).toBe(first);
    expect(sendKey('hello', { text: 'hi', key: first }, fresh)).not.toBe(first);
  });
});

/** The member chat's refusals, unchanged by the body it now shares with a
 *  client's chat (client logins C4): the brain's words in a toast, and a 409
 *  reloads the thread. */
describe('memberChatRefusal', () => {
  it('shows the brain message, and a 409 reloads', () => {
    expect(memberChatRefusal(new ApiError('Chat is closed.', 409))).toEqual({
      message: 'Chat is closed.',
      reload: true,
    });
    expect(memberChatRefusal(new ApiError('Too many.', 429))).toEqual({
      message: 'Too many.',
      reload: false,
    });
  });

  it('a 401 shows nothing', () => {
    expect(memberChatRefusal(new ApiError('unauthorized', 401))).toEqual({
      message: null,
      reload: false,
    });
  });
});

/** Chat not open (workspaces W5c): the Team workspace has no assistant. The
 *  thread shows the brain's own words, and a 409 is never retried. */
describe('a closed chat', () => {
  const notOpen = new ApiError(CHAT_NOT_OPEN_TEXT, 409, { error: CHAT_NOT_OPEN_TEXT });

  it("shows the brain's message for a 409 read", () => {
    expect(closedChatText(notOpen)).toBe(CHAT_NOT_OPEN_TEXT);
    expect(closedThreadText({ data: undefined, error: notOpen }, 'Closed.')).toBe(
      'Chat is not open yet: the Team workspace has no assistant.',
    );
    const other = new ApiError('The Team workspace is being set up.', 409);
    expect(closedThreadText({ data: undefined, error: other }, 'Closed.')).toBe(
      'The Team workspace is being set up.',
    );
  });

  it('says the screen words when the brain sends no agent', () => {
    expect(closedThreadText({ data: { agent: null }, error: null }, CHAT_NOT_OPEN_TEXT)).toBe(
      CHAT_NOT_OPEN_TEXT,
    );
    expect(closedThreadText({ data: { agent: { name: 'A' } }, error: null }, 'x')).toBeNull();
  });

  it('is not closed for a failure that is not a 409 (the error card and Try again)', () => {
    for (const err of [new ApiError('boom', 500), new TypeError('Failed to fetch'), null]) {
      expect(closedThreadText({ data: undefined, error: err }, 'Closed.')).toBeNull();
    }
  });

  it('never retries a 409 or another refusal, and a failure once', () => {
    expect(retryThreadRead(0, notOpen)).toBe(false);
    expect(retryThreadRead(0, new ApiError('Gone.', 410, { code: 'gone' }))).toBe(false);
    expect(retryThreadRead(0, new ApiError('boom', 502))).toBe(true);
    expect(retryThreadRead(1, new ApiError('boom', 502))).toBe(false);
    expect(retryThreadRead(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it("a refused send shows the brain's message and reloads the thread", () => {
    expect(memberChatRefusal(notOpen)).toEqual({ message: CHAT_NOT_OPEN_TEXT, reload: true });
  });
});
