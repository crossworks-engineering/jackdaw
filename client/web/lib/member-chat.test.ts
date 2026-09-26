import { describe, expect, it } from 'vitest';
import type { MemberChatMessage } from '@mantle/client-types';
import { replyLanded } from './member-chat';

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
