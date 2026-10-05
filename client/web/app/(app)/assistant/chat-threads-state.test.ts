import { describe, expect, it } from 'vitest';
import type { ChatThreadRow } from '@mantle/web-ui/types/chat-threads';
import { messageCount, newChatToast, previousChats, threadTitle } from './chat-threads-state';

const row = (over: Partial<ChatThreadRow>): ChatThreadRow => ({
  id: 'x',
  agentId: 'a',
  status: 'archived',
  title: null,
  startedAt: '2026-10-01T08:00:00.000Z',
  archivedAt: '2026-10-01T09:00:00.000Z',
  turnCount: 2,
  summary: null,
  summaryNodeId: null,
  continuedFrom: null,
  ...over,
});

describe('previousChats', () => {
  it('keeps archived threads only, newest first', () => {
    const out = previousChats([
      row({ id: 'old', archivedAt: '2026-10-01T09:00:00.000Z' }),
      row({ id: 'open', status: 'open', archivedAt: null }),
      row({ id: 'new', archivedAt: '2026-10-04T09:00:00.000Z' }),
    ]);
    expect(out.map((t) => t.id)).toEqual(['new', 'old']);
  });
});

describe('labels', () => {
  it('names an untitled thread by its day', () => {
    expect(threadTitle(row({ title: 'Garden Plan' }))).toBe('Garden Plan');
    expect(threadTitle(row({ title: '  ' }))).toMatch(/^Chat of /);
  });
  it('counts messages', () => {
    expect(messageCount(1)).toBe('1 message');
    expect(messageCount(12)).toBe('12 messages');
  });
});

describe('newChatToast', () => {
  it('says New chat and Previous chats, never archive', () => {
    const t = newChatToast({
      archived: row({ title: 'Garden Plan' }),
      open: row({ status: 'open' }),
    });
    expect(t).toEqual({
      kind: 'success',
      text: 'New chat started. "Garden Plan" is saved in Previous chats.',
    });
    expect(t.text.toLowerCase()).not.toContain('archive');
    expect(newChatToast({ archived: null, open: null }).text).toBe('This is already a new chat.');
    expect(
      newChatToast({
        archived: null,
        open: row({ status: 'open', continuedFrom: { id: 'x', title: 'Garden Plan' } }),
      }).kind,
    ).toBe('success');
  });
});
